const express = require('express');
const { timingSafeEqual } = require('crypto');
const database = require('../database/pool');
const repository = require('../services/scholarshipRepository');
const jsonCatalog = require('../services/jsonCatalogRepository');
const { importCsv, upsertScholarship } = require('../services/importService');

const router = express.Router();
const attempts = new Map();
const allowedSourceTypes = new Set([
  'government_portal',
  'government_information',
  'government_program',
  'university',
  'foundation',
]);

const rateLimit = (req, res, next) => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const current = attempts.get(req.ip);
  if (!current || now - current.startedAt >= windowMs) {
    attempts.set(req.ip, { startedAt: now, count: 1 });
    return next();
  }
  if (current.count >= 40) {
    res.set('Retry-After', String(Math.ceil((windowMs - (now - current.startedAt)) / 1000)));
    return res.status(429).json({ error: 'Too many admin requests. Please try again later.' });
  }
  current.count += 1;
  return next();
};

const authorize = (req, res, next) => {
  const expectedValue = process.env.ADMIN_API_TOKEN;
  if (!expectedValue) return res.status(503).json({ error: 'Admin access is not configured.' });
  const header = req.get('authorization') || '';
  const supplied = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(expectedValue);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: 'Admin authorization is required.' });
  }
  return next();
};

const unavailable = (res, error, action) => {
  console.error(`Admin ${action} failed.`, error);
  res.status(503).json({ error: `Unable to ${action} right now.` });
};

router.use(rateLimit, authorize);

router.get('/admin/dashboard', async (req, res) => {
  try {
    const summary = database.isConfigured
      ? await repository.getAdminSummary()
      : jsonCatalog.getDashboard();
    res.set('Cache-Control', 'no-store');
    res.json({ summary, storage: database.isConfigured ? 'postgresql' : 'json_development_fallback' });
  } catch (error) {
    unavailable(res, error, 'load the database dashboard');
  }
});

router.get('/admin/ingestion-logs', async (req, res) => {
  const limit = Number(req.query.limit || 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'limit must be an integer between 1 and 100.' });
  }
  try {
    res.set('Cache-Control', 'no-store');
    res.json({
      logs: database.isConfigured
        ? await repository.getIngestionLogs(limit)
        : jsonCatalog.getIngestionLogs(limit),
    });
  } catch (error) {
    unavailable(res, error, 'load ingestion logs');
  }
});

router.get('/admin/sources', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({
      sources: database.isConfigured
        ? await repository.getSourcesStatus()
        : jsonCatalog.getSources(),
    });
  } catch (error) {
    unavailable(res, error, 'load data sources');
  }
});

router.get('/admin/scholarships', async (req, res) => {
  const verificationStatus = req.query.verificationStatus || 'awaiting_verification';
  if (!['verified', 'awaiting_verification', 'rejected'].includes(verificationStatus)) {
    return res.status(400).json({ error: 'verificationStatus is not supported.' });
  }
  try {
    res.set('Cache-Control', 'no-store');
    res.json({
      scholarships: database.isConfigured
        ? await repository.getAdminScholarships(verificationStatus)
        : jsonCatalog.getScholarships(verificationStatus),
    });
  } catch (error) {
    unavailable(res, error, 'load scholarship review queue');
  }
});

router.get('/admin/export-csv', async (req, res) => {
  try {
    const records = database.isConfigured
      ? (await database.query('SELECT * FROM scholarships ORDER BY id ASC')).rows
      : jsonCatalog.getScholarships('all');

    const headers = [
      'source_record_id', 'title', 'slug', 'provider_name', 'provider_logo_url', 'description',
      'eligibility_description', 'category', 'scholarship_type', 'funding_type', 'award_amount',
      'currency', 'study_levels', 'eligible_subjects', 'applicant_nationalities',
      'eligible_residence_countries', 'destination_countries', 'disability_eligibility',
      'disability_categories', 'academic_requirements', 'income_requirements', 'age_requirements',
      'gender_requirements', 'application_open_date', 'application_deadline', 'deadline_timezone',
      'official_source_url', 'official_application_url', 'source_id', 'verification_status',
      'application_status', 'last_verified_at', 'last_source_checked_at', 'is_active', 'is_featured',
      'financial_need_required', 'minimum_gpa', 'minimum_age', 'maximum_age', 'maximum_income',
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      if (Array.isArray(val)) return `"${val.join('|').replace(/"/g, '""')}"`;
      if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      return `"${String(val).replace(/"/g, '""')}"`;
    };

    const lines = [headers.join(',')];
    for (const r of records) {
      const obj = {
        source_record_id: r.source_record_id || r.sourceRecordId || '',
        title: r.title || r.scholarshipName || '',
        slug: r.slug || r.scholarshipId || '',
        provider_name: r.provider_name || r.providerName || '',
        provider_logo_url: r.provider_logo_url || r.providerLogoUrl || '',
        description: r.description || '',
        eligibility_description: r.eligibility_description || r.eligibilityDetails || '',
        category: r.category || r.scholarshipCategory || '',
        scholarship_type: r.scholarship_type || r.scholarshipType || '',
        funding_type: r.funding_type || r.fundingType || '',
        award_amount: r.award_amount ?? r.awardAmount ?? '',
        currency: r.currency || '',
        study_levels: r.study_levels || r.studyLevels || [],
        eligible_subjects: r.eligible_subjects || r.eligibleSubjects || [],
        applicant_nationalities: r.applicant_nationalities || r.applicantNationalities || [],
        eligible_residence_countries: r.eligible_residence_countries || r.eligibleResidenceCountries || [],
        destination_countries: r.destination_countries || r.studyDestinationCountries || [],
        disability_eligibility: r.disability_eligibility || r.disabilityEligibility || 'unknown',
        disability_categories: r.disability_categories || r.disabilityCategories || [],
        academic_requirements: r.academic_requirements || r.academicRequirements || {},
        income_requirements: r.income_requirements || r.incomeRequirements || {},
        age_requirements: r.age_requirements || r.ageRequirements || {},
        gender_requirements: r.gender_requirements || r.genderEligibility || '',
        application_open_date: r.application_open_date || r.applicationOpenDate || '',
        application_deadline: r.application_deadline || r.applicationDeadline || '',
        deadline_timezone: r.deadline_timezone || r.deadlineTimezone || 'UTC',
        official_source_url: r.official_source_url || r.officialSourceUrl || '',
        official_application_url: r.official_application_url || r.officialApplicationUrl || '',
        source_id: r.source_id || r.sourceId || '',
        verification_status: r.verification_status || r.verificationStatus || '',
        application_status: r.application_status || r.applicationStatus || '',
        last_verified_at: r.last_verified_at || r.lastVerifiedAt || '',
        last_source_checked_at: r.last_source_checked_at || r.sourceCheckedAt || '',
        is_active: r.is_active ?? r.isActive ?? true,
        is_featured: r.is_featured ?? r.featured ?? false,
        financial_need_required: r.financial_need_required ?? r.financialNeedRequired ?? '',
        minimum_gpa: r.minimum_gpa ?? r.minimumGpa ?? '',
        minimum_age: r.minimum_age ?? r.minimumAge ?? '',
        maximum_age: r.maximum_age ?? r.maximumAge ?? '',
        maximum_income: r.maximum_income ?? r.maximumIncome ?? '',
      };
      lines.push(headers.map((h) => escapeCsv(obj[h])).join(','));
    }

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="scholarships-export.csv"',
      'Cache-Control': 'no-store',
    });
    res.send(lines.join('\r\n'));
  } catch (error) {
    unavailable(res, error, 'export scholarship CSV');
  }
});

router.post('/admin/refresh', async (req, res) => {
  const sourceId = req.body && req.body.sourceId;
  if (sourceId !== undefined && (typeof sourceId !== 'string' || sourceId.length > 120)) {
    return res.status(400).json({ error: 'sourceId must be a text identifier.' });
  }
  if (!database.isConfigured) {
    return res.status(503).json({ error: 'Automatic feed refresh requires PostgreSQL. No official JSON feeds are currently configured; use verified CSV import instead.' });
  }
  try {
    const worker = require('../worker');
    const results = sourceId
      ? [await worker.runSource(sourceId)]
      : await worker.runDueSources();
    res.json({ results });
  } catch (error) {
    unavailable(res, error, 'run source refresh');
  }
});

router.post('/admin/import-csv', async (req, res) => {
  if (!req.body || typeof req.body.csv !== 'string') {
    return res.status(400).json({ error: 'Provide CSV content in the csv field.' });
  }
  let logId;
  const startedAt = new Date().toISOString();
  try {
    if (!database.isConfigured) {
      const result = await jsonCatalog.importCsv(req.body.csv);
      await jsonCatalog.addIngestionLog({ ...result, startedAt });
      return res.status(result.rejected.length ? 207 : 201).json({
        ...result,
        storage: 'json_development_fallback',
      });
    }
    const started = await database.query(
      `INSERT INTO ingestion_logs (status) VALUES ('running') RETURNING id`,
    );
    logId = started.rows[0].id;
    const result = await importCsv(req.body.csv);
    const hasErrors = result.rejected.length > 0;
    await database.query(
      `UPDATE ingestion_logs
       SET completed_at = now(), status = $2, records_discovered = $3,
           records_imported = $4, records_updated = $5, records_rejected = $6,
           duplicate_records = $7,
           error_message = $8
       WHERE id = $1`,
      [
        logId,
        hasErrors ? (result.imported + result.updated ? 'partial' : 'failed') : 'manual_import',
        result.discovered,
        result.imported,
        result.updated,
        result.rejected.length,
        result.duplicates,
        result.rejected.length ? `${result.rejected.length} row(s) were rejected. See response details.` : null,
      ],
    );
    res.status(hasErrors ? 207 : 201).json(result);
  } catch (error) {
    if (logId) {
      await database.query(
        `UPDATE ingestion_logs SET completed_at = now(), status = 'failed', error_message = $2 WHERE id = $1`,
        [logId, error.message],
      );
    }
    if (error instanceof TypeError) return res.status(400).json({ error: error.message });
    unavailable(res, error, 'import scholarship records');
  }
});

router.post('/admin/scholarships', async (req, res) => {
  try {
    if (!database.isConfigured) {
      const result = await jsonCatalog.upsertScholarship(req.body || {});
      return res.status(result.result === 'duplicate' ? 409 : 201).json(result);
    }
    const result = await upsertScholarship(req.body || {});
    res.status(result.result === 'duplicate' ? 409 : 201).json(result);
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ error: error.message });
    unavailable(res, error, 'save scholarship');
  }
});

router.patch('/admin/scholarships/:slug', async (req, res) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(req.params.slug)) {
    return res.status(400).json({ error: 'Invalid scholarship slug.' });
  }
  const allowedFields = new Set([
    'verification_status', 'application_status', 'last_verified_at', 'application_deadline',
    'application_open_date', 'official_source_url', 'official_application_url', 'last_source_checked_at',
    'eligibility_description', 'is_active', 'is_featured',
  ]);
  if (!req.body || !Object.keys(req.body).length || Object.keys(req.body).some((key) => !allowedFields.has(key))) {
    return res.status(400).json({ error: 'Provide only supported scholarship review fields.' });
  }
  try {
    if (!database.isConfigured) {
      const result = await jsonCatalog.reviewScholarship(req.params.slug, req.body);
      if (result.result === 'not_found') return res.status(404).json({ error: 'Scholarship not found.' });
      return res.json(result);
    }
    const current = await database.query('SELECT * FROM scholarships WHERE slug = $1', [req.params.slug]);
    if (!current.rowCount) return res.status(404).json({ error: 'Scholarship not found.' });
    const record = { ...current.rows[0], ...req.body };
    const result = await upsertScholarship(record, { changedBy: 'admin_review' });
    res.json(result);
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ error: error.message });
    unavailable(res, error, 'update scholarship review');
  }
});

router.post('/admin/sources', async (req, res) => {
  if (!database.isConfigured) {
    return res.status(503).json({ error: 'Adding sources requires PostgreSQL. Local JSON mode supports imports from registered official sources.' });
  }
  const body = req.body || {};
  const sourceId = typeof body.sourceId === 'string' ? body.sourceId.trim() : '';
  const sourceName = typeof body.sourceName === 'string' ? body.sourceName.trim() : '';
  const country = typeof body.country === 'string' ? body.country.trim() : '';
  const website = typeof body.officialWebsite === 'string' ? body.officialWebsite : '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceId) || !sourceName || sourceName.length > 160 || !country || country.length > 100) {
    return res.status(400).json({ error: 'Provide a valid sourceId, sourceName, and country.' });
  }
  if (!allowedSourceTypes.has(body.sourceType)) return res.status(400).json({ error: 'sourceType is not supported.' });
  let parsedWebsite;
  try {
    parsedWebsite = new URL(website);
  } catch {
    return res.status(400).json({ error: 'officialWebsite must be a valid HTTPS URL.' });
  }
  if (parsedWebsite.protocol !== 'https:' || parsedWebsite.username || parsedWebsite.password) {
    return res.status(400).json({ error: 'officialWebsite must be a valid HTTPS URL without embedded credentials.' });
  }
  const integrationMethod = body.integrationMethod || 'manual_verification';
  if (!['manual_verification', 'json_feed'].includes(integrationMethod)) {
    return res.status(400).json({ error: 'integrationMethod must be manual_verification or json_feed.' });
  }
  let endpoint = null;
  if (integrationMethod === 'json_feed') {
    try {
      endpoint = new URL(body.apiEndpoint);
    } catch {
      return res.status(400).json({ error: 'A valid HTTPS apiEndpoint is required for a JSON feed.' });
    }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password
      || (endpoint.hostname !== parsedWebsite.hostname
      && !endpoint.hostname.endsWith(`.${parsedWebsite.hostname}`))) {
      return res.status(400).json({ error: 'apiEndpoint must use HTTPS on the official source website host and contain no embedded credentials.' });
    }
  }
  const refreshInterval = body.refreshIntervalHours === undefined ? 24 : Number(body.refreshIntervalHours);
  if (!Number.isInteger(refreshInterval) || refreshInterval < 1 || refreshInterval > 720) {
    return res.status(400).json({ error: 'refreshIntervalHours must be an integer between 1 and 720.' });
  }
  try {
    const result = await database.query(
      `INSERT INTO scholarship_sources
       (source_id, source_name, country, official_website, source_type, integration_method,
        api_endpoint, approved_application_hosts, refresh_interval_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ARRAY[$8]::text[], $9)
       RETURNING source_id AS id, source_name AS name, country, official_website AS url, integration_method AS "integrationMethod"`,
      [
        sourceId, sourceName, country, parsedWebsite.href, body.sourceType, integrationMethod,
        endpoint ? endpoint.href : null,
        parsedWebsite.hostname,
        integrationMethod === 'json_feed' ? refreshInterval : null,
      ],
    );
    res.status(201).json({ source: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'A source with that identifier already exists.' });
    unavailable(res, error, 'add scholarship source');
  }
});

router.patch('/admin/sources/:id', async (req, res) => {
  if (!database.isConfigured) {
    return res.status(503).json({ error: 'Updating source settings requires PostgreSQL.' });
  }
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean.' });
  try {
    const result = await database.query(
      `UPDATE scholarship_sources SET is_active = $2, updated_at = now()
       WHERE source_id = $1 RETURNING source_id AS id, is_active AS enabled`,
      [req.params.id, enabled],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Source not found.' });
    res.json({ source: result.rows[0] });
  } catch (error) {
    unavailable(res, error, 'update source');
  }
});

module.exports = router;
