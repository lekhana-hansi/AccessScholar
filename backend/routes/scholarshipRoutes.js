const express = require('express');
const database = require('../database/pool');
const repository = require('../services/scholarshipRepository');
const {
  categories,
  getScholarshipById,
  isPublishableScholarship,
  parseSearchQuery,
  readCountries,
  readScholarships,
  readSources,
  searchAwaitingScholarships,
  searchScholarships,
} = require('../services/scholarshipService');

const router = express.Router();

const sendDataError = (res, error, message) => {
  console.error(message, error);
  res.status(500).json({ error: message });
};

const handleSearch = async (req, res, extraFilters = {}) => {
  const parsed = parseSearchQuery(req.query);
  if (parsed.error) {
    return res.status(400).json({
      error: 'Invalid search request.',
      message: parsed.error,
    });
  }

  try {
    const query = { ...parsed.value, ...extraFilters };
    const result = database.isConfigured
      ? await repository.queryScholarships(query)
      : searchScholarships({ query });
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      count: result.pagination.total,
      scholarships: result.scholarships,
      pagination: result.pagination,
    });
  } catch (error) {
    if (database.isConfigured) {
      console.error('PostgreSQL scholarship query failed; no static fallback was used.', error);
      return res.status(503).json({
        error: 'Scholarship database is unavailable.',
        message: 'The database could not be reached. Existing records were not replaced with sample data.',
      });
    }
    sendDataError(res, error, 'Unable to load scholarship data.');
  }
};

router.get('/health', async (req, res) => {
  let databaseStatus = { configured: false, connected: false };
  if (database.isConfigured) {
    try {
      databaseStatus = await database.checkConnection();
    } catch (error) {
      console.error('PostgreSQL health check failed.', error);
      return res.status(503).json({
        status: 'degraded',
        service: 'AccessScholar API',
        storage: 'postgresql',
        database: { configured: true, connected: false },
        message: 'Scholarship database is unavailable.',
        timestamp: new Date().toISOString(),
      });
    }
  }
  res.json({
    status: 'ok',
    service: 'AccessScholar API',
    storage: database.isConfigured ? 'postgresql' : 'json_development_fallback',
    database: databaseStatus,
    timestamp: new Date().toISOString(),
  });
});

router.get('/countries', async (req, res) => {
  try {
    const countries = readCountries();
    if (database.isConfigured) {
      res.set('Cache-Control', 'public, max-age=60');
      return res.json({ countries: await repository.getCountries(countries) });
    }
    const sources = readSources();
    const records = readScholarships()
      .filter((scholarship) => isPublishableScholarship(scholarship, sources));
    const countryCode = (value) => {
      const country = countries.find((item) => item.code.toLowerCase() === String(value).toLowerCase()
        || item.name.toLowerCase() === String(value).toLowerCase());
      return country ? country.code : String(value).toLowerCase();
    };
    const counts = new Map(countries.map((country) => [country.code, 0]));
    records.forEach((scholarship) => {
      const rawDestinations = scholarship.studyDestinationCountries || [];
      const destinations = new Set(rawDestinations.map(countryCode));
      const includesAll = rawDestinations.some((value) => String(value).trim().toLowerCase() === 'all');
      countries.forEach((country) => {
        if (includesAll || destinations.has(country.code)) counts.set(country.code, counts.get(country.code) + 1);
      });
    });
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ countries: countries.map((country) => ({
      ...country,
      verifiedScholarshipCount: counts.get(country.code) || 0,
    })) });
  } catch (error) {
    if (database.isConfigured) {
      console.error('PostgreSQL country query failed.', error);
      return res.status(503).json({ error: 'Scholarship database is unavailable.' });
    }
    sendDataError(res, error, 'Unable to load countries.');
  }
});

router.get('/categories', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ categories });
});

router.get('/sources/status', async (req, res) => {
  try {
    const sources = database.isConfigured
      ? await repository.getSourcesStatus()
      : readSources().map((source) => ({
        ...source,
        lastSyncStatus: 'manual_verification',
        lastError: null,
        lastSuccessfulSync: null,
      }));
    res.set('Cache-Control', 'no-store');
    res.json({
      count: sources.length,
      sources: sources.map((source) => ({
        ...source,
        lastError: source.lastError ? 'Source refresh failed; cached verified records remain available.' : null,
      })),
    });
  } catch (error) {
    console.error('Unable to load source status.', error);
    res.status(503).json({ error: 'Source status is unavailable.' });
  }
});

router.get('/sources', async (req, res) => {
  try {
    const sources = database.isConfigured
      ? (await repository.getSourcesStatus()).filter((source) => source.enabled)
      : readSources().filter((source) => source.enabled);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      count: sources.length,
      sources: sources.map((source) => ({
        ...source,
        accessStatus: source.accessStatus || (source.integrationMethod === 'json_feed'
          ? 'Official structured feed; refresh follows its configured schedule.'
          : 'No permitted structured feed is configured; records require manual verification and import.'),
      })),
    });
  } catch (error) {
    console.error('Unable to load official sources.', error);
    res.status(database.isConfigured ? 503 : 500).json({ error: 'Unable to load official sources.' });
  }
});

router.get('/scholarships/featured', (req, res, next) => handleSearch(req, res, { featured: true }).catch(next));
router.get('/scholarships/search', (req, res, next) => handleSearch(req, res).catch(next));
router.get('/scholarships/awaiting-verification', async (req, res) => {
  const parsed = parseSearchQuery(req.query);
  if (parsed.error) {
    return res.status(400).json({ error: 'Invalid search request.', message: parsed.error });
  }
  try {
    const result = database.isConfigured
      ? await repository.queryAwaitingVerification(parsed.value)
      : searchAwaitingScholarships({ query: parsed.value });
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      count: result.pagination.total,
      scholarships: result.scholarships,
      pagination: result.pagination,
      notice: 'These source records are real opportunities but are awaiting full verification. Confirm eligibility and status directly with the official provider before applying.',
    });
  } catch (error) {
    console.error('Unable to load records awaiting verification.', error);
    res.status(database.isConfigured ? 503 : 500).json({ error: 'Unable to load opportunities awaiting verification.' });
  }
});
router.get('/scholarships', (req, res, next) => handleSearch(req, res).catch(next));

router.get('/scholarships/:id', async (req, res) => {
  try {
    const scholarship = database.isConfigured
      ? await repository.getScholarshipById(req.params.id)
      : getScholarshipById(req.params.id);
    if (!scholarship) {
      return res.status(404).json({
        error: 'Scholarship not found.',
        message: 'No verified scholarship matches the requested ID.',
      });
    }

    res.json({ scholarship });
  } catch (error) {
    if (database.isConfigured) {
      console.error('PostgreSQL scholarship detail query failed.', error);
      return res.status(503).json({ error: 'Scholarship database is unavailable.' });
    }
    sendDataError(res, error, 'Unable to load scholarship details.');
  }
});

module.exports = router;
