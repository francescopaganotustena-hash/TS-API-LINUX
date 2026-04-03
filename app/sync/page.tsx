"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SyncPanel, type SyncStatus } from "@/components/explorer/SyncPanel";

interface SyncJobPayload {
  jobId?: string;
  id?: string;
  status?: SyncStatus | "queued" | "cancelled" | string;
  phase?: string;
  progressPct?: number;
  processed?: number;
  inserted?: number;
  updated?: number;
  errors?: number;
  message?: string;
  warning?: string;
  startedAt?: string;
  endedAt?: string;
}

interface SyncHistoryPayload {
  jobs?: SyncJobPayload[];
}

interface LocalMetaPayload {
  lastSyncAt?: string;
  lastSyncedAt?: string;
  message?: string;
  lastStatus?: string;
  onDemandWarning?: string;
  onDemandStatus?: string;
  freshness?: string;
}

const DEFAULT_CONTEXT = {
  ambiente: "1",
  utente: "TeamSa",
  azienda: "1",
  pageSize: 100,
  maxPages: 1000,
};

type SyncMode = "incremental" | "full";
type SyncScope = "full" | "resource";

const RESOURCE_OPTIONS = [
  { value: "clienti", label: "Clienti" },
  { value: "fornitori", label: "Fornitori" },
  { value: "articoli", label: "Articoli" },
  { value: "ordini", label: "Ordini" },
  { value: "righeOrdine", label: "Righe ordine" },
] as const;

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeStatus(status?: string): SyncStatus {
  if (status === "running") return "running";
  if (status === "success") return "success";
  if (status === "failed" || status === "cancelled") return "failed";
  if (status === "queued") return "running";
  return "idle";
}

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(parsed));
}

function getSyncStatusMeta(status: SyncStatus) {
  switch (status) {
    case "running":
      return {
        label: "In corso",
        badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
        dotClass: "bg-amber-500",
      };
    case "success":
      return {
        label: "Completato",
        badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
        dotClass: "bg-emerald-500",
      };
    case "failed":
      return {
        label: "Errore",
        badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
        dotClass: "bg-rose-500",
      };
    default:
      return {
        label: "Pronto",
        badgeClass: "border-slate-200 bg-slate-100 text-slate-600",
        dotClass: "bg-slate-500",
      };
  }
}

function getJobStatusMeta(status?: string) {
  const normalized = normalizeStatus(status);
  const labelMap: Record<SyncStatus, string> = {
    idle: "Pronto",
    running: status === "queued" ? "In coda" : "In corso",
    success: "Completato",
    failed: status === "cancelled" ? "Annullato" : "Errore",
  };

  const base = getSyncStatusMeta(normalized);
  return {
    label: labelMap[normalized],
    badgeClass: base.badgeClass,
    dotClass: base.dotClass,
  };
}

function clampProgress(value?: number): number {
  return Math.max(0, Math.min(100, Math.round(Number(value ?? 0))));
}

async function parseJsonOrText<T>(response: Response): Promise<T | string | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text;
  }
}

export default function SyncPage() {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [phase, setPhase] = useState<string>("Pronto");
  const [progress, setProgress] = useState<number>(0);
  const [processed, setProcessed] = useState<number>(0);
  const [inserted, setInserted] = useState<number>(0);
  const [updated, setUpdated] = useState<number>(0);
  const [errors, setErrors] = useState<number>(0);
  const [message, setMessage] = useState<string>("Nessuna sincronizzazione in corso");
  const [warning, setWarning] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<SyncJobPayload[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [syncMode, setSyncMode] = useState<SyncMode>("full");
  const [overlapHours, setOverlapHours] = useState<number>(24);
  const [syncScope, setSyncScope] = useState<SyncScope>("full");
  const [syncScopeResource, setSyncScopeResource] = useState<(typeof RESOURCE_OPTIONS)[number]["value"]>("clienti");
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const loadMeta = useCallback(async () => {
    const response = await fetch("/api/local/meta", { method: "GET", headers: { Accept: "application/json" } });
    const payload = await parseJsonOrText<{ meta?: LocalMetaPayload } & LocalMetaPayload>(response);
    if (!response.ok) return;
    if (payload && typeof payload === "object" && "meta" in payload && payload.meta) {
      setLastSyncedAt(payload.meta.lastSyncAt ?? payload.meta.lastSyncedAt ?? null);
      if (payload.meta.message) setMessage(payload.meta.message);
      if (payload.meta.onDemandWarning) setWarning(payload.meta.onDemandWarning);
      if (payload.meta.freshness) setMessage(payload.meta.freshness);
      return;
    }
    if (payload && typeof payload === "object") {
      setLastSyncedAt(payload.lastSyncedAt ?? null);
      if (payload.message) setMessage(payload.message);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/sync/history?limit=15", { method: "GET", headers: { Accept: "application/json" } });
    const payload = await parseJsonOrText<SyncHistoryPayload>(response);
    if (!response.ok || !payload || typeof payload === "string") return;
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    setHistory(jobs);
    const active = jobs.find((job) => job.status === "running" || job.status === "queued");
    if (active) setActiveJobId(active.id ?? active.jobId ?? null);
  }, []);

  const pollJob = useCallback(
    async (jobId: string) => {
      clearPollTimer();
      const tick = async () => {
        try {
          const response = await fetch(`/api/sync/status/${encodeURIComponent(jobId)}`, {
            method: "GET",
            headers: { Accept: "application/json" },
          });
          const payload = await parseJsonOrText<SyncJobPayload>(response);
          if (!response.ok || !payload || typeof payload === "string") {
            setStatus("failed");
            setMessage("Errore nel recupero stato sincronizzazione");
            clearPollTimer();
            return;
          }

          const nextStatus = normalizeStatus(payload.status);
          setStatus(nextStatus);
          setPhase(payload.phase ?? "Sincronizzazione");
          setProgress(Number(payload.progressPct ?? 0));
          setProcessed(Number(payload.processed ?? 0));
          setInserted(Number(payload.inserted ?? 0));
          setUpdated(Number(payload.updated ?? 0));
          setErrors(Number(payload.errors ?? 0));
          if (payload.message) setMessage(payload.message);
          if (payload.warning) setWarning(payload.warning);
          if (nextStatus !== "running" && !payload.warning) setWarning(null);
          if (payload.endedAt) setLastSyncedAt(payload.endedAt);

          if (nextStatus === "running") {
            pollTimerRef.current = setTimeout(tick, 1200);
            return;
          }

          setActiveJobId(null);
          clearPollTimer();
          void loadMeta();
          void loadHistory();
        } catch {
          setStatus("failed");
          setMessage("Errore durante il monitoraggio del job");
          clearPollTimer();
        }
      };
      await tick();
    },
    [clearPollTimer, loadHistory, loadMeta]
  );

  const startSync = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      setWarning(null);
      const response = await fetch("/api/sync/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...DEFAULT_CONTEXT,
          syncMode,
          overlapHours: clampNumber(overlapHours, 1, 168),
          scope: {
            type: syncScope,
            resource: syncScope === "resource" ? syncScopeResource : undefined,
            trigger: "manual",
          },
          resource: syncScope === "resource" ? syncScopeResource : undefined,
        }),
      });
      const payload = await parseJsonOrText<
        SyncJobPayload & { error?: string; job?: SyncJobPayload; warning?: string }
      >(response);

      if (response.status === 409 && payload && typeof payload === "object" && payload.job) {
        const existingId = payload.job.id ?? payload.job.jobId;
        setMessage("Esiste gia una sincronizzazione in corso: monitor attivo");
        setWarning(payload.warning ?? null);
        if (existingId) {
          setActiveJobId(existingId);
          await pollJob(existingId);
        }
        return;
      }

      if (!response.ok || !payload || typeof payload === "string") {
        setStatus("failed");
        setMessage("Impossibile avviare la sincronizzazione");
        return;
      }

      const jobId = payload.jobId ?? payload.id;
      if (!jobId) {
        setStatus("failed");
        setMessage("Job avviato senza identificativo");
        return;
      }

      setStatus("running");
      setPhase(payload.phase ?? "Avvio sincronizzazione");
      setProgress(Number(payload.progressPct ?? 1));
      setMessage(
        payload.message ??
          (syncScope === "resource"
            ? `Sincronizzazione avviata sulla risorsa ${RESOURCE_OPTIONS.find((option) => option.value === syncScopeResource)?.label ?? syncScopeResource}`
            : "Sincronizzazione avviata")
      );
      setWarning(
        payload.warning ??
          (syncMode === "incremental"
            ? "Modalita incrementale selezionata: il backend puo ripiegare su una sync completa se la differenziale non e disponibile."
            : null)
      );
      setActiveJobId(jobId);
      await pollJob(jobId);
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, overlapHours, pollJob, syncMode, syncScope, syncScopeResource]);

  const cancelSync = useCallback(async () => {
    if (isCancelling || !activeJobId) return;
    setIsCancelling(true);
    try {
      const response = await fetch("/api/sync/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: activeJobId }),
      });
      const payload = await parseJsonOrText<SyncJobPayload & { error?: string; message?: string }>(response);

      if (!response.ok) {
        const errorMessage =
          payload && typeof payload === "object" && !Array.isArray(payload) && payload.error
            ? payload.error
            : "Impossibile annullare la sincronizzazione";
        setMessage(errorMessage);
        return;
      }

      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        if (payload.message) setMessage(payload.message);
        if (payload.status) setStatus(normalizeStatus(payload.status));
      } else {
        setMessage("Richiesta di annullamento inviata");
      }

      await pollJob(activeJobId);
      void loadHistory();
    } finally {
      setIsCancelling(false);
    }
  }, [activeJobId, isCancelling, loadHistory, pollJob]);

  useEffect(() => {
    void loadMeta();
    void loadHistory();
  }, [loadHistory, loadMeta]);

  useEffect(() => {
    if (!activeJobId) return;
    void pollJob(activeJobId);
    return () => clearPollTimer();
  }, [activeJobId, clearPollTimer, pollJob]);

  const historyRows = useMemo(() => history.slice(0, 10), [history]);
  const effectiveOverlapHours = clampNumber(overlapHours, 1, 168);
  const selectedScopeResourceLabel =
    RESOURCE_OPTIONS.find((option) => option.value === syncScopeResource)?.label ?? syncScopeResource;
  const syncStatusMeta = getSyncStatusMeta(status);
  const activeJobsCount = history.filter((job) => job.status === "running" || job.status === "queued").length;
  const completedJobsCount = history.filter((job) => normalizeStatus(job.status) === "success").length;
  const failedJobsCount = history.filter((job) => normalizeStatus(job.status) === "failed").length;
  const latestJob = historyRows[0];

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_34%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-3 py-4 text-slate-900 md:px-6 md:py-6">
      <div className="mx-auto max-w-[1240px] space-y-4 md:space-y-6">
        <header className="overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-6 lg:py-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Sync dashboard
                <span className={["h-2 w-2 rounded-full", syncStatusMeta.dotClass].join(" ")} />
                {syncStatusMeta.label}
              </div>
              <div className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Sincronizzazione</h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  Monitora i job, avvia aggiornamenti manuali e tieni sotto controllo la salute del database locale da
                  un unico pannello operativo.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Ultimo update: {formatDateTime(lastSyncedAt ?? undefined)}</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Job attivi: {activeJobsCount}</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Completati: {completedJobsCount}</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Errori: {failedJobsCount}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px] lg:grid-cols-1">
              <div className="rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 text-white shadow-lg shadow-slate-950/10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Stato attuale</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{syncStatusMeta.label}</p>
                    <p className="text-sm text-slate-300">{phase}</p>
                  </div>
                  <div className={["rounded-full border px-3 py-1 text-xs font-semibold", syncStatusMeta.badgeClass].join(" ")}>
                    {clampProgress(progress)}%
                  </div>
                </div>
              </div>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
              >
                Torna alla home
              </Link>
            </div>
          </div>
        </header>

        <section className="rounded-[28px] border border-white/70 bg-white/80 p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur md:p-4">
          <SyncPanel
            status={status}
            phase={phase}
            progress={progress}
            processed={processed}
            inserted={inserted}
            updated={updated}
            errors={errors}
            message={message}
            warning={warning}
            lastSyncedAt={lastSyncedAt}
            onSync={() => {
              void startSync();
            }}
            onCancel={() => {
              void cancelSync();
            }}
            disabled={isBusy || status === "running"}
            cancelDisabled={isCancelling || status !== "running"}
            title="Job sincronizzazione"
            description="Questa pagina mostra lo stato reale del job, inclusa la barra di avanzamento."
            actionLabel="Avvia nuova sincronizzazione"
            cancelLabel={isCancelling ? "Annullamento..." : "Blocca sincronizzazione"}
            contextSummary={
              syncScope === "resource"
                ? `Ambito: Singola risorsa | ${selectedScopeResourceLabel}`
                : "Ambito: Tutto"
            }
            extraActions={
              <div className="grid w-full gap-3 lg:min-w-[780px] lg:grid-cols-4">
                <label className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Ambito
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-500"
                      title="Definisce QUANTO sincronizzare: tutto il database locale oppure una sola risorsa."
                      aria-label="Aiuto ambito"
                    >
                      i
                    </span>
                  </span>
                  <select
                    value={syncScope}
                    onChange={(event) => setSyncScope(event.target.value === "resource" ? "resource" : "full")}
                    disabled={isBusy || status === "running"}
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="full">Tutto</option>
                    <option value="resource">Singola risorsa</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Risorsa</span>
                  <select
                    value={syncScopeResource}
                    onChange={(event) =>
                      setSyncScopeResource(
                        RESOURCE_OPTIONS.some((option) => option.value === event.target.value)
                          ? (event.target.value as (typeof RESOURCE_OPTIONS)[number]["value"])
                          : "clienti"
                      )
                    }
                    disabled={isBusy || status === "running" || syncScope === "full"}
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {RESOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Strategia sync
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-500"
                      title="Definisce COME sincronizzare: differenziale (solo variazioni) o ricarica completa."
                      aria-label="Aiuto strategia sync"
                    >
                      i
                    </span>
                  </span>
                  <select
                    value={syncMode}
                    onChange={(event) => setSyncMode(event.target.value === "full" ? "full" : "incremental")}
                    disabled={isBusy || status === "running"}
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="incremental">Differenziale</option>
                    <option value="full">Ricarica completa</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Overlap ore
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-500"
                      title="Solo per differenziale: recupera anche le ultime ore per coprire ritardi/riinvii."
                      aria-label="Aiuto overlap ore"
                    >
                      i
                    </span>
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    step={1}
                    value={effectiveOverlapHours}
                    onChange={(event) => setOverlapHours(clampNumber(Number(event.target.value), 1, 168))}
                    disabled={isBusy || status === "running" || syncMode === "full"}
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500 lg:col-span-4">
                  {syncScope === "resource"
                    ? "Sync mirata sulla singola risorsa selezionata. Il backend puo comunque applicare fallback di sicurezza."
                    : syncMode === "incremental"
                      ? "Strategia differenziale: aggiorna solo le variazioni. Se manca una baseline affidabile, il backend puo passare a ricarica completa."
                      : "Ricarica completa: utile per riallineamento totale o riconciliazione periodica."}
                </div>
              </div>
            }
          />
        </section>

        <section className="overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-4 md:px-6">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Storico job</h2>
              <p className="mt-1 text-sm text-slate-600">Ultimi dieci esiti registrati, con stato, fase e finestra temporale.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">Totale visualizzati: {historyRows.length}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">Ultimo ID: {latestJob?.id ?? latestJob?.jobId ?? "-"}</span>
            </div>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-slate-50/90 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <th className="border-b border-slate-200/70 px-5 py-3 font-semibold">ID</th>
                  <th className="border-b border-slate-200/70 px-5 py-3 font-semibold">Stato</th>
                  <th className="border-b border-slate-200/70 px-5 py-3 font-semibold">Fase</th>
                  <th className="border-b border-slate-200/70 px-5 py-3 font-semibold">Progresso</th>
                  <th className="border-b border-slate-200/70 px-5 py-3 font-semibold">Avvio</th>
                  <th className="border-b border-slate-200/70 px-5 py-3 font-semibold">Fine</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.length > 0 ? (
                  historyRows.map((job, index) => {
                    const statusMeta = getJobStatusMeta(job.status);
                    return (
                      <tr
                        key={job.id ?? job.jobId}
                        className={[
                          "transition-colors hover:bg-slate-50/80",
                          index !== historyRows.length - 1 ? "border-b border-slate-100" : "",
                        ].join(" ")}
                      >
                        <td className="px-5 py-4 font-mono text-xs text-slate-700">{job.id ?? job.jobId ?? "-"}</td>
                        <td className="px-5 py-4">
                          <span
                            className={["inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", statusMeta.badgeClass].join(
                              " "
                            )}
                          >
                            <span className={["h-2 w-2 rounded-full", statusMeta.dotClass].join(" ")} />
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-700">{job.phase ?? "-"}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-slate-900 via-slate-700 to-sky-600"
                                style={{ width: `${clampProgress(job.progressPct)}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-slate-600">{clampProgress(job.progressPct)}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-600">{formatDateTime(job.startedAt)}</td>
                        <td className="px-5 py-4 text-slate-600">{formatDateTime(job.endedAt)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-5 py-6 text-slate-500" colSpan={6}>
                      Nessun job registrato.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 md:hidden">
            {historyRows.length > 0 ? (
              historyRows.map((job) => {
                const statusMeta = getJobStatusMeta(job.status);
                return (
                  <article key={job.id ?? job.jobId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Job</p>
                        <p className="mt-1 truncate font-mono text-xs text-slate-700">{job.id ?? job.jobId ?? "-"}</p>
                      </div>
                      <span
                        className={["inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", statusMeta.badgeClass].join(
                          " "
                        )}
                      >
                        <span className={["h-2 w-2 rounded-full", statusMeta.dotClass].join(" ")} />
                        {statusMeta.label}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-slate-600">
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-500">Fase</span>
                        <span className="text-right text-slate-800">{job.phase ?? "-"}</span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-500">Progresso</span>
                        <span className="text-right font-medium text-slate-800">{clampProgress(job.progressPct)}%</span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-500">Avvio</span>
                        <span className="text-right text-slate-800">{formatDateTime(job.startedAt)}</span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-slate-500">Fine</span>
                        <span className="text-right text-slate-800">{formatDateTime(job.endedAt)}</span>
                      </div>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-slate-900 via-slate-700 to-sky-600"
                        style={{ width: `${clampProgress(job.progressPct)}%` }}
                      />
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Nessun job registrato.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

