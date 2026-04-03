import type { ReactNode } from "react";
import type { ExplorerResource, ExplorerStatus } from "./types";

export interface ResourceSidebarProps {
  resources: ExplorerResource[];
  activeResourceId?: string;
  onResourceSelect?: (resourceId: string) => void;
  brandTitle?: string;
  brandSubtitle?: string;
  footerTitle?: string;
  footerSubtitle?: string;
  footerTone?: ExplorerStatus;
  syncActionLabel?: string;
  syncActionStatus?: string;
  syncActionDisabled?: boolean;
  onSyncAction?: () => void;
  className?: string;
}

const toneStyles: Record<ExplorerStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/25",
  warning: "bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/25",
  suspended: "bg-orange-500/15 text-orange-100 ring-1 ring-orange-400/25",
  neutral: "bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/25",
  error: "bg-rose-500/15 text-rose-100 ring-1 ring-rose-400/25",
};

function ResourceMark({ icon }: { icon?: ReactNode }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/95 text-slate-950 shadow-[0_14px_28px_rgba(14,116,144,0.35)]">
      {icon ?? <span className="text-lg font-semibold">TS</span>}
    </div>
  );
}

function ResourceStatus({ tone, text }: { tone?: ExplorerStatus; text?: string }) {
  if (!text) return null;
  const resolvedTone = tone ?? "neutral";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneStyles[resolvedTone]}`}>
      {text}
    </span>
  );
}

export function ResourceSidebar({
  resources,
  activeResourceId,
  onResourceSelect,
  brandTitle = "TS-API",
  brandSubtitle = "Data Explorer",
  footerTitle = "API Connessa",
  footerSubtitle = "Alyante v1",
  footerTone = "active",
  syncActionLabel = "Sincronizza dati",
  syncActionStatus,
  syncActionDisabled = false,
  onSyncAction,
  className,
}: ResourceSidebarProps) {
  return (
    <aside
      className={[
        "flex h-full w-full flex-col border-r border-slate-800/60 bg-[linear-gradient(185deg,#0f172a_0%,#102238_45%,#0f2538_100%)] text-slate-100",
        "shadow-[0_22px_64px_rgba(15,23,42,0.42)]",
        className ?? "",
      ].join(" ")}
    >
      <div className="border-b border-white/10 px-5 py-5">
        <div className="flex items-center gap-3">
          <ResourceMark />
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-[0.08em] text-cyan-100">{brandTitle}</div>
            <div className="mt-0.5 text-xs text-slate-300/85">{brandSubtitle}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-3 py-5">
        <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400/90">
          Risorse
        </div>
        <nav className="space-y-1.5">
          {resources.map((resource) => {
            const active = resource.id === activeResourceId;
            return (
              <button
                key={resource.id}
                type="button"
                onClick={() => onResourceSelect?.(resource.id)}
                className={[
                  "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                  active
                    ? "bg-cyan-300/12 text-white ring-1 ring-cyan-200/15 shadow-[inset_0_1px_0_rgba(186,230,253,0.1)]"
                    : "text-slate-300/95 hover:bg-white/8 hover:text-white",
                ].join(" ")}
              >
                <div className={["flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-100", active ? "bg-cyan-300/20" : "bg-white/10"].join(" ")}>
                  {resource.icon ?? <span className="text-sm font-semibold">*</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{resource.label}</span>
                    {typeof resource.count === "number" && (
                      <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-slate-200 tabular-nums">
                        {resource.count}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    {resource.sublabel ? (
                      <span className="truncate text-[11px] text-slate-300/75">{resource.sublabel}</span>
                    ) : (
                      <span className="text-[11px] text-slate-300/75">&nbsp;</span>
                    )}
                    <span className="ml-auto">
                      <ResourceStatus tone={resource.statusTone} text={resource.status} />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.12)]" />
            <span className="text-sm font-medium text-cyan-50">{footerTitle}</span>
          </div>
          <div className="mt-1 break-words text-xs text-slate-300/80">{footerSubtitle}</div>
          <div className="mt-3">
            <ResourceStatus tone={footerTone} text={footerTone === "active" ? "Live" : footerTone} />
          </div>
          <button
            type="button"
            onClick={onSyncAction}
            disabled={syncActionDisabled}
            className="mt-3 w-full rounded-xl bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncActionLabel}
          </button>
          {syncActionStatus && <div className="mt-2 break-words text-[11px] text-slate-300/80">{syncActionStatus}</div>}
        </div>
      </div>
    </aside>
  );
}
