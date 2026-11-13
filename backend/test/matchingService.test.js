const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateScholarship } = require('../services/matchingService');
const { readCountries } = require('../services/scholarshipService');

const countries = readCountries();
const scholarship = {
  applicantNationalities: ['IN'],
  eligibleResidenceCountries: ['IN'],
  studyDestinationCountries: ['US'],
  studyLevels: ['master'],
  eligibleSubjects: ['Computer Science'],
  academicQualifications: ['Bachelor'],
  minimumGpa: 3,
  minimumAge: 18,
  maximumAge: 30,
  maximumIncome: 50000,
  financialNeedRequired: true,
  disabilityEligibility: 'disability_specific',
  disabilityCategories: ['Visual impairment'],
};
const eligibleProfile = {
  applicantCountry: 'IN',
  residenceCountry: 'IN',
  destinationCountry: 'US',
  level: 'master',
  fieldOfStudy: 'Computer Science',
  academicQualification: 'Bachelor',
  gpa: 3.5,
  age: 24,
  income: 30000,
  financialNeed: true,
  disabilityStatus: 'yes',
  disabilityCategory: 'Visual impairment',
};

test('classified strong only when all published structured criteria match', () => {
  assert.equal(evaluateScholarship(scholarship, eligibleProfile, countries).group, 'strongMatch');
});

test('puts incomplete profile information in possible matches with reasons', () => {
  const result = evaluateScholarship(scholarship, { ...eligibleProfile, gpa: null, disabilityCategory: '' }, countries);
  assert.equal(result.group, 'possibleMatch');
  assert.ok(result.reasons.some((reason) => reason.startsWith('Minimum academic score:')));
  assert.ok(result.reasons.some((reason) => reason.startsWith('Disability category:')));
});

test('reports explicit mandatory mismatches without excluding disability by default', () => {
  const result = evaluateScholarship(scholarship, { ...eligibleProfile, applicantCountry: 'CA' }, countries);
  assert.equal(result.group, 'notEligible');
  assert.ok(result.reasons.some((reason) => reason.startsWith('Applicant nationality:')));
  assert.equal(evaluateScholarship({ ...scholarship, disabilityEligibility: 'open_to_disability' }, {
    ...eligibleProfile,
    disabilityStatus: 'no',
  }, countries).group, 'strongMatch');
});

test('marks free-text eligibility as needing official-provider confirmation', () => {
  const result = evaluateScholarship({ ...scholarship, eligibilityDetails: 'See the official terms.' }, eligibleProfile, countries);
  assert.equal(result.group, 'possibleMatch');
  assert.ok(result.reasons.some((reason) => reason.startsWith('Detailed eligibility:')));
});
