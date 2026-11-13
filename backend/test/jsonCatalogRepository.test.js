const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { importCsv } = require('../services/jsonCatalogRepository');
const { isPublishableScholarship } = require('../services/scholarshipService');

const makeCsv = (record) => {
  const headers = Object.keys(record);
  const values = headers.map((header) => `"${String(record[header]).replaceAll('"', '""')}"`);
  return `${headers.join(',')}\n${values.join(',')}`;
};

const createTempCatalog = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'accessscholar-catalog-'));
  fs.writeFileSync(path.join(directory, 'sources.json'), JSON.stringify([{
    id: 'india-national-scholarship-portal',
    name: 'National Scholarship Portal',
    country: 'India',
    url: 'https://scholarships.gov.in/',
    applicationHosts: ['scholarships.gov.in'],
    integrationMethod: 'manual_verification',
    enabled: true,
  }]));
  fs.writeFileSync(path.join(directory, 'scholarships.json'), JSON.stringify({ scholarships: [] }));
  return directory;
};

const validRecord = {
  source_record_id: 'official-award-001',
  title: 'Official University Access Grant',
  slug: 'official-university-access-grant',
  provider_name: 'Government of India',
  description: 'Funding details published by the official provider.',
  eligibility_description: 'Review the complete criteria on the official source.',
  category: 'Government',
  scholarship_type: 'Government Scholarship',
  study_levels: 'undergraduate',
  destination_countries: 'IN',
  disability_eligibility: 'no_published_restriction',
  official_source_url: 'https://scholarships.gov.in/official-award',
  official_application_url: 'https://scholarships.gov.in/apply',
  source_id: 'india-national-scholarship-portal',
  verification_status: 'verified',
  application_status: 'open',
  last_verified_at: '2026-11-12T10:00:00.000Z',
  last_source_checked_at: '2026-11-12T10:00:00.000Z',
};

test('JSON fallback imports official CSV records into the catalog used by search', async () => {
  const directory = createTempCatalog();
  const previousDirectory = process.env.ACCESS_SCHOLAR_DATA_DIR;
  process.env.ACCESS_SCHOLAR_DATA_DIR = directory;
  try {
    const first = await importCsv(makeCsv(validRecord));
    const data = JSON.parse(fs.readFileSync(path.join(directory, 'scholarships.json'), 'utf8'));
    const sources = JSON.parse(fs.readFileSync(path.join(directory, 'sources.json'), 'utf8'));
    assert.equal(first.imported, 1);
    assert.equal(data.scholarships.length, 1);
    assert.equal(data.scholarships[0].verificationStatus, 'verified');
    const firstDiscoveredAt = data.scholarships[0].firstDiscoveredAt;
    assert.ok(Number.isFinite(Date.parse(firstDiscoveredAt)));
    assert.ok(Number.isFinite(Date.parse(data.scholarships[0].lastUpdatedAt)));
    assert.equal(isPublishableScholarship(data.scholarships[0], sources), true);

    const second = await importCsv(makeCsv(validRecord));
    const updated = JSON.parse(fs.readFileSync(path.join(directory, 'scholarships.json'), 'utf8'));
    assert.equal(second.updated, 1);
    assert.equal(updated.scholarships.length, 1);
    assert.equal(updated.scholarships[0].firstDiscoveredAt, firstDiscoveredAt);
    assert.ok(Number.isFinite(Date.parse(updated.scholarships[0].lastUpdatedAt)));
  } finally {
    if (previousDirectory === undefined) delete process.env.ACCESS_SCHOLAR_DATA_DIR;
    else process.env.ACCESS_SCHOLAR_DATA_DIR = previousDirectory;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('JSON fallback rejects an application link outside the registered official hosts', async () => {
  const directory = createTempCatalog();
  const previousDirectory = process.env.ACCESS_SCHOLAR_DATA_DIR;
  process.env.ACCESS_SCHOLAR_DATA_DIR = directory;
  try {
    const result = await importCsv(makeCsv({
      ...validRecord,
      official_application_url: 'https://unrelated.example/apply',
    }));
    const data = JSON.parse(fs.readFileSync(path.join(directory, 'scholarships.json'), 'utf8'));
    assert.equal(result.imported, 0);
    assert.equal(result.rejected.length, 1);
    assert.match(result.rejected[0].error, /approved source or application host/);
    assert.equal(data.scholarships.length, 0);
  } finally {
    if (previousDirectory === undefined) delete process.env.ACCESS_SCHOLAR_DATA_DIR;
    else process.env.ACCESS_SCHOLAR_DATA_DIR = previousDirectory;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
