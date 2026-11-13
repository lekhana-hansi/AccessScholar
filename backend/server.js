const express = require('express');
const path = require('path');
const scholarshipRoutes = require('./routes/scholarshipRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const adminDataRoutes = require('./routes/adminDataRoutes');
const database = require('./database/pool');
const scholarshipRepository = require('./services/scholarshipRepository');
const {
  isPublishableScholarship,
  readCountries,
  readScholarships,
  readSources,
} = require('./services/scholarshipService');

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const frontendPath = path.join(__dirname, '..', 'frontend');

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; font-src 'self' data:",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.static(frontendPath));
app.use('/api', scholarshipRoutes);
app.use('/api', feedbackRoutes);
app.use('/api', adminDataRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin.html'));
});

app.get('/robots.txt', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin.html\nSitemap: ${origin}/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    const countries = readCountries();
    const sources = readSources();
    const scholarshipSlugs = database.isConfigured
      ? await scholarshipRepository.getPublishedScholarshipSlugs()
      : readScholarships()
        .filter((scholarship) => isPublishableScholarship(scholarship, sources))
        .map((scholarship) => scholarship.scholarshipId);
    const countrySlug = (country) => {
      const slugs = { US: 'usa', GB: 'uk' };
      return slugs[country.code] || country.name.toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    };
    const escapeXml = (value) => String(value).replace(/[<>&'"]/g, (character) => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
    })[character]);
    const locations = [
      `${origin}/`,
      ...countries.map((country) => `${origin}/scholarships/${countrySlug(country)}`),
      ...scholarshipSlugs.map((slug) => `${origin}/scholarship/${encodeURIComponent(slug)}`),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n')}\n</urlset>`;
    res.type('application/xml').send(xml);
  } catch (error) {
    console.error('Unable to build the site map.', error);
    next(error);
  }
});

app.get(/^\/(?:scholarships\/[^/]+|scholarship\/[^/]+)\/?$/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found.',
    message: `No route matches ${req.method} ${req.originalUrl}`,
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.status === 400 || error.status === 413) {
    return res.status(error.status).json({
      error: error.status === 413 ? 'Request body is too large.' : 'Request body is not valid JSON.',
    });
  }
  console.error('Unhandled request error.', error);
  res.status(500).json({ error: 'The request could not be completed.' });
});

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`AccessScholar is available at http://localhost:${PORT}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. The AccessScholar server may already be running.`);
      process.exitCode = 1;
      return;
    }
    console.error('Unable to start the AccessScholar server:', error);
    process.exitCode = 1;
  });
}

module.exports = app;
