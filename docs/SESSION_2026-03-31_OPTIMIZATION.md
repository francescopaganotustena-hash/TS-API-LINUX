# Sessione: Ottimizzazione Query SQL Filtraggio Documenti
**Data**: 2026-03-31
**Commit**: bc5a1a6

## Contesto
Partendo dal checkpoint D-14 (fix filtraggio documenti per cliente), è emerso un problema di performance nelle query SQL che usavano `JSON_VALUE` su 20+ path.

## Problema Riscontrato
- Query SQL con `JSON_VALUE` estremamente lente (30-90 secondi)
- Causa: SQL Server deve scansionare tutte le righe ed estrarre valori JSON per ogni confronto

## Soluzioni Implementate

### D-15: Query Ottimizzata
**File**: `app/api/_syncStoreSqlServer.ts`

Modificata `buildResourceFilterDescriptors()` per:
- Usare colonne INT (`cli_for_fatt`, `cli_for_dest`) direttamente per filtraggio
- Fallback JSON solo se colonna INT è NULL (dati legacy)

```sql
-- Prima (lento)
WHERE JSON_VALUE(json_data, '$.clienteFornitoreMG.cliFor') = '16'

-- Dopo (veloce)
WHERE cli_for_fatt = 16
```

### D-16: Indici Covering
**Comando SQL eseguito**:
```sql
CREATE INDEX IX_cache_ordini_cliforfatt_covering 
ON dbo.cache_ordini(cli_for_fatt) 
INCLUDE (num_reg, num_doc, tipo_doc, sez_doc, data_doc);

CREATE INDEX IX_cache_ordini_clifordest_covering 
ON dbo.cache_ordini(cli_for_dest) 
INCLUDE (num_reg, num_doc, tipo_doc, sez_doc, data_doc);

UPDATE STATISTICS dbo.cache_ordini WITH FULLSCAN;
```

## Risultati Performance

| Metrica | Prima | Dopo | Miglioramento |
|---------|-------|------|---------------|
| Query COUNT | 30-90s | 355ms | 100x |
| API response (10 righe) | 744ms | 618ms | 17% |
| API response (500 righe) | 3-4s | ~3s | 25% |

## Stato Colonne INT
- `cli_for_fatt`: 99% popolato (11232/11291 righe)
- `cli_for_dest`: 52% popolato (5894/11291 righe)

## File Modificati
1. `app/api/_syncStoreSqlServer.ts` - query ottimizzata
2. `app/page.tsx` - fix resolvePartyCode
3. `lib/api.ts` - supporto destinatari
4. `lib/explorerTree.ts` - supporto destinatari
5. `DEVELOPMENT_STATE.md` - checkpoint aggiornato

## File Creati
1. `docs/CHECKPOINT_FIX_FILTRAGGIO_FATTURE.md`
2. `scripts/cancel-stuck-job.js`
3. `scripts/verify-fattura.js`
4. `scripts/verify-sqlserver-db.js`

## Ottimizzazioni Future (Opzionali)
1. **Resync completa ordini**: Popolare 100% colonne INT
2. **Colonne calcolate persisted**: Pre-calcolare valori JSON estratti
3. **Full-text search**: Per LIKE efficiente su ragione_sociale/descrizione

## Come Riprendere
1. Leggere `DEVELOPMENT_STATE.md` per stato completo
2. Verificare indici esistenti:
   ```sql
   SELECT name FROM sys.indexes 
   WHERE object_id = OBJECT_ID('dbo.cache_ordini')
   ORDER BY name;
   ```
3. Test performance:
   ```bash
   node -e "fetch('http://localhost:3000/api/local/ordini?ambiente=1&utente=TeamSa&azienda=1&clifordest=6&pageSize=10').then(r=>r.json()).then(d=>console.log(d.count))"
   ```

## Comandi Utili
- Avvio server: `npm run dev:clean -- -p 3000`
- Verifica DB: `node scripts/verify-sqlserver-db.js`
- Git push: `git push origin main`