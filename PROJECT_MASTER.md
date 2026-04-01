# TS-API - Documentazione Unica Completa

**Ultimo aggiornamento**: 2026-04-01
**Repository**: `https://github.com/francescopaganotustena-hash/TS-API-LINUX`
**Commit**: 4c11122

---

## 1. Quickstart Operativo

### Prerequisiti
- Node.js 20+
- SQL Server locale attivo
- File `.env.local` configurato

### Avvio Rapido
```powershell
cd <PROJECT_ROOT>
npm install
npm run build
npm run start
```
Apri: `http://localhost:3000`

### Avvio Robusto (pulizia cache)
```powershell
npm run dev:clean -- -p 3000
```

### Troubleshooting
Se Next.js mostra errori cache:
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force .next
npm run build
npm run dev -p 3000
```

---

## 2. Configurazione Ambiente

### Variabili Ambiente (.env.local)
```env
# API Gestionale
GESTIONALE_API_URL=http://miorouter.homeip.net:9080/api/v1
GESTIONALE_USERNAME=webapiadmin
GESTIONALE_PASSWORD=default
GESTIONALE_AUTH_SCOPE=1

# Storage locale
SYNC_STORAGE_PROVIDER=sqlserver
SQLSERVER_CONNECTION_STRING=Server=localhost;Database=TSApiLocalCache;User Id=tsapi_app;Password=TsApiLocal2026!;TrustServerCertificate=True;Encrypt=False;
SQLSERVER_SCHEMA=dbo
SQLSERVER_REQUEST_TIMEOUT_MS=300000
SQLSERVER_CONNECTION_TIMEOUT_MS=30000

# Sync behavior
SYNC_INCREMENTAL_ENABLED=false
SYNC_ON_DEMAND_ENABLED=false
```

### Parametri API Standard
- `ambiente` (default: `"1"`)
- `utente` (default: `"TeamSa"`)
- `azienda` (default: `"1"`)
- `pageNumber` (zero-based, default: `0`)
- `pageSize` (default: `100`)

---

## 3. Endpoint API Locali

### Risorse
| Endpoint | Descrizione |
|----------|-------------|
| `GET /api/local/clienti` | Query clienti da cache SQL |
| `GET /api/local/fornitori` | Query fornitori da cache SQL |
| `GET /api/local/articoli` | Query articoli da cache SQL |
| `GET /api/local/ordini` | Query ordini/documenti da cache SQL |
| `GET /api/local/righeOrdine` | Query righe documento da cache SQL |
| `GET /api/local/meta` | Metadati sync e conteggi |

### Sync
| Endpoint | Descrizione |
|----------|-------------|
| `POST /api/sync/start` | Avvio job sincronizzazione |
| `GET /api/sync/status/{jobId}` | Stato singolo job |
| `GET /api/sync/history` | Storico jobs |
| `POST /api/sync/cancel` | Cancel job in corso |

### Esempio Sync Completa
```http
POST /api/sync/start
Content-Type: application/json

{
  "ambiente": "1",
  "utente": "TeamSa",
  "azienda": "1",
  "pageSize": 100,
  "maxPages": 1000,
  "syncMode": "full",
  "scope": { "type": "full", "trigger": "manual" }
}
```

---

## 4. Mappatura Risorse

| resourceType | Entity Gestionale | Descrizione |
|--------------|-------------------|-------------|
| `clienti` | `cliente` | Clienti |
| `fornitori` | `fornitore` | Fornitori |
| `articoli` | `Articolo` | Articoli magazzino |
| `ordini` | `Documento` | Documenti (fatture, DDT, ordini) |
| `righeOrdine` | `RigaDocumento` | Righe documento |

---

## 5. Database SQL Server

### Tabelle Cache
- `cache_clienti` - Clienti sincronizzati
- `cache_fornitori` - Fornitori sincronizzati
- `cache_articoli` - Articoli sincronizzati
- `cache_ordini` - Documenti sincronizzati
- `cache_righe_ordine` - Righe documento sincronizzate

### Tabelle Metadata
- `sync_jobs` - Jobs sincronizzazione
- `sync_meta` - Metadati globali
- `sync_resource_meta` - Metadati per risorsa

### Indici Covering (Ottimizzazione D-16)
```sql
-- Indici per filtraggio rapido documenti
IX_cache_ordini_cliforfatt_covering ON cli_for_fatt INCLUDE (num_reg, num_doc, tipo_doc, sez_doc, data_doc)
IX_cache_ordini_clifordest_covering ON cli_for_dest INCLUDE (num_reg, num_doc, tipo_doc, sez_doc, data_doc)
```

### Query Utili
```sql
-- Controllo codici articolo null
SELECT COUNT(*) total,
       SUM(CASE WHEN codice_articolo IS NULL OR LTRIM(RTRIM(codice_articolo))='' THEN 1 ELSE 0 END) null_codice
FROM dbo.cache_articoli;

-- Distribuzione tipo documento
SELECT tipo_doc, COUNT(*) c
FROM dbo.cache_ordini
GROUP BY tipo_doc
ORDER BY c DESC;

-- Indici esistenti
SELECT name FROM sys.indexes 
WHERE object_id = OBJECT_ID('dbo.cache_ordini')
ORDER BY name;
```

---

## 6. Stato Sviluppo (Kanban)

### DONE (D-01 → D-16)
| ID | Task | Data |
|----|------|------|
| D-01 | Integrazione auth API (Basic Auth + Authorization-Scope) | 2026-03 |
| D-02 | Mappatura risorse principali | 2026-03 |
| D-03 | Correzione paginazione zero-based | 2026-03 |
| D-04 | Page size minima utente a 100 | 2026-03 |
| D-05 | Fallback ricerca estesa | 2026-03 |
| D-06 | Arricchimento dati clienti/fornitori | 2026-03 |
| D-07 | Normalizzazione descrizione articoli | 2026-03 |
| D-08 | Tabelle ordinabili (ASC/DESC) | 2026-03 |
| D-09 | Correzione errore React static flag | 2026-03 |
| D-10 | Script dev:clean | 2026-03 |
| D-11 | Ripristino ricerca fornitori ragione sociale | 2026-03 |
| D-12 | Drilldown Ordini → RigheDocumento | 2026-03-28 |
| D-13 | Fix filtraggio documenti per cliente | 2026-03-31 |
| D-14 | Fix visualizzazione cliente in tabella documenti | 2026-03-31 |
| D-15 | Ottimizzazione query SQL (355ms vs 30-90s) | 2026-03-31 |
| D-16 | Indici covering + statistiche aggiornate | 2026-03-31 |

### TODO (Backlog)
| ID | Task | Effort |
|----|------|--------|
| S1-T2 | Lookup destinatari | S |
| S1-T3 | Hardening test regressione | S |
| S2-T4 | Ricerca listini articolo | M |
| S2-T5 | Lookup depositi/magazzini | S |
| S2-T6 | Anagrafica estesa clienti/fornitori | M |
| S3-T7 | Relazione cliente-fornitore-articolo | M |
| S3-T8 | Workflow documento approve/decline | L |
| S3-T9 | Operazioni ricalcolo giacenze | L |

---

## 7. Storia Progetto (Timeline)

### Fase A - Avvio e mappatura API
- Raccolte specifiche da `swagger-api.json`
- Definiti parametri fondamentali (ambiente, utente, azienda, Authorization-Scope)
- Mappatura risorse → entity

### Fase B - Stabilizzazione API locale
- Corrette incongruenze paginazione (pageNumber zero-based)
- Introdotti fallback ricerca estesa
- Stabilizzati form/filtri

### Fase C - Restyling UI
- Interfaccia Explorer con sidebar, pannello dettagli, nodi gerarchici
- Navigazione ad albero su tutte le aree

### Fase D - Problemi emersi in test
- Dati mancanti/placeholder
- Ricerche intermittenti
- Sync bloccata

### Fase E - Scelta SQL-first
- Abbandono JSON-file come storage
- Adozione SQL Server locale

### Fase F - Implementazione SQL Server
- Schema tabelle cache + metadata + jobs
- API locali reindirizzate a query SQL
- Indicizzazione tabelle

### Fase G - Hardening finale
- Albero iniziale compresso
- Classificazione documenti corretta
- Fix `cache_articoli.codice_articolo`
- Sync resa sicura contro troncamento

---

## 8. Ottimizzazioni Performance (D-15, D-16)

### Problema
Query SQL con `JSON_VALUE` su 20+ path erano estremamente lente (30-90 secondi).

### Soluzione
1. Query ottimizzata: usa colonne INT (`cli_for_fatt`, `cli_for_dest`) direttamente
2. Fallback JSON solo se colonna INT è NULL
3. Indici covering creati
4. Statistiche aggiornate con FULLSCAN

### Risultati
| Metrica | Prima | Dopo |
|---------|-------|------|
| Query COUNT | 30-90s | 355ms |
| API response (10 righe) | 744ms | 618ms |

### Stato Colonne INT
- `cli_for_fatt`: 99% popolato (11232/11291)
- `cli_for_dest`: 52% popolato (5894/11291)

---

## 9. Specifiche API Alyante

### Struttura URL
```
/v1/{ambiente}/{verticale?}/{Entita}/{id}
/v1/{ambiente}/{verticale?}/{Entita}{._op=operation?}
```

### Operazioni Standard
| Operazione | Metodo | Endpoint |
|------------|--------|----------|
| GetById | GET | `/{id}` |
| Search | POST | `{._op=search?}` |
| Create | POST | `/` (body) |
| Update | PUT | `/{id}` (body) |
| Delete | DELETE | `/{id}` |
| Validate | POST | `{._op=validate?}` |

### Entità Principali Usate
- `ClienteFornitoreMG` - Clienti e fornitori
- `Articolo` - Articoli magazzino
- `Documento` - Testate documenti
- `RigaDocumento` - Righe documenti
- `DestinatarioMG` - Destinatari

### SearchGroupDTO
```json
{
  "pageNumber": 0,
  "pageSize": 100,
  "items": [
    {
      "propertyName": "nomeCampo",
      "value": "valore",
      "comparer": 0,
      "operator": 1
    }
  ]
}
```

---

## 10. File Chiave

### Frontend
- `app/page.tsx` - Pagina principale Explorer
- `lib/explorerTree.ts` - Logica albero navigazione
- `components/DataTable.tsx` - Tabella risultati
- `components/SearchForm.tsx` - Form filtri

### Backend Sync/Store
- `app/api/_syncEngine.ts` - Engine sincronizzazione
- `app/api/_syncStoreSqlServer.ts` - Store SQL Server
- `app/api/sync/start/route.ts` - Endpoint sync start
- `app/api/local/[resource]/route.ts` - Endpoint query locali

### Schema SQL
- `sql/sqlserver/001_init.sql` - Schema database

### Scripts Utility
- `scripts/dev-clean.js` - Pulizia cache + avvio
- `scripts/verify-sqlserver-db.js` - Verifica DB
- `scripts/cancel-stuck-job.js` - Cancel job bloccato

---

## 11. Runbook Operativo

### Diagnostica Rapida
```powershell
# Verifica processo
Get-CimInstance Win32_Process -Filter "name='node.exe'" | Select ProcessId,CommandLine

# Verifica API locale
Invoke-RestMethod "http://localhost:3000/api/local/clienti?ambiente=1&utente=TeamSa&azienda=1&pageSize=20"

# Verifica meta
Invoke-RestMethod "http://localhost:3000/api/local/meta"
```

### Rollback Sync Incrementale
1. Imposta `SYNC_INCREMENTAL_ENABLED=false`
2. Avvia sync completa manuale
3. Forza `syncMode=full` nella richiesta

### Problemi UI Vuota
- Verifica sync completata
- Controlla `/api/sync/history`
- Rilancia sync completa

---

## 12. Sviluppi Futuri

### Priorità Alta
1. Lookup destinatari (`DestinatarioMG`)
2. Ricerca listini articolo (`ListinoArticoloLI`)
3. Lookup depositi/magazzini (`DepositoMG`)

### Priorità Media
4. Anagrafica estesa (`Anagrafica`)
5. Relazioni cliente-fornitore-articolo

### Priorità Bassa (con guard rail)
6. Workflow approve/decline documenti
7. Operazioni ricalcolo giacenze

---

## 13. Note Sicurezza

- Endpoint `POST/PUT/DELETE` non read-only vanno protetti:
  - Conferma utente esplicita
  - Log operazione
  - Feature flag ambiente
- Prima di abilitare write operations, validare permessi API

---

**Fine Documentazione**