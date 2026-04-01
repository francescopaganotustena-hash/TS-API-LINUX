'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ConfigData {
  apiUrl: string;
  username: string;
  password: string;
  authScope: string;
  source: 'env' | 'file';
  configured: boolean;
  lastUpdated?: string;
}

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigData>({
    apiUrl: '',
    username: '',
    password: '',
    authScope: '1',
    source: 'env',
    configured: false
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      setConfig(data);
    } catch {
      setMessage({ type: 'error', text: 'Errore nel caricamento della configurazione' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: config.apiUrl,
          username: config.username,
          password: config.password,
          authScope: config.authScope
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setMessage({ type: 'success', text: data.message || 'Configurazione salvata con successo' });
        setConfig(prev => ({ ...prev, source: 'file', lastUpdated: data.lastUpdated }));
        // Ricarica per aggiornare lo stato
        await loadConfig();
      } else {
        setMessage({ type: 'error', text: data.error || 'Errore durante il salvataggio' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Errore di connessione durante il salvataggio' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/config/test', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: data.message || 'Connessione riuscita!' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Connessione fallita' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Errore durante il test di connessione' });
    } finally {
      setTesting(false);
    }
  }

  async function handleReset() {
    if (!confirm('Sei sicuro di voler rimuovere la configurazione salvata? Tornerai ad usare le variabili d\'ambiente.')) {
      return;
    }
    
    try {
      const response = await fetch('/api/config', { method: 'DELETE' });
      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: 'Configurazione rimossa. Ricaricamento...' });
        setTimeout(() => loadConfig(), 1000);
      } else {
        setMessage({ type: 'error', text: data.error || 'Errore durante il reset' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Errore durante il reset' });
    }
  }

  async function handleClearData() {
    setClearing(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/config/clear', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: data.message || 'Dati cancellati con successo' });
        setShowClearConfirm(false);
      } else {
        setMessage({ type: 'error', text: data.error || 'Errore durante la cancellazione' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Errore di connessione durante la cancellazione' });
    } finally {
      setClearing(false);
    }
  }

  function requestClearConfirmation() {
    setShowClearConfirm(true);
  }

  function cancelClearConfirmation() {
    setShowClearConfirm(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg text-gray-600">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-800">
              Configurazione API
            </h1>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 text-xs rounded-full ${
                config.configured 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {config.configured ? 'Configurato' : 'Non configurato'}
              </span>
              <span className={`px-2 py-1 text-xs rounded-full ${
                config.source === 'file' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {config.source === 'file' ? 'File config' : 'Env vars'}
              </span>
            </div>
          </div>

          {message && (
            <div className={`mb-4 p-4 rounded-md ${
              message.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {message.text}
            </div>
          )}

          {config.lastUpdated && (
            <div className="mb-4 text-sm text-gray-500">
              Ultimo aggiornamento: {new Date(config.lastUpdated).toLocaleString('it-IT')}
            </div>
          )}

          <div className="space-y-4">
            {/* URL API */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL API *
              </label>
              <input
                type="url"
                value={config.apiUrl}
                onChange={(e) => setConfig(prev => ({ ...prev, apiUrl: e.target.value }))}
                placeholder="http://server:9080/api"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">
                URL base del server API (es. http://miorouter.homeip.net:9080/api)
              </p>
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username *
              </label>
              <input
                type="text"
                value={config.username}
                onChange={(e) => setConfig(prev => ({ ...prev, username: e.target.value }))}
                placeholder="Nome utente"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={config.password}
                  onChange={(e) => setConfig(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Password"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {config.password === '••••••••' 
                  ? 'Password già configurata. Lascia vuoto per mantenere quella esistente.'
                  : 'Inserisci la password per autenticarsi'}
              </p>
            </div>

            {/* Auth Scope */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Authorization Scope
              </label>
              <input
                type="text"
                value={config.authScope}
                onChange={(e) => setConfig(prev => ({ ...prev, authScope: e.target.value }))}
                placeholder="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">
                Scope di autorizzazione (solitamente 1)
              </p>
            </div>
          </div>

          {/* Pulsanti azione */}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !config.apiUrl || !config.username}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Salvataggio...
                </>
              ) : (
                '💾 Salva Configurazione'
              )}
            </button>

            <button
              onClick={handleTest}
              disabled={testing || !config.configured}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {testing ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Test in corso...
                </>
              ) : (
                '🔌 Test Connessione'
              )}
            </button>

            {config.source === 'file' && (
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                🗑️ Reset
              </button>
            )}
          </div>

          {/* Sezione cancellazione dati */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-3">⚠️ Manutenzione Database</h3>
            <button
              onClick={requestClearConfirmation}
              disabled={clearing}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🧹 Cancella Log e Database
            </button>
            <p className="mt-2 text-xs text-gray-500">
              Cancella tutti i log delle sincronizzazioni precedenti e resetta il database SQL Server.
              <strong className="text-orange-600"> Questa operazione è irreversibile!</strong>
            </p>
          </div>

          {/* Modal di doppia conferma */}
          {showClearConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
                <h2 className="text-xl font-bold text-red-600 mb-4">⚠️ Conferma Cancellazione</h2>
                <p className="text-gray-700 mb-4">
                  Stai per cancellare <strong>tutti i log delle sincronizzazioni</strong> e 
                  <strong> resettare completamente il database SQL Server</strong>.
                </p>
                <p className="text-gray-600 mb-4">
                  Questa operazione eliminerà:
                </p>
                <ul className="text-sm text-gray-600 mb-4 list-disc list-inside">
                  <li>Tutti i job di sincronizzazione (sync_jobs)</li>
                  <li>Tutti i dati cache clienti, fornitori, articoli, ordini</li>
                  <li>I metadati di sincronizzazione</li>
                </ul>
                <p className="text-red-600 font-semibold mb-6">
                  ⚠️ QUESTA OPERAZIONE È IRREVERSIBILE! Procedere?
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={cancelClearConfirmation}
                    disabled={clearing}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 disabled:opacity-50"
                  >
                    ❌ Annulla
                  </button>
                  <button
                    onClick={handleClearData}
                    disabled={clearing}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {clearing ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Cancellazione...
                      </>
                    ) : (
                      '✅ Conferma Cancellazione'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Info box */}
          <div className="mt-6 p-4 bg-gray-50 rounded-md border border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-2">ℹ️ Informazioni</h3>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• La configurazione viene salvata in <code className="bg-gray-200 px-1 rounded">data/config.json</code></li>
              <li>• Se non configurata, vengono usate le variabili ambiente</li>
              <li>• La password è memorizzata in chiaro nel file di configurazione</li>
              <li>• Assicurarsi che il file non sia versionato in Git</li>
            </ul>
          </div>

          {/* Link torna alla home */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
              ← Torna alla Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}