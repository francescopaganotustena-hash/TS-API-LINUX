import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json');

interface ApiConfig {
  apiUrl: string;
  username: string;
  password: string;
  authScope: string;
}

function readConfig(): ApiConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Errore lettura config:', error);
  }
  return null;
}

function normalizeBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed;
}

// POST - Test connessione API
export async function POST() {
  try {
    // Leggi configurazione (file o env)
    const config = readConfig();
    
    const apiUrl = config?.apiUrl || process.env.GESTIONALE_API_URL;
    const username = config?.username || process.env.GESTIONALE_USERNAME;
    const password = config?.password || process.env.GESTIONALE_PASSWORD;
    const authScope = config?.authScope || process.env.GESTIONALE_AUTH_SCOPE || '1';
    
    if (!apiUrl) {
      return NextResponse.json({ 
        success: false, 
        error: 'URL API non configurato' 
      }, { status: 400 });
    }
    
    if (!username || !password) {
      return NextResponse.json({ 
        success: false, 
        error: 'Credenziali non configurate' 
      }, { status: 400 });
    }
    
    const baseUrl = normalizeBaseUrl(apiUrl);
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    
    // Test: chiamata leggera per verificare connessione
    // Proviamo a recuperare le informazioni di licenza (endpoint leggero)
    const testUrl = `${baseUrl}/v1/1/License/1`;
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${credentials}`,
        'Authorization-Scope': authScope
      }
    });
    
    if (response.ok) {
      return NextResponse.json({ 
        success: true, 
        message: 'Connessione riuscita!',
        statusCode: response.status,
        url: testUrl
      });
    }
    
    if (response.status === 401) {
      return NextResponse.json({ 
        success: false, 
        error: 'Credenziali non valide (401 Unauthorized)',
        statusCode: 401
      }, { status: 200 }); // Status 200 per gestire l'errore nel frontend
    }
    
    if (response.status === 404) {
      // 404 potrebbe significare che la connessione funziona ma la risorsa non esiste
      // Proviamo un altro endpoint
      const altTestUrl = `${baseUrl}/v1/1/ClienteFornitoreMG?_op=search`;
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
        })
      });
      
      if (altResponse.ok || altResponse.status === 400) {
        // 400 = connessione ok, ma query vuota non accettata
        return NextResponse.json({ 
          success: true, 
          message: 'Connessione riuscita!',
          statusCode: altResponse.status
        });
      }
      
      return NextResponse.json({ 
        success: false, 
        error: `Errore server (${altResponse.status})`,
        statusCode: altResponse.status
      }, { status: 200 });
    }
    
    const errorText = await response.text().catch(() => '');
    return NextResponse.json({ 
      success: false, 
      error: `Errore ${response.status}: ${errorText.slice(0, 200)}`,
      statusCode: response.status
    }, { status: 200 });
    
  } catch (error) {
    console.error('Errore test connessione:', error);
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json({ 
        success: false, 
        error: 'Impossibile raggiungere il server. Verifica URL e connettività.',
        details: error.message
      }, { status: 200 });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: 'Errore durante il test di connessione',
      details: error instanceof Error ? error.message : 'Errore sconosciuto'
    }, { status: 200 });
  }
}