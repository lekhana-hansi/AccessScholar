const { pool } = require('../database/pool');

const arrayFields = new Set([
  'study_levels',
  'eligible_subjects',
  'applicant_nationalities',
  'eligible_residence_countries',
  'destination_countries',
  'disability_categories',
]);
const jsonFields = new Set([
  'academic_requirements',
  'income_requirements',
  'age_requirements',
]);
const allowedStatuses = new Set(['open', 'opening_soon', 'closed', 'expired', 'unknown']);
const allowedVerification = new Set(['verified', 'awaiting_verification', 'rejected']);
const allowedDisability = new Set([
  'disability_specific',
  'open_to_disability',
  'accommodations',
  'no_published_restriction',
  'unknown',
]);

const parseCsv = (text) => {
  if (typeof text !== 'string' || text.length > 1024 * 1024) {
    throw new TypeError('CSV content must be a string no larger than 1 MB.');
  }
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new TypeError('CSV contains an unclosed quoted field.');
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  if (rows.length < 2) throw new TypeError('CSV must include a header row and at least one record.');
  const headers = rows.shift().map((header) => header.trim().toLowerCase());
  if (new Set(headers).size !== headers.length || headers.some((header) => !header)) {
    throw new TypeError('CSV header names must be non-empty and unique.');
  }
  const allowedFields = new Set([
    'source_record_id', 'title', 'slug', 'provider_name', 'provider_logo_url', 'description',
    'eligibility_description', 'category', 'scholarship_type', 'funding_type', 'award_amount',
    'currency', ...arrayFields, 'disability_eligibility', ...jsonFields, 'gender_requirements',
    'application_open_date', 'application_deadline', 'deadline_timezone', 'official_source_url',
    'official_application_url', 'source_id', 'verification_status', 'application_status',
    'last_verified_at', 'last_source_checked_at', 'is_active', 'is_featured', 'financial_need_required',
    'minimum_gpa', 'minimum_age', 'maximum_age', 'maximum_income',
  ]);
  const unsupported = headers.find((header) => !allowedFields.has(header));
  if (unsupported) throw new TypeError(`Unsupported CSV field: ${unsupported}`);
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new TypeError(`CSV row ${index + 2} has an unexpected number of columns.`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column].trim()]));
  });
};

const parseField = (record, field) => {
  const value = record[field];
  if (value === undefined || value === null || value === '') return null;
  if (arrayFields.has(field)) {
    return Array.isArray(value) ? value : String(value).split('|').map((item) => item.trim()).filter(Boolean);
  }
  if (jsonFields.has(field)) {
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    try {
      return JSON.parse(value);
    } catch {
      throw new TypeError(`${field} must be valid JSON.`);
    }
  }
  return value;
};

const safeUrl = (value, label) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${label} must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new TypeError(`${label} must be a valid HTTPS URL without embedded credentials.`);
  }
  return parsed;
};

const hostIsAllowed = (host, allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`);

const normalizeRecord = async (input, { lookupSource } = {}) => {
  const record = Object.fromEntries([
    'source_record_id', 'title', 'slug', 'provider_name', 'provider_logo_url', 'description',
    'eligibility_description', 'category', 'scholarship_type', 'funding_type', 'award_amount',
    'currency', ...arrayFields, 'disability_eligibility', ...jsonFields, 'gender_requirements',
    'application_open_date', 'application_deadline', 'official_source_url',
    'deadline_timezone',
    'official_application_url', 'source_id', 'verification_status', 'application_status',
    'last_verified_at', 'last_source_checked_at', 'is_active', 'is_featured', 'financial_need_required',
    'minimum_gpa', 'minimum_age', 'maximum_age', 'maximum_income',
  ].map((field) => [field, parseField(input, field)]));

  for (const [field, label] of [
    ['source_id', 'source_id'],
    ['source_record_id', 'source_record_id'],
    ['title', 'title'],
    ['provider_name', 'provider_name'],
  ]) {
    if (typeof record[field] !== 'string' || !record[field].trim()) {
      throw new TypeError(`${label} is required.`);
    }
    if (record[field].length > (field === 'title' ? 300 : 180)) throw new TypeError(`${label} is too long.`);
    record[field] = record[field].trim();
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug || '')) {
    throw new TypeError('slug is required and must contain lowercase letters, numbers, and hyphens.');
  }
  if (!allowedStatuses.has(record.application_status || 'unknown')) {
    throw new TypeError('application_status is not supported.');
  }
  record.application_status ||= 'unknown';
  if (!allowedVerification.has(record.verification_status || 'awaiting_verification')) {
    throw new TypeError('verification_status is not supported.');
  }
  record.verification_status ||= 'awaiting_verification';
  if (!allowedDisability.has(record.disability_eligibility || 'unknown')) {
    throw new TypeError('disability_eligibility is not supported.');
  }
  record.disability_eligibility ||= 'unknown';
  if (record.verification_status === 'verified' && !record.last_verified_at) {
    throw new TypeError('last_verified_at is required for a verified record.');
  }
  if (record.last_verified_at && Number.isNaN(Date.parse(record.last_verified_at))) {
    throw new TypeError('last_verified_at must be a valid date or timestamp.');
  }
  if (record.application_status === 'open' && !record.last_source_checked_at) {
    throw new TypeError('An open status requires a recorded date when the official application source was checked.');
  }
  if (record.last_source_checked_at && Number.isNaN(Date.parse(record.last_source_checked_at))) {
    throw new TypeError('last_source_checked_at must be a valid date or timestamp.');
  }
  for (const field of ['application_open_date', 'application_deadline']) {
    if (record[field] !== null && !/^\d{4}-\d{2}-\d{2}$/.test(record[field])) {
      throw new TypeError(`${field} must use YYYY-MM-DD format.`);
    }
    if (record[field] !== null && Number.isNaN(Date.parse(`${record[field]}T00:00:00Z`))) {
      throw new TypeError(`${field} must be a valid calendar date.`);
    }
  }
  for (const field of ['minimum_gpa', 'minimum_age', 'maximum_age', 'maximum_income']) {
    if (record[field] !== null && !Number.isFinite(Number(record[field]))) {
      throw new TypeError(`${field} must be a valid number.`);
    }
  }
  for (const field of ['minimum_age', 'maximum_age']) {
    if (record[field] !== null && !Number.isInteger(Number(record[field]))) {
      throw new TypeError(`${field} must be a whole number.`);
    }
  }
  if (record.minimum_age !== null && record.maximum_age !== null
    && Number(record.minimum_age) > Number(record.maximum_age)) {
    throw new TypeError('minimum_age cannot exceed maximum_age.');
  }
  if (!Array.isArray(record.destination_countries) || record.destination_countries.length === 0) {
    throw new TypeError('destination_countries must contain at least one country or "all".');
  }

  const source = lookupSource
    ? await lookupSource(record.source_id)
    : (await pool.query(
      `SELECT source_id, official_website, approved_application_hosts, is_active
       FROM scholarship_sources WHERE source_id = $1`,
      [record.source_id],
    )).rows[0];
  if (!source || !source.is_active) throw new TypeError('source_id must refer to an active registered source.');
  const sourceUrl = safeUrl(record.official_source_url, 'official_source_url');
  const applicationUrl = safeUrl(record.official_application_url, 'official_application_url');
  const sourceHost = new URL(source.official_website).hostname;
  const applicationHosts = [sourceHost, ...(source.approved_application_hosts || [])];
  if (!hostIsAllowed(sourceUrl.hostname, sourceHost)) {
    throw new TypeError('official_source_url must use the registered source host.');
  }
  if (!applicationHosts.some((host) => hostIsAllowed(applicationUrl.hostname, host))) {
    throw new TypeError('official_application_url must use an approved source or application host.');
  }
  if (record.provider_logo_url) safeUrl(record.provider_logo_url, 'provider_logo_url');

  for (const field of arrayFields) {
    if (!Array.isArray(record[field])) record[field] = [];
    if (record[field].some((value) => typeof value !== 'string' || value.length > 100)) {
      throw new TypeError(`${field} must contain text values of 100 characters or fewer.`);
    }
  }
  for (const field of jsonFields) {
    if (!record[field] || typeof record[field] !== 'object' || Array.isArray(record[field])) record[field] = {};
  }
  if (record.currency && !/^[A-Z]{3}$/.test(record.currency)) throw new TypeError('currency must be a 3-letter uppercase code.');
  record.deadline_timezone ||= 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: record.deadline_timezone });
  } catch {
    throw new TypeError('deadline_timezone must be a valid IANA timezone.');
  }
  if (record.award_amount !== null && (!Number.isFinite(Number(record.award_amount)) || Number(record.award_amount) < 0)) {
    throw new TypeError('award_amount must be a non-negative number.');
  }
  if (record.is_active === null) record.is_active = true;
  else record.is_active = record.is_active === true || record.is_active === 'true';
  if (record.is_featured === null) record.is_featured = false;
  else record.is_featured = record.is_featured === true || record.is_featured === 'true';
  if (record.financial_need_required !== null) {
    if (![true, false, 'true', 'false'].includes(record.financial_need_required)) {
      throw new TypeError('financial_need_required must be true or false.');
    }
    record.financial_need_required = record.financial_need_required === true || record.financial_need_required === 'true';
  }
  return record;
};

const changedFields = (before, after) => {
  const tracked = [
    'title', 'provider_name', 'provider_logo_url', 'description', 'eligibility_description',
    'category', 'scholarship_type', 'funding_type', 'award_amount', 'currency',
    'application_open_date', 'application_deadline', 'deadline_timezone',
    'official_source_url', 'official_application_url', 'study_levels', 'eligible_subjects',
    'applicant_nationalities', 'eligible_residence_countries', 'destination_countries',
    'disability_eligibility', 'disability_categories', 'academic_requirements',
    'income_requirements', 'age_requirements', 'gender_requirements',
    'verification_status', 'application_status',
  ];
  return tracked.filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null));
};

const upsertScholarship = async (input, { changedBy = 'admin_manual_import' } = {}) => {
  const record = await normalizeRecord(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingResult = await client.query(
      'SELECT * FROM scholarships WHERE source_id = $1 AND source_record_id = $2 FOR UPDATE',
      [record.source_id, record.source_record_id],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      const duplicate = await client.query(
        `SELECT id, slug FROM scholarships
         WHERE lower(title) = lower($1) AND lower(provider_name) = lower($2)
         LIMIT 1`,
        [record.title, record.provider_name],
      );
      if (duplicate.rowCount) {
        await client.query('COMMIT');
        return { result: 'duplicate', duplicateOf: duplicate.rows[0].slug };
      }
    }

    const fields = [
      'source_record_id', 'title', 'slug', 'provider_name', 'provider_logo_url', 'description',
      'eligibility_description', 'category', 'scholarship_type', 'funding_type', 'award_amount',
      'currency', 'study_levels', 'eligible_subjects', 'applicant_nationalities',
      'eligible_residence_countries', 'destination_countries', 'disability_eligibility',
      'disability_categories', 'academic_requirements', 'income_requirements', 'age_requirements',
      'gender_requirements', 'application_open_date', 'application_deadline', 'official_source_url',
      'official_application_url', 'deadline_timezone', 'verification_status', 'application_status', 'last_verified_at',
      'last_source_checked_at', 'is_active', 'is_featured', 'financial_need_required', 'minimum_gpa', 'minimum_age',
      'maximum_age', 'maximum_income',
    ];
    const values = fields.map((field) => record[field] ?? null);
    let saved;
    if (existing) {
      const updateFields = fields.filter((field) => field !== 'source_record_id' && field !== 'slug');
      const updateValues = updateFields.map((field) => record[field] ?? null);
      const updates = updateFields.map((field, index) => `${field} = $${index + 1}`);
      const updated = await client.query(
        `UPDATE scholarships SET ${updates.join(', ')}, last_updated_at = now()
         WHERE id = $${updateValues.length + 1}
         RETURNING *`,
        [...updateValues, existing.id],
      );
      saved = updated.rows[0];
      const changed = changedFields(existing, saved);
      if (changed.length) {
        await client.query(
          `INSERT INTO scholarship_history
           (scholarship_id, changed_fields, before_values, after_values, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            saved.id,
            changed,
            Object.fromEntries(changed.map((field) => [field, existing[field]])),
            Object.fromEntries(changed.map((field) => [field, saved[field]])),
            changedBy,
          ],
        );
      }
      await client.query('COMMIT');
      return { result: changed.length ? 'updated' : 'unchanged', slug: saved.slug };
    }

    const inserted = await client.query(
      `INSERT INTO scholarships (source_id, ${fields.join(', ')})
       VALUES ($${values.map((_, index) => index + 2).join(', $')})
       RETURNING *`,
      [record.source_id, ...values],
    );
    saved = inserted.rows[0];
    await client.query('COMMIT');
    return { result: 'inserted', slug: saved.slug };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return { result: 'duplicate', duplicateOf: error.constraint || 'existing-record' };
    }
    throw error;
  } finally {
    client.release();
  }
};

const importCsv = async (csv, options) => {
  const records = parseCsv(csv);
  const sourceIds = new Set();
  let imported = 0;
  let updated = 0;
  let duplicates = 0;
  const rejected = [];
  for (const [index, record] of records.entries()) {
    try {
      const result = await upsertScholarship(record, options);
      if (result.result !== 'duplicate') sourceIds.add(record.source_id);
      if (result.result === 'inserted') imported += 1;
      else if (result.result === 'updated') updated += 1;
      else if (result.result === 'duplicate') duplicates += 1;
    } catch (error) {
      rejected.push({ row: index + 2, error: error.message });
    }
  }
  for (const sourceId of sourceIds) {
    await pool.query(
      `UPDATE scholarship_sources
       SET last_attempted_at = now(),
           last_successful_sync = CASE WHEN $2 = 0 THEN now() ELSE last_successful_sync END,
           last_sync_status = 'manual_import',
           last_error = CASE WHEN $2 = 0 THEN NULL ELSE $3 END,
           updated_at = now()
       WHERE source_id = $1`,
      [sourceId, rejected.length, rejected.length ? `${rejected.length} row(s) were rejected during manual import.` : null],
    );
  }
  return { discovered: records.length, imported, updated, duplicates, rejected };
};

module.exports = { importCsv, normalizeRecord, parseCsv, upsertScholarship };
