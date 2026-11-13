const express = require('express');
const { timingSafeEqual } = require('crypto');
const { getScholarshipById } = require('../services/scholarshipService');
const {
  allowedReasons,
  createReport,
  readReports,
  updateReportStatus,
} = require('../services/reportService');
const { matchRecords, matchScholarships } = require('../services/matchingService');
const database = require('../database/pool');
const repository = require('../services/scholarshipRepository');

const router = express.Router();
const reportAttempts = new Map();
const adminAttempts = new Map();
const reasons = new Set(allowedReasons);
const profileFields = new Set([
  'applicantCountry',
  'residenceCountry',
  'destinationCountry',
  'level',
  'fieldOfStudy',
  'academicQualification',
  'gpa',
  'age',
  'income',
  'financialNeed',
  'disabilityStatus',
  'disabilityCategory',
  'fundingType',
]);

const rateLimitReports = (req, res, next) => {
  const now = Date.now();
  const key = req.ip;
  const windowMs = 15 * 60 * 1000;
  const current = reportAttempts.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    reportAttempts.set(key, { startedAt: now, count: 1 });
    return next();
  }
  if (current.count >= 5) {
    res.set('Retry-After', String(Math.ceil((windowMs - (now - current.startedAt)) / 1000)));
    return res.status(429).json({ error: 'Too many reports. Please try again later.' });
  }
  current.count += 1;
  next();
};

const rateLimitAdmin = (req, res, next) => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const key = req.ip;
  const current = adminAttempts.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    adminAttempts.set(key, { startedAt: now, count: 1 });
    return next();
  }
  if (current.count >= 30) {
    res.set('Retry-After', String(Math.ceil((windowMs - (now - current.startedAt)) / 1000)));
    return res.status(429).json({ error: 'Too many admin requests. Please try again later.' });
  }
  current.count += 1;
  next();
};

const isAdmin = (req) => {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) return null;
  const authorization = req.get('authorization') || '';
  const supplied = Buffer.from(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};

const validateProfile = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Profile must be an object.';
  if (Object.keys(input).some((key) => !profileFields.has(key))) return 'Profile contains an unsupported field.';
  const profile = {
    applicantCountry: '',
    residenceCountry: '',
    destinationCountry: '',
    level: '',
    fieldOfStudy: '',
    academicQualification: '',
    disabilityCategory: '',
    disabilityStatus: 'unspecified',
    financialNeed: null,
    fundingType: '',
    gpa: null,
    age: null,
    income: null,
  };
  for (const key of ['applicantCountry', 'residenceCountry', 'destinationCountry', 'level', 'fieldOfStudy', 'academicQualification', 'disabilityCategory', 'fundingType']) {
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string' || value.length > 100) return `${key} must be a text value of 100 characters or fewer.`;
    profile[key] = value.trim();
  }
  if (input.disabilityStatus !== undefined) {
    if (!['yes', 'no', 'unspecified'].includes(input.disabilityStatus)) return 'disabilityStatus is not supported.';
    profile.disabilityStatus = input.disabilityStatus;
  }
  if (input.financialNeed !== undefined && input.financialNeed !== null) {
    if (typeof input.financialNeed !== 'boolean') return 'financialNeed must be true, false, or null.';
    profile.financialNeed = input.financialNeed;
  }
  for (const key of ['gpa', 'age', 'income']) {
    if (input[key] === undefined || input[key] === null || input[key] === '') continue;
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < 0) {
      return `${key} must be a non-negative number.`;
    }
    if (key === 'age' && (!Number.isInteger(input.age) || input.age > 150)) return 'age must be a whole number between 0 and 150.';
    profile[key] = input[key];
  }
  if (profile.fundingType && !['full', 'partial'].includes(profile.fundingType)) return 'fundingType must be full or partial.';
  return profile;
};

router.post('/scholarships/matches', async (req, res, next) => {
  const profile = validateProfile(req.body);
  if (typeof profile === 'string') return res.status(400).json({ error: profile });
  try {
    const groups = database.isConfigured
      ? matchRecords(profile, await repository.getVerifiedRecordsForMatching())
      : matchScholarships(profile);
    res.set('Cache-Control', 'no-store');
    res.json({
      strongMatch: groups.strongMatch,
      possibleMatch: groups.possibleMatch,
      notEligible: groups.notEligible,
      counts: {
        strongMatch: groups.strongMatch.length,
        possibleMatch: groups.possibleMatch.length,
        notEligible: groups.notEligible.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reports', rateLimitReports, async (req, res, next) => {
  const { scholarshipId, reason, details } = req.body || {};
  if (typeof scholarshipId !== 'string' || !/^[a-zA-Z0-9._-]{1,120}$/.test(scholarshipId)) {
    return res.status(400).json({ error: 'A valid scholarship ID is required.' });
  }
  if (!reasons.has(reason)) return res.status(400).json({ error: 'Select a supported report reason.' });
  if (typeof details !== 'string' || details.trim().length < 10 || details.length > 1000) {
    return res.status(400).json({ error: 'Report details must be between 10 and 1000 characters.' });
  }
  try {
    const scholarship = database.isConfigured
      ? await repository.getScholarshipById(scholarshipId)
      : getScholarshipById(scholarshipId);
    if (!scholarship) {
      return res.status(404).json({ error: 'No verified scholarship matches the requested ID.' });
    }
    const report = createReport({ scholarshipId, reason, details });
    res.status(201).json({
      reportId: report.id,
      status: report.status,
      message: 'Your report has been recorded for admin review; it does not change the published listing.',
    });
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ error: error.message });
    next(error);
  }
});

router.get('/admin/reports', rateLimitAdmin, (req, res, next) => {
  const authorized = isAdmin(req);
  if (authorized === null) return res.status(503).json({ error: 'Admin access is not configured.' });
  if (!authorized) return res.status(401).json({ error: 'Admin authorization is required.' });
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ reports: readReports() });
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/reports/:id', rateLimitAdmin, (req, res, next) => {
  const authorized = isAdmin(req);
  if (authorized === null) return res.status(503).json({ error: 'Admin access is not configured.' });
  if (!authorized) return res.status(401).json({ error: 'Admin authorization is required.' });
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid report ID.' });
  if (!req.body || !['reviewed', 'dismissed'].includes(req.body.status)) {
    return res.status(400).json({ error: 'Status must be reviewed or dismissed.' });
  }
  try {
    const report = updateReportStatus(req.params.id, req.body.status);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    res.json({ report });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
