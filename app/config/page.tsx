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

interface TestResult {
  success: boolean;
  message?: string;
  error?: string;
  elapsedMs?: number;
  statusCode?: number;
  serverInfo?: { license: string; version: string } | null;
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
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [clearing, setClearing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
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
  
  // Validazione form
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formTouched, setFormTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadConfig();
  }, []);

  // Test automatico all'apertura pagina se configurato
  useEffect(() => {
    if (!loading && config.configured && config.activeServerId) {
      // Test connessione automatico dopo 1 secondo
      const timer = setTimeout(() => {
        handleTest(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, config.configured, config.activeServerId]);

  async function loadConfig() {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      setConfig(data);
      setTestResult(null);
    } catch {
      setMessage({ type: 'error', text: 'Errore nel caricamento della configurazione' });
    } finally {
      setLoading(false);
    }
  }

  function getActiveServer(): ServerConfig | null {
    return config.servers.find(s => s.id === config.activeServerId) || null;
  }

  // ==================== VALIDAZIONE FORM ====================
  
  function validateField(field: string, value: string): string | null {
    switch (field) {
      case 'name':
        if (!value.trim()) return 'Nome server è obbligatorio';
        if (value.trim().length < 3) return 'Nome deve avere almeno 3 caratteri';
        if (value.trim().length > 50) return 'Nome troppo lungo (max 50 caratteri)';
        // Verifica duplicati (solo per nuovo server)
        if (!editingServer && config.servers.some(s => s.name.toLowerCase() === value.trim().toLowerCase())) {
          return 'Nome già in uso';
        }
        return null;
      
      case 'apiUrl':
        if (!value.trim()) return 'URL API è obbligatorio';
        try {
          const url = new URL(value.trim());
          if (!url.protocol.startsWith('http')) return 'Protocollo non valido (usa http:// o https://)';
          if (!url.hostname) return 'Hostname mancante';
          if (!url.pathname.includes('/api') && !url.pathname.includes('/v1')) return 'URL deve contenere /api/v1';
        } catch {
          return 'URL non valido (formato: http://hostname:port/api/v1)';
        }
        return null;
      
      case 'username':
        if (!value.trim()) return 'Username è obbligatorio';
        if (value.trim().length < 2) return 'Username troppo corto (min 2 caratteri)';
        return null;
      
      case 'password':
        if (!value) return 'Password è obbligatoria';
        if (value === '••••••••') return 'Inserisci la password reale';
        if (value.length < 2) return 'Password troppo corta (min 2 caratteri)';
        return null;
      
      case 'authScope':
        if (!value.trim()) return 'Auth Scope è obbligatorio';
        if (!/^\d+$/.test(value.trim())) return 'Auth Scope deve essere un numero';
        return null;
      
      default:
        return null;
    }
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    const fields = ['name', 'apiUrl', 'username', 'password', 'authScope'];
    
    let isValid = true;
    fields.forEach(field => {
      const error = validateField(field, formData[field as keyof typeof formData]);
      if (error) {
        errors[field] = error;
        isValid = false;
      }
    });
    
    setFormErrors(errors);
    return isValid;
  }

  function handleFieldChange(field: string, value: string) {
    setFormData(prev => ({ ...prev, [field]: value }));
    setFormTouched(prev => ({ ...prev, [field]: true }));
    
    // Validazione live
    const error = validateField(field, value);
    setFormErrors(prev => ({ ...prev, [field]: error || '' }));
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
    setFormErrors({});
    setFormTouched({});
    setShowServerForm(true);
    setShowPassword(false);
  }

  function startEditServer(server: ServerConfig) {
    setEditingServer(server);
    setFormData({
      name: server.name,
      apiUrl: server.apiUrl,
      username: server.username,
      password: server.password, // Password mascherata
      authScope: server.authScope || '1'
    });
    setFormErrors({});
    setFormTouched({});
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
    setFormErrors({});
    setFormTouched({});
  }

  async function handleSaveServer() {
    if (!validateForm()) {
      setMessage({ type: 'error', text: 'Correggi gli errori nel form prima di salvare' });
      return;
    }
    
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
    setMessage(null);
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
        setTestResult(null);
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
    
    if (!confirm(`Sei sicuro di voler eliminare il server "${server.name}"?\n\nQuesta operazione non può essere annullata.`)) {
      return;
    }
    
    setMessage(null);
    
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

  async function handleTest(silent = false) {
    setTesting(true);
    if (!silent) setMessage(null);
    
    try {
      const response = await fetch('/api/config/test', { method: 'POST' });
      const data: TestResult = await response.json();
      
      setTestResult(data);
      
      if (!silent) {
        if (data.success) {
          setMessage({ type: 'success', text: data.message || 'Connessione riuscita!' });
        } else {
          setMessage({ type: 'error', text: data.error || 'Connessione fallita' });
        }
      }
    } catch {
      const errorResult = { success: false, error: 'Errore durante il test di connessione' };
      setTestResult(errorResult);
      if (!silent) {
        setMessage({ type: 'error', text: errorResult.error });
      }
    } finally {
      setTesting(false);
    }
  }

  async function handleReset() {
    if (!confirm('Sei sicuro di voler rimuovere TUTTI i server salvati?\n\nTornerai ad usare le variabili d\'ambiente.\nQuesta operazione non può essere annullata.')) {
      return;
    }
    
    setMessage(null);
    
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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-lg text-gray-600">Caricamento configurazione...</div>
        </div>
      </div>
    );
  }

  const activeServer = getActiveServer();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          {/* Header */}
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
                {config.configured ? '✓ Configurato' : '⚠ Non configurato'}
              </span>
              <span className={`px-2 py-1 text-xs rounded-full ${
                config.source === 'file' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {config.source === 'file' ? '📁 File config' : '🔐 Env vars'}
              </span>
            </div>
          </div>

          {/* Messaggi */}
          {message && (
            <div className={`mb-4 p-4 rounded-md border ${
              message.type === 'success' 
                ? 'bg-green-50 text-green-800 border-green-200' 
                : message.type === 'warning'
                ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {message.type === 'success' ? '✅' : message.type === 'warning' ? '⚠️' : '❌'}
                </span>
                <span>{message.text}</span>
              </div>
            </div>
          )}

          {/* Ultimo aggiornamento */}
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
              <div className="text-gray-500 text-sm p-4 bg-gray-50 rounded-md border border-gray-200">
                Nessun server configurato. Aggiungi un server o usa le variabili d'ambiente.
              </div>
            ) : (
              <div className="space-y-3">
                {config.servers.map((server) => (
                  <div 
                    key={server.id}
                    className={`p-4 rounded-md border transition-all ${
                      server.id === config.activeServerId 
                        ? 'border-green-500 bg-green-50 shadow-sm' 
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-lg flex-shrink-0`}>
                          {server.id === config.activeServerId ? '✅' : '⚪'}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800 truncate">{server.name}</div>
                          <div className="text-sm text-gray-500 truncate">{server.apiUrl}</div>
                          {server.id === config.activeServerId && (
                            <span className="text-xs text-green-600 font-medium">Server Attivo</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {server.id !== config.activeServerId && (
                          <button
                            onClick={() => requestSwitchServer(server.id)}
                            className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                            title="Attiva questo server"
                          >
                            🔄 Attiva
                          </button>
                        )}
                        {server.id !== 'env' && (
                          <>
                            <button
                              onClick={() => startEditServer(server)}
                              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                              title="Modifica server"
                            >
                              ✏️ Modifica
                            </button>
                            <button
                              onClick={() => handleDeleteServer(server.id)}
                              disabled={server.id === config.activeServerId}
                              className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title={server.id === config.activeServerId ? "Non puoi eliminare il server attivo" : "Elimina server"}
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
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              ➕ Aggiungi Nuovo Server
            </button>
          </div>

          {/* Form per aggiungere/modificare server */}
          {showServerForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
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
                      onChange={(e) => handleFieldChange('name', e.target.value)}
                      placeholder="es. Produzione, Test, Cliente XYZ"
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                        formErrors.name && formTouched.name
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    {formErrors.name && formTouched.name && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                    )}
                  </div>

                  {/* URL API */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      URL API *
                    </label>
                    <input
                      type="url"
                      value={formData.apiUrl}
                      onChange={(e) => handleFieldChange('apiUrl', e.target.value)}
                      placeholder="http://server:9080/api/v1"
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                        formErrors.apiUrl && formTouched.apiUrl
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    {formErrors.apiUrl && formTouched.apiUrl && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.apiUrl}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Formato: http://hostname:port/api/v1
                    </p>
                  </div>

                  {/* Username */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username *
                    </label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => handleFieldChange('username', e.target.value)}
                      placeholder="Nome utente API"
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                        formErrors.username && formTouched.username
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    {formErrors.username && formTouched.username && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.username}</p>
                    )}
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
                        onChange={(e) => handleFieldChange('password', e.target.value)}
                        placeholder="Password API"
                        className={`w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 ${
                          formErrors.password && formTouched.password
                            ? 'border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:ring-blue-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {formErrors.password && formTouched.password && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.password}</p>
                    )}
                    {editingServer && formData.password === '••••••••' && (
                      <p className="mt-1 text-xs text-gray-500">
                        Password già configurata. Inserisci una nuova password per cambiarla.
                      </p>
                    )}
                  </div>

                  {/* Auth Scope */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Authorization Scope *
                    </label>
                    <input
                      type="text"
                      value={formData.authScope}
                      onChange={(e) => handleFieldChange('authScope', e.target.value)}
                      placeholder="1"
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                        formErrors.authScope && formTouched.authScope
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    {formErrors.authScope && formTouched.authScope && (
                      <p className="mt-1 text-sm text-red-600">{formErrors.authScope}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Numero identificativo dell'ambiente (es. 1)
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex gap-3 justify-end">
                  <button
                    onClick={cancelServerForm}
                    disabled={saving}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 disabled:opacity-50 transition-colors"
                  >
                    ❌ Annulla
                  </button>
                  <button
                    onClick={handleSaveServer}
                    disabled={saving || Object.values(formErrors).some(e => e)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
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
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
                <h2 className="text-xl font-bold text-orange-600 mb-4">⚠️ Cambio Server Rilevato</h2>
                <p className="text-gray-700 mb-4">
                  Stai cambiando il server attivo da <strong>{activeServer?.name || 'Nessuno'}</strong> a 
                  <strong> {config.servers.find(s => s.id === pendingSwitchServerId)?.name}</strong>.
                </p>
                <p className="text-gray-600 mb-4">
                  Il cambio del server attivo richiede la <strong>cancellazione totale</strong> di:
                </p>
                <ul className="text-sm text-gray-600 mb-4 list-disc list-inside space-y-1">
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
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 disabled:opacity-50 transition-colors"
                  >
                    ❌ Annulla
                  </button>
                  <button
                    onClick={() => handleSwitchServer(true)}
                    disabled={switching}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
                  >
                    {switching ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Cambio in corso...
                      </>
                    ) : (
                      '✅ Conferma e Cancella Dati'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Info server attivo + Test connessione */}
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
              
              {/* Risultato test */}
              {testResult && (
                <div className={`mt-3 p-3 rounded-md ${
                  testResult.success 
                    ? 'bg-green-100 border border-green-200' 
                    : 'bg-red-100 border border-red-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{testResult.success ? '✅' : '❌'}</span>
                    <div>
                      <div className={`font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                        {testResult.success ? testResult.message : testResult.error}
                      </div>
                      {testResult.elapsedMs && (
                        <div className="text-xs text-gray-600">
                          Tempo: {testResult.elapsedMs}ms
                        </div>
                      )}
                      {testResult.serverInfo && (
                        <div className="text-xs text-gray-600">
                          Licenza: {testResult.serverInfo.license} | Versione: {testResult.serverInfo.version}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              <button
                onClick={() => handleTest(false)}
                disabled={testing || !config.configured}
                className="mt-3 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
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
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                🧹 Cancella Log e Database
              </button>
              {config.source === 'file' && config.servers.length > 0 && (
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
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
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
                <h2 className="text-xl font-bold text-red-600 mb-4">⚠️ Conferma Cancellazione</h2>
                <p className="text-gray-700 mb-4">
                  Stai per cancellare <strong>tutti i log delle sincronizzazioni</strong> e 
                  <strong> resettare completamente il database SQL Server</strong>.
                </p>
                <p className="text-gray-600 mb-4">
                  Questa operazione eliminerà:
                </p>
                <ul className="text-sm text-gray-600 mb-4 list-disc list-inside space-y-1">
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
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 disabled:opacity-50 transition-colors"
                  >
                    ❌ Annulla
                  </button>
                  <button
                    onClick={handleClearData}
                    disabled={clearing}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
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
              <li>• Backup automatico in <code className="bg-gray-200 px-1 rounded">data/config.backup.json</code></li>
              <li>• Log operazioni in <code className="bg-gray-200 px-1 rounded">data/operations.log</code></li>
            </ul>
          </div>

          {/* Link torna alla home */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm transition-colors">
              ← Torna alla Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
