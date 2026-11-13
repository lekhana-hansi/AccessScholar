CREATE TABLE scholarship_sources (
  source_id text PRIMARY KEY,
  source_name text NOT NULL,
  country text NOT NULL,
  official_website text NOT NULL,
  source_type text NOT NULL,
  integration_method text NOT NULL DEFAULT 'manual_verification'
    CHECK (integration_method IN ('manual_verification', 'json_feed')),
  api_endpoint text,
  approved_application_hosts text[] NOT NULL DEFAULT '{}',
  refresh_interval_hours integer CHECK (refresh_interval_hours IS NULL OR refresh_interval_hours >= 1),
  is_active boolean NOT NULL DEFAULT true,
  last_attempted_at timestamptz,
  last_successful_sync timestamptz,
  last_sync_status text NOT NULL DEFAULT 'never'
    CHECK (last_sync_status IN ('never', 'success', 'failed', 'manual_import', 'skipped')),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_website_https CHECK (official_website ~ '^https://')
);

CREATE TABLE scholarships (
  id bigserial PRIMARY KEY,
  source_id text NOT NULL REFERENCES scholarship_sources(source_id),
  source_record_id text,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  provider_name text NOT NULL,
  provider_logo_url text,
  description text NOT NULL DEFAULT '',
  eligibility_description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Scholarship',
  scholarship_type text NOT NULL DEFAULT 'International Scholarship',
  funding_type text,
  award_amount numeric CHECK (award_amount IS NULL OR award_amount >= 0),
  currency char(3),
  study_levels text[] NOT NULL DEFAULT '{}',
  eligible_subjects text[] NOT NULL DEFAULT '{}',
  applicant_nationalities text[] NOT NULL DEFAULT '{}',
  eligible_residence_countries text[] NOT NULL DEFAULT '{}',
  destination_countries text[] NOT NULL DEFAULT '{}',
  disability_eligibility text NOT NULL DEFAULT 'unknown'
    CHECK (disability_eligibility IN ('disability_specific', 'open_to_disability', 'accommodations', 'no_published_restriction', 'unknown')),
  disability_categories text[] NOT NULL DEFAULT '{}',
  academic_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  income_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  age_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  gender_requirements text,
  application_open_date date,
  application_deadline date,
  deadline_timezone text NOT NULL DEFAULT 'UTC',
  official_source_url text NOT NULL,
  official_application_url text NOT NULL,
  verification_status text NOT NULL DEFAULT 'awaiting_verification'
    CHECK (verification_status IN ('verified', 'awaiting_verification', 'rejected')),
  application_status text NOT NULL DEFAULT 'unknown'
    CHECK (application_status IN ('open', 'opening_soon', 'closed', 'expired', 'unknown', 'source_temporarily_unavailable')),
  first_discovered_at timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  last_source_checked_at timestamptz,
  last_verified_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  financial_need_required boolean,
  minimum_gpa numeric,
  minimum_age integer,
  maximum_age integer,
  maximum_income numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_record_unique UNIQUE (source_id, source_record_id),
  CONSTRAINT scholarship_source_url_https CHECK (official_source_url ~ '^https://'),
  CONSTRAINT scholarship_application_url_https CHECK (official_application_url ~ '^https://')
);

CREATE TABLE scholarship_eligibility (
  id bigserial PRIMARY KEY,
  scholarship_id bigint NOT NULL REFERENCES scholarships(id) ON DELETE CASCADE,
  criterion_type text NOT NULL,
  description text NOT NULL,
  is_mandatory boolean NOT NULL DEFAULT true,
  structured_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE scholarship_history (
  id bigserial PRIMARY KEY,
  scholarship_id bigint NOT NULL REFERENCES scholarships(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_fields text[] NOT NULL,
  before_values jsonb NOT NULL,
  after_values jsonb NOT NULL,
  changed_by text NOT NULL DEFAULT 'ingestion_worker'
);

CREATE TABLE ingestion_logs (
  id bigserial PRIMARY KEY,
  source_id text REFERENCES scholarship_sources(source_id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'partial', 'failed', 'skipped', 'manual_import')),
  records_discovered integer NOT NULL DEFAULT 0,
  records_imported integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  records_rejected integer NOT NULL DEFAULT 0,
  duplicate_records integer NOT NULL DEFAULT 0,
  error_message text
);

CREATE INDEX scholarships_destination_idx ON scholarships USING gin (destination_countries);
CREATE INDEX scholarships_nationality_idx ON scholarships USING gin (applicant_nationalities);
CREATE INDEX scholarships_deadline_idx ON scholarships (application_deadline);
CREATE INDEX scholarships_provider_idx ON scholarships (provider_name);
CREATE INDEX scholarships_category_idx ON scholarships (category);
CREATE INDEX scholarships_active_status_idx ON scholarships (is_active, verification_status, application_status);
CREATE INDEX scholarships_source_updated_idx ON scholarships (source_id, last_updated_at DESC);
CREATE INDEX scholarships_search_idx ON scholarships USING gin (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(provider_name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(eligibility_description, ''))
);
CREATE INDEX scholarship_eligibility_record_idx ON scholarship_eligibility (scholarship_id, criterion_type);
CREATE INDEX scholarship_history_record_idx ON scholarship_history (scholarship_id, changed_at DESC);
CREATE INDEX ingestion_logs_source_started_idx ON ingestion_logs (source_id, started_at DESC);

INSERT INTO scholarship_sources (
  source_id, source_name, country, official_website, source_type,
  integration_method, approved_application_hosts, last_sync_status
) VALUES
  ('india-national-scholarship-portal', 'National Scholarship Portal', 'India',
    'https://scholarships.gov.in/', 'government_portal', 'manual_verification',
    ARRAY['scholarships.gov.in'], 'never'),
  ('india-depwd-schemes', 'Department of Empowerment of Persons with Disabilities — Schemes', 'India',
    'https://depwd.gov.in/en/schemes/', 'government_information', 'manual_verification',
    ARRAY[]::text[], 'never'),
  ('usa-federal-student-aid', 'Federal Student Aid', 'United States',
    'https://studentaid.gov/', 'government_information', 'manual_verification',
    ARRAY['studentaid.gov'], 'never'),
  ('australia-awards', 'Australia Awards', 'Australia',
    'https://www.dfat.gov.au/people-to-people/australia-awards', 'government_program', 'manual_verification',
    ARRAY['dfat.gov.au'], 'never')
ON CONFLICT (source_id) DO NOTHING;
