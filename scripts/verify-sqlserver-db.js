const mssql = require('mssql');

// Connection string from .env.local
const connectionString = 'Server=localhost;Database=TSApiLocalCache;User Id=tsapi_app;Password=TsApiLocal2026!;TrustServerCertificate=True;Encrypt=False;';

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

async function verifyDatabase() {
  let pool;
  try {
    console.log('🔌 Connecting to SQL Server...');
    pool = await mssql.connect(config);
    console.log('✅ Connected successfully!\n');

    // Check if tables exist
    const tablesQuery = `
      SELECT 
        TABLE_NAME,
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = t.TABLE_NAME) as column_count
      FROM INFORMATION_SCHEMA.TABLES t
      WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME LIKE 'cache_%'
      ORDER BY TABLE_NAME
    `;
    const tablesResult = await pool.request().query(tablesQuery);
    
    console.log('📊 Tables Found:');
    console.log('─'.repeat(60));
    if (tablesResult.recordset.length === 0) {
      console.log('❌ No cache tables found! Database needs to be synced.');
    } else {
      for (const row of tablesResult.recordset) {
        console.log(`✓ ${row.TABLE_NAME} (${row.column_count} columns)`);
      }
    }
    console.log('');

    // Check row counts
    const countQuery = `
      SELECT 
        'cache_clienti' as table_name, COUNT(*) as row_count FROM cache_clienti
      UNION ALL
      SELECT 
        'cache_fornitori' as table_name, COUNT(*) as row_count FROM cache_fornitori
      UNION ALL
      SELECT 
        'cache_articoli' as table_name, COUNT(*) as row_count FROM cache_articoli
      UNION ALL
      SELECT 
        'cache_ordini' as table_name, COUNT(*) as row_count FROM cache_ordini
      UNION ALL
      SELECT 
        'cache_righe_ordine' as table_name, COUNT(*) as row_count FROM cache_righe_ordine
    `;
    const countResult = await pool.request().query(countQuery);
    
    console.log('📈 Row Counts:');
    console.log('─'.repeat(60));
    for (const row of countResult.recordset) {
      const count = row.row_count;
      const icon = count === 0 ? '⚠️' : '✓';
      console.log(`${icon} ${row.table_name}: ${count.toLocaleString()} rows`);
    }
    console.log('');

    // Check indexes
    const indexQuery = `
      SELECT 
        t.name as table_name,
        i.name as index_name,
        i.type_desc as index_type,
        i.is_unique,
        i.is_primary_key,
        STUFF((
          SELECT ', ' + c.name
          FROM sys.index_columns ic
          JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
          WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
          ORDER BY ic.key_ordinal
          FOR XML PATH('')
        ), 1, 2, '') as columns
      FROM sys.indexes i
      JOIN sys.tables t ON i.object_id = t.object_id
      WHERE t.name LIKE 'cache_%'
      AND i.name IS NOT NULL
      ORDER BY t.name, i.name
    `;
    const indexResult = await pool.request().query(indexQuery);
    
    console.log('🔍 Indexes:');
    console.log('─'.repeat(80));
    for (const row of indexResult.recordset) {
      const type = row.index_type === 'CLUSTERED' ? '🔷' : '⚡';
      const unique = row.is_unique ? ' (UNIQUE)' : '';
      const pk = row.is_primary_key ? ' [PK]' : '';
      console.log(`${type} ${row.table_name}.${row.index_name}${unique}${pk}`);
      console.log(`   Columns: ${row.columns}`);
    }
    console.log('');

    // Check sync meta
    const metaQuery = `
      SELECT TOP (1) 
        last_sync_at,
        last_success_at,
        last_job_id,
        last_status,
        message
      FROM dbo.sync_meta
      WHERE id = 1
    `;
    const metaResult = await pool.request().query(metaQuery);
    
    console.log('📅 Sync Status:');
    console.log('─'.repeat(60));
    if (metaResult.recordset.length > 0) {
      const row = metaResult.recordset[0];
      console.log(`Last Sync: ${row.last_sync_at || 'Never'}`);
      console.log(`Last Success: ${row.last_success_at || 'Never'}`);
      console.log(`Last Job ID: ${row.last_job_id || 'None'}`);
      console.log(`Last Status: ${row.last_status || 'Unknown'}`);
      console.log(`Message: ${row.message || 'None'}`);
    } else {
      console.log('❌ No sync metadata found!');
    }
    console.log('');

    // Test query performance for ordini with clifordest filter
    console.log('⚡ Performance Test (ordini filtered by cli_for_dest = 6):');
    console.log('─'.repeat(60));
    
    const testQueries = [
      'SELECT COUNT(*) as count FROM cache_ordini WHERE cli_for_dest = 6',
      'SELECT TOP 10 * FROM cache_ordini WHERE cli_for_dest = 6'
    ];

    for (const query of testQueries) {
      const start = Date.now();
      const result = await pool.request().query(query);
      const duration = Date.now() - start;
      const count = query.startsWith('SELECT COUNT') ? result.recordset[0].count : result.recordset.length;
      console.log(`✓ Query: ${query.substring(0, 50)}...`);
      console.log(`  Result: ${count} rows`);
      console.log(`  Duration: ${duration}ms`);
      console.log('');
    }

    // Check for NULL values in indexed columns
    const nullCheckQuery = `
      SELECT 
        'cli_for_fatt' as column_name,
        COUNT(*) as total_rows,
        COUNT(cli_for_fatt) as non_null_rows,
        COUNT(*) - COUNT(cli_for_fatt) as null_rows
      FROM cache_ordini
      UNION ALL
      SELECT 
        'cli_for_dest' as column_name,
        COUNT(*) as total_rows,
        COUNT(cli_for_dest) as non_null_rows,
        COUNT(*) - COUNT(cli_for_dest) as null_rows
      FROM cache_ordini
    `;
    const nullCheckResult = await pool.request().query(nullCheckQuery);
    
    console.log('🔎 Column Data Quality (cli_for_fatt/cli_for_dest):');
    console.log('─'.repeat(60));
    for (const row of nullCheckResult.recordset) {
      const nullPct = ((row.null_rows / row.total_rows) * 100).toFixed(1);
      console.log(`${row.column_name}:`);
      console.log(`  Total: ${row.total_rows.toLocaleString()}`);
      console.log(`  Non-NULL: ${row.non_null_rows.toLocaleString()} (${(100 - nullPct).toFixed(1)}%)`);
      console.log(`  NULL: ${row.null_rows.toLocaleString()} (${nullPct}%)`);
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ESOCKET') {
      console.error('\n💡 Possible issues:');
      console.error('  - SQL Server service not running');
      console.error('  - Wrong server name or port');
      console.error('  - Firewall blocking connection');
    }
  } finally {
    if (pool) {
      await pool.close();
      console.log('\n🔌 Connection closed.');
    }
  }
}

verifyDatabase();