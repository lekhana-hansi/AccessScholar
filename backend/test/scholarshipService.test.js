const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getApplicationStatus,
  isPublishableScholarship,
  parseSearchQuery,
  scholarshipMatches,
  sortScholarships,
} = require('../services/scholarshipService');

const source = {
  id: 'test-source',
  url: 'https://funding.example.gov.in/',
  enabled: true,
};

const scholarship = {
  scholarshipId: 'verified-sample',
  scholarshipName: 'Inclusive Engineering Award',
  providerName: 'Example Provider',
  sourceId: source.id,
  officialSourceUrl: 'https://funding.example.gov.in/scholarships',
  officialApplicationUrl: 'https://funding.example.gov.in/apply',
  verificationStatus: 'verified',
  disabilityEligibility: 'disability_specific',
  disabilityCategories: ['visual impairment'],
  applicantNationalities: ['IN'],
  eligibleResidenceCountries: ['IN'],
  studyDestinationCountries: ['AU'],
  studyLevels: ['master'],
  eligibleSubjects: ['engineering'],
  applicationDeadline: '2099-12-31',
  applicationStatus: 'open',
  lastVerifiedAt: '2025-01-01',
};

test('only individually verified records tied to an enabled official source are publishable', () => {
  assert.equal(isPublishableScholarship(scholarship, [source]), true);
  assert.equal(isPublishableScholarship({ ...scholarship, verificationStatus: 'pending_verification' }, [source]), false);
  assert.equal(isPublishableScholarship({ ...scholarship, officialApplicationUrl: 'https://fake.example.com/apply' }, [source]), false);
  assert.equal(isPublishableScholarship(scholarship, [{ ...source, enabled: false }]), false);
});

test('nationality, residence, destination and level filters are independent and combined', () => {
  assert.equal(scholarshipMatches(scholarship, { applicantCountry: 'India' }), true);
  assert.equal(scholarshipMatches(scholarship, { residenceCountry: 'IN' }), true);
  assert.equal(scholarshipMatches(scholarship, { destinationCountry: 'Australia', level: 'master' }), true);
  assert.equal(scholarshipMatches(scholarship, { applicantCountry: 'US', destinationCountry: 'AU' }), false);
  assert.equal(scholarshipMatches(scholarship, { destinationCountry: 'IN' }), false);
});

test('disability category filters do not invent category eligibility', () => {
  assert.equal(scholarshipMatches(scholarship, { disability: true }), true);
  assert.equal(scholarshipMatches(scholarship, { disabilityCategory: 'visual impairment' }), true);
  assert.equal(scholarshipMatches(scholarship, { disabilityCategory: 'hearing impairment' }), false);
  assert.equal(scholarshipMatches({ ...scholarship, disabilityCategories: [] }, { disabilityCategory: 'visual impairment' }), false);
});

test('field and institution filters use exact values rather than country matching rules', () => {
  assert.equal(scholarshipMatches({ ...scholarship, eligibleSubjects: ['Engineering'] }, { fieldOfStudy: 'engineering' }), true);
  assert.equal(scholarshipMatches({ ...scholarship, eligibleSubjects: ['All'] }, { fieldOfStudy: 'engineering' }), false);
});

test('featured eligibility is explicit and never inferred from ordinary records', () => {
  assert.equal(scholarshipMatches({ ...scholarship, featured: true }, { featured: true }), true);
  assert.equal(scholarshipMatches(scholarship, { featured: true }), false);
});

test('academic, income, age, gender and financial-need filters honor published criteria', () => {
  const record = {
    ...scholarship,
    minimumGpa: 3,
    maximumIncome: 50000,
    minimumAge: 18,
    maximumAge: 30,
    genderEligibility: 'female',
    financialNeedRequired: true,
  };
  assert.equal(scholarshipMatches(record, {
    gpa: 3.2,
    maximumIncome: 45000,
    age: 24,
    gender: 'female',
    financialNeed: true,
  }), true);
  assert.equal(scholarshipMatches(record, { gpa: 2.8 }), false);
  assert.equal(scholarshipMatches(record, { maximumIncome: 55000 }), false);
  assert.equal(scholarshipMatches(record, { age: 31 }), false);
  assert.equal(scholarshipMatches(record, { gender: 'male' }), false);
  assert.equal(scholarshipMatches(record, { financialNeed: false }), false);
});

test('unknown deadlines do not appear open and past deadlines expire', () => {
  assert.equal(getApplicationStatus({ verificationStatus: 'verified', applicationStatus: 'open' }, new Date('2026-01-01')), 'open');
  assert.equal(getApplicationStatus({ verificationStatus: 'verified' }, new Date('2026-01-01')), 'unknown');
  assert.equal(getApplicationStatus({
    verificationStatus: 'verified',
    applicationStatus: 'open',
    applicationDeadline: '2026-01-05',
  }, new Date('2026-01-01')), 'deadline_approaching');
  assert.equal(getApplicationStatus({
    verificationStatus: 'verified',
    applicationStatus: 'open',
    applicationDeadline: '2025-12-31',
  }, new Date('2026-01-01')), 'expired');
});

test('search query validates pagination, booleans and sort order', () => {
  assert.deepEqual(parseSearchQuery({ page: '2', limit: '20', disability: 'true', sort: 'deadline' }).value, {
    page: 2,
    limit: 20,
    disability: true,
    sort: 'deadline',
  });
  assert.match(parseSearchQuery({ page: '0' }).error, /positive integer/);
  assert.match(parseSearchQuery({ limit: '200' }).error, /between 1 and 100/);
  assert.match(parseSearchQuery({ sort: 'random' }).error, /sort/);
  assert.match(parseSearchQuery({ deadlineBefore: '2025-02-31' }).error, /YYYY-MM-DD/);
  assert.equal(parseSearchQuery({ sort: 'funding' }).value.sort, 'funding');
  assert.equal(parseSearchQuery({ sort: 'new' }).value.sort, 'new');
});

test('listing sort options use published funding and discovery dates', () => {
  const records = [
    { scholarshipId: 'partial', fundingType: 'partial', lastUpdatedAt: '2026-11-12', firstDiscoveredAt: '2026-11-12' },
    { scholarshipId: 'full', fundingType: 'full', lastUpdatedAt: '2026-11-10', firstDiscoveredAt: '2026-11-10' },
    { scholarshipId: 'newer', fundingType: 'partial', lastUpdatedAt: '2026-11-13', firstDiscoveredAt: '2026-11-13' },
  ];
  assert.deepEqual(sortScholarships(records, 'funding').map((item) => item.scholarshipId), ['full', 'newer', 'partial']);
  assert.deepEqual(sortScholarships(records, 'new').map((item) => item.scholarshipId), ['newer', 'partial', 'full']);
  assert.deepEqual(sortScholarships(records, 'latest').map((item) => item.scholarshipId), ['newer', 'partial', 'full']);
});
