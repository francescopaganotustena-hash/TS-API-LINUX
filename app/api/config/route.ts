import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { clearAllSyncData } from '../_syncStoreSqlServer';

const CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json');
const CONFIG_BACKUP_FILE = path.join(process.cwd(), 'data', 'config.backup.json');
const LOG_FILE = path.join(process.cwd(), 'data', 'operations.log');

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

// ==================== UTILITY FUNCTIONS ====================

function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function generateId(): string {
  return `server_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function logOperation(operation: string, details: Record<string, unknown>, success: boolean) {
  ensureDataDir();
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${success ? 'SUCCESS' : 'ERROR'}] ${operation}: ${JSON.stringify(details)}\n`;
  
  try {
    fs.appendFileSync(LOG_FILE, logEntry, 'utf-8');
  } catch (error) {
    console.error('[CONFIG] Errore scrittura log:', error);
  }
  
  console.log(`[CONFIG] ${operation}:`, success ? 'OK' : 'FAILED', details);
}

function createBackup(): boolean {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      ensureDataDir();
      fs.copyFileSync(CONFIG_FILE, CONFIG_BACKUP_FILE);
      console.log('[CONFIG] Backup creato:', CONFIG_BACKUP_FILE);
      return true;
    }
    return true; // No config file to backup
  } catch (error) {
    console.error('[CONFIG] Errore creazione backup:', error);
    return false;
  }
}

function restoreBackup(): boolean {
  try {
    if (fs.existsSync(CONFIG_BACKUP_FILE)) {
      fs.copyFileSync(CONFIG_BACKUP_FILE, CONFIG_FILE);
      console.log('[CONFIG] Backup ripristinato:', CONFIG_FILE);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[CONFIG] Errore ripristino backup:', error);
    return false;
  }
}

function validateUrl(url: string): { valid: boolean; error?: string } {
  if (!url || url.trim().length === 0) {
    return { valid: false, error: 'URL è obbligatorio' };
  }
  
  try {
    const parsed = new URL(url.trim());
    
    if (!parsed.protocol.startsWith('http')) {
      return { valid: false, error: 'Protocollo non supportato. Usa http:// o https://' };
    }
    
    if (!parsed.hostname) {
      return { valid: false, error: 'Hostname mancante nell\'URL' };
    }
    
    // Verifica che l'URL contenga /api o /v1
    const pathPart = parsed.pathname;
    if (!pathPart.includes('/api') && !pathPart.includes('/v1')) {
      return { valid: false, error: 'URL deve contenere /api/v1 o simile' };
    }
    
    return { valid: true };
  } catch {
    return { valid: false, error: 'URL non valido. Formato richiesto: http://hostname:port/api/v1' };
  }
}

function validateName(name: string, existingServers: ServerConfig[], excludeId?: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Nome server è obbligatorio' };
  }
  
  if (name.trim().length < 3) {
    return { valid: false, error: 'Nome server deve avere almeno 3 caratteri' };
  }
  
  if (name.trim().length > 50) {
    return { valid: false, error: 'Nome server troppo lungo (max 50 caratteri)' };
  }
  
  // Verifica nomi duplicati
  const duplicate = existingServers.find(s => 
    s.name.toLowerCase() === name.trim().toLowerCase() && s.id !== excludeId
  );
  
  if (duplicate) {
    return { valid: false, error: `Nome "${name}" già in uso dal server "${duplicate.name}"` };
  }
  
  return { valid: true };
}

function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || username.trim().length === 0) {
    return { valid: false, error: 'Username è obbligatorio' };
  }
  
  if (username.trim().length < 2) {
    return { valid: false, error: 'Username deve avere almeno 2 caratteri' };
  }
  
  return { valid: true };
}

function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length === 0) {
    return { valid: false, error: 'Password è obbligatoria' };
  }
  
  if (password.length < 2) {
    return { valid: false, error: 'Password deve avere almeno 2 caratteri' };
  }
  
  // Non accettare password mascherata come valida
  if (password === '••••••••') {
    return { valid: false, error: 'Password mascherata non valida. Inserisci la password reale.' };
  }
  
  return { valid: true };
}

function validateAuthScope(authScope: string): { valid: boolean; error?: string } {
  if (!authScope || authScope.trim().length === 0) {
    return { valid: false, error: 'Authorization Scope è obbligatorio' };
  }
  
  // Deve essere un numero
  if (!/^\d+$/.test(authScope.trim())) {
    return { valid: false, error: 'Authorization Scope deve essere un numero (es. 1)' };
  }
  
  return { valid: true };
}

function maskPassword(password: string): string {
  return password ? '••••••••' : '';
}

// ==================== CONFIG READ/WRITE ====================

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
    console.error('[CONFIG] Errore lettura config:', error);
    // Tenta ripristino backup
    if (restoreBackup()) {
      return readConfig(); // Riprova con backup
    }
  }
  return null;
}

function writeConfig(config: MultiServerConfig): boolean {
  try {
    ensureDataDir();
    config.lastUpdated = new Date().toISOString();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('[CONFIG] Errore scrittura config:', error);
    return false;
  }
}

function writeConfigWithBackup(config: MultiServerConfig): boolean {
  // Crea backup prima di scrivere
  if (!createBackup()) {
    console.warn('[CONFIG] Backup non creato, procedendo comunque...');
  }
  
  return writeConfig(config);
}

// ==================== API ENDPOINTS ====================

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
    
    const config = readConfig() || { servers: [], activeServerId: null };
    
    // ==================== VALIDAZIONE ====================
    
    // Validazione URL
    const urlValidation = validateUrl(body.apiUrl || '');
    if (!urlValidation.valid) {
      logOperation('ADD_SERVER', { url: body.apiUrl }, false);
      return NextResponse.json({ error: urlValidation.error }, { status: 400 });
    }
    
    // Validazione Nome
    const nameValidation = validateName(body.name || '', config.servers, body.id);
    if (!nameValidation.valid) {
      logOperation('ADD_SERVER', { name: body.name }, false);
      return NextResponse.json({ error: nameValidation.error }, { status: 400 });
    }
    
    // Validazione Username
    const usernameValidation = validateUsername(body.username || '');
    if (!usernameValidation.valid) {
      logOperation('ADD_SERVER', { username: body.username }, false);
      return NextResponse.json({ error: usernameValidation.error }, { status: 400 });
    }
    
    // Validazione Password
    let password = body.password;
    if (body.id && body.id !== 'env') {
      // Se modifica, mantieni password esistente se mascherata/vuota
      const existingServer = config.servers.find(s => s.id === body.id);
      if (password === '••••••••' || !password) {
        password = existingServer?.password || process.env.GESTIONALE_PASSWORD || '';
      } else {
        // Nuova password inserita, valida
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
          logOperation('EDIT_SERVER', { id: body.id }, false);
          return NextResponse.json({ error: passwordValidation.error }, { status: 400 });
        }
      }
    } else {
      // Nuovo server, password deve essere valida
      const passwordValidation = validatePassword(password || '');
      if (!passwordValidation.valid) {
        logOperation('ADD_SERVER', { name: body.name }, false);
        return NextResponse.json({ error: passwordValidation.error }, { status: 400 });
      }
    }
    
    // Validazione AuthScope
    const authScopeValidation = validateAuthScope(body.authScope || '1');
    if (!authScopeValidation.valid) {
      logOperation('ADD_SERVER', { authScope: body.authScope }, false);
      return NextResponse.json({ error: authScopeValidation.error }, { status: 400 });
    }
    
    const now = new Date().toISOString();
    
    // ==================== OPERAZIONE ====================
    
    if (body.id && body.id !== 'env') {
      // Modifica server esistente
      const serverIndex = config.servers.findIndex(s => s.id === body.id);
      if (serverIndex >= 0) {
        const oldServer = config.servers[serverIndex];
        
        if (!writeConfigWithBackup(config)) {
          logOperation('EDIT_SERVER', { id: body.id, name: body.name }, false);
          return NextResponse.json({ error: 'Errore durante il salvataggio. Backup disponibile.' }, { status: 500 });
        }
        
        config.servers[serverIndex] = {
          ...config.servers[serverIndex],
          name: body.name.trim(),
          apiUrl: body.apiUrl.trim(),
          username: body.username.trim(),
          password: password,
          authScope: body.authScope.trim(),
          updatedAt: now,
        };
        
        // Riscrivi dopo modifica
        if (!writeConfig(config)) {
          // Ripristina backup
          restoreBackup();
          logOperation('EDIT_SERVER', { id: body.id, name: body.name }, false);
          return NextResponse.json({ error: 'Errore durante il salvataggio. Backup ripristinato.' }, { status: 500 });
        }
        
        logOperation('EDIT_SERVER', { 
          id: body.id, 
          name: body.name, 
          oldName: oldServer.name,
          urlChanged: oldServer.apiUrl !== body.apiUrl
        }, true);
        
        return NextResponse.json({ 
          success: true, 
          message: 'Server modificato con successo',
          serverId: body.id
        });
      }
      
      return NextResponse.json({ error: 'Server non trovato' }, { status: 404 });
    }
    
    // Aggiungi nuovo server
    const newServer: ServerConfig = {
      id: generateId(),
      name: body.name.trim(),
      apiUrl: body.apiUrl.trim(),
      username: body.username.trim(),
      password: password,
      authScope: body.authScope.trim(),
      createdAt: now,
      updatedAt: now,
    };
    
    config.servers.push(newServer);
    
    // Se è il primo server, impostalo come attivo
    if (config.servers.length === 1) {
      config.activeServerId = newServer.id;
    }
    
    if (!writeConfigWithBackup(config)) {
      logOperation('ADD_SERVER', { name: body.name }, false);
      return NextResponse.json({ error: 'Errore durante il salvataggio' }, { status: 500 });
    }
    
    logOperation('ADD_SERVER', { 
      id: newServer.id, 
      name: newServer.name, 
      url: newServer.apiUrl,
      isFirst: config.servers.length === 1
    }, true);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Server aggiunto con successo',
      serverId: newServer.id,
      isActive: config.activeServerId === newServer.id
    });
  } catch (error) {
    console.error('[CONFIG] Errore salvataggio config:', error);
    logOperation('ADD_SERVER', { error: error instanceof Error ? error.message : 'Unknown' }, false);
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
    
    const previousActiveId = config.activeServerId;
    const previousServer = config.servers.find(s => s.id === previousActiveId);
    const isChangingServer = previousActiveId !== activeServerId;
    
    // Se cambio server con clearData, procedi con cancellazione
    if (isChangingServer && clearData) {
      // Backup prima di operazione critica
      if (!createBackup()) {
        logOperation('SWITCH_SERVER', { from: previousActiveId, to: activeServerId }, false);
        return NextResponse.json({ 
          error: 'Impossibile creare backup. Operazione annullata per sicurezza.' 
        }, { status: 500 });
      }
      
      // Cancella tutti i dati
      try {
        await clearAllSyncData();
        console.log('[CONFIG] Dati cancellati con successo');
      } catch (clearError) {
        console.error('[CONFIG] Errore cancellazione dati:', clearError);
        logOperation('SWITCH_SERVER', { 
          from: previousActiveId, 
          to: activeServerId, 
          error: clearError instanceof Error ? clearError.message : 'Unknown'
        }, false);
        
        // Ripristina backup
        restoreBackup();
        
        return NextResponse.json({ 
          error: 'Errore durante la cancellazione dei dati. Operazione annullata e backup ripristinato.' 
        }, { status: 500 });
      }
    }
    
    // Aggiorna server attivo
    config.activeServerId = activeServerId;
    
    if (!writeConfig(config)) {
      logOperation('SWITCH_SERVER', { from: previousActiveId, to: activeServerId }, false);
      return NextResponse.json({ error: 'Errore durante l\'aggiornamento' }, { status: 500 });
    }
    
    logOperation('SWITCH_SERVER', { 
      from: previousActiveId, 
      fromName: previousServer?.name || 'Nessuno',
      to: activeServerId, 
      toName: server.name,
      clearedData: isChangingServer && clearData
    }, true);
    
    return NextResponse.json({ 
      success: true, 
      message: isChangingServer 
        ? (clearData ? 'Server cambiato e dati cancellati con successo' : 'Server attivo cambiato')
        : 'Server attivo confermato',
      previousServerId: previousActiveId,
      clearedData: isChangingServer && clearData
    });
  } catch (error) {
    console.error('[CONFIG] Errore cambio server:', error);
    logOperation('SWITCH_SERVER', { error: error instanceof Error ? error.message : 'Unknown' }, false);
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
      // Backup prima di reset
      createBackup();
      
      if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
      }
      
      logOperation('RESET_CONFIG', { action: 'complete_reset' }, true);
      
      return NextResponse.json({ 
        success: true, 
        message: 'Configurazione rimossa. Backup disponibile in config.backup.json' 
      });
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
    
    const serverToDelete = config.servers[serverIndex];
    
    // Non permettere di eliminare il server attivo
    if (config.activeServerId === serverId) {
      logOperation('DELETE_SERVER', { id: serverId, name: serverToDelete.name }, false);
      return NextResponse.json({ 
        error: 'Non puoi eliminare il server attivo. Cambia prima il server attivo.' 
      }, { status: 400 });
    }
    
    // Backup prima di eliminazione
    if (!createBackup()) {
      logOperation('DELETE_SERVER', { id: serverId, name: serverToDelete.name }, false);
      return NextResponse.json({ 
        error: 'Impossibile creare backup. Operazione annullata per sicurezza.' 
      }, { status: 500 });
    }
    
    config.servers.splice(serverIndex, 1);
    
    if (!writeConfig(config)) {
      restoreBackup();
      logOperation('DELETE_SERVER', { id: serverId, name: serverToDelete.name }, false);
      return NextResponse.json({ error: 'Errore durante l\'eliminazione. Backup ripristinato.' }, { status: 500 });
    }
    
    logOperation('DELETE_SERVER', { 
      id: serverId, 
      name: serverToDelete.name,
      remainingServers: config.servers.length
    }, true);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Server eliminato con successo',
      remainingServers: config.servers.length
    });
  } catch (error) {
    console.error('[CONFIG] Errore eliminazione server:', error);
    logOperation('DELETE_SERVER', { error: error instanceof Error ? error.message : 'Unknown' }, false);
    return NextResponse.json({ error: 'Errore durante l\'eliminazione' }, { status: 500 });
  }
}