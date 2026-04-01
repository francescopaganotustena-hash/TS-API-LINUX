'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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

interface ConfigData {
  servers: ServerConfig[];
  activeServerId: string | null;
  source: 'env' | 'file';
  configured: boolean;
  lastUpdated?: string;
}

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigData>({
    servers: [],
    activeServerId: null,
    source: 'env',
    configured: false
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [pendingSwitchServerId, setPendingSwitchServerId] = useState<string | null>(null);
  
  // Form state per aggiungere/modificare server
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null);
  const [showServerForm, setShowServerForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    apiUrl: '',
    username: '',
    password: '',
    authScope: '1'
  });

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

  function getActiveServer(): ServerConfig | null {
    return config.servers.find(s => s.id === config.activeServerId) || null;
  }

  function startAddServer() {
    setEditingServer(null);
    setFormData({
      name: '',
      apiUrl: '',
      username: '',
      password: '',
      authScope: '1'
    });
    setShowServerForm(true);
    setShowPassword(false);
  }

  function startEditServer(server: ServerConfig) {
    setEditingServer(server);
    setFormData({
      name: server.name,
      apiUrl: server.apiUrl,
      username: server.username,
      password: server.password,
      authScope: server.authScope || '1'
    });
    setShowServerForm(true);
    setShowPassword(false);
  }

  function cancelServerForm() {
    setShowServerForm(false);
    setEditingServer(null);
    setFormData({
      name: '',
      apiUrl: '',
      username: '',
      password: '',
      authScope: '1'
    });
  }

  async function handleSaveServer() {
    setSaving(true);
    setMessage(null);
    
    try {
      const payload = {
        ...formData,
        id: editingServer?.id
      };
      
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setMessage({ type: 'success', text: data.message || 'Server salvato con successo' });
        setShowServerForm(false);
        setEditingServer(null);
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

  function requestSwitchServer(serverId: string) {
    // Se è lo stesso server attivo, non fare nulla
    if (serverId === config.activeServerId) return;
    
    setPendingSwitchServerId(serverId);
    setShowSwitchConfirm(true);
  }

  function cancelSwitchConfirmation() {
    setShowSwitchConfirm(false);
    setPendingSwitchServerId(null);
  }

  async function handleSwitchServer(clearData: boolean) {
    if (!pendingSwitchServerId) return;
    
    setSwitching(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeServerId: pendingSwitchServerId,
          clearData: clearData
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setMessage({ 
          type: 'success', 
          text: data.message || 'Server cambiato con successo' 
        });
        setShowSwitchConfirm(false);
        setPendingSwitchServerId(null);
        await loadConfig();
      } else {
        setMessage({ type: 'error', text: data.error || 'Errore durante il cambio server' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Errore di connessione durante il cambio server' });
    } finally {
      setSwitching(false);
    }
  }

  async function handleDeleteServer(serverId: string) {
    const server = config.servers.find(s => s.id === serverId);
    if (!server) return;
    
    if (!confirm(`Sei sicuro di voler eliminare il server "${server.name}"?`)) {
      return;
    }
    
    try {
      const response = await fetch(`/api/config?serverId=${serverId}`, { method: 'DELETE' });
      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: data.message || 'Server eliminato' });
        await loadConfig();
      } else {
        setMessage({ type: 'error', text: data.error || 'Errore durante l\'eliminazione' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Errore durante l\'eliminazione' });
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
    if (!confirm('Sei sicuro di voler rimuovere TUTTI i server salvati? Tornerai ad usare le variabili d\'ambiente.')) {
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

  const activeServer = getActiveServer();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-800">
              Configurazione Server API
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

          {/* Lista Server */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">
              📋 Server Salvati ({config.servers.length})
            </h2>
            
            {config.servers.length === 0 ? (
              <div className="text-gray-500 text-sm p-4 bg-gray-50 rounded-md">
                Nessun server configurato. Aggiungi un server o usa le variabili d'ambiente.
              </div>
            ) : (
              <div className="space-y-2">
                {config.servers.map((server) => (
                  <div 
                    key={server.id}
                    className={`p-4 rounded-md border ${
                      server.id === config.activeServerId 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-lg ${
                          server.id === config.activeServerId ? 'text-green-600' : 'text-gray-400'
                        }`}>
                          {server.id === config.activeServerId ? '✅' : '⚪'}
                        </span>
                        <div>
                          <div className="font-medium text-gray-800">{server.name}</div>
                          <div className="text-sm text-gray-500">{server.apiUrl}</div>
                          {server.id === config.activeServerId && (
                            <span className="text-xs text-green-600 font-medium">Server Attivo</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {server.id !== config.activeServerId && server.id !== 'env' && (
                          <button
                            onClick={() => requestSwitchServer(server.id)}
                            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            title="Attiva questo server"
                          >
                            🔄 Attiva
                          </button>
                        )}
                        {server.id !== 'env' && (
                          <>
                            <button
                              onClick={() => startEditServer(server)}
                              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                              title="Modifica server"
                            >
                              ✏️ Modifica
                            </button>
                            <button
                              onClick={() => handleDeleteServer(server.id)}
                              disabled={server.id === config.activeServerId}
                              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              title={server.id === config.activeServerId ? 'Non puoi eliminare il server attivo' : 'Elimina server'}
                            >
                              🗑️ Elimina
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <button
              onClick={startAddServer}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              ➕ Aggiungi Nuovo Server
            </button>
          </div>

          {/* Form per aggiungere/modificare server */}
          {showServerForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg mx-4 w-full">
                <h2 className="text-xl font-bold text-gray-800 mb-4">
                  {editingServer ? `✏️ Modifica: ${editingServer.name}` : '➕ Aggiungi Nuovo Server'}
                </h2>
                
                <div className="space-y-4">
                  {/* Nome Server */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome Server *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="es. Produzione, Test, Cliente XYZ"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* URL API */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      URL API *
                    </label>
                    <input
                      type="url"
                      value={formData.apiUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, apiUrl: e.target.value }))}
                      placeholder="http://server:9080/api"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Username */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username *
                    </label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="Nome utente"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Password"
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {editingServer && formData.password === '••••••••' && (
                      <p className="mt-1 text-xs text-gray-500">
                        Password già configurata. Lascia vuoto per mantenere quella esistente.
                      </p>
                    )}
                  </div>

                  {/* Auth Scope */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Authorization Scope
                    </label>
                    <input
                      type="text"
                      value={formData.authScope}
                      onChange={(e) => setFormData(prev => ({ ...prev, authScope: e.target.value }))}
                      placeholder="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="mt-6 flex gap-3 justify-end">
                  <button
                    onClick={cancelServerForm}
                    disabled={saving}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 disabled:opacity-50"
                  >
                    ❌ Annulla
                  </button>
                  <button
                    onClick={handleSaveServer}
                    disabled={saving || !formData.name || !formData.apiUrl || !formData.username}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Salvataggio...
                      </>
                    ) : (
                      '💾 Salva Server'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal conferma cambio server */}
          {showSwitchConfirm && pendingSwitchServerId && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
                <h2 className="text-xl font-bold text-orange-600 mb-4">⚠️ Cambio Server Rilevato</h2>
                <p className="text-gray-700 mb-4">
                  Stai cambiando il server attivo da <strong>{activeServer?.name || 'Nessuno'}</strong> a 
                  <strong> {config.servers.find(s => s.id === pendingSwitchServerId)?.name}</strong>.
                </p>
                <p className="text-gray-600 mb-4">
                  Il cambio del server attivo richiede la <strong>cancellazione totale</strong> di:
                </p>
                <ul className="text-sm text-gray-600 mb-4 list-disc list-inside">
                  <li>Tutti i log di sincronizzazione (sync_jobs)</li>
                  <li>Tutti i dati cache nel database SQL Server</li>
                  <li>I metadati di sincronizzazione</li>
                </ul>
                <p className="text-red-600 font-semibold mb-6">
                  ⚠️ QUESTA OPERAZIONE È IRREVERSIBILE!
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={cancelSwitchConfirmation}
                    disabled={switching}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 disabled:opacity-50"
                  >
                    ❌ Annulla
                  </button>
                  <button
                    onClick={() => handleSwitchServer(true)}
                    disabled={switching}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {switching ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Cambio...
                      </>
                    ) : (
                      '✅ Conferma e Cancella Dati'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Info server attivo */}
          {activeServer && (
            <div className="mb-6 p-4 bg-blue-50 rounded-md border border-blue-200">
              <h3 className="text-sm font-medium text-blue-800 mb-2">
                🟢 Server Attivo: {activeServer.name}
              </h3>
              <div className="text-sm text-blue-700 space-y-1">
                <div><strong>URL:</strong> {activeServer.apiUrl}</div>
                <div><strong>Username:</strong> {activeServer.username}</div>
                <div><strong>Auth Scope:</strong> {activeServer.authScope}</div>
              </div>
              <button
                onClick={handleTest}
                disabled={testing || !config.configured}
                className="mt-3 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
            </div>
          )}

          {/* Sezione cancellazione dati */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-3">⚠️ Manutenzione Database</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={requestClearConfirmation}
                disabled={clearing}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🧹 Cancella Log e Database
              </button>
              {config.source === 'file' && config.servers.length > 0 && (
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  🗑️ Reset Configurazione
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Cancella tutti i log delle sincronizzazioni precedenti e resetta il database SQL Server.
              <strong className="text-orange-600"> Questa operazione è irreversibile!</strong>
            </p>
          </div>

          {/* Modal di doppia conferma cancellazione */}
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
              <li>• Puoi salvare più server e cambiare il server attivo in qualsiasi momento</li>
              <li>• <strong className="text-orange-600">Il cambio server attivo cancella automaticamente tutti i dati</strong></li>
              <li>• Se non configurato, vengono usate le variabili ambiente</li>
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