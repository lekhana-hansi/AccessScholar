const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const reportsPath = path.join(__dirname, '..', 'data', 'reports.json');
const allowedReasons = new Set([
  'expired_deadline',
  'incorrect_details',
  'broken_application_url',
  'incorrect_eligibility',
  'incorrect_provider_logo',
]);
const allowedStatuses = new Set(['pending', 'reviewed', 'dismissed']);

const readReports = () => {
  if (!fs.existsSync(reportsPath)) return [];
  const data = JSON.parse(fs.readFileSync(reportsPath, 'utf8'));
  if (!Array.isArray(data.reports)) throw new Error('Report data must contain a reports array.');
  return data.reports;
};

const writeReports = (reports) => {
  const temporaryPath = `${reportsPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify({ reports }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, reportsPath);
};

const createReport = ({ scholarshipId, reason, details }) => {
  if (!allowedReasons.has(reason)) throw new TypeError('Select a supported report reason.');
  const description = String(details || '').trim();
  if (description.length < 10 || description.length > 1000) {
    throw new TypeError('Report details must be between 10 and 1000 characters.');
  }
  const report = {
    id: randomUUID(),
    scholarshipId,
    reason,
    details: description,
    status: 'pending',
    submittedAt: new Date().toISOString(),
  };
  writeReports([...readReports(), report]);
  return report;
};

const updateReportStatus = (id, status) => {
  if (!allowedStatuses.has(status) || status === 'pending') {
    throw new TypeError('Select reviewed or dismissed as the report status.');
  }
  const reports = readReports();
  const index = reports.findIndex((report) => report.id === id);
  if (index === -1) return null;
  reports[index] = { ...reports[index], status, reviewedAt: new Date().toISOString() };
  writeReports(reports);
  return reports[index];
};

module.exports = { allowedReasons, allowedStatuses, createReport, readReports, updateReportStatus };
