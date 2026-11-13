INSERT INTO scholarships (
  source_id, source_record_id, title, slug, provider_name, description,
  eligibility_description, category, scholarship_type, study_levels,
  destination_countries, disability_eligibility, official_source_url,
  official_application_url, verification_status, application_status, last_source_checked_at,
  is_active
) VALUES (
  'india-national-scholarship-portal',
  'nsp-pm-yasasvi-schools-2026-27-announcement',
  'PM YASASVI Central Sector Scheme of Top Class Education in Schools for OBC, EBC and DNT Students',
  'pm-yasasvi-top-class-education-schools-2026-27',
  'Government of India — PM YASASVI scheme',
  'The National Scholarship Portal announcement for academic year 2026–27 reports that fresh applications are open for this scheme. It says students from Rajasthan, Keralam and Karnataka must wait for further notice. The announcement does not publish an application deadline or award amount.',
  'The current portal announcement names OBC, EBC and DNT students. It instructs students with disabilities to complete UDID portal consent before submitting through NSP. Full eligibility, state availability, award details and deadline must be checked on the official portal; this record is awaiting full verification and is not an eligibility decision.',
  'Government',
  'Government Scholarship',
  ARRAY['school'],
  ARRAY['IN'],
  'open_to_disability',
  'https://scholarships.gov.in/ViewMoreAnnouncement',
  'https://scholarships.gov.in/otrapplication/#/login-page',
  'awaiting_verification',
  'open',
  '2026-11-12T11:26:41Z',
  true
)
ON CONFLICT (source_id, source_record_id) DO NOTHING;
