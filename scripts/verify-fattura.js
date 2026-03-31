const mssql = require('mssql');

const config = {
  server: 'localhost',
  database: 'TSApiLocalCache',
  user: 'tsapi_app',
  password: 'TsApiLocal2026!',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function main() {
  try {
    const pool = await mssql.connect(config);
    
    // 1. Cerca cliente MARINCO
    const clientiResult = await pool.request().query(
      "SELECT cli_for, id_cli_for, ragione_sociale FROM dbo.cache_clienti WHERE ragione_sociale LIKE '%MARINCO%'"
    );
    console.log('=== CLIENTI MARINCO ===');
    console.log(JSON.stringify(clientiResult.recordset, null, 2));
    
    // 2. Cerca la fattura specifica con full JSON
    const fatturaResult = await pool.request().query(
      `SELECT 
        num_reg, 
        num_doc, 
        tipo_doc, 
        cli_for_fatt, 
        cli_for_dest,
        raw_json
       FROM dbo.cache_ordini 
       WHERE num_reg = 202000000031`
    );
    console.log('\n=== FATTURA 2/MA (RAW JSON) ===');
    if (fatturaResult.recordset.length > 0) {
      const row = fatturaResult.recordset[0];
      console.log('num_reg:', row.num_reg);
      console.log('num_doc:', row.num_doc);
      console.log('tipo_doc:', row.tipo_doc);
      console.log('cli_for_fatt:', row.cli_for_fatt);
      console.log('cli_for_dest:', row.cli_for_dest);
      try {
        const parsed = JSON.parse(row.raw_json);
        console.log('\n--- PARSED JSON ---');
        console.log('clienteFornitoreMG:', JSON.stringify(parsed.clienteFornitoreMG, null, 2));
        console.log('cliforfatt:', parsed.cliforfatt);
        console.log('cliForFatt:', parsed.cliForFatt);
        console.log('cliForDest:', parsed.cliForDest);
        console.log('clifordest:', parsed.clifordest);
        // Cerca qualsiasi campo che contiene "APO"
        const apoFields = Object.entries(parsed).filter(([k, v]) => 
          typeof v === 'string' && v.toUpperCase().includes('APO')
        );
        if (apoFields.length > 0) {
          console.log('\n--- CAMPI CON APO ---');
          apoFields.forEach(([k, v]) => console.log(`${k}: ${v}`));
        }
      } catch (e) {
        console.log('Error parsing JSON:', e.message);
      }
    }
    
    // 3. Cerca cliente con codice 6 in BOTH clienti and fornitori
    const code6Result = await pool.request().query(
      `SELECT 'clienti' as table_name, cli_for, ragione_sociale FROM dbo.cache_clienti WHERE cli_for = 6
       UNION ALL
       SELECT 'fornitori' as table_name, cli_for, ragione_sociale FROM dbo.cache_fornitori WHERE cli_for = 6`
    );
    console.log('\n=== PARTY CODE 6 (clienti + fornitori) ===');
    console.log(JSON.stringify(code6Result.recordset, null, 2));
    
    // 4. Cerca qualsiasi cliente/fornitore con APO nel nome
    const apoResult = await pool.request().query(
      `SELECT 'clienti' as table_name, cli_for, ragione_sociale FROM dbo.cache_clienti WHERE ragione_sociale LIKE '%APO%'
       UNION ALL
       SELECT 'fornitori' as table_name, cli_for, ragione_sociale FROM dbo.cache_fornitori WHERE ragione_sociale LIKE '%APO%'`
    );
    console.log('\n=== PARTY CON APO NEL NOME ===');
    console.log(JSON.stringify(apoResult.recordset, null, 2));
    
    await pool.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
