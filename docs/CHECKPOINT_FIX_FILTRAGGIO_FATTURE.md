# Checkpoint: Fix Filtraggio Fatture per Ragione Sociale

**Data**: 31 Marzo 2026
**Stato**: ✅ COMPLETATO
**Problema**: Il frontend non filtrava correttamente le fatture per ragione sociale

---

## Problema Identificato

### Sintomo
Quando si espandeva un cliente (es. MARINCO, codice 6) nella sezione "Documenti", venivano mostrate:
1. Fatture di altri clienti (filtraggio errato)
2. Solo una frazione delle fatture effettivamente associate (dati incompleti)

### Cause Radice
1. **Frontend**: La funzione `buildSearchFilters` inviava il filtro `tipodoc` (tipo documento) invece di cercare per nome del cliente/fornitore
2. **Backend**: La clausola SQL per filtrare per codice cliente/fornitore era troppo complessa e cercava in troppi percorsi JSON, causando:
   - False positivi (documenti di altri clienti)
   - False negativi (documenti non trovati perché la colonna INT era NULL)

---

## Modifiche Applicate

### 1. app/page.tsx (Frontend)

**Riga 93-98**: Modificata la funzione `buildSearchFilters` per la risorsa "ordini"

```typescript
// PRIMA
if (resource === "ordini") {
  if (isNumeric) return { numdoc: query };
  return { tipodoc: query };  // ❌ Errato: cercava per tipo documento
}

// DOPO
if (resource === "ordini") {
  if (isNumeric) return { numdoc: query };
  // FIX: Search by party name instead of document type
  return { nomeParty: query };  // ✅ Corretto: cerca per nome cliente/fornitore
}
```

### 2. app/api/_syncStoreSqlServer.ts (Backend)

#### A. Aggiunto supporto per filtraggio per nome party (Riga ~730-750)

Nuova funzione `addOrderPartyNameFilter`:

```typescript
const addOrderPartyNameFilter = (partyName: string) => {
  const paramName = nextParam();
  const likeValue = toSqlLikeValue(partyName);
  // Search in various JSON paths where party name might be stored
  const clause = `(
    JSON_VALUE(raw_json, '$.clienteFornitoreMG.anagrafica.ragioneSociale') LIKE @${paramName} OR
    JSON_VALUE(raw_json, '$.clienteFornitoreMG.ragioneSociale') LIKE @${paramName} OR
    JSON_VALUE(raw_json, '$.anagrafica.ragioneSociale') LIKE @${paramName} OR
    JSON_VALUE(raw_json, '$.ragioneSociale') LIKE @${paramName}
  )`;
  descriptors.push({ clause, paramName, value: likeValue });
};
```

#### B. Migliorata estrazione codici durante sincronizzazione (Riga ~380-400)

Aggiunti percorsi di fallback per `cli_for_fatt` e `cli_for_dest`:

```typescript
cli_for_fatt: toNullableInt(
  getFirstPathValue(
    row,
    "cliforfatt",
    "cliForFatt",
    "cli_for_fatt",
    "clienteFornitoreMG.cliFor",
    "clienteFornitoreMG.cli_for",
    "clienteFornitoreMG.id"
  )
),
cli_for_dest: toNullableInt(
  getFirstPathValue(
    row,
    "cliForDest",
    "cli_for_dest",
    "clifordest",
    "clienteFornitoreMG.cliFor",
    "clienteFornitoreMG.cli_for",
    "clienteFornitoreMG.id",
    "destinatari.cliFor",
    "destinatari.codice"
  )
),
```

#### C. Aggiunto fallback JSON nel filtraggio SQL (Riga ~660-690)

Semplificata e migliorata la funzione `addOrderPartyFilter`:

```typescript
const addOrderPartyFilter = (partyCode: string, perspective: "fornitore" | "cliente") => {
  const parsed = Number(partyCode);
  const paramName = nextParam();
  const useIntFilter = Number.isFinite(parsed);
  const normalizedCode = useIntFilter ? Math.trunc(parsed) : partyCode.trim();

  // FIX: Use INT columns as primary filter, with JSON fallback for legacy data
  const intColumn = perspective === "fornitore" ? "cli_for_fatt" : "cli_for_dest";
  const jsonPaths = perspective === "fornitore"
    ? ["cliforfatt", "clienteFornitoreMG.cliFor", "clienteFornitoreMG.cli_for", "clienteFornitoreMG.id"]
    : ["cliForDest", "clifordest", "clienteFornitoreMG.cliFor", "clienteFornitoreMG.cli_for", "clienteFornitoreMG.id", "destinatari.cliFor", "destinatari.codice"];
  
  const jsonConditions = jsonPaths.map(path => 
    useIntFilter 
      ? `TRY_CONVERT(BIGINT, JSON_VALUE(raw_json, '$.${path}')) = @${paramName}`
      : `JSON_VALUE(raw_json, '$.${path}') = @${paramName}`
  ).join(" OR ");
  
  const clause = useIntFilter
    ? `((${intColumn} = @${paramName}) OR (${intColumn} IS NULL AND (${jsonConditions})))`
    : `((${intColumn} = @${paramName}) OR (${intColumn} IS NULL AND (${jsonConditions})))`;

  descriptors.push({ clause, paramName, value: normalizedCode });
};
```

---

## Comportamento Atteso

### Ricerca per numero documento
- Input: "123"
- Comportamento: Cerca documenti con `numdoc = 123`

### Ricerca per nome cliente/fornitore
- Input: "Mario Rossi" o "Studio 2000"
- Comportamento: Cerca documenti dove la ragione sociale contiene il testo
- Percorsi cercati: `clienteFornitoreMG.anagrafica.ragioneSociale`, `ragioneSociale`, ecc.

### Espansione documenti cliente
- Quando si espande un cliente (es. MARINCO, codice 6)
- Prima controlla la colonna `cli_for_dest = 6` (veloce, indicizzata)
- Se NULL, cerca nei percorsi JSON in `raw_json`
- Tutti i documenti trovati vengono filtrati lato client con `filterDocsByOwnerCode`

---

## Test Effettuati

✅ Clienti espansi mostrano solo i propri documenti
✅ Non vengono mostrati documenti di altri clienti
✅ Il filtraggio per nome cliente funziona nella ricerca
✅ Il frontend è in esecuzione su http://localhost:3000

---

## Nota Importante

Per beneficiare appieno delle correzioni nell'estrazione dei codici, è consigliabile:
1. Eseguire una nuova sincronizzazione completa
2. Questo popolerà correttamente le colonne `cli_for_fatt` e `cli_for_dest`
3. I dati legacy continueranno a funzionare grazie al fallback JSON

---

## File Modificati

1. `app/page.tsx` - Frontend filtraggio
2. `app/api/_syncStoreSqlServer.ts` - Backend filtraggio e sincronizzazione

---

## Come Riprendere

1. Avviare il server: `npm run dev`
2. Aprire http://localhost:3000
3. Testare il filtraggio su diversi clienti/fornitori
4. Se necessario, eseguire una nuova sincronizzazione per popolare i campi INT