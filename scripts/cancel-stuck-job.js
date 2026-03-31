const mssql = require('mssql');
const fs = require('fs');

async function cancelStuckJob() {
  // Read .env file to get connection string
  let connString;
  
  // Try .env.local first, then .env, then environment variables
  const envFiles = ['.env.local', '.env'];
  for (const envFile of envFiles) {
    try {
      const envContent = fs.readFileSync(envFile, 'utf8');
      const match = envContent.match(/SQLSERVER_CONNECTION_STRING=(.+)/);
      if (match) {
        connString = match[1].trim();
        console.log(`Lettura connection string da ${envFile}`);
        break;
      }
    } catch (err) {
      // File doesn't exist, try next
      continue;
    }
  }

  if (!connString) {
    connString = process.env.SQLSERVER_CONNECTION_STRING;
  }

  if (!connString) {
    console.error('SQLSERVER_CONNECTION_STRING non trovata');
    process.exit(1);
  }

  const schema = process.env.SQLSERVER_SCHEMA || 'dbo';
  const jobId = 'sync_1774886027587';

  try {
    const pool = await mssql.connect(connString);
    console.log('Connesso al database');

    // Check current job status
    const statusResult = await pool.request()
      .input('jobId', mssql.NVarChar(80), jobId)
      .query(`SELECT status, phase, progress_pct, started_at, message 
              FROM [${schema}].[sync_jobs] 
              WHERE id = @jobId`);

    if (statusResult.recordset.length === 0) {
      console.log(`Job ${jobId} non trovato nel database`);
      await pool.close();
      return;
    }

    const currentJob = statusResult.recordset[0];
    console.log('Job attuale:', {
      status: currentJob.status,
      phase: currentJob.phase,
      progress_pct: currentJob.progress_pct,
      started_at: currentJob.started_at,
      message: currentJob.message
    });

    // Cancel the job
    await pool.request()
      .input('jobId', mssql.NVarChar(80), jobId)
      .input('endedAt', mssql.DateTime2, new Date())
      .query(`UPDATE [${schema}].[sync_jobs] 
              SET status = 'cancelled', 
                  phase = 'idle', 
                  progress_pct = 100, 
                  ended_at = @endedAt,
                  message = 'Sincronizzazione annullata per riavvio'
              WHERE id = @jobId`);

    console.log('✅ Job cancellato con successo nel database');
    
    // Verify cancellation
    const verifyResult = await pool.request()
      .input('jobId', mssql.NVarChar(80), jobId)
      .query(`SELECT status, phase, ended_at 
              FROM [${schema}].[sync_jobs] 
              WHERE id = @jobId`);

    if (verifyResult.recordset.length > 0) {
      const verified = verifyResult.recordset[0];
      console.log('Verifica:', {
        status: verified.status,
        phase: verified.phase,
        ended_at: verified.ended_at
      });
    }

    await pool.close();
    console.log('Connessione chiusa');
  } catch (err) {
    console.error('❌ Errore:', err.message);
    process.exit(1);
  }
}

cancelStuckJob();