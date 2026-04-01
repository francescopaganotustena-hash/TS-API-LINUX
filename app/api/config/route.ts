import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { clearAllSyncData } from '../_syncStoreSqlServer';

const CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json');

interface ServerConfig {
  id: string;
  name: string;
  apiUrl: string;
  username: string;
  password: string;
  authScope: string;
  createdAt?: string;
  updatedAt?: string;
}

interface MultiServerConfig {
  servers: ServerConfig[];
  activeServerId: string | null;
  lastUpdated?: string;
}

function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function generateId(): string {
  return `server_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function readConfig(): MultiServerConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      
      // Se è il formato vecchio (singolo server), converti al nuovo formato
      if (parsed.apiUrl && !parsed.servers) {
        const oldConfig = parsed as { apiUrl: string; username: string; password: string; authScope: string; lastUpdated?: string };
        const serverId = generateId();
        const newConfig: MultiServerConfig = {
          servers: [{
            id: serverId,
            name: 'Server migrato',
            apiUrl: oldConfig.apiUrl,
            username: oldConfig.username,
            password: oldConfig.password,
            authScope: oldConfig.authScope || '1',
            createdAt: oldConfig.lastUpdated,
            updatedAt: oldConfig.lastUpdated,
          }],
          activeServerId: serverId,
          lastUpdated: oldConfig.lastUpdated,
        };
        writeConfig(newConfig);
        return newConfig;
      }
      
      return parsed as MultiServerConfig;
    }
  } catch (error) {
    console.error('Errore lettura config:', error);
  }
  return null;
}

function writeConfig(config: MultiServerConfig) {
  ensureDataDir();
  config.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function maskPassword(password: string): string {
  return password ? '••••••••' : '';
}

// GET - Leggi configurazione corrente
export async function GET() {
  const config = readConfig();
  
  if (!config || config.servers.length === 0) {
    // Fallback su variabili d'ambiente
    const envServer: ServerConfig = {
      id: 'env',
      name: 'Variabili ambiente',
      apiUrl: process.env.GESTIONALE_API_URL || '',
      username: process.env.GESTIONALE_USERNAME || '',
      password: process.env.GESTIONALE_PASSWORD ? '••••••••' : '',
      authScope: process.env.GESTIONALE_AUTH_SCOPE || '1',
    };
    
    return NextResponse.json({
      servers: [envServer],
      activeServerId: 'env',
      source: 'env',
      configured: !!(process.env.GESTIONALE_API_URL && process.env.GESTIONALE_USERNAME && process.env.GESTIONALE_PASSWORD)
    });
  }
  
  // Maschera le password nella risposta
  const maskedServers = config.servers.map(server => ({
    ...server,
    password: maskPassword(server.password),
  }));
  
  const activeServer = config.servers.find(s => s.id === config.activeServerId);
  
  return NextResponse.json({
    servers: maskedServers,
    activeServerId: config.activeServerId,
    source: 'file',
    configured: !!activeServer,
    lastUpdated: config.lastUpdated
  });
}

// POST - Aggiungi nuovo server o salva modifiche
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validazione
    if (!body.apiUrl?.trim()) {
      return NextResponse.json({ error: 'URL API è obbligatorio' }, { status: 400 });
    }
    if (!body.username?.trim()) {
      return NextResponse.json({ error: 'Username è obbligatorio' }, { status: 400 });
    }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Nome server è obbligatorio' }, { status: 400 });
    }
    
    const config = readConfig() || { servers: [], activeServerId: null };
    
    // Se la password è mascherata, mantieni quella esistente (per modifica)
    let password = body.password;
    if (password === '••••••••' || !password) {
      const existingServer = config.servers.find(s => s.id === body.id);
      password = existingServer?.password || process.env.GESTIONALE_PASSWORD || '';
    }
    
    const now = new Date().toISOString();
    
    if (body.id && body.id !== 'env') {
      // Modifica server esistente
      const serverIndex = config.servers.findIndex(s => s.id === body.id);
      if (serverIndex >= 0) {
        config.servers[serverIndex] = {
          ...config.servers[serverIndex],
          name: body.name.trim(),
          apiUrl: body.apiUrl.trim(),
          username: body.username.trim(),
          password: password,
          authScope: body.authScope?.trim() || '1',
          updatedAt: now,
        };
        writeConfig(config);
        return NextResponse.json({ 
          success: true, 
          message: 'Server modificato con successo',
          serverId: body.id
        });
      }
    }
    
    // Aggiungi nuovo server
    const newServer: ServerConfig = {
      id: generateId(),
      name: body.name.trim(),
      apiUrl: body.apiUrl.trim(),
      username: body.username.trim(),
      password: password,
      authScope: body.authScope?.trim() || '1',
      createdAt: now,
      updatedAt: now,
    };
    
    config.servers.push(newServer);
    
    // Se è il primo server, impostalo come attivo
    if (config.servers.length === 1) {
      config.activeServerId = newServer.id;
    }
    
    writeConfig(config);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Server aggiunto con successo',
      serverId: newServer.id,
      isActive: config.activeServerId === newServer.id
    });
  } catch (error) {
    console.error('Errore salvataggio config:', error);
    return NextResponse.json({ error: 'Errore durante il salvataggio' }, { status: 500 });
  }
}

// PUT - Cambia server attivo (con opzione cancellazione dati)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { activeServerId, clearData } = body;
    
    if (!activeServerId) {
      return NextResponse.json({ error: 'Server ID è obbligatorio' }, { status: 400 });
    }
    
    const config = readConfig();
    
    if (!config) {
      return NextResponse.json({ error: 'Nessuna configurazione trovata' }, { status: 404 });
    }
    
    // Verifica che il server esista
    const server = config.servers.find(s => s.id === activeServerId);
    if (!server) {
      return NextResponse.json({ error: 'Server non trovato' }, { status: 404 });
    }
    
    // Se il server attivo è diverso dal nuovo, e clearData è richiesto
    const previousActiveId = config.activeServerId;
    const isChangingServer = previousActiveId !== activeServerId;
    
    if (isChangingServer && clearData) {
      // Cancella tutti i dati
      try {
        await clearAllSyncData();
      } catch (clearError) {
        console.error('Errore cancellazione dati:', clearError);
        return NextResponse.json({ 
          error: 'Errore durante la cancellazione dei dati. Cambio server non completato.' 
        }, { status: 500 });
      }
    }
    
    // Aggiorna server attivo
    config.activeServerId = activeServerId;
    writeConfig(config);
    
    return NextResponse.json({ 
      success: true, 
      message: isChangingServer 
        ? (clearData ? 'Server cambiato e dati cancellati con successo' : 'Server attivo cambiato')
        : 'Server attivo confermato',
      previousServerId: previousActiveId,
      clearedData: isChangingServer && clearData
    });
  } catch (error) {
    console.error('Errore cambio server:', error);
    return NextResponse.json({ error: 'Errore durante il cambio server' }, { status: 500 });
  }
}

// DELETE - Elimina un server o reset configurazione
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const serverId = searchParams.get('serverId');
    
    // Se non c'è serverId, reset completo
    if (!serverId) {
      if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
      }
      return NextResponse.json({ success: true, message: 'Configurazione rimossa' });
    }
    
    // Elimina un server specifico
    const config = readConfig();
    if (!config) {
      return NextResponse.json({ error: 'Nessuna configurazione trovata' }, { status: 404 });
    }
    
    const serverIndex = config.servers.findIndex(s => s.id === serverId);
    if (serverIndex < 0) {
      return NextResponse.json({ error: 'Server non trovato' }, { status: 404 });
    }
    
    // Non permettere di eliminare il server attivo
    if (config.activeServerId === serverId) {
      return NextResponse.json({ 
        error: 'Non puoi eliminare il server attivo. Cambia prima il server attivo.' 
      }, { status: 400 });
    }
    
    config.servers.splice(serverIndex, 1);
    writeConfig(config);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Server eliminato con successo',
      remainingServers: config.servers.length
    });
  } catch (error) {
    console.error('Errore eliminazione server:', error);
    return NextResponse.json({ error: 'Errore durante l\'eliminazione' }, { status: 500 });
  }
}