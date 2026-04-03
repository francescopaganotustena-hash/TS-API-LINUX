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
        if (!value.trim()) return 'Nome server Ã¨ obbligatorio';
        if (value.trim().length < 3) return 'Nome deve avere almeno 3 caratteri';
        if (value.trim().length > 50) return 'Nome troppo lungo (max 50 caratteri)';
        // Verifica duplicati (solo per nuovo server)
        if (!editingServer && config.servers.some(s => s.name.toLowerCase() === value.trim().toLowerCase())) {
          return 'Nome giÃ  in uso';
        }
        return null;
      
      case 'apiUrl':
        if (!value.trim()) return 'URL API Ã¨ obbligatorio';
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
        if (!value.trim()) return 'Username Ã¨ obbligatorio';
        if (value.trim().length < 2) return 'Username troppo corto (min 2 caratteri)';
        return null;
      
      case 'password':
        if (!value) return 'Password Ã¨ obbligatoria';
        if (value === 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢') return 'Inserisci la password reale';
        if (value.length < 2) return 'Password troppo corta (min 2 caratteri)';
        return null;
      
      case 'authScope':
        if (!value.trim()) return 'Auth Scope Ã¨ obbligatorio';
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
    // Se Ã¨ lo stesso server attivo, non fare nulla
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
    
    if (!confirm(`Sei sicuro di voler eliminare il server "${server.name}"?\n\nQuesta operazione non puÃ² essere annullata.`)) {
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
    if (!confirm('Sei sicuro di voler rimuovere TUTTI i server salvati?\n\nTornerai ad usare le variabili d\'ambiente.\nQuesta operazione non puÃ² essere annullata.')) {
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

  const panel = 'rounded-3xl border border-slate-200/80 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur';
  const panelInner = 'p-5 sm:p-6';
  const label = 'text-xs font-semibold uppercase tracking-[0.18em] text-slate-500';
  const muted = 'text-sm text-slate-500';
  const badgeBase = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset';
  const btnBase = 'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
  const btnPrimary = 'bg-slate-900 text-white hover:bg-slate-700 focus:ring-slate-400';
  const btnSecondary = 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 focus:ring-slate-200';
  const btnDanger = 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-400';
  const btnSoft = 'bg-slate-100 text-slate-700 hover:bg-slate-200 focus:ring-slate-200';
  const inputBase = 'mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10';
  const inputError = 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10';
  const inputNormal = 'border-slate-300';
  const sectionHeader = 'flex flex-col gap-3 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-end sm:justify-between';

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.06),transparent_28%)]" />
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className={`${panel} w-full max-w-md ${panelInner} text-center`}>
            <div className="mx-auto mb-4 h-14 w-14 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
            <div className="text-lg font-semibold text-slate-950">Caricamento configurazione</div>
            <div className={`mt-1 ${muted}`}>Recupero impostazioni server e stato corrente...</div>
          </div>
        </div>
      </div>
    );
  }

  const activeServer = getActiveServer();
  const activeServerName = activeServer?.name || 'Nessuno';
  const pendingServerName = config.servers.find(s => s.id === pendingSwitchServerId)?.name || '';

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.06),transparent_30%)]" />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="space-y-6">
          <header className={`${panel} ${panelInner}`}>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <div className={label}>Configuration</div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    Configurazione Server API
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                    Gestisci piu server, cambia il server attivo e verifica la connessione da una sola schermata.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`${badgeBase} ${
                    config.configured
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      : 'bg-amber-50 text-amber-700 ring-amber-200'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${config.configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {config.configured ? 'Configurato' : 'Non configurato'}
                </span>
                <span
                  className={`${badgeBase} ${
                    config.source === 'file'
                      ? 'bg-sky-50 text-sky-700 ring-sky-200'
                      : 'bg-slate-100 text-slate-700 ring-slate-200'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${config.source === 'file' ? 'bg-sky-500' : 'bg-slate-500'}`} />
                  {config.source === 'file' ? 'File config' : 'Env vars'}
                </span>
                {config.lastUpdated && (
                  <span className={`${badgeBase} bg-white text-slate-600 ring-slate-200`}>
                    Aggiornato {new Date(config.lastUpdated).toLocaleString('it-IT')}
                  </span>
                )}
              </div>
            </div>
          </header>

          {message && (
            <div
              role="status"
              className={`border-l-4 px-4 py-3 ${panel} ${
                message.type === 'success'
                  ? 'border-l-emerald-500 bg-emerald-50/80 text-emerald-900'
                  : message.type === 'warning'
                  ? 'border-l-amber-500 bg-amber-50/80 text-amber-900'
                  : 'border-l-rose-500 bg-rose-50/80 text-rose-900'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    message.type === 'success'
                      ? 'bg-emerald-100 text-emerald-700'
                      : message.type === 'warning'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {message.type === 'success' ? 'OK' : message.type === 'warning' ? '!' : 'x'}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {message.type === 'success' ? 'Operazione completata' : message.type === 'warning' ? 'Attenzione' : 'Errore'}
                  </div>
                  <div className="text-sm leading-6">{message.text}</div>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
            <section className={`${panel} ${panelInner}`}>
              <div className={sectionHeader}>
                <div>
                  <div className={label}>Servers</div>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950">Server salvati</h2>
                  <p className={`mt-1 ${muted}`}>
                    {config.servers.length} server disponibili, con cambio attivo e modifica inline.
                  </p>
                </div>
                <button onClick={startAddServer} className={`${btnBase} ${btnPrimary} w-full sm:w-auto`}>
                  Aggiungi server
                </button>
              </div>

              <div className="mt-5">
                {config.servers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-sm text-slate-600">
                    Nessun server configurato. Aggiungine uno oppure usa le variabili d&apos;ambiente.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {config.servers.map(server => {
                      const isActive = server.id === config.activeServerId;
                      return (
                        <article
                          key={server.id}
                          className={`rounded-2xl border p-4 transition-all ${
                            isActive
                              ? 'border-emerald-200 bg-emerald-50/80 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                          }`}
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-base font-semibold text-slate-950">{server.name}</h3>
                                <span
                                  className={`${badgeBase} ${
                                    isActive
                                      ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                                      : 'bg-slate-100 text-slate-600 ring-slate-200'
                                  }`}
                                >
                                  <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                  {isActive ? 'Attivo' : 'Inattivo'}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-sm text-slate-600">{server.apiUrl}</p>
                              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1">Username: {server.username}</span>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1">Scope: {server.authScope || '1'}</span>
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 sm:items-end">
                              <div className="flex flex-wrap gap-2">
                                {server.id !== config.activeServerId && (
                                  <button
                                    onClick={() => requestSwitchServer(server.id)}
                                    className={`${btnBase} ${btnSecondary} w-full sm:w-auto`}
                                    title="Attiva questo server"
                                  >
                                    Attiva
                                  </button>
                                )}
                                {server.id !== 'env' && (
                                  <>
                                    <button
                                      onClick={() => startEditServer(server)}
                                      className={`${btnBase} ${btnSoft} w-full sm:w-auto`}
                                      title="Modifica server"
                                    >
                                      Modifica
                                    </button>
                                    <button
                                      onClick={() => handleDeleteServer(server.id)}
                                      disabled={server.id === config.activeServerId}
                                      className={`${btnBase} ${btnDanger} w-full sm:w-auto disabled:bg-rose-300`}
                                      title={
                                        server.id === config.activeServerId
                                          ? 'Non puoi eliminare il server attivo'
                                          : 'Elimina server'
                                      }
                                    >
                                      Elimina
                                    </button>
                                  </>
                                )}
                              </div>
                              {isActive && (
                                <span className="text-xs font-medium text-emerald-700">
                                  Server in uso dalla configurazione corrente
                                </span>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <div className="space-y-6">
              <section className={`${panel} ${panelInner}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className={label}>Active server</div>
                    <h2 className="mt-1 text-xl font-semibold text-slate-950">Server attivo</h2>
                  </div>
                  <span
                    className={`${badgeBase} ${
                      activeServer
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : 'bg-slate-100 text-slate-600 ring-slate-200'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${activeServer ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {activeServer ? 'Online' : 'Nessuno'}
                  </span>
                </div>

                {activeServer ? (
                  <div className="mt-5 space-y-5">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Nome</div>
                        <div className="mt-1 text-sm font-medium text-slate-900">{activeServer.name}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Username</div>
                        <div className="mt-1 truncate text-sm font-medium text-slate-900">{activeServer.username}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Scope</div>
                        <div className="mt-1 text-sm font-medium text-slate-900">{activeServer.authScope}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Endpoint</div>
                      <div className="mt-1 break-all text-sm font-medium text-slate-900">{activeServer.apiUrl}</div>
                    </div>

                    {testResult && (
                      <div
                        className={`rounded-2xl border p-4 ${
                          testResult.success
                            ? 'border-emerald-200 bg-emerald-50/80'
                            : 'border-rose-200 bg-rose-50/80'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                              testResult.success ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {testResult.success ? 'OK' : 'x'}
                          </span>
                          <div className="min-w-0 space-y-2">
                            <div className={`text-sm font-semibold ${testResult.success ? 'text-emerald-900' : 'text-rose-900'}`}>
                              {testResult.success ? testResult.message : testResult.error}
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                              {testResult.elapsedMs && (
                                <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">Tempo: {testResult.elapsedMs}ms</span>
                              )}
                              {testResult.serverInfo && (
                                <>
                                  <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                                    Licenza: {testResult.serverInfo.license}
                                  </span>
                                  <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                                    Versione: {testResult.serverInfo.version}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <button onClick={() => handleTest(false)} disabled={testing || !config.configured} className={`${btnBase} ${btnPrimary} w-full`}>
                      {testing ? (
                        <>
                          <span className="animate-spin">⏳</span>
                          Test in corso
                        </>
                      ) : (
                        'Test connessione'
                      )}
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm text-slate-600">
                    Nessun server attivo selezionato. Attiva uno dei server salvati per vedere i dettagli e avviare il test.
                  </p>
                )}
              </section>

              <section className={`${panel} ${panelInner}`}>
                <div className={sectionHeader}>
                  <div>
                    <div className={label}>Maintenance</div>
                    <h2 className="mt-1 text-xl font-semibold text-slate-950">Manutenzione database</h2>
                    <p className={`mt-1 ${muted}`}>
                      Operazioni distruttive con conferma esplicita e layout separato per ridurre errori.
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button onClick={requestClearConfirmation} disabled={clearing} className={`${btnBase} ${btnDanger} w-full sm:w-auto`}>
                    Cancella log e database
                  </button>
                  {config.source === 'file' && config.servers.length > 0 && (
                    <button
                      onClick={handleReset}
                      className={`${btnBase} ${btnSecondary} w-full sm:w-auto text-rose-700 hover:border-rose-300 hover:bg-rose-50`}
                    >
                      Reset configurazione
                    </button>
                  )}
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  Cancella tutti i log delle sincronizzazioni precedenti e resetta il database SQL Server.
                  <strong className="text-rose-700"> Questa operazione e irreversibile.</strong>
                </p>
              </section>

              <section className={`${panel} ${panelInner}`}>
                <div className={sectionHeader}>
                  <div>
                    <div className={label}>Info</div>
                    <h2 className="mt-1 text-xl font-semibold text-slate-950">Dettagli configurazione</h2>
                  </div>
                </div>

                <ul className="mt-5 space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>
                      La configurazione viene salvata in <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.8rem] text-slate-700">data/config.json</code>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>Puoi salvare piu server e cambiare il server attivo in qualsiasi momento</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>
                      <strong className="text-rose-700">Il cambio server attivo cancella automaticamente tutti i dati</strong>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>Se non configurato, vengono usate le variabili ambiente</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>
                      Backup automatico in <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.8rem] text-slate-700">data/config.backup.json</code>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>
                      Log operazioni in <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.8rem] text-slate-700">data/operations.log</code>
                    </span>
                  </li>
                </ul>
              </section>
            </div>
          </div>

          <div className={`${panel} ${panelInner}`}>
            <Link href="/" className="inline-flex items-center text-sm font-medium text-blue-700 transition-colors hover:text-blue-900">
              Torna alla Home
            </Link>
          </div>
        </div>

        {/* Form per aggiungere/modificare server */}
        {showServerForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.2)]">
              <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className={label}>Server form</div>
                    <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                      {editingServer ? `Modifica ${editingServer.name}` : 'Aggiungi nuovo server'}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Compila i campi richiesti, poi salva per aggiornare la configurazione.
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-5 py-5 sm:px-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={label}>Nome server *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => handleFieldChange('name', e.target.value)}
                      placeholder="es. Produzione, Test, Cliente XYZ"
                      className={`${inputBase} ${formErrors.name && formTouched.name ? inputError : inputNormal}`}
                    />
                    {formErrors.name && formTouched.name && <p className="mt-1.5 text-sm text-rose-600">{formErrors.name}</p>}
                  </div>

                  <div className="md:col-span-2">
                    <label className={label}>URL API *</label>
                    <input
                      type="url"
                      value={formData.apiUrl}
                      onChange={e => handleFieldChange('apiUrl', e.target.value)}
                      placeholder="http://server:9080/api/v1"
                      className={`${inputBase} ${formErrors.apiUrl && formTouched.apiUrl ? inputError : inputNormal}`}
                    />
                    {formErrors.apiUrl && formTouched.apiUrl && <p className="mt-1.5 text-sm text-rose-600">{formErrors.apiUrl}</p>}
                    <p className="mt-1.5 text-xs text-slate-500">Formato: http://hostname:port/api/v1</p>
                  </div>

                  <div>
                    <label className={label}>Username *</label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={e => handleFieldChange('username', e.target.value)}
                      placeholder="Nome utente API"
                      className={`${inputBase} ${formErrors.username && formTouched.username ? inputError : inputNormal}`}
                    />
                    {formErrors.username && formTouched.username && <p className="mt-1.5 text-sm text-rose-600">{formErrors.username}</p>}
                  </div>

                  <div>
                    <label className={label}>Authorization scope *</label>
                    <input
                      type="text"
                      value={formData.authScope}
                      onChange={e => handleFieldChange('authScope', e.target.value)}
                      placeholder="1"
                      className={`${inputBase} ${formErrors.authScope && formTouched.authScope ? inputError : inputNormal}`}
                    />
                    {formErrors.authScope && formTouched.authScope && <p className="mt-1.5 text-sm text-rose-600">{formErrors.authScope}</p>}
                    <p className="mt-1.5 text-xs text-slate-500">Numero identificativo dell&apos;ambiente, per esempio 1.</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className={label}>Password *</label>
                    <div className="relative mt-2">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={e => handleFieldChange('password', e.target.value)}
                        placeholder="Password API"
                        className={`${inputBase} pr-12 ${formErrors.password && formTouched.password ? inputError : inputNormal}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center px-4 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-700"
                      >
                        {showPassword ? 'Nascondi' : 'Mostra'}
                      </button>
                    </div>
                    {formErrors.password && formTouched.password && <p className="mt-1.5 text-sm text-rose-600">{formErrors.password}</p>}
                    {editingServer && formData.password === '••••••••' && (
                      <p className="mt-1.5 text-xs text-slate-500">
                        Password gia configurata. Inserisci una nuova password per modificarla.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-5 sm:flex-row sm:justify-end sm:px-6">
                <button onClick={cancelServerForm} disabled={saving} className={`${btnBase} ${btnSecondary} w-full sm:w-auto`}>
                  Annulla
                </button>
                <button
                  onClick={handleSaveServer}
                  disabled={saving || Object.values(formErrors).some(e => e)}
                  className={`${btnBase} ${btnPrimary} w-full sm:w-auto`}
                >
                  {saving ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      Salvataggio in corso
                    </>
                  ) : (
                    'Salva server'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal conferma cambio server */}
        {showSwitchConfirm && pendingSwitchServerId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[2rem] border border-amber-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.2)]">
              <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-700">
                    !
                  </span>
                  <div>
                    <div className={label}>Cambio server</div>
                    <h2 className="mt-1 text-2xl font-semibold text-slate-950">Conferma cambio server</h2>
                  </div>
                </div>
              </div>
              <div className="px-5 py-5 sm:px-6">
                <p className="text-sm leading-6 text-slate-700">
                  Stai cambiando il server attivo da <strong>{activeServerName}</strong> a <strong>{pendingServerName}</strong>.
                </p>
                <p className="mt-4 text-sm leading-6 text-slate-600">Il cambio richiede la cancellazione totale di:</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>Tutti i log di sincronizzazione (sync_jobs)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>Tutti i dati cache nel database SQL Server</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>I metadati di sincronizzazione</span>
                  </li>
                </ul>
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  Questa operazione e irreversibile.
                </div>
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-5 sm:flex-row sm:justify-end sm:px-6">
                <button onClick={cancelSwitchConfirmation} disabled={switching} className={`${btnBase} ${btnSecondary} w-full sm:w-auto`}>
                  Annulla
                </button>
                <button onClick={() => handleSwitchServer(true)} disabled={switching} className={`${btnBase} ${btnDanger} w-full sm:w-auto`}>
                  {switching ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      Cambio in corso
                    </>
                  ) : (
                    'Conferma e cancella dati'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal di doppia conferma cancellazione */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[2rem] border border-rose-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.2)]">
              <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-semibold text-rose-700">
                    x
                  </span>
                  <div>
                    <div className={label}>Maintenance</div>
                    <h2 className="mt-1 text-2xl font-semibold text-slate-950">Conferma cancellazione</h2>
                  </div>
                </div>
              </div>
              <div className="px-5 py-5 sm:px-6">
                <p className="text-sm leading-6 text-slate-700">
                  Stai per cancellare <strong>tutti i log delle sincronizzazioni</strong> e resettare completamente il database SQL Server.
                </p>
                <p className="mt-4 text-sm leading-6 text-slate-600">Questa operazione elimina:</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>Tutti i job di sincronizzazione (sync_jobs)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>Tutti i dati cache clienti, fornitori, articoli e ordini</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>I metadati di sincronizzazione</span>
                  </li>
                </ul>
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  Questa operazione e irreversibile.
                </div>
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-5 sm:flex-row sm:justify-end sm:px-6">
                <button onClick={cancelClearConfirmation} disabled={clearing} className={`${btnBase} ${btnSecondary} w-full sm:w-auto`}>
                  Annulla
                </button>
                <button onClick={handleClearData} disabled={clearing} className={`${btnBase} ${btnDanger} w-full sm:w-auto`}>
                  {clearing ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      Cancellazione in corso
                    </>
                  ) : (
                    'Conferma cancellazione'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
