import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

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

function readConfig(): MultiServerConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      
      // Se è il formato vecchio (singolo server), converti al nuovo formato
      if (parsed.apiUrl && !parsed.servers) {
        const oldConfig = parsed as { apiUrl: string; username: string; password: string; authScope: string; lastUpdated?: string };
        const serverId = `server_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
        // Salva nel nuovo formato
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf-8');
        return newConfig;
      }
      
      return parsed as MultiServerConfig;
    }
  } catch (error) {
    console.error('[CONFIG TEST] Errore lettura config:', error);
  }
  return null;
}

function getActiveServerConfig(): { apiUrl: string; username: string; password: string; authScope: string } | null {
  const config = readConfig();
  
  if (config && config.servers.length > 0 && config.activeServerId) {
    const activeServer = config.servers.find(s => s.id === config.activeServerId);
    if (activeServer) {
      return {
        apiUrl: activeServer.apiUrl,
        username: activeServer.username,
        password: activeServer.password,
        authScope: activeServer.authScope || '1'
      };
    }
  }
  
  // Fallback su variabili d'ambiente
  const envUrl = process.env.GESTIONALE_API_URL;
  const envUsername = process.env.GESTIONALE_USERNAME;
  const envPassword = process.env.GESTIONALE_PASSWORD;
  const envAuthScope = process.env.GESTIONALE_AUTH_SCOPE || '1';
  
  if (envUrl && envUsername && envPassword) {
    return {
      apiUrl: envUrl,
      username: envUsername,
      password: envPassword,
      authScope: envAuthScope
    };
  }
  
  return null;
}

function normalizeBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed;
}

function validateUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    
    if (!parsed.protocol.startsWith('http')) {
      return { valid: false, error: 'Protocollo non supportato. Usa http:// o https://' };
    }
    
    if (!parsed.hostname) {
      return { valid: false, error: 'Hostname mancante' };
    }
    
    return { valid: true };
  } catch {
    return { valid: false, error: 'URL non valido. Formato richiesto: http://hostname:port/api/v1' };
  }
}

// POST - Test connessione API
export async function POST() {
  const startTime = Date.now();
  console.log('[CONFIG TEST] Inizio test connessione:', new Date().toISOString());
  
  try {
    const serverConfig = getActiveServerConfig();
    
    if (!serverConfig) {
      console.log('[CONFIG TEST] Nessuna configurazione attiva trovata');
      return NextResponse.json({ 
        success: false, 
        error: 'Nessun server configurato. Aggiungi un server o configura le variabili d\'ambiente.' 
      }, { status: 400 });
    }
    
    const { apiUrl, username, password, authScope } = serverConfig;
    
    // Validazione URL
    const urlValidation = validateUrl(apiUrl);
    if (!urlValidation.valid) {
      console.log('[CONFIG TEST] URL non valido:', apiUrl, urlValidation.error);
      return NextResponse.json({ 
        success: false, 
        error: urlValidation.error,
        url: apiUrl
      }, { status: 200 });
    }
    
    // Validazione credenziali
    if (!username || username.trim().length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'Username non valido (minimo 2 caratteri)' 
      }, { status: 200 });
    }
    
    if (!password || password.trim().length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'Password non valida (minimo 2 caratteri)' 
      }, { status: 200 });
    }
    
    const baseUrl = normalizeBaseUrl(apiUrl);
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    
    console.log('[CONFIG TEST] Test URL:', baseUrl, 'AuthScope:', authScope);
    
    // Test: chiamata leggera per verificare connessione
    // Proviamo a recuperare le informazioni di licenza (endpoint leggero)
    const testUrl = `${baseUrl}/v1/${authScope}/License/1`;
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${credentials}`,
        'Authorization-Scope': authScope
      },
      signal: AbortSignal.timeout(15000) // Timeout 15 secondi
    });
    
    const elapsedMs = Date.now() - startTime;
    console.log('[CONFIG TEST] Risposta ricevuta:', response.status, 'in', elapsedMs, 'ms');
    
    if (response.ok) {
      const data = await response.json().catch(() => null);
      return NextResponse.json({ 
        success: true, 
        message: 'Connessione riuscita!',
        statusCode: response.status,
        url: testUrl,
        elapsedMs,
        serverInfo: data ? { 
          license: data.licenseType || 'N/A',
          version: data.version || 'N/A'
        } : null
      });
    }
    
    if (response.status === 401) {
      console.log('[CONFIG TEST] Credenziali non valide (401)');
      return NextResponse.json({ 
        success: false, 
        error: 'Credenziali non valide (401 Unauthorized). Verifica username e password.',
        statusCode: 401,
        elapsedMs
      }, { status: 200 });
    }
    
    if (response.status === 403) {
      console.log('[CONFIG TEST] Accesso negato (403)');
      return NextResponse.json({ 
        success: false, 
        error: 'Accesso negato (403 Forbidden). Verifica Authorization-Scope.',
        statusCode: 403,
        elapsedMs
      }, { status: 200 });
    }
    
    if (response.status === 404) {
      // 404 potrebbe significare che la connessione funziona ma la risorsa non esiste
      // Proviamo un altro endpoint più generico
      console.log('[CONFIG TEST] License endpoint 404, provo endpoint alternativo...');
      
      const altTestUrl = `${baseUrl}/v1/${authScope}/ClienteFornitoreMG?_op=search`;
      const altResponse = await fetch(altTestUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`,
          'Authorization-Scope': authScope
        },
        body: JSON.stringify({
          pageNumber: 0,
          pageSize: 1,
          items: []
        }),
        signal: AbortSignal.timeout(15000)
      });
      
      const altElapsedMs = Date.now() - startTime;
      
      if (altResponse.ok || altResponse.status === 400) {
        // 400 = connessione ok, ma query vuota non accettata
        console.log('[CONFIG TEST] Endpoint alternativo OK:', altResponse.status);
        return NextResponse.json({ 
          success: true, 
          message: 'Connessione riuscita! (endpoint License non disponibile)',
          statusCode: altResponse.status,
          elapsedMs: altElapsedMs
        });
      }
      
      if (altResponse.status === 401) {
        return NextResponse.json({ 
          success: false, 
          error: 'Credenziali non valide (401 Unauthorized)',
          statusCode: 401,
          elapsedMs: altElapsedMs
        }, { status: 200 });
      }
      
      console.log('[CONFIG TEST] Endpoint alternativo fallito:', altResponse.status);
      return NextResponse.json({ 
        success: false, 
        error: `Server raggiunto ma risorsa non trovata (${altResponse.status}). Verifica URL e AuthScope.`,
        statusCode: altResponse.status,
        elapsedMs: altElapsedMs
      }, { status: 200 });
    }
    
    if (response.status >= 500) {
      console.log('[CONFIG TEST] Errore server:', response.status);
      return NextResponse.json({ 
        success: false, 
        error: `Errore server (${response.status}). Il server API non è disponibile.`,
        statusCode: response.status,
        elapsedMs
      }, { status: 200 });
    }
    
    const errorText = await response.text().catch(() => '');
    console.log('[CONFIG TEST] Errore generico:', response.status, errorText.slice(0, 100));
    
    return NextResponse.json({ 
      success: false, 
      error: `Errore ${response.status}: ${errorText.slice(0, 200) || 'Risposta non interpretabile'}`,
      statusCode: response.status,
      elapsedMs
    }, { status: 200 });
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    console.error('[CONFIG TEST] Errore:', error);
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json({ 
        success: false, 
        error: 'Impossibile raggiungere il server. Verifica URL, connettività network e che il server sia attivo.',
        details: error.message,
        elapsedMs
      }, { status: 200 });
    }
    
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json({ 
        success: false, 
        error: 'Timeout: il server non risponde entro 15 secondi. Verifica che il server sia attivo e raggiungibile.',
        elapsedMs
      }, { status: 200 });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: 'Errore durante il test di connessione',
      details: error instanceof Error ? error.message : 'Errore sconosciuto',
      elapsedMs
    }, { status: 200 });
  }
}