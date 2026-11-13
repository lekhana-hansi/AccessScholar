const fs = require('fs');
const path = require('path');
const { normalizeRecord, parseCsv } = require('./importService');
const { getApplicationStatus, isPublishableScholarship, readCountries } = require('./scholarshipService');

const defaultDataDirectory = path.join(__dirname, '..', 'data');
const dataFile = (name) => path.join(process.env.ACCESS_SCHOLAR_DATA_DIR || defaultDataDirectory, name);
let writeQueue = Promise.resolve();

const readJson = (filePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw error;
  }
};

const readSources = () => readJson(dataFile('sources.json')).filter((source) => source.enabled);
const readScholarships = () => {
  const data = readJson(dataFile('scholarships.json'));
  if (!Array.isArray(data.scholarships)) throw new Error('Scholarship data must contain a scholarships array.');
  return data.scholarships;
};

const serializeWrites = (operation) => {
  const result = writeQueue.then(operation);
  writeQueue = result.catch(() => {});
  return result;
};

const writeJsonAtomic = async (filePath, value) => {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await fs.promises.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true });
    throw error;
  }
};

const toPublicRecord = (record, existing = {}) => ({
  ...existing,
  scholarshipId: existing.scholarshipId || record.slug,
  sourceRecordId: record.source_record_id,
  scholarshipName: record.title,
  providerName: record.provider_name,
  providerLogoUrl: record.provider_logo_url,
  description: record.description || '',
  eligibilityDetails: record.eligibility_description || '',
  scholarshipCategory: record.category || 'Scholarship',
  scholarshipType: record.scholarship_type || 'International Scholarship',
  fundingType: record.funding_type,
  awardAmount: record.award_amount === null ? null : Number(record.award_amount),
  currency: record.currency,
  studyLevels: record.study_levels,
  eligibleSubjects: record.eligible_subjects,
  applicantNationalities: record.applicant_nationalities,
  eligibleResidenceCountries: record.eligible_residence_countries,
  studyDestinationCountries: record.destination_countries,
  disabilityEligibility: record.disability_eligibility,
  disabilityCategories: record.disability_categories,
  academicRequirements: record.academic_requirements,
  incomeRequirements: record.income_requirements,
  ageRequirements: record.age_requirements,
  academicQualifications: record.academic_requirements.qualifications || [],
  genderEligibility: record.gender_requirements,
  applicationOpenDate: record.application_open_date,
  applicationDeadline: record.application_deadline,
  deadlineTimezone: record.deadline_timezone,
  officialSourceUrl: record.official_source_url,
  officialApplicationUrl: record.official_application_url,
  verificationStatus: record.verification_status,
  applicationStatus: record.application_status,
  sourceCheckedAt: record.last_source_checked_at,
  firstDiscoveredAt: existing.scholarshipId
    ? existing.firstDiscoveredAt || null
    : new Date().toISOString(),
  lastUpdatedAt: new Date().toISOString(),
  lastVerifiedAt: record.last_verified_at,
  sourceId: record.source_id,
  sourceIds: [record.source_id],
  featured: record.is_featured,
  minimumGpa: record.minimum_gpa === null ? null : Number(record.minimum_gpa),
  minimumAge: record.minimum_age === null ? null : Number(record.minimum_age),
  maximumAge: record.maximum_age === null ? null : Number(record.maximum_age),
  maximumIncome: record.maximum_income === null ? null : Number(record.maximum_income),
  financialNeedRequired: record.financial_need_required,
  isActive: record.is_active,
});

const toImportRecord = (record) => ({
  source_record_id: record.sourceRecordId,
  title: record.scholarshipName,
  slug: record.scholarshipId,
  provider_name: record.providerName,
  provider_logo_url: record.providerLogoUrl,
  description: record.description,
  eligibility_description: record.eligibilityDetails,
  category: record.scholarshipCategory,
  scholarship_type: record.scholarshipType,
  funding_type: record.fundingType,
  award_amount: record.awardAmount,
  currency: record.currency,
  study_levels: record.studyLevels,
  eligible_subjects: record.eligibleSubjects,
  applicant_nationalities: record.applicantNationalities,
  eligible_residence_countries: record.eligibleResidenceCountries,
  destination_countries: record.studyDestinationCountries,
  disability_eligibility: record.disabilityEligibility,
  disability_categories: record.disabilityCategories,
  academic_requirements: record.academicRequirements,
  income_requirements: record.incomeRequirements,
  age_requirements: record.ageRequirements,
  gender_requirements: record.genderEligibility,
  application_open_date: record.applicationOpenDate,
  application_deadline: record.applicationDeadline,
  deadline_timezone: record.deadlineTimezone,
  official_source_url: record.officialSourceUrl,
  official_application_url: record.officialApplicationUrl,
  source_id: record.sourceId,
  verification_status: record.verificationStatus,
  application_status: record.applicationStatus,
  last_verified_at: record.lastVerifiedAt,
  last_source_checked_at: record.sourceCheckedAt,
  first_discovered_at: record.firstDiscoveredAt,
  is_featured: record.featured,
  financial_need_required: record.financialNeedRequired,
  is_active: record.isActive !== false,
  minimum_gpa: record.minimumGpa,
  minimum_age: record.minimumAge,
  maximum_age: record.maximumAge,
  maximum_income: record.maximumIncome,
});

const sourceLookup = async (sourceId) => {
  const source = readSources().find((item) => item.id === sourceId);
  if (!source) return undefined;
  return {
    source_id: source.id,
    official_website: source.url,
    approved_application_hosts: source.applicationHosts || [],
    is_active: source.enabled,
  };
};

const upsertScholarship = async (input) => {
  const record = await normalizeRecord(input, { lookupSource: sourceLookup });
  return serializeWrites(async () => {
    const scholarshipsPath = dataFile('scholarships.json');
    const data = readJson(scholarshipsPath);
    if (!Array.isArray(data.scholarships)) throw new Error('Scholarship data must contain a scholarships array.');
    const existingIndex = data.scholarships.findIndex((item) => (
      item.sourceId === record.source_id && item.sourceRecordId === record.source_record_id
    ));
    const duplicate = data.scholarships.find((item, index) => (
      index !== existingIndex
      && item.providerName?.toLowerCase() === record.provider_name.toLowerCase()
      && item.scholarshipName?.toLowerCase() === record.title.toLowerCase()
    ));
    if (duplicate) return { result: 'duplicate', duplicateOf: duplicate.scholarshipId };

    const existing = existingIndex >= 0 ? data.scholarships[existingIndex] : null;
    if (existing && existing.scholarshipId !== record.slug) record.slug = existing.scholarshipId;
    const saved = toPublicRecord(record, existing || {});
    if (existing) {
      data.scholarships[existingIndex] = saved;
      await writeJsonAtomic(scholarshipsPath, data);
      return { result: 'updated', slug: saved.scholarshipId };
    }

    if (data.scholarships.some((item) => item.scholarshipId === record.slug)) {
      return { result: 'duplicate', duplicateOf: record.slug };
    }
    data.scholarships.push(saved);
    await writeJsonAtomic(scholarshipsPath, data);
    return { result: 'inserted', slug: saved.scholarshipId };
  });
};

const importCsv = async (csv) => {
  const records = parseCsv(csv);
  let imported = 0;
  let updated = 0;
  let duplicates = 0;
  const rejected = [];
  for (const [index, record] of records.entries()) {
    try {
      const result = await upsertScholarship(record);
      if (result.result === 'inserted') imported += 1;
      else if (result.result === 'updated') updated += 1;
      else if (result.result === 'duplicate') duplicates += 1;
    } catch (error) {
      rejected.push({ row: index + 2, error: error.message });
    }
  }
  return { discovered: records.length, imported, updated, duplicates, rejected };
};

const getDashboard = () => {
  const sources = readSources();
  const scholarships = readScholarships();
  const verified = scholarships.filter((record) => isPublishableScholarship(record, sources));
  const active = verified.filter((record) => !['closed', 'expired'].includes(getApplicationStatus(record)));
  return {
    scholarshipTotal: scholarships.length,
    activeScholarships: active.length,
    expiredScholarships: verified.filter((record) => getApplicationStatus(record) === 'expired').length,
    pendingVerification: scholarships.filter((record) => record.verificationStatus === 'awaiting_verification').length,
    sourceTotal: sources.length,
    activeSources: sources.length,
    failedSources: 0,
    lastSuccessfulSync: null,
  };
};

const getSources = () => readSources().map((source) => ({
  id: source.id,
  name: source.name,
  country: source.country,
  officialWebsite: source.url,
  integrationMethod: source.integrationMethod,
  enabled: source.enabled,
  lastSyncStatus: source.lastSyncStatus || 'manual_verification',
  lastSuccessfulSync: source.lastSuccessfulSync || null,
  lastError: null,
}));

const getScholarships = (verificationStatus) => {
  const sources = readSources();
  return readScholarships()
    .filter((record) => (verificationStatus === 'all' || record.verificationStatus === verificationStatus) && record.isActive !== false)
    .map((record) => ({
      ...record,
      sourceName: sources.find((source) => source.id === record.sourceId)?.name || record.sourceId,
    }));
};

const getIngestionLogs = (limit = 50) => readJson(logsPath, []).slice(0, limit);

const addIngestionLog = async (result) => serializeWrites(async () => {
  const logsPath = dataFile('ingestion-logs.json');
  const logs = readJson(logsPath, []);
  const sourceNames = new Map(getSources().map((source) => [source.id, source.name]));
  logs.unshift({
    source_name: result.sourceId ? sourceNames.get(result.sourceId) || result.sourceId : 'Manual import',
    status: result.rejected.length ? (result.imported + result.updated ? 'partial' : 'failed') : 'manual_import',
    started_at: result.startedAt,
    completed_at: new Date().toISOString(),
    records_discovered: result.discovered,
    records_imported: result.imported,
    records_updated: result.updated,
    duplicate_records: result.duplicates,
    records_rejected: result.rejected.length,
    error_message: result.rejected.length ? `${result.rejected.length} row(s) were rejected during import.` : null,
  });
  await writeJsonAtomic(logsPath, logs.slice(0, 100));
});

const reviewScholarship = async (slug, changes) => {
  const existing = readScholarships().find((record) => record.scholarshipId === slug);
  if (!existing) return { result: 'not_found' };
  return upsertScholarship({
    ...toImportRecord(existing),
    ...changes,
  });
};

module.exports = {
  addIngestionLog,
  getDashboard,
  getIngestionLogs,
  getScholarships,
  getSources,
  importCsv,
  reviewScholarship,
  upsertScholarship,
};
