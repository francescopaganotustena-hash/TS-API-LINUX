# TS-API-LINUX

Portale Next.js per consultazione dati gestionale con cache locale SQL Server e motore di sincronizzazione.

Repository: `https://github.com/francescopaganotustena-hash/TS-API-LINUX`

## Obiettivo progetto

Applicazione web per:
- interrogare risorse gestionali (`clienti`, `fornitori`, `articoli`, `ordini`, `righeOrdine`)
- mantenere una cache locale performante in SQL Server
- tracciare job di sync, stato, progress e storico
- fornire UI Explorer per navigazione ad albero e dettaglio documenti

## Stack tecnico

- Next.js 15 (App Router)
- React 19
- TypeScript 5
- SQL Server (`mssql`)
- Tailwind CSS

Nota importante:
- il facade storage attuale (`app/api/_syncStore.ts`) supporta solo `sqlserver`
- se `SYNC_STORAGE_PROVIDER` e valorizzato a valore diverso da `sqlserver`, il backend risponde con errore

## Architettura (alto livello)

- `app/page.tsx`: UI Explorer principale
- `app/api/*`: API locali (config, sync, query cache)
- `app/api/_syncEngine.ts`: orchestrazione sincronizzazione
- `app/api/_syncStoreSqlServer.ts`: persistenza su SQL Server
- `app/api/_syncStore.ts`: facade storage (attualmente SQL Server only)
- `sql/sqlserver/001_init.sql`: bootstrap schema DB cache
- `scripts/*`: utility operative (clean dev, verify DB, cancel job)

## Struttura repository

```text
app/
  api/
    config/
    local/
    sync/
    _syncEngine.ts
    _syncStore.ts
    _syncStoreSqlServer.ts
components/
lib/
data/
docs/
sql/sqlserver/001_init.sql
scripts/
PROJECT_MASTER.md
```

## Prerequisiti

- Node.js 20+
- npm 10+
- SQL Server raggiungibile dalla macchina di sviluppo
- database inizializzato con schema cache

## Installazione rapida

```bash
npm install
```

## Configurazione ambiente

1. Copia file esempio:

```bash
cp .env.example .env.local
```

2. Aggiorna variabili in `.env.local`:

```env
# API gestionale
GESTIONALE_API_URL=http://your-host:9080/api/v1
GESTIONALE_USERNAME=your-user
GESTIONALE_PASSWORD=your-password
GESTIONALE_AUTH_SCOPE=1

# Storage locale (obbligatorio ad oggi: sqlserver)
SYNC_STORAGE_PROVIDER=sqlserver
SQLSERVER_CONNECTION_STRING=Server=localhost;Database=TSApiLocalCache;User Id=tsapi_app;Password=change-me;TrustServerCertificate=True;Encrypt=False;
SQLSERVER_SCHEMA=dbo
SQLSERVER_REQUEST_TIMEOUT_MS=300000
SQLSERVER_CONNECTION_TIMEOUT_MS=30000

# Sync flags
SYNC_INCREMENTAL_ENABLED=false
SYNC_ON_DEMAND_ENABLED=false
```

Nota:
- in `.env.example` puo comparire `SYNC_STORAGE_PROVIDER=json`; con codice attuale va impostato a `sqlserver`

## Bootstrap database SQL Server

Esegui script:

`sql/sqlserver/001_init.sql`

Lo script crea:
- tabelle metadata: `sync_jobs`, `sync_meta`, `sync_resource_meta`
- tabelle cache: `cache_clienti`, `cache_fornitori`, `cache_articoli`, `cache_ordini`, `cache_righe_ordine`
- indici principali per ricerca e filtraggio

## Avvio applicazione

Dev standard:

```bash
npm run dev
```

Dev con pulizia cache Next:

```bash
npm run dev:clean -- -p 3000
```

Build produzione:

```bash
npm run build
npm run start
```

App disponibile su:
- `http://localhost:3000`

## Script disponibili

- `npm run dev`: avvio sviluppo
- `npm run dev:clean`: rimuove `.next` e riavvia dev server
- `npm run build`: build produzione
- `npm run start`: avvio runtime produzione
- `npm run lint`: lint codebase

Script utility (`scripts/`):
- `verify-sqlserver-db.js`: verifica schema/stato DB SQL Server
- `cancel-stuck-job.js`: annulla job sync bloccato
- `verify-fattura.js`: utility diagnostica fattura

## API locali principali

### Config

- `GET /api/config`: legge configurazione server
- `POST /api/config`: aggiunge/modifica server
- `PUT /api/config`: cambia server attivo (opzione clear data)
- `DELETE /api/config`: elimina server o reset completo
- `POST /api/config/test`: test connessione gestionale
- `POST /api/config/clear`: pulizia dati locali

### Sync

- `POST /api/sync/start`: avvio job sync
- `GET /api/sync/status/{jobId}`: stato job
- `GET /api/sync/history?limit=20`: storico job
- `POST /api/sync/cancel`: annulla job attivo o `jobId` specifico

### Query cache locale

- `GET /api/local/clienti`
- `GET /api/local/fornitori`
- `GET /api/local/articoli`
- `GET /api/local/ordini`
- `GET /api/local/righeOrdine`
- `GET /api/local/meta`

Parametri query comuni:
- `pageNumber` (default 0)
- `pageSize` (default 100)
- `ambiente` (default 1)
- `utente` (default TeamSa)
- `azienda` (default 1)

## Esempi chiamate

Avvio sync completa:

```bash
curl -X POST http://localhost:3000/api/sync/start \
  -H "Content-Type: application/json" \
  -d '{
    "ambiente":"1",
    "utente":"TeamSa",
    "azienda":"1",
    "pageSize":100,
    "maxPages":1000,
    "syncMode":"full",
    "scope":{"type":"full","trigger":"manual"}
  }'
```

Lettura clienti:

```bash
curl "http://localhost:3000/api/local/clienti?pageNumber=0&pageSize=50"
```

Storico job:

```bash
curl "http://localhost:3000/api/sync/history?limit=20"
```

## Workflow operativo consigliato

1. Configura `.env.local` con provider `sqlserver`.
2. Inizializza DB con `sql/sqlserver/001_init.sql`.
3. Avvia app (`npm run dev`).
4. Verifica configurazione con `GET /api/config`.
5. Avvia sync con `POST /api/sync/start`.
6. Controlla avanzamento con `/api/sync/history` e `/api/sync/status/{jobId}`.
7. Consulta dati via endpoint `/api/local/*` o da UI Explorer.

## Troubleshooting rapido

### UI vuota o dati assenti

- verifica sync completata (`/api/sync/history`)
- verifica conteggi (`/api/local/meta`)
- rilancia sync full

### Errore storage provider non supportato

- controlla `.env.local`
- imposta `SYNC_STORAGE_PROVIDER=sqlserver`
- riavvia server Next

### Errori cache Next.js

```bash
rm -rf .next
npm run dev
```

Su Windows PowerShell:

```powershell
Remove-Item -Recurse -Force .next
npm run dev
```

### Job bloccati

- usa endpoint `POST /api/sync/cancel`
- oppure esegui script `scripts/cancel-stuck-job.js`

## Documentazione interna utile

- [PROJECT_MASTER.md](./PROJECT_MASTER.md): documento operativo esteso
- [docs/migration-plan-sqlserver-to-postgres.md](./docs/migration-plan-sqlserver-to-postgres.md): piano migrazione DB
- [CHANGELOG_maxPages_fix.md](./CHANGELOG_maxPages_fix.md): changelog fix maxPages

## Sicurezza

- non committare credenziali reali in `.env.local`
- usa account DB e API con privilegi minimi necessari
- prima di abilitare operazioni write lato gestionale, aggiungi guard rail applicativi e logging audit

## Stato attuale e roadmap

Stato corrente:
- produzione locale basata su SQL Server cache
- sync e query locali operative

Roadmap:
- migrazione a PostgreSQL + Docker (vedi doc dedicata)
- hardening test regressione su filtri complessi
- pulizia configurazioni legacy e allineamento env example

## Licenza

Repository privato. Uso interno.

