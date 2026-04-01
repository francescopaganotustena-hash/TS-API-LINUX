import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json');

interface ApiConfig {
  apiUrl: string;
  username: string;
  password: string;
  authScope: string;
  lastUpdated?: string;
}

function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
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

function writeConfig(config: ApiConfig) {
  ensureDataDir();
  config.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

// GET - Leggi configurazione corrente (password mascherata)
export async function GET() {
  const config = readConfig();
  
  if (!config) {
    // Fallback su variabili d'ambiente
    return NextResponse.json({
      apiUrl: process.env.GESTIONALE_API_URL || '',
      username: process.env.GESTIONALE_USERNAME || '',
      password: process.env.GESTIONALE_PASSWORD ? '••••••••' : '',
      authScope: process.env.GESTIONALE_AUTH_SCOPE || '1',
      source: 'env',
      configured: !!(process.env.GESTIONALE_API_URL && process.env.GESTIONALE_USERNAME && process.env.GESTIONALE_PASSWORD)
    });
  }
  
  return NextResponse.json({
    apiUrl: config.apiUrl,
    username: config.username,
    password: '••••••••', // Password mascherata
    authScope: config.authScope || '1',
    source: 'file',
    configured: true,
    lastUpdated: config.lastUpdated
  });
}

// POST - Salva nuova configurazione
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
    
    // Se la password è mascherata, mantieni quella esistente
    let password = body.password;
    if (password === '••••••••' || !password) {
      const existingConfig = readConfig();
      password = existingConfig?.password || process.env.GESTIONALE_PASSWORD || '';
    }
    
    const newConfig: ApiConfig = {
      apiUrl: body.apiUrl.trim(),
      username: body.username.trim(),
      password: password,
      authScope: body.authScope?.trim() || '1'
    };
    
    writeConfig(newConfig);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Configurazione salvata con successo',
      lastUpdated: newConfig.lastUpdated
    });
  } catch (error) {
    console.error('Errore salvataggio config:', error);
    return NextResponse.json({ error: 'Errore durante il salvataggio' }, { status: 500 });
  }
}

// DELETE - Reset configurazione (torna a variabili d'ambiente)
export async function DELETE() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
    return NextResponse.json({ success: true, message: 'Configurazione rimossa' });
  } catch (error) {
    console.error('Errore reset config:', error);
    return NextResponse.json({ error: 'Errore durante il reset' }, { status: 500 });
  }
}