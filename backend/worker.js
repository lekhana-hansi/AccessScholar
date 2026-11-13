require('./database/pool');
const { pool, isConfigured, close } = require('./database/pool');
const { upsertScholarship } = require('./services/importService');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isAllowedEndpoint = (endpoint, source) => {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const sourceHost = new URL(source.official_website).hostname;
  const approvedHosts = [sourceHost, ...(source.approved_application_hosts || [])];
  return approvedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
};

const fetchJsonFeed = async (endpoint, source) => {
  if (!isAllowedEndpoint(endpoint, source)) {
    throw new Error('Configured feed must use HTTPS on the registered official source host.');
  }
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}.`);
      const declaredLength = Number(response.headers.get('content-length') || 0);
      if (declaredLength > 2 * 1024 * 1024) throw new Error('Feed exceeded the 2 MB response limit.');
      if (!response.body) throw new Error('Feed response did not contain a readable body.');
      const reader = response.body.getReader();
      const chunks = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > 2 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('Feed exceeded the 2 MB response limit.');
        }
        chunks.push(Buffer.from(value));
      }
      const text = Buffer.concat(chunks).toString('utf8');
      const body = JSON.parse(text);
      if (!body || !Array.isArray(body.scholarships)) {
        throw new Error('Feed JSON must contain a scholarships array.');
      }
      return body.scholarships;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(500 * (2 ** attempt));
    }
  }
  throw lastError;
};

const logResult = async (logId, sourceId, status, counts, errorMessage = null) => {
  await pool.query(
    `UPDATE ingestion_logs
     SET completed_at = now(), status = $2, records_discovered = $3,
         records_imported = $4, records_updated = $5, records_rejected = $6,
         duplicate_records = $7, error_message = $8
     WHERE id = $1`,
    [
      logId,
      status,
      counts.discovered,
      counts.imported,
      counts.updated,
      counts.rejected,
      counts.duplicates,
      errorMessage,
    ],
  );
  await pool.query(
    `UPDATE scholarship_sources
     SET last_attempted_at = now(), last_successful_sync = CASE WHEN $2 IN ('success', 'partial') THEN now() ELSE last_successful_sync END,
         last_sync_status = CASE WHEN $2 IN ('success', 'partial') THEN 'success' ELSE 'failed' END,
         last_error = $3, updated_at = now()
     WHERE source_id = $1`,
    [sourceId, status, errorMessage],
  );
};

const runSource = async (sourceId) => {
  if (!isConfigured) throw new Error('Set DATABASE_URL before running the ingestion worker.');
  const sourceResult = await pool.query('SELECT * FROM scholarship_sources WHERE source_id = $1', [sourceId]);
  const source = sourceResult.rows[0];
  if (!source) throw new Error(`Scholarship source not found: ${sourceId}`);
  if (!source.is_active) throw new Error(`Scholarship source is disabled: ${sourceId}`);

  const log = await pool.query(
    `INSERT INTO ingestion_logs (source_id, status)
     VALUES ($1, 'running') RETURNING id`,
    [sourceId],
  );
  const logId = log.rows[0].id;
  await pool.query(
    `UPDATE scholarship_sources SET last_attempted_at = now(), updated_at = now()
     WHERE source_id = $1`,
    [sourceId],
  );

  if (source.integration_method !== 'json_feed' || !source.api_endpoint) {
    const message = 'Manual verification/import required; no structured official feed is configured.';
    await pool.query(
      `UPDATE ingestion_logs SET completed_at = now(), status = 'skipped', error_message = $2 WHERE id = $1`,
      [logId, message],
    );
    await pool.query(
      `UPDATE scholarship_sources SET last_sync_status = 'skipped', last_error = $2, updated_at = now()
       WHERE source_id = $1`,
      [sourceId, message],
    );
    return { sourceId, status: 'skipped', message };
  }

  const counts = { discovered: 0, imported: 0, updated: 0, rejected: 0, duplicates: 0 };
  try {
    const records = await fetchJsonFeed(source.api_endpoint, source);
    counts.discovered = records.length;
    for (const [index, record] of records.entries()) {
      try {
        const result = await upsertScholarship({ ...record, source_id: sourceId }, { changedBy: 'ingestion_worker' });
        if (result.result === 'inserted') counts.imported += 1;
        if (result.result === 'updated') counts.updated += 1;
        if (result.result === 'duplicate') counts.duplicates += 1;
      } catch (error) {
        counts.rejected += 1;
        console.error(`Rejected feed record ${index + 1} for source ${sourceId}:`, error.message);
      }
    }
    const status = counts.rejected ? (counts.imported + counts.updated ? 'partial' : 'failed') : 'success';
    await logResult(logId, sourceId, status, counts, counts.rejected ? `${counts.rejected} feed records were rejected. Review worker output for row-level reasons.` : null);
    return { sourceId, status, ...counts };
  } catch (error) {
    await logResult(logId, sourceId, 'failed', counts, error.message);
    console.error(`Source refresh failed for ${sourceId}; existing cached records were retained.`, error);
    return { sourceId, status: 'failed', ...counts, error: error.message };
  }
};

const runDueSources = async () => {
  if (!isConfigured) throw new Error('Set DATABASE_URL before running the ingestion worker.');
  const result = await pool.query(
    `SELECT source_id
     FROM scholarship_sources
     WHERE is_active = true
       AND integration_method = 'json_feed'
       AND api_endpoint IS NOT NULL
       AND (
         last_successful_sync IS NULL
         OR last_successful_sync < now() - make_interval(hours => coalesce(refresh_interval_hours, 24))
         OR (last_sync_status = 'failed' AND last_attempted_at < now() - interval '15 minutes')
       )
     ORDER BY last_successful_sync NULLS FIRST`,
  );
  const outcomes = [];
  for (const row of result.rows) outcomes.push(await runSource(row.source_id));
  return outcomes;
};

const startScheduler = async () => {
  if (!isConfigured) throw new Error('Set DATABASE_URL before starting the ingestion worker.');
  console.log('Scholarship ingestion worker started; scheduled feeds refresh according to their configured intervals.');
  const run = async () => {
    try {
      const outcomes = await runDueSources();
      if (outcomes.length) console.log('Scheduled source refresh finished:', outcomes);
    } catch (error) {
      console.error('Scheduled source refresh could not start.', error);
    }
  };
  await run();
  return setInterval(run, 5 * 60 * 1000);
};

if (require.main === module) {
  if (process.argv.includes('--once')) {
    runDueSources()
      .then((outcomes) => {
        console.log('Due source refresh results:', outcomes);
        if (outcomes.some((outcome) => outcome.status === 'failed')) process.exitCode = 1;
      })
      .catch((error) => {
        console.error('Unable to run scheduled source refresh.', error);
        process.exitCode = 1;
      })
      .finally(close);
  } else {
    startScheduler()
      .then((timer) => {
        const shutdown = async () => {
          clearInterval(timer);
          await close();
          process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      })
      .catch(async (error) => {
        console.error(error.message);
        await close();
        process.exitCode = 1;
      });
  }
}

module.exports = { fetchJsonFeed, isAllowedEndpoint, runDueSources, runSource, startScheduler };
