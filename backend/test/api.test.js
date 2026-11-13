const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const app = require('../server');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test('health endpoint responds', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
});

test('country and official source catalogs are returned independently of scholarship records', async () => {
  const countries = await (await fetch(`${baseUrl}/api/countries`)).json();
  const sourcesResponse = await fetch(`${baseUrl}/api/sources`);
  const sources = await sourcesResponse.json();
  assert.ok(countries.countries.some((country) => country.code === 'IN'));
  assert.ok(countries.countries.some((country) => country.code === 'AU'));
  assert.ok(sources.count > 0);
  assert.ok(sources.sources.every((source) => source.integrationMethod === 'manual_verification'));
});

test('country landing and scholarship detail paths serve the existing frontend app', async () => {
  for (const route of ['/scholarships/india', '/scholarships/usa', '/scholarships/australia', '/scholarship/sample-award']) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /AccessScholar/);
  }
});

test('robots and sitemap endpoints expose crawlable country landing pages', async () => {
  const [robotsResponse, sitemapResponse] = await Promise.all([
    fetch(`${baseUrl}/robots.txt`),
    fetch(`${baseUrl}/sitemap.xml`),
  ]);
  assert.equal(robotsResponse.status, 200);
  assert.match(await robotsResponse.text(), /Sitemap: .*\/sitemap\.xml/);
  assert.equal(sitemapResponse.status, 200);
  const sitemap = await sitemapResponse.text();
  assert.match(sitemap, /\/scholarships\/india/);
  assert.match(sitemap, /\/scholarships\/usa/);
});

test('category and featured endpoints respond with structured data', async () => {
  const [categoriesResponse, featuredResponse] = await Promise.all([
    fetch(`${baseUrl}/api/categories`),
    fetch(`${baseUrl}/api/scholarships/featured`),
  ]);
  assert.equal(categoriesResponse.status, 200);
  const categories = (await categoriesResponse.json()).categories;
  for (const category of ['Government', 'University', 'Private Foundation', 'Disability Scholarship', 'Research Funding', 'International Scholarship', 'Merit-Based', 'Need-Based']) {
    assert.ok(categories.includes(category));
  }
  assert.equal(featuredResponse.status, 200);
  assert.ok(Array.isArray((await featuredResponse.json()).scholarships));
});

test('scholarship API returns genuine results and honest empty results for unmatched criteria', async () => {
  // 1. Search for genuine opportunities in India
  const indiaResponse = await fetch(`${baseUrl}/api/scholarships/search?destinationCountry=IN`);
  assert.equal(indiaResponse.status, 200);
  const indiaBody = await indiaResponse.json();
  assert.ok(indiaBody.scholarships.length > 0);
  assert.ok(indiaBody.pagination.total >= 10);
  assert.ok(indiaBody.scholarships.some((s) => s.scholarshipName.includes('AICTE') || s.scholarshipName.includes('Saksham')));

  // 2. Search for genuine opportunities in Australia
  const ausResponse = await fetch(`${baseUrl}/api/scholarships/search?destinationCountry=AU`);
  assert.equal(ausResponse.status, 200);
  const ausBody = await ausResponse.json();
  assert.ok(ausBody.scholarships.length > 0);
  assert.ok(ausBody.scholarships.some((s) => s.scholarshipName.includes('Australia Awards') || s.scholarshipName.includes('Research Training Program')));

  // 3. Indian applicant wanting to study in Australia
  const indToAusResponse = await fetch(`${baseUrl}/api/scholarships/search?applicantCountry=IN&destinationCountry=AU`);
  assert.equal(indToAusResponse.status, 200);
  const indToAusBody = await indToAusResponse.json();
  assert.ok(indToAusBody.scholarships.length > 0);

  // 4. Searches with non-matching criteria return honest empty results and pagination
  const emptyCases = [
    'q=nonexistentkeywordxyz987',
    'destinationCountry=IN&level=vocational&maximumIncome=100&gpa=5.0',
  ];
  for (const filters of emptyCases) {
    const response = await fetch(`${baseUrl}/api/scholarships/search?${filters}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.scholarships, []);
    assert.deepEqual(body.pagination, { page: 1, limit: 12, total: 0, totalPages: 0 });
  }
});

test('official announcements awaiting review are visible separately from verified results', async () => {
  const [verifiedResponse, pendingResponse] = await Promise.all([
    fetch(`${baseUrl}/api/scholarships/search?applicantCountry=IN&destinationCountry=IN`),
    fetch(`${baseUrl}/api/scholarships/awaiting-verification?applicantCountry=IN&destinationCountry=IN&level=school&disability=true`),
  ]);
  assert.equal(verifiedResponse.status, 200);
  const verified = await verifiedResponse.json();
  assert.ok(verified.scholarships.length > 0);
  assert.ok(verified.scholarships.every((s) => s.verificationStatus === 'verified'));

  assert.equal(pendingResponse.status, 200);
  const pending = await pendingResponse.json();
  assert.equal(pending.pagination.total, 1);
  assert.equal(pending.scholarships[0].verificationStatus, 'awaiting_verification');
  assert.equal(pending.scholarships[0].applicationStatus, 'open');
  assert.equal(pending.scholarships[0].sourceCheckedAt, '2026-11-12T11:26:41.000Z');
  assert.match(pending.scholarships[0].scholarshipName, /PM YASASVI/);
  assert.equal(pending.scholarships[0].officialSourceUrl, 'https://scholarships.gov.in/ViewMoreAnnouncement');
  assert.match(pending.notice, /awaiting full verification/);
});

test('invalid pagination and unsupported countries are reported as client errors', async () => {
  const badPagination = await fetch(`${baseUrl}/api/scholarships?page=0`);
  assert.equal(badPagination.status, 400);
  const oldCountryParam = await fetch(`${baseUrl}/api/scholarships?country=India`);
  assert.equal(oldCountryParam.status, 400);
});

test('detail requests do not expose unverified or absent records', async () => {
  const response = await fetch(`${baseUrl}/api/scholarships/no-such-record`);
  assert.equal(response.status, 404);
});

test('security headers are sent and cross-origin access is not enabled', async () => {
  const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://example.invalid' } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('country API supplies real verified counts and profile matching compares against verified records', async () => {
  const countriesResponse = await fetch(`${baseUrl}/api/countries`);
  const countries = (await countriesResponse.json()).countries;
  assert.ok(countries.every((country) => Number.isInteger(country.verifiedScholarshipCount)));
  // Every one of the 15 countries now has active verified scholarships!
  assert.ok(countries.every((country) => country.verifiedScholarshipCount > 0));

  const matchesResponse = await fetch(`${baseUrl}/api/scholarships/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ applicantCountry: 'IN', destinationCountry: 'US', level: 'master' }),
  });
  assert.equal(matchesResponse.status, 200);
  assert.equal(matchesResponse.headers.get('cache-control'), 'no-store');
  const matches = await matchesResponse.json();
  assert.ok(matches.counts.strongMatch > 0 || matches.counts.possibleMatch > 0);

  const invalidProfile = await fetch(`${baseUrl}/api/scholarships/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disabilityStatus: 'maybe' }),
  });
  assert.equal(invalidProfile.status, 400);
});

test('reports are validated, rate limited, and require a verified scholarship ID', async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invalid = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scholarshipId: 'not-an-id', reason: 'expired_deadline', details: 'This deadline needs review.' }),
    });
    assert.equal(invalid.status, 404);
  }
  const limited = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scholarshipId: 'not-an-id', reason: 'expired_deadline', details: 'This deadline needs review.' }),
  });
  assert.equal(limited.status, 429);
});

test('admin report access requires the server-side token', async () => {
  const originalToken = process.env.ADMIN_API_TOKEN;
  process.env.ADMIN_API_TOKEN = 'test-only-admin-token';
  try {
    const unauthorized = await fetch(`${baseUrl}/api/admin/reports`);
    assert.equal(unauthorized.status, 401);
    const authorized = await fetch(`${baseUrl}/api/admin/reports`, {
      headers: { Authorization: 'Bearer test-only-admin-token' },
    });
    assert.equal(authorized.status, 200);
    assert.ok(Array.isArray((await authorized.json()).reports));
    const adminPage = await fetch(`${baseUrl}/admin`);
    assert.equal(adminPage.status, 200);
    assert.match(await adminPage.text(), /Scholarship report review/);
  } finally {
    if (originalToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = originalToken;
  }
});

test('admin catalog endpoints work in JSON mode when configured with a token', async () => {
  const originalToken = process.env.ADMIN_API_TOKEN;
  process.env.ADMIN_API_TOKEN = 'test-only-admin-token';
  try {
    const response = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { Authorization: 'Bearer test-only-admin-token' },
    });
    assert.equal(response.status, 200);
    const dashboard = await response.json();
    assert.equal(dashboard.storage, 'json_development_fallback');
    assert.equal(dashboard.summary.pendingVerification, 1);

    const queueResponse = await fetch(`${baseUrl}/api/admin/scholarships?verificationStatus=awaiting_verification`, {
      headers: { Authorization: 'Bearer test-only-admin-token' },
    });
    assert.equal(queueResponse.status, 200);
    assert.equal((await queueResponse.json()).scholarships.length, 1);
  } finally {
    if (originalToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = originalToken;
  }
});

test('verified CSV import appears in scholarship search without PostgreSQL', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'accessscholar-api-'));
  const originalToken = process.env.ADMIN_API_TOKEN;
  const originalDataDirectory = process.env.ACCESS_SCHOLAR_DATA_DIR;
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'countries.json'), path.join(directory, 'countries.json'));
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
  process.env.ADMIN_API_TOKEN = 'test-only-admin-token';
  process.env.ACCESS_SCHOLAR_DATA_DIR = directory;
  const record = {
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
  const csvValue = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = `${Object.keys(record).join(',')}\n${Object.values(record).map(csvValue).join(',')}`;
  try {
    const importResponse = await fetch(`${baseUrl}/api/admin/import-csv`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-only-admin-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ csv }),
    });
    assert.equal(importResponse.status, 201);
    assert.equal((await importResponse.json()).imported, 1);

    const searchResponse = await fetch(`${baseUrl}/api/scholarships?destinationCountry=IN`);
    assert.equal(searchResponse.status, 200);
    const results = await searchResponse.json();
    assert.equal(results.pagination.total, 1);
    assert.equal(results.scholarships[0].scholarshipName, record.title);
  } finally {
    if (originalToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = originalToken;
    if (originalDataDirectory === undefined) delete process.env.ACCESS_SCHOLAR_DATA_DIR;
    else process.env.ACCESS_SCHOLAR_DATA_DIR = originalDataDirectory;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('privacy, terms, and accessibility pages are served', async () => {
  for (const page of ['/privacy.html', '/terms.html', '/accessibility.html']) {
    const response = await fetch(`${baseUrl}${page}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<main/);
  }
});

test('destinations including Singapore, Sweden, and South Korea return genuine verified opportunities', async () => {
  for (const [code, slug] of [['SG', 'singapore'], ['SE', 'sweden'], ['KR', 'south-korea']]) {
    const res = await fetch(`${baseUrl}/api/scholarships?destinationCountry=${code}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.scholarships.length > 0, `Expected verified scholarships for ${code}`);
    assert.ok(body.pagination.total > 0);
    assert.ok(body.scholarships.every((s) => s.verificationStatus === 'verified'));
  }
});

test('scholarship detail endpoint returns verified record with official links', async () => {
  const res = await fetch(`${baseUrl}/api/scholarships/singapore-international-graduate-award-singa`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.scholarship);
  assert.equal(data.scholarship.scholarshipId, 'singapore-international-graduate-award-singa');
  assert.equal(data.scholarship.verificationStatus, 'verified');
  assert.match(data.scholarship.officialApplicationUrl, /^https:\/\//);
});

test('admin export-csv endpoint produces valid CSV file', async () => {
  const originalToken = process.env.ADMIN_API_TOKEN;
  process.env.ADMIN_API_TOKEN = 'test-only-admin-token';
  try {
    const res = await fetch(`${baseUrl}/api/admin/export-csv`, {
      headers: { Authorization: 'Bearer test-only-admin-token' },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    const csvText = await res.text();
    assert.match(csvText, /source_record_id,title,slug/);
    assert.ok(csvText.split('\n').length >= 10);
  } finally {
    if (originalToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = originalToken;
  }
});
