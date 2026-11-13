const { pool, isConfigured } = require('../database/pool');

const normaliseDate = (value) => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
};

const applicationStatusFor = (record, now = new Date()) => {
  if (record.applicationStatus === 'closed' || record.applicationStatus === 'expired') return record.applicationStatus;
  if (record.applicationStatus === 'opening_soon' || record.applicationStatus === 'source_temporarily_unavailable') {
    return record.applicationStatus;
  }
  if (record.applicationDeadline) {
    const timeZone = record.deadline_timezone || 'UTC';
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const deadlineDate = String(record.applicationDeadline).slice(0, 10);
    if (deadlineDate < today) return 'expired';
    const todayUtc = new Date(`${today}T00:00:00.000Z`);
    const deadlineUtc = new Date(`${deadlineDate}T00:00:00.000Z`);
    const daysUntilDeadline = Math.floor((deadlineUtc - todayUtc) / (24 * 60 * 60 * 1000));
    if (record.applicationStatus === 'open' && daysUntilDeadline >= 0 && daysUntilDeadline <= 7) {
      return 'deadline_approaching';
    }
  }
  return record.applicationStatus || 'unknown';
};

const rowToScholarship = (row) => ({
  scholarshipId: row.slug,
  sourceRecordId: row.source_record_id,
  scholarshipName: row.title,
  providerName: row.provider_name,
  providerLogoUrl: row.provider_logo_url,
  description: row.description,
  eligibilityDetails: row.eligibility_description,
  scholarshipCategory: row.category,
  scholarshipType: row.scholarship_type,
  fundingType: row.funding_type,
  awardAmount: row.award_amount === null ? null : Number(row.award_amount),
  currency: row.currency,
  studyLevels: row.study_levels || [],
  eligibleSubjects: row.eligible_subjects || [],
  academicQualifications: row.academic_requirements?.qualifications || [],
  applicantNationalities: row.applicant_nationalities || [],
  eligibleResidenceCountries: row.eligible_residence_countries || [],
  studyDestinationCountries: row.destination_countries || [],
  disabilityEligibility: row.disability_eligibility,
  disabilityCategories: row.disability_categories || [],
  academicRequirements: row.academic_requirements || {},
  incomeRequirements: row.income_requirements || {},
  ageRequirements: row.age_requirements || {},
  genderEligibility: row.gender_requirements,
  applicationOpenDate: row.application_open_date ? String(row.application_open_date).slice(0, 10) : null,
  applicationDeadline: row.application_deadline ? String(row.application_deadline).slice(0, 10) : null,
  deadlineTimezone: row.deadline_timezone || 'UTC',
  officialSourceUrl: row.official_source_url,
  officialApplicationUrl: row.official_application_url,
  verificationStatus: row.verification_status,
  applicationStatus: applicationStatusFor({
    applicationStatus: row.application_status,
    applicationDeadline: row.application_deadline,
    deadline_timezone: row.deadline_timezone,
  }),
  sourceCheckedAt: normaliseDate(row.last_source_checked_at),
  firstDiscoveredAt: normaliseDate(row.first_discovered_at),
  lastVerifiedAt: normaliseDate(row.last_verified_at),
  lastUpdatedAt: normaliseDate(row.last_updated_at),
  sourceId: row.source_id,
  sourceIds: [row.source_id],
  sourceName: row.source_name || row.source_id,
  featured: row.is_featured,
  minimumGpa: row.minimum_gpa === null || row.minimum_gpa === undefined
    ? (typeof row.academic_requirements?.minimumGpa === 'number' ? row.academic_requirements.minimumGpa : null)
    : Number(row.minimum_gpa),
  minimumAge: row.minimum_age ?? row.age_requirements?.minimum ?? null,
  maximumAge: row.maximum_age ?? row.age_requirements?.maximum ?? null,
  maximumIncome: row.maximum_income === null || row.maximum_income === undefined
    ? (typeof row.income_requirements?.maximum === 'number' ? row.income_requirements.maximum : null)
    : Number(row.maximum_income),
  financialNeedRequired: row.financial_need_required ?? row.income_requirements?.financialNeedRequired ?? null,
  official: row.verification_status === 'verified',
});

const valueForArray = (query, key, column, values, includeUnknown = false) => {
  if (!query[key]) return;
  const parameter = values.length + 1;
  values.push(query[key]);
  return includeUnknown
    ? `(${column} @> ARRAY[$${parameter}]::text[] OR ${column} @> ARRAY['all']::text[] OR cardinality(${column}) = 0)`
    : `(${column} @> ARRAY[$${parameter}]::text[] OR ${column} @> ARRAY['all']::text[])`;
};

const buildSearchWhere = (query, { includeUnverified = false } = {}) => {
  const clauses = ['s.is_active = true'];
  const values = [];
  const add = (clause) => { if (clause) clauses.push(clause); };

  clauses.push(includeUnverified
    ? "s.verification_status = 'awaiting_verification'"
    : "s.verification_status = 'verified'");
  if (query.featured === true) clauses.push('s.is_featured = true');
  add(valueForArray(query, 'applicantCountry', 's.applicant_nationalities', values, includeUnverified));
  add(valueForArray(query, 'residenceCountry', 's.eligible_residence_countries', values, includeUnverified));
  add(valueForArray(query, 'destinationCountry', 's.destination_countries', values, includeUnverified));

  const exactFilters = [
    ['level', 's.study_levels', 'array'],
    ['disabilityCategory', 's.disability_categories', 'array'],
    ['fieldOfStudy', 's.eligible_subjects', 'array'],
    ['category', 's.category', 'text'],
    ['fundingType', 's.funding_type', 'text'],
    ['gender', 's.gender_requirements', 'text'],
  ];
  exactFilters.forEach(([key, column, kind]) => {
    if (!query[key]) return;
    values.push(query[key]);
    const param = `$${values.length}`;
    if (kind === 'array') {
      add(includeUnverified
        ? `(${column} @> ARRAY[${param}]::text[] OR cardinality(${column}) = 0)`
        : `${column} @> ARRAY[${param}]::text[]`);
    }
    else add(`lower(${column}) = lower(${param})`);
  });

  if (query.disabilityEligibility) {
    values.push(query.disabilityEligibility);
    add(includeUnverified
      ? `(s.disability_eligibility = $${values.length} OR s.disability_eligibility = 'unknown')`
      : `s.disability_eligibility = $${values.length}`);
  }
  if (query.disability === true) {
    add(includeUnverified
      ? "s.disability_eligibility IN ('disability_specific', 'open_to_disability', 'accommodations', 'no_published_restriction', 'unknown')"
      : "s.disability_eligibility IN ('disability_specific', 'open_to_disability', 'accommodations', 'no_published_restriction')");
  }
  if (query.financialNeed !== undefined) {
    values.push(query.financialNeed);
    add(includeUnverified
      ? `(s.financial_need_required IS NULL OR s.financial_need_required = $${values.length})`
      : `s.financial_need_required = $${values.length}`);
  }
  if (query.gpa !== undefined) {
    values.push(query.gpa);
    add(`(s.minimum_gpa IS NULL OR s.minimum_gpa <= $${values.length})`);
  }
  if (query.maximumIncome !== undefined) {
    values.push(query.maximumIncome);
    add(`(s.maximum_income IS NULL OR $${values.length} <= s.maximum_income)`);
  }
  if (query.age !== undefined) {
    values.push(query.age);
    add(`(s.minimum_age IS NULL OR $${values.length} >= s.minimum_age)`);
    add(`(s.maximum_age IS NULL OR $${values.length} <= s.maximum_age)`);
  }
  if (query.deadlineBefore) {
    values.push(query.deadlineBefore);
    add(`s.application_deadline <= $${values.length}`);
  }
  if (query.deadlineAfter) {
    values.push(query.deadlineAfter);
    add(`s.application_deadline >= $${values.length}`);
  }
  if (query.applicationStatus) {
    values.push(query.applicationStatus);
    const status = `CASE
      WHEN s.application_status IN ('closed', 'expired') THEN s.application_status
      WHEN s.application_deadline < (now() AT TIME ZONE coalesce(s.deadline_timezone, 'UTC'))::date THEN 'expired'
      WHEN s.application_status = 'open'
        AND s.application_deadline <= ((now() AT TIME ZONE coalesce(s.deadline_timezone, 'UTC'))::date + 7)
        AND s.application_deadline >= (now() AT TIME ZONE coalesce(s.deadline_timezone, 'UTC'))::date
        THEN 'deadline_approaching'
      ELSE s.application_status
    END`;
    add(`${status} = $${values.length}`);
  } else if (!includeUnverified) {
    add("s.application_status NOT IN ('closed', 'expired')");
    add("(s.application_deadline IS NULL OR s.application_deadline >= (now() AT TIME ZONE coalesce(s.deadline_timezone, 'UTC'))::date)");
  }
  if (query.q) {
    values.push(query.q);
    add(`to_tsvector('simple', coalesce(s.title, '') || ' ' || coalesce(s.provider_name, '') || ' ' || coalesce(s.description, '') || ' ' || coalesce(s.eligibility_description, '')) @@ plainto_tsquery('simple', $${values.length})`);
  }
  return { where: clauses.join(' AND '), values };
};

const queryScholarships = async (query, options) => {
  const { where, values } = buildSearchWhere(query, options);
  const countResult = await pool.query(
    `SELECT count(*)::int AS total
     FROM scholarships s
     WHERE ${where}`,
    values,
  );
  const sortBy = {
    deadline: 's.application_deadline ASC NULLS LAST',
    funding: `CASE WHEN lower(coalesce(s.funding_type, '')) IN ('full', 'fully funded', 'full funding') THEN 0 ELSE 1 END ASC, s.last_updated_at DESC`,
    new: 's.first_discovered_at DESC NULLS LAST',
    verified: 's.last_verified_at DESC NULLS LAST',
    latest: 's.last_updated_at DESC',
  }[query.sort] || 's.last_updated_at DESC';
  const offset = (query.page - 1) * query.limit;
  const pageValues = [...values, query.limit, offset];
  const records = await pool.query(
    `SELECT s.*, src.source_name
     FROM scholarships s
     JOIN scholarship_sources src ON src.source_id = s.source_id AND src.is_active = true
     WHERE ${where}
     ORDER BY ${sortBy}
     LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
    pageValues,
  );
  const total = countResult.rows[0].total;
  return {
    scholarships: records.rows.map(rowToScholarship),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

const getScholarshipById = async (slug) => {
  const result = await pool.query(
    `SELECT s.*, src.source_name
     FROM scholarships s
     JOIN scholarship_sources src ON src.source_id = s.source_id AND src.is_active = true
     WHERE (s.slug = $1 OR s.source_record_id = $1) AND s.is_active = true AND s.verification_status = 'verified'`,
    [slug],
  );
  return result.rowCount ? rowToScholarship(result.rows[0]) : null;
};

const getCountries = async (countryList) => {
  const result = await pool.query(
    `SELECT country.code, count(DISTINCT s.id)::int AS count
     FROM unnest($1::text[]) AS country(code)
     JOIN scholarships s
       ON s.destination_countries @> ARRAY[country.code]::text[]
       OR s.destination_countries @> ARRAY['all']::text[]
     JOIN scholarship_sources src ON src.source_id = s.source_id AND src.is_active = true
     WHERE s.is_active = true
       AND s.verification_status = 'verified'
       AND s.application_status NOT IN ('closed', 'expired')
       AND (s.application_deadline IS NULL OR s.application_deadline >= (now() AT TIME ZONE coalesce(s.deadline_timezone, 'UTC'))::date)
     GROUP BY country.code`,
    [countryList.map((country) => country.code.toUpperCase())],
  );
  const counts = new Map(result.rows.map((row) => [row.code, row.count]));
  return countryList.map((country) => ({
    ...country,
    verifiedScholarshipCount: counts.get(country.code.toUpperCase()) || 0,
  }));
};

const getSourcesStatus = async () => {
  const result = await pool.query(
    `SELECT source_id AS id, source_name AS name, country, official_website AS url,
            source_type AS "sourceType", integration_method AS "integrationMethod",
            api_endpoint AS "apiEndpoint", refresh_interval_hours AS "refreshIntervalHours",
            is_active AS enabled, last_attempted_at AS "lastAttemptedAt",
            last_successful_sync AS "lastSuccessfulSync", last_sync_status AS "lastSyncStatus",
            last_error AS "lastError"
     FROM scholarship_sources
     ORDER BY country, source_name`,
  );
  return result.rows;
};

const getAdminSummary = async () => {
  const [counts, sources, latestSync] = await Promise.all([
    pool.query(`SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE is_active AND verification_status = 'verified' AND application_status NOT IN ('closed', 'expired') AND (application_deadline IS NULL OR application_deadline >= (now() AT TIME ZONE coalesce(deadline_timezone, 'UTC'))::date))::int AS active,
      count(*) FILTER (WHERE application_deadline < (now() AT TIME ZONE coalesce(deadline_timezone, 'UTC'))::date OR application_status = 'expired')::int AS expired,
      count(*) FILTER (WHERE verification_status = 'awaiting_verification')::int AS pending
      FROM scholarships`),
    pool.query(`SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE is_active)::int AS active,
      count(*) FILTER (WHERE last_sync_status = 'failed')::int AS failed
      FROM scholarship_sources`),
    pool.query("SELECT max(completed_at) AS last_successful_sync FROM ingestion_logs WHERE status IN ('success', 'manual_import')"),
  ]);
  return {
    scholarshipTotal: counts.rows[0].total,
    activeScholarships: counts.rows[0].active,
    expiredScholarships: counts.rows[0].expired,
    pendingVerification: counts.rows[0].pending,
    sourceTotal: sources.rows[0].total,
    activeSources: sources.rows[0].active,
    failedSources: sources.rows[0].failed,
    lastSuccessfulSync: latestSync.rows[0].last_successful_sync,
  };
};

const getIngestionLogs = async (limit = 50) => {
  const result = await pool.query(
    `SELECT l.*, s.source_name
     FROM ingestion_logs l
     LEFT JOIN scholarship_sources s ON s.source_id = l.source_id
     ORDER BY l.started_at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows;
};

const getAdminScholarships = async (verificationStatus = 'awaiting_verification', limit = 100) => {
  const result = await pool.query(
    `SELECT s.*, src.source_name
     FROM scholarships s
     JOIN scholarship_sources src ON src.source_id = s.source_id
     WHERE s.verification_status = $1
     ORDER BY s.last_updated_at DESC
     LIMIT $2`,
    [verificationStatus, limit],
  );
  return result.rows.map(rowToScholarship);
};

const getPublishedScholarshipSlugs = async () => {
  const result = await pool.query(
    `SELECT slug FROM scholarships s
     JOIN scholarship_sources src ON src.source_id = s.source_id AND src.is_active = true
     WHERE s.is_active = true AND s.verification_status = 'verified'`,
  );
  return result.rows.map((row) => row.slug);
};

const getVerifiedRecordsForMatching = async () => {
  const result = await pool.query(
    `SELECT s.*, src.source_name
     FROM scholarships s
     JOIN scholarship_sources src ON src.source_id = s.source_id AND src.is_active = true
     WHERE s.is_active = true AND s.verification_status = 'verified'
       AND s.application_status NOT IN ('closed', 'expired')
       AND (s.application_deadline IS NULL OR s.application_deadline >= (now() AT TIME ZONE coalesce(s.deadline_timezone, 'UTC'))::date)`,
  );
  return result.rows.map(rowToScholarship);
};

const queryAwaitingVerification = async (query) => queryScholarships(query, { includeUnverified: true });

module.exports = {
  applicationStatusFor,
  buildSearchWhere,
  getAdminSummary,
  getAdminScholarships,
  getPublishedScholarshipSlugs,
  getCountries,
  getIngestionLogs,
  getScholarshipById,
  getSourcesStatus,
  getVerifiedRecordsForMatching,
  isConfigured,
  queryScholarships,
  queryAwaitingVerification,
  rowToScholarship,
};
