# AccessScholar

AccessScholar helps students discover verified education funding from official sources, with a focus on inclusive opportunities. Its tagline is **“Accessible Opportunities. Inclusive Education.”** The site uses a vanilla HTML/CSS/JavaScript frontend, an Express API, and either a local JSON catalog or PostgreSQL.

## Project structure

```text
AccessScholar/
├── backend/
│   ├── database/
│   │   ├── migrations/       # versioned PostgreSQL schema and initial source data
│   │   ├── migrate.js
│   │   └── pool.js
│   ├── data/                 # scholarship, country, and source JSON
│   ├── routes/               # Express API
│   ├── services/             # PostgreSQL/JSON repositories, imports, matching and reports
│   ├── test/                 # Node test-runner tests
│   ├── worker.js             # scheduled permitted JSON-feed refreshes
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── index.html
│   ├── script.js
│   ├── admin.html            # token-protected report review UI
│   ├── admin.js
│   ├── privacy.html
│   ├── terms.html
│   ├── accessibility.html
│   ├── styles.css
│   └── assets/               # SVG brand assets, favicon, optimized hero photo
├── chrome-extension/
│   ├── icons/                # PNG action and extension icons
│   ├── icon.svg              # scalable extension icon artwork
│   ├── manifest.json
│   ├── content.js
│   ├── content.css
│   └── popup.*
├── package.json
└── README.md
```

The website's **`index.html` is `frontend/index.html`**. The Express server serves it at `http://localhost:5000`; do not open the file directly because scholarship search uses the API.

## Run locally

From the project root:

```bash
npm install
npm start
```

Open `http://localhost:5000`. Use `npm run dev` for automatic server restarts. The backend can also be started from its own directory with `npm install` followed by `npm start`. The default port is `5000`; set the `PORT` environment variable to change it.

Without `DATABASE_URL`, the server uses the JSON catalog. To import real records in this mode, copy `.env.example` to `.env`, leave `DATABASE_URL` commented out, set a private `ADMIN_API_TOKEN`, start the server, open `/admin`, enter the token and use **Import verified CSV records**. Valid rows are saved in `backend/data/scholarships.json` and appear in normal search immediately. Rows awaiting verification remain out of verified results. This local file mode is intended for development or a single server instance.

For PostgreSQL-backed operation:

1. Create a Supabase PostgreSQL project or a local PostgreSQL database.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to the database connection string. For Supabase, use its PostgreSQL connection string, not a browser-exposed service key. Keep `.env` private.
3. Set `ADMIN_API_TOKEN` to a long random secret.
4. Run `npm run db:migrate` once to create the schema and seed the source catalog plus an official NSP announcement awaiting verification.
5. In one terminal run `npm start`; in another run `npm run worker`.

The API health response reports `storage: "postgresql"` when the database is configured and connected. If PostgreSQL is configured but unreachable, API requests return a database-unavailable error; they do not silently fall back to JSON. `npm run worker:once` runs due JSON feeds once. No source-specific feed endpoint is preconfigured.

## API

- `GET /api/health` — health check
- `GET /api/scholarships` or `GET /api/scholarships/search` — search with filters and pagination
- `GET /api/scholarships/awaiting-verification` — real source records awaiting full verification; no apply action is shown
- `GET /api/scholarships/featured` — only records explicitly marked `featured: true`
- `GET /api/scholarships/:id` — verified opportunity details
- `GET /api/categories` — available categories
- `GET /api/countries` — the current 15-country starter list with actual verified-record counts
- `GET /api/sources` — enabled official-source references and access notes
- `GET /api/sources/status` — last public sync status; error details are redacted
- `POST /api/scholarships/matches` — compare a profile with verified records and return Strong Match, Possible Match, and Not Eligible groups with explanations
- `POST /api/reports` — validate and queue a report about a verified scholarship for review
- `GET /api/admin/reports` — list reports; requires `Authorization: Bearer <ADMIN_API_TOKEN>`
- `PATCH /api/admin/reports/:id` — mark a report `reviewed` or `dismissed`; requires the admin token
- `GET /api/admin/dashboard`, `/api/admin/sources`, `/api/admin/scholarships`, and `/api/admin/ingestion-logs` — protected data dashboard; reads PostgreSQL when configured and the local catalog otherwise
- `POST /api/admin/import-csv` — protected CSV import to PostgreSQL or the local JSON catalog; accepts `{ "csv": "..." }`
- `POST /api/admin/refresh` — protected run of due official JSON feeds (or one source with `sourceId`); requires PostgreSQL
- `POST /api/admin/sources` and `PATCH /api/admin/sources/:id` — protected source management
- `POST /api/admin/scholarships` and `PATCH /api/admin/scholarships/:slug` — protected scholarship add/review/update API
- `GET /admin` — admin report-review page; the token is entered for the current page session only
- `GET /scholarships/:country` — country discovery route served by the frontend
- `GET /scholarship/:id` — scholarship detail route served by the frontend
- `GET /robots.txt` and `GET /sitemap.xml` — crawl guidance and supported country pages

Search filters include `applicantCountry`, `residenceCountry`, `destinationCountry`, `level`, `disabilityEligibility`, `disabilityCategory`, `category`, `fundingType`, `applicationStatus`, `fieldOfStudy`, `institution`, `academicQualification`, `gender`, `financialNeed`, `gpa`, `maximumIncome`, `age`, `deadlineBefore`, and `deadlineAfter`. Pagination uses `page` and `limit` (maximum 100). Sort options are `latest`, `deadline`, `funding`, `new`, and `verified`. `new` sorts by recorded discovery date; existing records without that date remain undated rather than receiving an assumed date. Application status remains unknown unless an open/closed status is explicitly verified; published open deadlines within seven days are labeled deadline-approaching. Countries can be specified by the listed ISO code or name.

Run the automated checks with `npm test` from the project root.

Country routes use `/scholarships/india`, `/scholarships/usa`, `/scholarships/australia`, and equivalent slugs for the other supported countries. Verified record details use `/scholarship/:id`. The client fetches the individual record from the backend API before rendering the detail page.

## Official listing policy

The scholarship listing displays records already in the selected backend catalog and relies on their verification status; a UI redesign does not independently re-verify scholarship claims. The current local JSON catalog includes records classified by the catalog as verified and a separate awaiting-verification announcement. Review current official provider details before applying. Awaiting-verification items are labeled and do not expose an Apply action.

Provider logo images are optional. The current local catalog has no populated provider logo URLs, so cards intentionally show provider initials and names rather than guessed logos, unrelated flags, or favicons. An approved official logo can be added through the scholarship record's `providerLogoUrl`/`provider_logo_url` field after confirming its source and permitted use. The country list is a 15-country starter set, not evidence of global coverage.

PostgreSQL is the production data store when `DATABASE_URL` is set. Versioned migrations create sources, scholarships, structured eligibility, history, and ingestion logs; the seed migration populates its configured source and scholarship records. The JSON files remain a local development catalog and are not used as a fallback when a configured PostgreSQL connection fails.

Country discovery counts come from active verified database rows. The default search excludes expired and closed records; status-unknown verified records can still appear but are labeled unknown. Unverified announcements are returned by the separate awaiting-verification endpoint. A database outage is reported as HTTP 503 with a retryable explanation, while external source failures leave cached database records intact.

The ingestion worker does not scrape portals. It supports manually verified CSV imports and an explicitly configured JSON feed only when its HTTPS endpoint is on the registered official source host. There are currently no configured JSON feeds; the registered sources use manual verification. The worker applies bounded response sizes, timeouts, retries, deduplication by stable source identifier and exact provider/title, history tracking, and ingestion logs. It never removes existing rows when a source fails. Confirm each source's access rules and terms before configuring an endpoint.

To publish a scholarship, import one individual record only after checking the awarding provider's current details. A verified row needs a stable `source_record_id`, title, slug, provider, destination, registered official source and application URLs, disability-eligibility value, and `last_verified_at`. The importer checks HTTPS and approved source hosts. An `open` status requires a recorded source-check date; if full record verification is still pending, the record stays in the pending section and has no Apply action. Missing requirements stay unknown; do not infer eligibility or treat a missing deadline as unlimited.

Provider logos are only rendered from a record's HTTPS `providerLogoUrl`; otherwise the UI displays a provider-name initials fallback, never AccessScholar branding as the provider. Country flags are loaded from FlagCDN and are not used to infer eligibility. The decorative hero uses a locally served, compressed WebP version of a Pexels photograph with a visible license link.

## Optional student profile and privacy

The profile is optional and is saved locally in the browser only when the user chooses to save it. The matching request is sent to the same-origin API with `Cache-Control: no-store`; it is not saved by the API. The matcher compares explicit published fields (nationality, residence, destination, level, subject, qualification, score, age, income, financial need and disability requirements). Missing profile information creates a Possible Match; explicit conflicts with a published mandatory condition create a Not Eligible result. Free-text eligibility requirements always need official-provider confirmation. A Strong Match is not an eligibility guarantee.

The floating accessibility panel stores preferences in local storage and offers font choices, text resizing, light/dark/high-contrast/inverted/grayscale/warm modes, spacing, heading/link/focus emphasis, simplified layout, reading ruler/mask, large cursor, motion reduction, contrast estimation, and browser speech controls. Font choices use installed fonts and fallbacks; speech and voice options depend on browser support. The contrast checker only evaluates the two chosen colors and is not a full-site audit. The policy pages are `/privacy.html`, `/terms.html`, and `/accessibility.html`. The site currently has no video content; any video added later must include captions.

## PostgreSQL, manual imports, and worker

The connection uses `DATABASE_URL`; credentials stay server-side in `.env`. Supabase is supported through its PostgreSQL connection string. Never place a service-role key or database password in frontend code. Apply migrations with `npm run db:migrate`; migration files are in `backend/database/migrations/`. They create indexes, structured eligibility, change history, ingestion logs and source rows, then add a single source-backed NSP announcement as `awaiting_verification`.

The local fallback catalog also contains that announcement, but the verified search API excludes it. The homepage displays it in **Opportunities awaiting verification**, with the official NSP source and source-check date and without an application button. The current announcement was checked on 12 November 2026; its complete eligibility, award and deadline were not available in that announcement. It is not safe to claim the final project has a fully verified open scholarship, or to claim the 20-record target has been met. Refresh that source manually before relying on its application status.

The worker is a separate process: start it with `npm run worker`, or run due feeds once with `npm run worker:once`. It only connects to an explicitly configured HTTPS JSON endpoint on the registered official source host, and it does not scrape HTML, use credentials, bypass access controls, or guess feed URLs. Since no public JSON feeds have been confirmed for the current sources, they are registered as `manual_verification` and scheduled runs will not scrape them. Manual imports run from `/admin` after setting `ADMIN_API_TOKEN`; they work in local JSON mode as well as PostgreSQL mode. The dashboard includes catalog metrics, source status, ingestion logs, a verification queue, and CSV import. Source registration and automated refresh configuration require PostgreSQL.

CSV uses a header row with database field names. Lists use `|` between values; JSON requirement fields must be quoted valid JSON. Stable `source_record_id` values are required. Verified records require `last_verified_at`; an open status also requires `last_source_checked_at`. Official source and application URL hosts are checked against the registered source. An `awaiting_verification` row can display a reported-open status only in the pending section; it never gets an apply action.

Supported CSV columns:

```text
source_record_id,title,slug,provider_name,provider_logo_url,description,eligibility_description,category,scholarship_type,funding_type,award_amount,currency,study_levels,eligible_subjects,applicant_nationalities,eligible_residence_countries,destination_countries,disability_eligibility,disability_categories,academic_requirements,income_requirements,age_requirements,gender_requirements,application_open_date,application_deadline,deadline_timezone,official_source_url,official_application_url,source_id,verification_status,application_status,last_verified_at,last_source_checked_at,is_active,is_featured,financial_need_required,minimum_gpa,minimum_age,maximum_age,maximum_income
```

For example, `study_levels` can contain `school|undergraduate`. JSON requirement fields must be valid JSON, with embedded quotes escaped using standard CSV double-quote rules. Use the dashboard's row-level import result and ingestion logs to diagnose rejected records. Duplicate rows with the same stable source identifier are updates; exact title/provider duplicates across source IDs are reported rather than silently merged.

Admin data endpoints require `Authorization: Bearer <ADMIN_API_TOKEN>`. The HTML admin page keeps the token in memory and requests it again after reload. Use HTTPS and a strong secret in production. `ACCESS_SCHOLAR_DATA_DIR` optionally changes where the local JSON files and import logs are stored. The in-memory rate limiter and JSON report/catalog stores are single-instance development implementations; production needs a shared rate limiter and durable database.

## External data sources and known limitations

Official pages reviewed for this update:

- [National Scholarship Portal announcements](https://scholarships.gov.in/ViewMoreAnnouncement) — current PM YASASVI notice; no structured public feed was configured.
- [Federal Student Aid](https://studentaid.gov/) — official U.S. aid information, not a confirmed feed of awards open to international applicants.
- [Australia Awards](https://www.dfat.gov.au/people-to-people/australia-awards) — official program information; no structured feed is configured.

The worker can import only a documented JSON feed after an administrator verifies its URL and source terms. Current registered sources have no such feed. Australia Awards and U.S. Federal Student Aid are source references, not scholarship records. Data volume depends on verified information and cannot be guaranteed to reach 20 without sufficient official source details. Do not treat portal or agency landing pages as individual awards.

The environment used for this implementation has no `psql`, Docker, Supabase URL, or database credentials. Therefore PostgreSQL migrations, live DB imports, persistence across DB restarts, actual SQL counts, and end-to-end worker-to-PostgreSQL behavior could not be executed here. The JSON-mode API now supports protected CSV import and scholarship review, and its import-to-search flow is covered by tests. Set up a real PostgreSQL database and follow the migration steps above before deploying the database-backed mode.

The optional Chrome extension is separate from the website. It persists settings through Chrome storage and reapplies them on supported pages. Browser-restricted pages do not allow content scripts; the popup reports that limitation. A website cannot install or automatically enable a browser extension.

## Reports and admin review

Reports are accepted only for an existing verified scholarship, validated against an allowed issue type and text-length limit, rate-limited per client IP in process memory, and saved as pending feedback in `backend/data/reports.json`. User reports do not modify listing facts. Review each report against the official provider before editing the catalog. Report text is user-submitted and should not contain personal or sensitive information. The JSON file is ignored by Git; protect and back it up according to your deployment's data-retention policy.

Set a strong `ADMIN_API_TOKEN` in the server's environment before using `/admin` or the admin endpoints. There is no built-in default credential, user database, or external identity provider. The admin page keeps the entered token in memory only and sends it as a bearer token. Use HTTPS, a secret manager, restricted server access, and a production persistent database/rate limiter before deploying this JSON-backed review system to a multi-instance service. Do not put an admin token in frontend code or commit it.

The server sets a restrictive Content Security Policy and other security headers, does not enable cross-origin API access, limits JSON request bodies, validates report/profile inputs, and returns generic server errors. Rate limits are process-local and reset when the server restarts; production deployments need a shared limiter and persistent data store.

## Lighthouse results

A real Lighthouse run against the local homepage (Chrome headless, mobile emulation) before the accessibility and performance changes measured:

| Category | Before | After |
|---|---:|
| Performance | 85 | 91 |
| Accessibility | 93 | 100 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |

The post-change run was measured on the homepage with mobile emulation. It reported LCP 3.2 s, CLS 0, and TBT 160 ms. The LCP image is preloaded with high fetch priority; Lighthouse confirmed it is discoverable in the initial document. Its remaining network-dependency diagnostic shows a 54 ms document-to-stylesheet chain, with no estimated time savings from listed performance opportunities. The hero image was converted from a 398,386-byte JPEG to a 212,930-byte WebP (about 47% smaller), and country counts now come from the countries API rather than separate per-card requests. These scores are a local audit snapshot, not a guarantee of production performance; network, device, and deployment conditions can change results. The initial audit findings included insufficient secondary-text contrast, an invalid ARIA label on a generic `div`, and accessible names that omitted visible link text; these were corrected before the post-change run.

## Optional Chrome extension

The website works without the extension. To install it separately in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this project's `chrome-extension` folder.
4. On a regular website, use the extension popup to choose settings.
5. After changing extension files, select **Reload** on its card and refresh the page being tested.

When installed and enabled, the extension's content script applies its saved settings on supported pages, including official portals. A website cannot install, enable, or grant browser permissions to an extension; users must install and enable it themselves. Browser-internal pages, Chrome Web Store pages, and some protected pages do not permit content scripts.
