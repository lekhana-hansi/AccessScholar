const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv } = require('../services/importService');
const { applicationStatusFor, buildSearchWhere } = require('../services/scholarshipRepository');
const { getApplicationStatus } = require('../services/scholarshipService');
const { isAllowedEndpoint } = require('../worker');

test('CSV parser preserves quoted commas, escaped quotes, and embedded newlines', () => {
  const rows = parseCsv('title,description\r\n"Grant, for students","Line one\nLine ""two"""');
  assert.deepEqual(rows, [{
    title: 'Grant, for students',
    description: 'Line one\nLine "two"',
  }]);
});

test('CSV parser rejects duplicate headers, unsupported fields, and malformed rows', () => {
  assert.throws(() => parseCsv('title,title\none,two'), /unique/);
  assert.throws(() => parseCsv('title,internal_sql\none,two'), /Unsupported CSV field/);
  assert.throws(() => parseCsv('title,provider_name\none'), /unexpected number/);
  assert.throws(() => parseCsv('title\n"unclosed'), /unclosed quoted/);
});

test('database search clauses use bound values and preserve unknown eligibility in pending results', () => {
  const query = { applicantCountry: 'IN', destinationCountry: 'AU', page: 1, limit: 12, sort: 'latest' };
  const pending = buildSearchWhere(query, { includeUnverified: true });
  assert.match(pending.where, /verification_status = 'awaiting_verification'/);
  assert.match(pending.where, /cardinality\(s\.applicant_nationalities\) = 0/);
  assert.deepEqual(pending.values, ['IN', 'AU']);

  const verified = buildSearchWhere(query);
  assert.match(verified.where, /verification_status = 'verified'/);
  assert.doesNotMatch(verified.where, /cardinality/);
  assert.deepEqual(verified.values, ['IN', 'AU']);
});

test('application deadline is evaluated in the provider timezone', () => {
  const status = applicationStatusFor({
    applicationStatus: 'open',
    applicationDeadline: '2026-11-12',
    deadline_timezone: 'Asia/Kolkata',
  }, new Date('2026-11-12T19:00:00.000Z'));
  assert.equal(status, 'expired');
});

test('pending records show open only when the official source check is recorded', () => {
  const pending = {
    applicationStatus: 'open',
    verificationStatus: 'awaiting_verification',
    sourceCheckedAt: '2026-11-12T11:26:41.000Z',
  };
  assert.equal(getApplicationStatus(pending), 'open');
  assert.equal(getApplicationStatus({ ...pending, sourceCheckedAt: null }), 'unknown');
});

test('automated feed endpoints must remain on the registered official HTTPS host', () => {
  const source = {
    official_website: 'https://scholarships.gov.in/',
    approved_application_hosts: ['apply.scholarships.gov.in'],
  };
  assert.equal(isAllowedEndpoint('https://scholarships.gov.in/official-feed.json', source), true);
  assert.equal(isAllowedEndpoint('https://apply.scholarships.gov.in/feed.json', source), true);
  assert.equal(isAllowedEndpoint('https://scholarships.gov.in.attacker.example/feed.json', source), false);
  assert.equal(isAllowedEndpoint('http://scholarships.gov.in/feed.json', source), false);
  assert.equal(isAllowedEndpoint('https://user:pass@scholarships.gov.in/feed.json', source), false);
});
