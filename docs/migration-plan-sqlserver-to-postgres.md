# Piano di Migrazione: SQL Server → PostgreSQL + Docker

**Data**: 2026-04-13  
**Progetto**: TS-API-LINUX  
**Obiettivo**: Sostituire SQL Server con PostgreSQL come DB cache, containerizzare l'applicazione con Docker

---

## 1. Analisi dello Stato Attuale

### 1.1 Architettura Corrente

L'applicazione è una Next.js 15 che sincronizza dati da un'API gestionale esterna e li memorizza in un cache layer locale su **SQL Server**. Lo storage è implementato in:

- `app/api/_syncStoreSqlServer.ts` (~1500 righe) — Implementazione completa SQL Server
- `app/api/_syncStore.ts` — Facade che delega al solo provider `sqlserver`
- `app/api/_syncEngine.ts` — Motore di sincronizzazione (DB-agnostic, usa il facade)
- `app/api/_syncTypes.ts` — Tipi TypeScript (DB-agnostic)

Il facade `_syncStore.ts` attualmente **rifiuta** qualsiasi provider diverso da `sqlserver` tramite `assertSqlServerProvider()`. Non esiste implementazione JSON o altro provider.

### 1.2 Dipendenze SQL Server

| Elemento | Dettaglio |
|----------|-----------|
| **Driver npm** | `mssql` ^11.0.0 (+ `@types/mssql` ^9.1.11) |
| **Driver interno** | `tedious` (via `@tediousjs/connection-string`) |
| **Connection string** | ADO.NET-style: `Server=...;Database=...;User Id=...;Password=...;TrustServerCertificate=True;Encrypt=False;` |
| **Variabili env** | `SQLSERVER_CONNECTION_STRING`, `SQLSERVER_SCHEMA`, `SQLSERVER_REQUEST_TIMEOUT_MS`, `SQLSERVER_CONNECTION_TIMEOUT_MS` |

### 1.3 Feature SQL Server-Specifiche Usate

Queste sono le feature che richiedono traduzione per PostgreSQL:

| Feature SQL Server | Uso nel codice | Equivalente PostgreSQL |
|---|---|---|
| `IDENTITY(1,1)` | PK auto-increment su tutte le tabelle cache | `SERIAL` / `BIGSERIAL` |
| `DATETIME2` | Timestamp ad alta precisione | `TIMESTAMPTZ` |
| `NVARCHAR(N)` / `NVARCHAR(MAX)` | Stringhe Unicode | `VARCHAR(N)` / `TEXT` (PG gestisce Unicode nativamente) |
| `BIT` | Flag booleane | `BOOLEAN` |
| `DECIMAL(18,6)` | Campo `quantita` in righe ordine | `NUMERIC(18,6)` |
| `SYSUTCDATETIME()` | Timestamp UTC corrente | `NOW() AT TIME ZONE 'utc'` / `CURRENT_TIMESTAMP` |
| `OBJECT_ID()` / `SCHEMA_ID()` | Check esistenza tabelle/schema | `CREATE TABLE IF NOT EXISTS` / `CREATE SCHEMA IF NOT EXISTS` |
| `sys.indexes` | Check esistenza indici | `CREATE INDEX IF NOT EXISTS` |
| `WITH (UPDLOCK, HOLDLOCK)` | Lock pessimistico su `sync_meta` | `SELECT ... FOR UPDATE` |
| `TRY_CONVERT(BIGINT, ...)` | Conversione sicura in query filtro | `CASE WHEN ... THEN ... END` con regex o `NULLIF` |
| `JSON_VALUE(col, '$.path')` | Estrazione JSON in query filtro | `col::jsonb->>'key'` o `jsonb_path_query_text()` |
| `OFFSET ... ROWS FETCH NEXT ... ROWS ONLY` | Paginazione ANSI | `LIMIT ... OFFSET ...` |
| `TOP (@limit)` | Limit risultati | `LIMIT $1` |
| `IF EXISTS ... ELSE ...` | Upsert pattern | `INSERT ... ON CONFLICT ... DO UPDATE` |
| `mssql.Table` bulk insert | Inserimento massivo | `INSERT INTO ... VALUES (...), (...), ...` parametrico a batch |
| `mssql.Transaction` | Transazioni esplicite | `pg.Client` con `BEGIN` / `COMMIT` / `ROLLBACK` |
| `[schema].[table]` quoting | Identificatori delimitati | `"schema"."table"` (double-quote) |
| `mssql.Int`, `sql.NVarChar`, etc. | Type inference parametri | Cast espliciti in query o inferenza automatica `pg` |

### 1.4 Tabelle del Database

**Tabelle Metadata:**
- `sync_jobs` — Tracking job sincronizzazione (id, status, phase, progress, timestamps)
- `sync_meta` — Metadati globali sync (singleton row id=1)
- `sync_resource_meta` — Metadati per risorsa (resource, updated_at, row_count)

**Tabelle Cache:**
- `cache_clienti` — Clienti (cli_for, id_cli_for, ragione_sociale, piva, citta, flg_attivo, updated_at, raw_json)
- `cache_fornitori` — Fornitori (stessa struttura clienti)
- `cache_articoli` — Articoli (codice_articolo, descrizione, ditta, flg_esaurito, updated_at, raw_json)
- `cache_ordini` — Documenti (num_reg, num_doc, tipo_doc, sez_doc, cli_for_fatt, cli_for_dest, data_doc, updated_at, raw_json)
- `cache_righe_ordine` — Righe documento (num_reg, progr_riga, cod_articolo, descrizione, quantita, updated_at, raw_json)

### 1.5 Query Filtro con JSON

Il codice usa `JSON_VALUE()` e `TRY_CONVERT()` estensivamente nei filtri per ordini e articoli:

```sql
-- Esempio: filtro ordini per cliente
(cli_for_fatt = @param OR (cli_for_fatt IS NULL AND TRY_CONVERT(BIGINT, JSON_VALUE(raw_json, '$.cliforfatt')) = @param))

-- Esempio: filtro nome party in ordini
JSON_VALUE(raw_json, '$.clienteFornitoreMG.anagrafica.ragioneSociale') LIKE @param

-- Esempio: COALESCE per codice articolo
COALESCE(NULLIF(LTRIM(RTRIM(codice_articolo)), ''), JSON_VALUE(raw_json, '$.codiceArticoloMG'), ...)
```

Queste query richiedono traduzione attenta in PostgreSQL usando `->>` e `jsonb_path_query_text()`.

### 1.6 Nessun Docker Setup Esistente

Non esistono `Dockerfile`, `docker-compose.yml`, o `.dockerignore` nel progetto.

---

## 2. Scelta del Database Alternativo: PostgreSQL

### 2.1 Perché PostgreSQL

| Criterio | PostgreSQL | SQLite | MySQL |
|----------|-----------|--------|-------|
| **JSONB nativo** | ✅ `->>`, `jsonb_path_query_text()` | ✅ `json_extract()` (limitato) | ⚠️ `JSON_EXTRACT` (meno potente) |
| **Concorrenza** | ✅ MVCC, `FOR UPDATE`, advisory locks | ❌ Singolo writer | ⚠️ Table locks |
| **Docker** | ✅ Immagine Alpine ~80MB | ✅ Embedded | ✅ Immagine disponibile |
| **Produzione** | ✅ Enterprise-grade | ⚠️ Solo embedded | ✅ Production-ready |
| **Compatibilità tipi** | ✅ `NUMERIC`, `TIMESTAMPTZ`, `TEXT` | ⚠️ Tipi limitati | ⚠️ No `TIMESTAMPTZ` nativo |
| **Upsert** | ✅ `ON CONFLICT DO UPDATE` | ✅ `ON CONFLICT` (3.24+) | ⚠️ `ON DUPLICATE KEY` (sintassi diversa) |
| **Estensioni** | ✅ `pg_trgm` per full-text | ❌ | ⚠️ Limitate |

**Conclusione**: PostgreSQL è la scelta ottimale per JSONB avanzato, concorrenza robusta, e Docker-friendliness.

### 2.2 Driver Node.js: `pg` (node-postgres)

Scelto `pg` invece di ORM (Prisma/Drizzle) perché:
- Mantiene lo stesso pattern raw-SQL del codice esistente
- Zero astrazione aggiuntiva, stessa architettura di `mssql`
- Connection pooling nativo con `pg.Pool`
- Supporto transazioni esplicite con `pg.Client`
- ~1.5MB bundle vs ~15MB per Prisma

---

## 3. Piano di Implementazione

### Fase 1: Implementazione Store PostgreSQL

#### Step 1.1: Creare `app/api/_syncStorePostgres.ts`

File principale (~1500 righe), port completo di `_syncStoreSqlServer.ts`.

**Struttura:**

```typescript
import pg from "pg";
import type { LocalDataFile, LocalResourceSnapshot, SyncJob, SyncMeta, SyncResource } from "./_syncTypes";

// Config da env vars
const PG_HOST = process.env.PG_HOST ?? "localhost";
const PG_PORT = Number(process.env.PG_PORT ?? "5432");
const PG_DATABASE = process.env.PG_DATABASE ?? "tsapi_localcache";
const PG_USER = process.env.PG_USER ?? "tsapi_app";
const PG_PASSWORD = process.env.PG_PASSWORD ?? "";
const PG_SCHEMA = sanitizeIdentifier(process.env.PG_SCHEMA ?? "app_cache") ?? "app_cache";
const PG_POOL_MAX = Number(process.env.PG_POOL_MAX ?? "10");
const PG_POOL_IDLE_TIMEOUT_MS = Number(process.env.PG_POOL_IDLE_TIMEOUT_MS ?? "30000");
const PG_STATEMENT_TIMEOUT_MS = Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? "300000");
```

**Traduzioni SQL chiave:**

| Pattern SQL Server | Pattern PostgreSQL |
|---|---|
| `SELECT TOP (@limit) ...` | `SELECT ... LIMIT $1` |
| `OFFSET @offset ROWS FETCH NEXT @fetch ROWS ONLY` | `LIMIT $1 OFFSET $2` |
| `IF OBJECT_ID(...) IS NULL BEGIN CREATE TABLE ... END` | `CREATE TABLE IF NOT EXISTS ...` |
| `IF NOT EXISTS (SELECT ... FROM sys.indexes ...) BEGIN CREATE INDEX ... END` | `CREATE INDEX IF NOT EXISTS ...` |
| `IF SCHEMA_ID(N'...') IS NULL BEGIN EXEC(N'CREATE Schema ...') END` | `CREATE SCHEMA IF NOT EXISTS ...` |
| `WITH (UPDLOCK, HOLDLOCK)` | `FOR UPDATE` |
| `TRY_CONVERT(BIGINT, JSON_VALUE(raw_json, '$.path'))` | `NULLIF((raw_json::jsonb->>'key')::text, '')::bigint` |
| `JSON_VALUE(raw_json, '$.path')` | `raw_json::jsonb->>'key'` o `jsonb_path_query_text(raw_json::jsonb, '$.path')` |
| `IF EXISTS (...) UPDATE ... ELSE INSERT ...` | `INSERT ... ON CONFLICT (id) DO UPDATE SET ...` |
| `[schema].[table]` | `"schema"."table"` |
| `SYSUTCDATETIME()` | `NOW() AT TIME ZONE 'utc'` |
| `mssql.Table` bulk insert | `INSERT INTO ... VALUES ($1, $2, ...), ($1, $2, ...)` a batch di 500 righe |
| `mssql.Transaction` | `client.query('BEGIN')` / `client.query('COMMIT')` / `client.query('ROLLBACK')` |

**Funzioni da mantenere identiche (pure JS, DB-agnostic):**
- `normalizeRow()` per ogni risorsa
- `toNullableString()`, `toNullableInt()`, `toNullableBigInt()`, `toNullableNumber()`, `toNullableBoolean()`
- `toSqlDate()`, `toNullableDateIso()`
- `safeJsonStringify()`, `normalizeBulkCellValue()`
- `getFirstPathValue()`, `getValueByPath()`, `canonicalKey()`, `getFirstValue()`
- `getArticleCodeValue()`
- `serializeJob()`, `deserializeJob()`
- `EMPTY_META()`, `createEmptyResourceMeta()`

**Funzioni da adattare:**
- `buildResourceFilterDescriptors()` — Tradurre clausole `JSON_VALUE` e `TRY_CONVERT` in sintassi PostgreSQL
- `buildSyncSchemaSql()` — Riscrivere completamente in DDL PostgreSQL
- `buildResourceTableDefinition()` — Riscrivere con tipi PG
- `getPool()` / `ensureSchema()` — Usare `pg.Pool` invece di `mssql.ConnectionPool`
- `runQuery()` / `runExecute()` — Usare `pg` parameterized queries (`$1`, `$2`, ...)
- `replaceResourceRows()` — Usare transazioni `pg.Client` + batch INSERT
- `appendResourceRows()` — Stesso pattern
- `queryLocalResource()` — Tradurre paginazione e filtri

**Gestione parametri:**

SQL Server usa parametri nominati (`@paramName`), PostgreSQL usa parametri posizionali (`$1`, `$2`, ...). Ogni funzione che costruisce query dinamiche deve tenere traccia del parametro index.

```typescript
// Pattern per query con filtri dinamici
function buildWhereClause(descriptors: PgFilterDescriptor[], startIdx: number): string {
  return descriptors.map((d, i) => `${d.clause.replace('@' + d.paramName, '$' + (startIdx + i))}`).join(' AND ');
}
```

**Gestione schema auto-creation:**

PostgreSQL supporta `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS` nativamente, semplificando molto `ensureSchema()` rispetto alla versione SQL Server che usa `OBJECT_ID()` e `sys.indexes`.

#### Step 1.2: Creare `sql/postgres/001_init.sql`

Script DDL di bootstrap per PostgreSQL:

```sql
-- TS-API local cache bootstrap for PostgreSQL
-- Schema: app_cache (default)

CREATE SCHEMA IF NOT EXISTS app_cache;

-- Tabella: sync_jobs
CREATE TABLE IF NOT EXISTS app_cache.sync_jobs (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  status VARCHAR(20) NOT NULL,
  phase VARCHAR(50) NOT NULL,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  message VARCHAR(4000)
);

CREATE INDEX IF NOT EXISTS ix_sync_jobs_status_started 
  ON app_cache.sync_jobs(status, started_at DESC);

-- Tabella: sync_meta
CREATE TABLE IF NOT EXISTS app_cache.sync_meta (
  id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
  last_sync_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_job_id VARCHAR(80),
  last_status VARCHAR(20),
  message VARCHAR(4000),
  updated_at TIMESTAMPTZ
);

INSERT INTO app_cache.sync_meta (id, updated_at) 
VALUES (1, NOW() AT TIME ZONE 'utc')
ON CONFLICT (id) DO NOTHING;

-- Tabella: sync_resource_meta
CREATE TABLE IF NOT EXISTS app_cache.sync_resource_meta (
  resource VARCHAR(50) NOT NULL PRIMARY KEY,
  updated_at TIMESTAMPTZ,
  row_count INTEGER NOT NULL DEFAULT 0,
  updated_on TIMESTAMPTZ
);

INSERT INTO app_cache.sync_resource_meta (resource, updated_at, row_count, updated_on) 
VALUES ('clienti', NULL, 0, NOW() AT TIME ZONE 'utc')
ON CONFLICT (resource) DO NOTHING;
-- ... stesso pattern per fornitori, articoli, ordini, righeOrdine

-- Tabelle cache (stesso pattern per tutte)
CREATE TABLE IF NOT EXISTS app_cache.cache_clienti (
  row_id BIGSERIAL PRIMARY KEY,
  cli_for INTEGER,
  id_cli_for INTEGER,
  ragione_sociale VARCHAR(255),
  piva VARCHAR(40),
  citta VARCHAR(120),
  flg_attivo BOOLEAN,
  updated_at TIMESTAMPTZ,
  raw_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_cache_clienti_clifor ON app_cache.cache_clienti(cli_for);
CREATE INDEX IF NOT EXISTS ix_cache_clienti_ragione_sociale ON app_cache.cache_clienti(ragione_sociale);
CREATE INDEX IF NOT EXISTS ix_cache_clienti_piva ON app_cache.cache_clienti(piva);

-- ... stesso pattern per cache_fornitori, cache_articoli, cache_ordini, cache_righe_ordine
```

#### Step 1.3: Aggiornare `app/api/_syncStore.ts`

Trasformare il facade da single-provider a multi-provider:

```typescript
import type { LocalDataFile, LocalResourceSnapshot, SyncJob, SyncMeta, SyncResource } from "./_syncTypes";
import * as sqlStore from "./_syncStoreSqlServer";
import * as pgStore from "./_syncStorePostgres";

export interface LocalQueryResult {
  resource: SyncResource;
  count: number;
  updatedAt: string | null;
  data: Record<string, unknown>[];
}

type StorageProvider = "sqlserver" | "postgres";

function getStorageProvider(): StorageProvider {
  const provider = process.env.SYNC_STORAGE_PROVIDER?.trim().toLowerCase();
  if (provider === "sqlserver") return "sqlserver";
  if (provider === "postgres" || !provider) return "postgres";
  throw new Error(`Storage provider non supportato: ${provider}. Usare SYNC_STORAGE_PROVIDER=postgres|sqlserver`);
}

function getStore() {
  return getStorageProvider() === "sqlserver" ? sqlStore : pgStore;
}

// Tutte le funzioni esportate delegano tramite getStore()
export async function readLocalData(resource: SyncResource): Promise<LocalResourceSnapshot> {
  return getStore().readLocalData(resource);
}
// ... stesso pattern per tutte le altre funzioni
```

---

### Fase 2: Configurazione Ambiente

#### Step 2.1: Aggiornare `.env.example`

Aggiungere variabili PostgreSQL mantenendo quelle SQL Server per retro-compatibilità:

```env
# Storage provider: postgres (default) | sqlserver
SYNC_STORAGE_PROVIDER=postgres

# PostgreSQL (usato quando SYNC_STORAGE_PROVIDER=postgres)
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=tsapi_localcache
PG_USER=tsapi_app
PG_PASSWORD=TsApiLocal2026!
PG_SCHEMA=app_cache
PG_POOL_MAX=10
PG_POOL_IDLE_TIMEOUT_MS=30000
PG_STATEMENT_TIMEOUT_MS=300000

# SQL Server (usato quando SYNC_STORAGE_PROVIDER=sqlserver)
SQLSERVER_CONNECTION_STRING=Server=localhost;Database=TSApiLocalCache;User Id=tsapi_app;Password=TsApiLocal2026!;TrustServerCertificate=True;Encrypt=False;
SQLSERVER_SCHEMA=dbo
SQLSERVER_REQUEST_TIMEOUT_MS=300000
SQLSERVER_CONNECTION_TIMEOUT_MS=30000

# API Gestionale
GESTIONALE_API_URL=http://miorouter.homeip.net:9080/api/v1
GESTIONALE_USERNAME=webapiadmin
GESTIONALE_PASSWORD=default
GESTIONALE_AUTH_SCOPE=1

# Sync behavior
SYNC_INCREMENTAL_ENABLED=false
SYNC_ON_DEMAND_ENABLED=false
```

#### Step 2.2: Aggiornare `PROJECT_MASTER.md`

Aggiungere sezione PostgreSQL alla documentazione esistente, mantenendo la sezione SQL Server come deprecata.

#### Step 2.3: Creare `scripts/verify-postgres-db.js`

Script di verifica equivalente a `verify-sqlserver-db.js` ma per PostgreSQL:

- Connessione con `pg.Pool`
- Verifica esistenza tabelle e conteggio righe
- Verifica indici
- Verifica dati in `sync_meta`

#### Step 2.4: Aggiornare `scripts/cancel-stuck-job.js`

Aggiungere supporto dual-provider: leggere `SYNC_STORAGE_PROVIDER` e usare il driver appropriato.

#### Step 2.5: Aggiornare `scripts/dev-clean.js`

Stesso pattern dual-provider di cancel-stuck-job.

---

### Fase 3: Docker Setup

#### Step 3.1: Creare `Dockerfile`

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/config || exit 1

CMD ["node", "server.js"]
```

#### Step 3.2: Creare `docker-compose.yml`

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: tsapi_localcache
      POSTGRES_USER: tsapi_app
      POSTGRES_PASSWORD: TsApiLocal2026!
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./sql/postgres/001_init.sql:/docker-entrypoint-initdb.d/001_init.sql:ro
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tsapi_app -d tsapi_localcache"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - tsapi-net

  app:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      SYNC_STORAGE_PROVIDER: postgres
      PG_HOST: postgres
      PG_PORT: 5432
      PG_DATABASE: tsapi_localcache
      PG_USER: tsapi_app
      PG_PASSWORD: TsApiLocal2026!
      PG_SCHEMA: app_cache
      PG_POOL_MAX: "10"
      PG_STATEMENT_TIMEOUT_MS: "300000"
      GESTIONALE_API_URL: http://miorouter.homeip.net:9080/api/v1
      GESTIONALE_USERNAME: webapiadmin
      GESTIONALE_PASSWORD: default
      GESTIONALE_AUTH_SCOPE: "1"
    ports:
      - "3000:3000"
    networks:
      - tsapi-net

volumes:
  pgdata:

networks:
  tsapi-net:
    driver: bridge
```

**Nota**: `001_init.sql` viene montato in `/docker-entrypoint-initdb.d/` — PostgreSQL esegue automaticamente gli script in questa directory al primo avvio del container.

#### Step 3.3: Creare `.dockerignore`

```
node_modules
.next
.git
data/
scripts/
sql/sqlserver/
Swagger/
Mokup/
docs/
*.md
.env.local
.env
```

#### Step 3.4: Creare `tools/docker/healthcheck.sh`

```bash
#!/bin/sh
wget --no-verbose --tries=1 --spider http://localhost:3000/api/config || exit 1
```

---

### Fase 4: Package & Build

#### Step 4.1: Aggiornare `package.json`

```json
{
  "dependencies": {
    "mssql": "^11.0.0",
    "next": "^15.1.0",
    "pg": "^8.13.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/mssql": "^9.1.11",
    "@types/node": "^20",
    "@types/pg": "^8.11.0",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "autoprefixer": "^10.4.19",
    "eslint": "^8",
    "eslint-config-next": "15.1.0",
    "postcss": "^8",
    "tailwindcss": "^3.4.1",
    "typescript": "^5"
  },
  "scripts": {
    "dev": "next dev",
    "dev:clean": "node scripts/dev-clean.js",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "docker:build": "docker compose build",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down",
    "docker:logs": "docker compose logs -f app"
  }
}
```

#### Step 4.2: Aggiornare `next.config.ts`

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

`output: "standalone"` è necessario per il Dockerfile multi-stage — produce un bundle ottimizzato in `.next/standalone/`.

---

### Fase 5: Testing & Validazione

#### Step 5.1: Checklist Verifica Manuale

| # | Test | Comando | Risultato Atteso |
|---|------|---------|------------------|
| 1 | Avvio container | `docker compose up --build` | Entrambi i container avviati, PG healthy |
| 2 | Schema auto-creato | Verificare tabelle in PG | 8 tabelle + indici presenti |
| 3 | Config API | `curl localhost:3000/api/config` | JSON con config server |
| 4 | Sync completa | `curl -X POST localhost:3000/api/sync/start` | Job completato con successo |
| 5 | Query clienti | `curl localhost:3000/api/local/clienti` | Dati clienti restituiti |
| 6 | Filtro nome | `curl localhost:3000/api/local/clienti?nome=test` | Risultati filtrati |
| 7 | Query ordini | `curl localhost:3000/api/local/ordini?cliforfatt=123` | Risultati con fallback JSON |
| 8 | Paginazione | `curl localhost:3000/api/local/articoli?page=1&pageSize=50` | 50 risultati |
| 9 | Job history | `curl localhost:3000/api/sync/history` | Lista job |
| 10 | Clear cache | `curl -X DELETE localhost:3000/api/config/clear` | Cache svuotata |
| 11 | Cancel job | `curl -X POST localhost:3000/api/sync/cancel` | Job cancellato |
| 12 | Teardown | `docker compose down -v` | Container e volumi rimossi |

#### Step 5.2: Script Migrazione Dati (Opzionale)

`scripts/migrate-mssql-to-pg.js` — Per trasferire dati esistenti da SQL Server a PostgreSQL:

1. Leggere tutte le righe da ogni tabella SQL Server
2. Inserire in batch in PostgreSQL
3. Verificare conteggi
4. Aggiornare `sync_meta` e `sync_resource_meta`

---

## 4. Mappatura Completa Tipi SQL Server → PostgreSQL

| Tabella | Colonna | SQL Server | PostgreSQL |
|---------|----------|-----------|------------|
| sync_jobs | id | NVARCHAR(80) | VARCHAR(80) |
| sync_jobs | status | NVARCHAR(20) | VARCHAR(20) |
| sync_jobs | phase | NVARCHAR(50) | VARCHAR(50) |
| sync_jobs | progress_pct | INT | INTEGER |
| sync_jobs | processed/inserted/updated/errors | INT | INTEGER |
| sync_jobs | started_at | DATETIME2 | TIMESTAMPTZ |
| sync_jobs | updated_at/ended_at | DATETIME2 | TIMESTAMPTZ |
| sync_jobs | message | NVARCHAR(4000) | VARCHAR(4000) |
| sync_meta | id | INT CHECK(id=1) | INTEGER CHECK(id=1) |
| sync_meta | last_sync_at/last_success_at | DATETIME2 | TIMESTAMPTZ |
| sync_meta | last_job_id | NVARCHAR(80) | VARCHAR(80) |
| sync_meta | last_status | NVARCHAR(20) | VARCHAR(20) |
| sync_meta | message | NVARCHAR(4000) | VARCHAR(4000) |
| sync_meta | updated_at | DATETIME2 | TIMESTAMPTZ |
| sync_resource_meta | resource | NVARCHAR(50) | VARCHAR(50) |
| sync_resource_meta | updated_at | DATETIME2 | TIMESTAMPTZ |
| sync_resource_meta | row_count | INT | INTEGER |
| sync_resource_meta | updated_on | DATETIME2 | TIMESTAMPTZ |
| cache_clienti/fornitori | row_id | BIGINT IDENTITY | BIGSERIAL |
| cache_clienti/fornitori | cli_for/id_cli_for | INT | INTEGER |
| cache_clienti/fornitori | ragione_sociale | NVARCHAR(255) | VARCHAR(255) |
| cache_clienti/fornitori | piva | NVARCHAR(40) | VARCHAR(40) |
| cache_clienti/fornitori | citta | NVARCHAR(120) | VARCHAR(120) |
| cache_clienti/fornitori | flg_attivo | BIT | BOOLEAN |
| cache_clienti/fornitori | updated_at | DATETIME2 | TIMESTAMPTZ |
| cache_clienti/fornitori | raw_json | NVARCHAR(MAX) | TEXT |
| cache_articoli | row_id | BIGINT IDENTITY | BIGSERIAL |
| cache_articoli | codice_articolo | NVARCHAR(80) | VARCHAR(80) |
| cache_articoli | descrizione | NVARCHAR(400) | VARCHAR(400) |
| cache_articoli | ditta | INT | INTEGER |
| cache_articoli | flg_esaurito | BIT | BOOLEAN |
| cache_articoli | updated_at | DATETIME2 | TIMESTAMPTZ |
| cache_articoli | raw_json | NVARCHAR(MAX) | TEXT |
| cache_ordini | row_id | BIGINT IDENTITY | BIGSERIAL |
| cache_ordini | num_reg | BIGINT | BIGINT |
| cache_ordini | num_doc | NVARCHAR(60) | VARCHAR(60) |
| cache_ordini | tipo_doc | NVARCHAR(40) | VARCHAR(40) |
| cache_ordini | sez_doc | NVARCHAR(20) | VARCHAR(20) |
| cache_ordini | cli_for_fatt/dest | INT | INTEGER |
| cache_ordini | data_doc | DATETIME2 | TIMESTAMPTZ |
| cache_ordini | updated_at | DATETIME2 | TIMESTAMPTZ |
| cache_ordini | raw_json | NVARCHAR(MAX) | TEXT |
| cache_righe_ordine | row_id | BIGINT IDENTITY | BIGSERIAL |
| cache_righe_ordine | num_reg | BIGINT | BIGINT |
| cache_righe_ordine | progr_riga | INT | INTEGER |
| cache_righe_ordine | cod_articolo | NVARCHAR(80) | VARCHAR(80) |
| cache_righe_ordine | descrizione | NVARCHAR(400) | VARCHAR(400) |
| cache_righe_ordine | quantita | DECIMAL(18,6) | NUMERIC(18,6) |
| cache_righe_ordine | updated_at | DATETIME2 | TIMESTAMPTZ |
| cache_righe_ordine | raw_json | NVARCHAR(MAX) | TEXT |

---

## 5. Mappatura Query Filtro SQL Server → PostgreSQL

### 5.1 Filtro Clienti/Fornitori

```sql
-- SQL Server
WHERE ragione_sociale LIKE @param
-- PostgreSQL
WHERE ragione_sociale LIKE $1
```

### 5.2 Filtro Articoli (codice articolo con COALESCE + JSON_VALUE)

```sql
-- SQL Server
WHERE COALESCE(NULLIF(LTRIM(RTRIM(codice_articolo)), ''),
  JSON_VALUE(raw_json, '$.codiceArticoloMG'),
  JSON_VALUE(raw_json, '$.codice_articolo'),
  ...) LIKE @param

-- PostgreSQL
WHERE COALESCE(NULLIF(TRIM(codice_articolo), ''),
  raw_json::jsonb->>'codiceArticoloMG',
  raw_json::jsonb->>'codice_articolo',
  ...) LIKE $1
```

### 5.3 Filtro Ordini (cli_for con fallback JSON)

```sql
-- SQL Server
(cli_for_fatt = @param OR (cli_for_fatt IS NULL AND TRY_CONVERT(BIGINT, JSON_VALUE(raw_json, '$.cliforfatt')) = @param))

-- PostgreSQL
(cli_for_fatt = $1 OR (cli_for_fatt IS NULL AND NULLIF(raw_json::jsonb->>'cliforfatt', '')::bigint = $1))
```

### 5.4 Filtro Nome Party Ordini

```sql
-- SQL Server
(JSON_VALUE(raw_json, '$.clienteFornitoreMG.anagrafica.ragioneSociale') LIKE @param
 OR JSON_VALUE(raw_json, '$.clienteFornitoreMG.ragioneSociale') LIKE @param
 OR ...)

-- PostgreSQL
(raw_json::jsonb#>>'{clienteFornitoreMG,anagrafica,ragioneSociale}' LIKE $1
 OR raw_json::jsonb->>'clienteFornitoreMG' LIKE $1  -- se nested, usare jsonb_path_query_text
 OR ...)
```

**Nota**: Per path JSON annidati come `clienteFornitoreMG.anagrafica.ragioneSociale`, PostgreSQL offre:
- `col::jsonb#>>'{key1,key2,key3}'` — Estrazione come testo
- `jsonb_path_query_text(col, '$.key1.key2.key3')` — JSONPath completo (PG 12+)
- `col::jsonb->'key1'->'key2'->>'key3'` — Estrazione step-by-step

Per path con array (es. `datoDescrizione[0].codArtMg66`):
- `jsonb_path_query_text(col::jsonb, '$.datoDescrizione[0].codArtMg66')`

---

## 6. File da Creare/Modificare

### Nuovi File

| File | Descrizione |
|------|-------------|
| `app/api/_syncStorePostgres.ts` | Implementazione completa store PostgreSQL (~1500 righe) |
| `sql/postgres/001_init.sql` | DDL bootstrap PostgreSQL |
| `scripts/verify-postgres-db.js` | Script verifica database PostgreSQL |
| `scripts/migrate-mssql-to-pg.js` | Script migrazione dati (opzionale) |
| `Dockerfile` | Multi-stage Next.js production build |
| `docker-compose.yml` | Stack app + PostgreSQL |
| `.dockerignore` | Esclusioni per build Docker |
| `tools/docker/healthcheck.sh` | Health check script |

### File da Modificare

| File | Modifica |
|------|----------|
| `app/api/_syncStore.ts` | Aggiungere routing multi-provider (postgres/sqlserver) |
| `package.json` | Aggiungere `pg`, `@types/pg`, script Docker |
| `next.config.ts` | Aggiungere `output: 'standalone'` |
| `.env.example` | Aggiungere variabili PG_* |
| `PROJECT_MASTER.md` | Documentare config PostgreSQL |
| `scripts/cancel-stuck-job.js` | Supporto dual-provider |
| `scripts/dev-clean.js` | Supporto dual-provider |

### File Invariati

| File | Motivo |
|------|--------|
| `app/api/_syncTypes.ts` | Tipi DB-agnostic |
| `app/api/_syncEngine.ts` | Usa solo il facade |
| `app/api/_syncStoreSqlServer.ts` | Mantenuto per retro-compatibilità |
| `sql/sqlserver/001_init.sql` | Mantenuto per retro-compatibilità |
| Tutti i component UI | Non toccano il DB direttamente |

---

## 7. Dipendenze tra Step

```
Step 1.1 (_syncStorePostgres.ts) ──→ Step 1.3 (_syncStore.ts routing)
Step 1.2 (001_init.sql PG) ──→ Step 3.2 (docker-compose.yml)
Step 1.3 (_syncStore.ts) ──→ Step 4.1 (package.json)
Step 4.1 (package.json) ──→ Step 3.1 (Dockerfile)
Step 4.2 (next.config.ts) ──→ Step 3.1 (Dockerfile)
Step 3.1 + 3.2 ──→ Step 5 (Testing)

Parallelismo possibile:
- Step 1.1 e 1.2 possono essere sviluppati in parallelo
- Step 2.1-2.5 possono essere sviluppati in parallelo con Step 1
- Step 3.1-3.4 possono essere sviluppati in parallelo con Step 1-2
```

---

## 8. Decisioni

| Decisione | Scelta | Rationale |
|-----------|--------|-----------|
| Database alternativo | PostgreSQL | JSONB nativo, concorrenza robusta, Docker-friendly, production-grade, gratuito |
| Driver Node.js | `pg` (node-postgres) | Stesso pattern raw-SQL di `mssql`, zero astrazione aggiuntiva |
| Supporto dual-provider | Sì, durante transizione | `SYNC_STORAGE_PROVIDER` env var, default `postgres` |
| Schema PostgreSQL | `app_cache` | Evita collisione con `public`, convenzione PG |
| ORM | No | Mantenere pattern raw-SQL coerente con codebase esistente |
| Variabili connessione PG | Variabili separate (`PG_HOST`, `PG_PORT`, etc.) | Più Docker-friendly, override per-container |
| Variabili connessione MSSQL | Connection string singola (invariato) | Retro-compatibilità |
| Rimozione `mssql` | Post-validazione | Dopo conferma PG funzionante, rimuovere `mssql` + `@types/mssql` + `_syncStoreSqlServer.ts` |

---

## 9. Considerazioni Finali

1. **Migrazione dati esistenti**: Se SQL Server ha dati produzione, serve script ETL one-shot (`migrate-mssql-to-pg.js`). Per ambiente dev, basta una sync completa da zero.

2. **Rimozione `mssql` a lungo termine**: Dopo validazione PostgreSQL, rimuovere `mssql`, `@types/mssql`, `_syncStoreSqlServer.ts`, e `sql/sqlserver/` per ridurre bundle size e complessità.

3. **Formato connessione**: Variabili PG_* separate sono più Docker-friendly di una connection string singola. Per MSSQL si mantiene la connection string per retro-compatibilità.

4. **Performance JSONB**: PostgreSQL JSONB è più potente di SQL Server `JSON_VALUE` — supporta indicizzazione via GIN, query path annidati, e operatori avanzati. Considerare aggiunta indici GIN su `raw_json` per query filtro frequenti:
   ```sql
   CREATE INDEX IF NOT EXISTS ix_cache_ordini_raw_json_gin 
     ON app_cache.cache_ordini USING GIN (raw_json::jsonb);
   ```

5. **Backup Docker**: Aggiungere volume nominato per persistenza dati PG. Considerare `pg_dump` automatizzato via cron nel container o script esterno.