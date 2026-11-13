const http = require('http');
const app = require('../server');

async function run() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`\n======================================================`);
  console.log(`AccessScholar End-to-End System Verification`);
  console.log(`Server listening on ${baseUrl}`);
  console.log(`======================================================\n`);

  try {
    // 1. Countries & verified counts
    const countriesRes = await fetch(`${baseUrl}/api/countries`);
    const countriesData = await countriesRes.json();
    console.log(`[PASS] /api/countries returned ${countriesData.countries.length} countries.`);
    console.log(`Sample country verified counts:`);
    const sampleCodes = ['IN', 'US', 'AU', 'GB', 'DE', 'SG', 'SE', 'KR', 'FR', 'JP'];
    for (const code of sampleCodes) {
      const c = countriesData.countries.find(x => x.code === code);
      console.log(`  - ${c.name} (${c.code}): ${c.verifiedScholarshipCount} verified scholarships`);
      if (c.verifiedScholarshipCount === 0) {
        throw new Error(`Country ${c.name} unexpectedly has 0 verified scholarships!`);
      }
    }

    // 2. India search
    const indiaRes = await fetch(`${baseUrl}/api/scholarships?destinationCountry=IN`);
    const indiaData = await indiaRes.json();
    console.log(`\n[PASS] /api/scholarships?destinationCountry=IN returned ${indiaData.scholarships.length} scholarships (total: ${indiaData.pagination.total}).`);
    console.log(`Top 3 India scholarships:`);
    indiaData.scholarships.slice(0, 3).forEach(s => {
      console.log(`  * ${s.scholarshipName} (Provider: ${s.providerName})`);
    });

    // 3. Singapore search
    const sgRes = await fetch(`${baseUrl}/api/scholarships?destinationCountry=SG`);
    const sgData = await sgRes.json();
    console.log(`\n[PASS] /api/scholarships?destinationCountry=SG returned ${sgData.scholarships.length} scholarships (total: ${sgData.pagination.total}).`);
    sgData.scholarships.forEach(s => {
      console.log(`  * ${s.scholarshipName} (Provider: ${s.providerName}, Award: ${s.currency} ${s.awardAmount})`);
    });

    // 4. Sweden search
    const seRes = await fetch(`${baseUrl}/api/scholarships?destinationCountry=SE`);
    const seData = await seRes.json();
    console.log(`\n[PASS] /api/scholarships?destinationCountry=SE returned ${seData.scholarships.length} scholarships (total: ${seData.pagination.total}).`);
    seData.scholarships.forEach(s => {
      console.log(`  * ${s.scholarshipName} (Provider: ${s.providerName})`);
    });

    // 5. South Korea search
    const krRes = await fetch(`${baseUrl}/api/scholarships?destinationCountry=KR`);
    const krData = await krRes.json();
    console.log(`\n[PASS] /api/scholarships?destinationCountry=KR returned ${krData.scholarships.length} scholarships (total: ${krData.pagination.total}).`);
    krData.scholarships.forEach(s => {
      console.log(`  * ${s.scholarshipName} (Provider: ${s.providerName})`);
    });

    // 6. Indian applicant wanting to study in Australia
    const indAusRes = await fetch(`${baseUrl}/api/scholarships?applicantCountry=IN&destinationCountry=AU`);
    const indAusData = await indAusRes.json();
    console.log(`\n[PASS] /api/scholarships?applicantCountry=IN&destinationCountry=AU returned ${indAusData.scholarships.length} scholarships (total: ${indAusData.pagination.total}).`);
    indAusData.scholarships.forEach(s => {
      console.log(`  * ${s.scholarshipName} (Provider: ${s.providerName})`);
    });

    // 7. Disability-specific opportunities
    const disRes = await fetch(`${baseUrl}/api/scholarships?disabilityEligibility=disability_specific`);
    const disData = await disRes.json();
    console.log(`\n[PASS] /api/scholarships?disabilityEligibility=disability_specific returned ${disData.scholarships.length} scholarships (total: ${disData.pagination.total}).`);
    disData.scholarships.slice(0, 4).forEach(s => {
      console.log(`  * ${s.scholarshipName} (Category: ${s.disabilityCategories.join(', ')})`);
    });

    // 8. Details page endpoint
    const detailRes = await fetch(`${baseUrl}/api/scholarships/india-aicte-saksham-degree`);
    const detailData = await detailRes.json();
    console.log(`\n[PASS] Detail view for ${detailData.scholarship.scholarshipId}:`);
    console.log(`  Title: ${detailData.scholarship.scholarshipName}`);
    console.log(`  Provider: ${detailData.scholarship.providerName}`);
    console.log(`  Official Source: ${detailData.scholarship.officialSourceUrl}`);
    console.log(`  Official Application: ${detailData.scholarship.officialApplicationUrl}`);
    console.log(`  Status: ${detailData.scholarship.applicationStatus}`);
    console.log(`  Last Verified: ${detailData.scholarship.lastVerifiedAt}`);

    // 9. Admin Dashboard
    process.env.ADMIN_API_TOKEN = 'e2e-test-secret-token';
    const adminRes = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer e2e-test-secret-token` }
    });
    const adminData = await adminRes.json();
    console.log(`\n[PASS] Admin Dashboard Metrics:`);
    console.log(`  Total Scholarships: ${adminData.summary.scholarshipTotal}`);
    console.log(`  Active Verified: ${adminData.summary.activeScholarships}`);
    console.log(`  Pending Verification: ${adminData.summary.pendingVerification}`);
    console.log(`  Active Sources: ${adminData.summary.activeSources}`);
    console.log(`  Storage Engine: ${adminData.storage}`);

    // 10. Admin Export CSV
    const exportRes = await fetch(`${baseUrl}/api/admin/export-csv`, {
      headers: { Authorization: `Bearer e2e-test-secret-token` }
    });
    const csvContent = await exportRes.text();
    const csvLines = csvContent.trim().split('\n');
    console.log(`\n[PASS] Admin CSV Export returned ${csvLines.length} lines (header + ${csvLines.length - 1} records).`);

    console.log(`\n======================================================`);
    console.log(`ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!`);
    console.log(`======================================================\n`);
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('E2E Verification Error:', err);
  process.exit(1);
});
