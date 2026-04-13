# CHANGELOG — Fix Limite Pagine RigaDocumento (maxPages 1000→5000)

## Problema

Errore `"Limite pagine raggiunto (1000) per RigaDocumento: possibile troncamento dati"` nella sincronizzazione full. Causa: default client `maxPages=1000` mentre server supporta fino a 5000. A 100 righe/pagina → cap 100.000 righe. RigaDocumento supera soglia → sync fallisce.

Rischio aggiuntivo: on-demand sync (`local/[resource]/route.ts`) troncava **silenziosamente** a 1000 pagine senza errore.

## Modifiche

### 1. Allineamento default maxPages client→server

| File | Prima | Dopo |
|------|-------|------|
| `app/sync/page.tsx:42` | `maxPages: 1000` | `maxPages: 5000` |
| `app/page.tsx:41` | `maxPages: 1000` | `maxPages: 5000` |
| `app/api/local/[resource]/route.ts:28` | `SYNC_ON_DEMAND_MAX_PAGES ?? "1000"` | `SYNC_ON_DEMAND_MAX_PAGES ?? "5000"` |

Cap righe per risorsa: 100K → 500K.

### 2. Warning troncamento on-demand

**File:** `app/api/local/[resource]/route.ts` — loop `fetchAllRemoteRows` (linea ~137)

Aggiunto controllo: se `pageNumber === maxPages - 1` e pagina piena → `console.warn("ON_DEMAND_TRUNCATION: ...")`. Prima: troncamento silente. Ora: warning in log.

### 3. Streaming bulk flush (protezione memoria)

Problema: `fetchAllPages` accumulava tutte le righe in RAM prima del bulk insert. A 5000 pag × 100 righe × ~2KB/riga ≈ 1 GB heap → rischio OOM.

**Soluzione:** flush parziale ogni 50 pagine (~5000 righe, ~10 MB).

#### File: `app/api/_syncEngine.ts`

- Aggiunta costante `BULK_FLUSH_EVERY_PAGES = 50` (linea 59)
- Aggiunto import `writeLocalResourceChunked` da `_syncStore` (linea 21)
- `fetchAllPages` (linea 238): aggiunti parametri opzionali `flushEveryNPages` e `onFlushBatch`. Quando array raggiunge `flushEveryNPages × pageSize` righe, chiama `onFlushBatch([...rows])` e svuota array. Flush finale per righe residue.
- `syncResourceFullPhase` (linea 418): usa streaming. Prima chiamata a `onFlushBatch` → `writeLocalResourceChunked(resource, [], syncTime, "truncate")` (DELETE tabella), poi `"append"` per ogni batch. Se nessun flush attivato (< 5000 righe) → fallback a `writeLocalResource` originale. Alla fine → `"finalize"` per upsert meta.

#### File: `app/api/_syncStoreSqlServer.ts`

- `truncateResourceTable(resource)` (linea ~1082): DELETE FROM in transazione. Usata come primo step dello streaming.
- `appendResourceRows(resource, rows, syncTime)` (linea ~1105): bulk insert senza DELETE. Usa stessa logica di `replaceResourceRows` ma salta DELETE.
- `writeLocalResourceChunked(resource, rowBatch, syncTime, mode)` (linea ~1275, export): orchestratore. Mode `"truncate"` → `truncateResourceTable`, `"append"` → `appendResourceRows`, `"finalize"` → upsert meta.

#### File: `app/api/_syncStore.ts`

- Aggiunto export `writeLocalResourceChunked` (linea ~46): delega a `sqlStore.writeLocalResourceChunked`.

## Impatto prestazioni

| Metrica | Prima | Dopo |
|---------|-------|------|
| Cap righe/sync | 100K | 500K |
| RAM peak full sync (500K righe) | ~1 GB (tutto in RAM) | ~10 MB (flush ogni 5K) |
| Bulk insert SQL | 1 transazione con 500K righe | ~100 transazioni da 5K righe |
| Sync incrementale | Invariato | Invariato |
| On-demand troncamento | Silente | Warning in log |

## Rollback

```bash
git checkout HEAD -- \
  app/sync/page.tsx \
  app/page.tsx \
  app/api/local/[resource]/route.ts \
  app/api/_syncEngine.ts \
  app/api/_syncStoreSqlServer.ts \
  app/api/_syncStore.ts
```

## Parametri configurabili via env

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `SYNC_ON_DEMAND_MAX_PAGES` | 5000 | Max pagine on-demand sync |
| `SYNC_ON_DEMAND_PAGE_SIZE` | 100 | Page size on-demand |
| `SQLSERVER_REQUEST_TIMEOUT_MS` | 300000 | Timeout richiesta SQL (5 min) |
| `SQLSERVER_CONNECTION_TIMEOUT_MS` | 30000 | Timeout connessione SQL |

## Costanti codice (non env)

| Costante | Valore | File |
|----------|--------|------|
| `DEFAULT_MAX_PAGES` | 5000 | `app/api/sync/start/route.ts:9` |
| `DEFAULT_PAGE_SIZE` | 100 | `app/api/sync/start/route.ts:8` |
| `BULK_FLUSH_EVERY_PAGES` | 50 | `app/api/_syncEngine.ts:59` |
| maxPages clamp server | 1–5000 | `app/api/sync/start/route.ts:72` |
| pageSize clamp server | 25–1000 | `app/api/sync/start/route.ts:71` |
