const fs = require('fs');
const path = require('path');

const dataPath = () => process.env.ACCESS_SCHOLAR_DATA_DIR || path.join(__dirname, '..', 'data');

const categories = [
  'Government',
  'University',
  'Private Foundation',
  'Disability Scholarship',
  'Research Funding',
  'International Scholarship',
  'Merit-Based',
  'Need-Based',
];

const disabilityEligibilityValues = [
  'disability_specific',
  'open_to_disability',
  'accommodations',
  'no_published_restriction',
];

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const readCountries = () => readJson(path.join(dataPath(), 'countries.json'));
const readSources = () => readJson(path.join(dataPath(), 'sources.json'));
let countryCodesByName;
const countryCodeFor = (country) => {
  const value = normalize(country);
  if (!countryCodesByName) {
    countryCodesByName = new Map();
    readCountries().forEach((item) => {
      countryCodesByName.set(normalize(item.code), normalize(item.code));
      countryCodesByName.set(normalize(item.name), normalize(item.code));
    });
  }
  return countryCodesByName.get(value) || value;
};
const readScholarships = () => {
  const data = readJson(path.join(dataPath(), 'scholarships.json'));
  if (!Array.isArray(data.scholarships)) {
    throw new Error('Scholarship data must contain a scholarships array.');
  }
  return data.scholarships;
};

const normalize = (value) => String(value || '').trim().toLowerCase();

const includesCountry = (list, country) => Array.isArray(list)
  && list.some((item) => normalize(item) === 'all' || countryCodeFor(item) === countryCodeFor(country));
const includesValue = (list, value) => Array.isArray(list)
  && list.some((item) => normalize(item) === normalize(value));

const verifiedSourceFor = (scholarship, sources) => {
  const sourceIds = Array.isArray(scholarship.sourceIds) && scholarship.sourceIds.length
    ? scholarship.sourceIds
    : (scholarship.sourceId ? [scholarship.sourceId] : []);
  if (scholarship.verificationStatus !== 'verified' || sourceIds.length === 0) return false;
  const relatedSources = sourceIds.map((id) => sources.find((item) => item.id === id && item.enabled));
  if (relatedSources.some((source) => !source)) return false;

  try {
    const officialUrl = new URL(scholarship.officialSourceUrl);
    const applicationUrl = new URL(scholarship.officialApplicationUrl);
    const officialUrlIsApproved = officialUrl.protocol === 'https:'
      && relatedSources.some((source) => {
        const sourceUrl = new URL(source.url);
        return officialUrl.hostname === sourceUrl.hostname || officialUrl.hostname.endsWith(`.${sourceUrl.hostname}`);
      });
    const applicationUrlIsApproved = applicationUrl.protocol === 'https:'
      && relatedSources.some((source) => {
        const sourceHost = new URL(source.url).hostname;
        const allowedHosts = [sourceHost, ...(source.applicationHosts || [])];
        return allowedHosts.some((host) => applicationUrl.hostname === host || applicationUrl.hostname.endsWith(`.${host}`));
      });
    return officialUrlIsApproved
      && applicationUrl.protocol === 'https:'
      && applicationUrlIsApproved;
  } catch {
    return false;
  }
};

const isPublishableScholarship = (scholarship, sources) => verifiedSourceFor(scholarship, sources)
  && scholarship.isActive !== false
  && typeof scholarship.scholarshipId === 'string'
  && Boolean(scholarship.scholarshipName && scholarship.providerName)
  && typeof scholarship.lastVerifiedAt === 'string'
  && !Number.isNaN(Date.parse(scholarship.lastVerifiedAt))
  && scholarship.disabilityEligibility
  && disabilityEligibilityValues.includes(scholarship.disabilityEligibility)
  && Array.isArray(scholarship.studyDestinationCountries)
  && scholarship.studyDestinationCountries.length > 0;

const normalizeSearchText = (value) => normalize(value)
  .replace(/\b([a-z]+?)ies\b/g, '$1y');

const scholarshipMatches = (scholarship, filters) => {
  const query = normalizeSearchText(filters.q);
  const searchableText = normalizeSearchText([
    scholarship.scholarshipName,
    scholarship.providerName,
    scholarship.description,
    scholarship.eligibilityDetails,
    scholarship.scholarshipCategory,
    ...(scholarship.eligibleSubjects || []),
    ...(scholarship.studyLevels || []),
  ].filter(Boolean).join(' '));

  if (query && !searchableText.includes(query)) return false;
  if (filters.featured === true && scholarship.featured !== true) return false;
  if (filters.applicantCountry && !includesCountry(scholarship.applicantNationalities, filters.applicantCountry)) return false;
  if (filters.residenceCountry && !includesCountry(scholarship.eligibleResidenceCountries, filters.residenceCountry)) return false;
  if (filters.destinationCountry && !includesCountry(scholarship.studyDestinationCountries, filters.destinationCountry)) return false;
  if (filters.level && !(scholarship.studyLevels || []).some((level) => normalize(level) === normalize(filters.level))) return false;
  if (filters.disabilityEligibility && scholarship.disabilityEligibility !== filters.disabilityEligibility) return false;
  if (filters.disability === true && !disabilityEligibilityValues.includes(scholarship.disabilityEligibility)) return false;
  if (filters.disabilityCategory && !(scholarship.disabilityCategories || []).some((value) => normalize(value) === normalize(filters.disabilityCategory))) return false;
  if (filters.category && normalize(scholarship.scholarshipCategory) !== normalize(filters.category)) return false;
  if (filters.fundingType && normalize(scholarship.fundingType) !== normalize(filters.fundingType)) return false;
  if (filters.applicationStatus && getApplicationStatus(scholarship) !== filters.applicationStatus) return false;
  if (filters.fieldOfStudy && !includesValue(scholarship.eligibleSubjects, filters.fieldOfStudy)) return false;
  if (filters.institution && !includesValue(scholarship.eligibleUniversities, filters.institution)) return false;
  if (filters.academicQualification && !includesValue(scholarship.academicQualifications, filters.academicQualification)) return false;
  if (filters.gender && normalize(scholarship.genderEligibility || 'any') !== normalize(filters.gender)) return false;
  if (filters.financialNeed !== undefined && scholarship.financialNeedRequired !== filters.financialNeed) return false;
  if (filters.gpa !== undefined && (typeof scholarship.minimumGpa !== 'number' || filters.gpa < scholarship.minimumGpa)) return false;
  if (filters.maximumIncome !== undefined && (typeof scholarship.maximumIncome !== 'number' || filters.maximumIncome > scholarship.maximumIncome)) return false;
  if (filters.age !== undefined && (
    (typeof scholarship.minimumAge === 'number' && filters.age < scholarship.minimumAge)
    || (typeof scholarship.maximumAge === 'number' && filters.age > scholarship.maximumAge)
  )) return false;
  if (filters.deadlineBefore && (!scholarship.applicationDeadline || scholarship.applicationDeadline > filters.deadlineBefore)) return false;
  if (filters.deadlineAfter && (!scholarship.applicationDeadline || scholarship.applicationDeadline < filters.deadlineAfter)) return false;
  return true;
};

const getApplicationStatus = (scholarship, now = new Date()) => {
  if (['closed', 'expired', 'opening_soon', 'source_temporarily_unavailable'].includes(scholarship.applicationStatus)) {
    return scholarship.applicationStatus;
  }

  if (scholarship.applicationDeadline) {
    const timeZone = scholarship.deadlineTimezone || 'UTC';
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const deadlineDate = String(scholarship.applicationDeadline).slice(0, 10);
    if (deadlineDate < today) return 'expired';
    const todayUtc = new Date(`${today}T00:00:00.000Z`);
    const deadlineUtc = new Date(`${deadlineDate}T00:00:00.000Z`);
    const daysUntilDeadline = Math.floor((deadlineUtc - todayUtc) / (24 * 60 * 60 * 1000));
    if (
      daysUntilDeadline >= 0
      && daysUntilDeadline <= 7
      && scholarship.applicationStatus === 'open'
      && scholarship.verificationStatus === 'verified'
    ) return 'deadline_approaching';
  }

  if (
    scholarship.applicationStatus === 'open'
    && scholarship.verificationStatus === 'awaiting_verification'
    && scholarship.sourceCheckedAt
    && !Number.isNaN(Date.parse(scholarship.sourceCheckedAt))
  ) return 'open';

  if (scholarship.applicationStatus === 'open' && scholarship.verificationStatus === 'verified') return 'open';
  return 'unknown';
};

const sortScholarships = (scholarships, sort) => {
  const sorted = [...scholarships];
  if (sort === 'deadline') {
    sorted.sort((a, b) => (a.applicationDeadline || '9999-12-31').localeCompare(b.applicationDeadline || '9999-12-31'));
  } else if (sort === 'funding') {
    sorted.sort((a, b) => {
      const aFull = ['full', 'fully funded', 'full funding'].includes(normalize(a.fundingType)) ? 0 : 1;
      const bFull = ['full', 'fully funded', 'full funding'].includes(normalize(b.fundingType)) ? 0 : 1;
      return aFull - bFull
        || (b.lastUpdatedAt || '').localeCompare(a.lastUpdatedAt || '');
    });
  } else if (sort === 'new') {
    sorted.sort((a, b) => (b.firstDiscoveredAt || '').localeCompare(a.firstDiscoveredAt || ''));
  } else if (sort === 'verified') {
    sorted.sort((a, b) => (b.lastVerifiedAt || '').localeCompare(a.lastVerifiedAt || ''));
  } else {
    sorted.sort((a, b) => (b.lastUpdatedAt || '').localeCompare(a.lastUpdatedAt || ''));
  }
  return sorted;
};

const searchScholarships = ({ query, now = new Date() }) => {
  const sources = readSources();
  const records = readScholarships()
    .filter((record) => isPublishableScholarship(record, sources))
    .filter((record) => scholarshipMatches(record, query))
    .map((record) => ({
      ...record,
      sourceName: (record.sourceIds || [record.sourceId])
        .map((id) => sources.find((source) => source.id === id)?.name)
        .filter(Boolean)
        .join('; '),
      applicationStatus: getApplicationStatus(record, now),
    }));
  const sorted = sortScholarships(records, query.sort);
  const page = query.page;
  const limit = query.limit;
  const start = (page - 1) * limit;

  return {
    scholarships: sorted.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total: sorted.length,
      totalPages: Math.ceil(sorted.length / limit),
    },
  };
};

const searchAwaitingScholarships = ({ query, now = new Date() }) => {
  const sources = readSources();
  const records = readScholarships()
    .filter((record) => record.verificationStatus === 'awaiting_verification')
    .filter((record) => record.isActive !== false)
    .filter((record) => {
      const filters = { ...query };
      const unknownFilterFields = [
        ['applicantNationalities', 'applicantCountry'],
        ['eligibleResidenceCountries', 'residenceCountry'],
        ['studyLevels', 'level'],
        ['eligibleSubjects', 'fieldOfStudy'],
        ['disabilityCategories', 'disabilityCategory'],
      ];
      unknownFilterFields.forEach(([recordField, filterField]) => {
        if (!Array.isArray(record[recordField]) || record[recordField].length === 0) delete filters[filterField];
      });
      if (record.disabilityEligibility === 'unknown') delete filters.disabilityEligibility;
      if (record.disabilityEligibility === 'unknown') delete filters.disability;
      if (typeof record.minimumGpa !== 'number') delete filters.gpa;
      if (typeof record.maximumIncome !== 'number') delete filters.maximumIncome;
      if (typeof record.minimumAge !== 'number' && typeof record.maximumAge !== 'number') delete filters.age;
      if (typeof record.financialNeedRequired !== 'boolean') delete filters.financialNeed;
      if (!record.genderEligibility) delete filters.gender;
      if (!record.fundingType) delete filters.fundingType;
      if (!record.applicationStatus || record.applicationStatus === 'unknown') delete filters.applicationStatus;
      return scholarshipMatches(record, filters);
    })
    .map((record) => ({
      ...record,
      sourceName: (record.sourceIds || [record.sourceId])
        .map((id) => sources.find((source) => source.id === id && source.enabled)?.name)
        .filter(Boolean)
        .join('; '),
      applicationStatus: getApplicationStatus(record, now),
    }))
    .filter((record) => record.sourceName);
  const sorted = sortScholarships(records, query.sort);
  const start = (query.page - 1) * query.limit;
  return {
    scholarships: sorted.slice(start, start + query.limit),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: sorted.length,
      totalPages: Math.ceil(sorted.length / query.limit),
    },
  };
};

const getScholarshipById = (id, now = new Date()) => {
  const sources = readSources();
  const record = readScholarships().find((item) => item.scholarshipId === id);
  if (!record || !isPublishableScholarship(record, sources)) return null;
  return {
    ...record,
    sourceName: (record.sourceIds || [record.sourceId])
      .map((source) => sources.find((item) => item.id === source)?.name)
      .filter(Boolean)
      .join('; '),
    applicationStatus: getApplicationStatus(record, now),
  };
};

const parseSearchQuery = (query) => {
  const allowed = new Set([
    'q', 'applicantCountry', 'residenceCountry', 'destinationCountry', 'level',
    'disability', 'disabilityEligibility', 'disabilityCategory', 'category',
    'fundingType', 'applicationStatus', 'page', 'limit', 'sort', 'fieldOfStudy',
    'institution', 'academicQualification', 'gender', 'financialNeed', 'gpa',
    'maximumIncome', 'age', 'deadlineBefore', 'deadlineAfter',
  ]);
  const unsupported = Object.keys(query).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return { error: `Unsupported search parameter: ${unsupported[0]}` };
  }

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 12);
  if (!Number.isInteger(page) || page < 1) return { error: 'page must be a positive integer.' };
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { error: 'limit must be an integer between 1 and 100.' };

  const disabilityValue = query.disability;
  if (disabilityValue !== undefined && !['true', 'false'].includes(disabilityValue)) {
    return { error: 'disability must be true or false.' };
  }
  for (const key of ['financialNeed']) {
    if (query[key] !== undefined && !['true', 'false'].includes(query[key])) {
      return { error: `${key} must be true or false.` };
    }
  }
  for (const key of ['gpa', 'maximumIncome', 'age']) {
    if (query[key] !== undefined && (!Number.isFinite(Number(query[key])) || Number(query[key]) < 0)) {
      return { error: `${key} must be a non-negative number.` };
    }
  }
  for (const key of ['deadlineBefore', 'deadlineAfter']) {
    const date = query[key] === undefined ? null : new Date(`${query[key]}T00:00:00.000Z`);
    if (query[key] !== undefined && (
      !/^\d{4}-\d{2}-\d{2}$/.test(query[key])
      || Number.isNaN(date.getTime())
      || date.toISOString().slice(0, 10) !== query[key]
    )) {
      return { error: `${key} must use YYYY-MM-DD format.` };
    }
  }
  if (query.disabilityEligibility && !disabilityEligibilityValues.includes(query.disabilityEligibility)) {
    return { error: 'disabilityEligibility is not supported.' };
  }
  if (query.applicationStatus && !['open', 'opening_soon', 'deadline_approaching', 'closed', 'expired', 'unknown', 'source_temporarily_unavailable'].includes(query.applicationStatus)) {
    return { error: 'applicationStatus is not supported.' };
  }
  const sort = query.sort || 'latest';
  if (!['latest', 'deadline', 'funding', 'new', 'verified'].includes(sort)) {
    return { error: 'sort must be latest, deadline, funding, new, or verified.' };
  }

  const value = {
    ...query,
    page,
    limit,
    sort,
  };
  if (disabilityValue !== undefined) value.disability = disabilityValue === 'true';
  if (query.financialNeed !== undefined) value.financialNeed = query.financialNeed === 'true';
  for (const key of ['gpa', 'maximumIncome', 'age']) {
    if (query[key] !== undefined) value[key] = Number(query[key]);
  }
  ['applicantCountry', 'residenceCountry', 'destinationCountry'].forEach((key) => {
    if (value[key]) {
      value[key] = countryCodeFor(value[key]).toUpperCase();
    }
  });
  return { value };
};

module.exports = {
  categories,
  disabilityEligibilityValues,
  getScholarshipById,
  getApplicationStatus,
  isPublishableScholarship,
  parseSearchQuery,
  readCountries,
  readScholarships,
  readSources,
  searchAwaitingScholarships,
  scholarshipMatches,
  sortScholarships,
  searchScholarships,
};
