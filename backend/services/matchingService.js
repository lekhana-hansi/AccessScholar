const {
  isPublishableScholarship,
  readCountries,
  readScholarships,
  readSources,
} = require('./scholarshipService');

const normalize = (value) => String(value || '').trim().toLowerCase();
const hasProfileValue = (value) => value !== '' && value !== null && value !== undefined;

const includesCountry = (eligible, selected, countries) => {
  if (!Array.isArray(eligible) || eligible.length === 0) return null;
  if (!hasProfileValue(selected)) return 'missing';
  const countryFor = (value) => {
    const match = countries.find((country) => normalize(country.code) === normalize(value)
      || normalize(country.name) === normalize(value));
    return match ? match.code.toLowerCase() : normalize(value);
  };
  return eligible.some((value) => normalize(value) === 'all' || countryFor(value) === countryFor(selected))
    ? 'matched'
    : 'unmet';
};

const includesText = (eligible, selected) => {
  if (!Array.isArray(eligible) || eligible.length === 0) return null;
  if (!hasProfileValue(selected)) return 'missing';
  const needle = normalize(selected);
  return eligible.some((value) => normalize(value).includes(needle) || needle.includes(normalize(value)))
    ? 'matched'
    : 'unmet';
};

const compareValue = (required, provided, condition) => {
  if (typeof required !== 'number') return null;
  if (!hasProfileValue(provided)) return 'missing';
  return condition(provided, required) ? 'matched' : 'unmet';
};

const evaluateScholarship = (scholarship, profile, countries) => {
  const missing = [];
  const unmet = [];
  const preferences = [];
  const add = (label, result) => {
    if (result === 'missing') missing.push(`${label}: add this to your profile to check the published requirement.`);
    if (result === 'unmet') unmet.push(`${label}: your profile does not meet the published requirement.`);
  };
  add('Applicant nationality', includesCountry(scholarship.applicantNationalities, profile.applicantCountry, countries));
  add('Country of residence', includesCountry(scholarship.eligibleResidenceCountries, profile.residenceCountry, countries));
  add('Study destination', includesCountry(scholarship.studyDestinationCountries, profile.destinationCountry, countries));
  add('Education level', includesText(scholarship.studyLevels, profile.level));
  add('Subject / course', includesText(scholarship.eligibleSubjects, profile.fieldOfStudy));
  add('Academic qualification', includesText(scholarship.academicQualifications, profile.academicQualification));
  add('Minimum academic score', compareValue(scholarship.minimumGpa, profile.gpa, (value, minimum) => value >= minimum));
  add('Minimum age', compareValue(scholarship.minimumAge, profile.age, (value, minimum) => value >= minimum));
  add('Maximum age', compareValue(scholarship.maximumAge, profile.age, (value, maximum) => value <= maximum));
  add('Maximum household income', compareValue(scholarship.maximumIncome, profile.income, (value, maximum) => value <= maximum));

  if (scholarship.financialNeedRequired === true) {
    if (profile.financialNeed === null) add('Financial need', 'missing');
    else if (profile.financialNeed === false) add('Financial need', 'unmet');
  }
  if (scholarship.disabilityEligibility === 'disability_specific') {
    if (profile.disabilityStatus === 'unspecified') add('Disability-specific eligibility', 'missing');
    else if (profile.disabilityStatus === 'no') add('Disability-specific eligibility', 'unmet');
    if (profile.disabilityStatus === 'yes' && Array.isArray(scholarship.disabilityCategories)
      && scholarship.disabilityCategories.length > 0) {
      add('Disability category', includesText(scholarship.disabilityCategories, profile.disabilityCategory));
    }
  }

  if (scholarship.eligibilityDetails || scholarship.academicRequirements) {
    missing.push('Detailed eligibility: confirm the provider’s full published terms; free-text requirements are not automatically interpreted.');
  }
  if (profile.fundingType && scholarship.fundingType && profile.fundingType !== scholarship.fundingType) {
    preferences.push(`Funding preference: this listing is marked ${scholarship.fundingType}, but you prefer ${profile.fundingType}; this preference does not determine eligibility.`);
  }

  if (unmet.length) return { group: 'notEligible', reasons: [...unmet, ...preferences] };
  if (missing.length) return { group: 'possibleMatch', reasons: [...missing, ...preferences] };
  return {
    group: 'strongMatch',
    reasons: [
      'All published structured eligibility requirements we can compare appear satisfied. Confirm every requirement with the official provider.',
      ...preferences,
    ],
  };
};

const matchRecords = (profile, records, countries = readCountries()) => {
  const groups = { strongMatch: [], possibleMatch: [], notEligible: [] };
  records.forEach((scholarship) => {
    const result = evaluateScholarship(scholarship, profile, countries);
    groups[result.group].push({
      ...scholarship,
      matchReasons: result.reasons,
    });
  });
  return groups;
};

const matchScholarships = (profile) => {
  const sources = readSources();
  const records = readScholarships()
    .filter((scholarship) => isPublishableScholarship(scholarship, sources));
  return matchRecords(profile, records.map((scholarship) => ({
    ...scholarship,
    sourceName: (scholarship.sourceIds || [scholarship.sourceId])
      .map((id) => sources.find((source) => source.id === id)?.name)
      .filter(Boolean)
      .join('; '),
  })));
};

module.exports = { evaluateScholarship, matchRecords, matchScholarships };
