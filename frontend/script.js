const resultsContainer = document.getElementById('scholarshipResults');
const countryGrid = document.getElementById('countryGrid');
const applicantCountryFilter = document.getElementById('applicantCountryFilter');
const residenceCountryFilter = document.getElementById('residenceCountryFilter');
const destinationCountryFilter = document.getElementById('destinationCountryFilter');
const categoryFilter = document.getElementById('categoryFilter');
const searchForm = document.getElementById('searchForm');
const heroSearchForm = document.getElementById('heroSearchForm');
const heroDestination = document.getElementById('heroDestination');
const heroLevel = document.getElementById('heroLevel');
const heroDisability = document.getElementById('heroDisability');
const heroKeyword = document.getElementById('heroKeyword');
const activeFiltersContainer = document.getElementById('activeFilters');
const resultsSort = document.getElementById('resultsSort');
const opportunitySections = document.getElementById('opportunitySections');
const homePage = document.getElementById('homePage');
const scholarshipDetailPage = document.getElementById('scholarshipDetailPage');
const scholarshipDetailContent = document.getElementById('scholarshipDetailContent');
const detailBreadcrumb = document.getElementById('detailBreadcrumb');
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');
const resultsPagination = document.getElementById('resultsPagination');
const previousPageButton = document.getElementById('previousPage');
const nextPageButton = document.getElementById('nextPage');
const pageStatus = document.getElementById('pageStatus');
const sourcesSection = document.getElementById('officialSources');
const sourcesList = document.getElementById('officialSourcesList');
const resultsCount = document.getElementById('resultsCount');
const filterDrawer = document.getElementById('filterDrawer');
const awaitingVerificationSection = document.getElementById('awaitingVerificationSection');
const awaitingVerificationResults = document.getElementById('awaitingVerificationResults');
const accessibilityStatus = document.getElementById('accessibilityStatus');
const brandLogo = document.querySelector('.brand-logo');
const accessibilityLauncher = document.getElementById('accessibilityLauncher');
const accessibilityDialog = document.getElementById('accessibilityDialog');
const closeAccessibilityDialog = document.getElementById('closeAccessibilityDialog');
const readingRuler = document.getElementById('readingRuler');
const readingMask = document.getElementById('readingMask');
const reportDialog = document.getElementById('reportDialog');
const reportForm = document.getElementById('reportForm');
const reportStatus = document.getElementById('reportStatus');
const profileForm = document.getElementById('profileForm');
const profileStatus = document.getElementById('profileStatus');
const profileMatches = document.getElementById('profileMatches');

const defaultAccessibilityState = {
  visualMode: 'light',
  fontFamily: 'system',
  lineSpacing: false,
  letterSpacing: false,
  highlightHeadings: false,
  dyslexiaFont: false,
  highlightLinks: false,
  simplifiedLayout: false,
  fontScale: 100,
  readingRuler: false,
  readingMask: false,
  largeCursor: false,
  focusHighlight: false,
  highlightControls: false,
  reduceMotion: false,
  speechSpeed: 1,
  speechVoice: '',
};

const accessibilityState = { ...defaultAccessibilityState };
let speechUtterance = null;
let currentSearchController = null;
let currentPage = 1;
let countries = [];
let currentRouteToken = 0;
let shelfRequestToken = 0;

const countryOrder = ['IN', 'US', 'AU', 'GB', 'CA', 'DE', 'FR', 'NL', 'FI', 'IE', 'NZ', 'JP', 'SG', 'SE', 'KR'];
const filterLabels = {
  q: 'Keyword',
  applicantCountry: 'Applicant nationality',
  residenceCountry: 'Current residence',
  destinationCountry: 'Study destination',
  level: 'Education level',
  disabilityEligibility: 'Disability eligibility',
  disabilityCategory: 'Disability category',
  category: 'Scholarship type',
  fundingType: 'Funding type',
  applicationStatus: 'Application status',
  fieldOfStudy: 'Subject',
  institution: 'Institution',
  academicQualification: 'Academic qualification',
  gender: 'Gender',
  financialNeed: 'Financial need',
  gpa: 'Academic score',
  maximumIncome: 'Annual household income',
  age: 'Age',
  deadlineBefore: 'Deadline before',
  deadlineAfter: 'Deadline after',
};

const restoreAccessibilityState = () => {
  try {
    const savedState = JSON.parse(localStorage.getItem('accessScholarSettings') || '{}');
    Object.entries(defaultAccessibilityState).forEach(([key, defaultValue]) => {
      if (typeof savedState[key] === typeof defaultValue) accessibilityState[key] = savedState[key];
    });
    if (!savedState.visualMode) {
      if (savedState.highContrast) accessibilityState.visualMode = 'contrast';
      else if (savedState.darkMode) accessibilityState.visualMode = 'dark';
    }
    if (savedState.readMode === true && savedState.simplifiedLayout === undefined) {
      accessibilityState.simplifiedLayout = true;
    }
    if (!['light', 'dark', 'contrast', 'inverted', 'grayscale', 'warm'].includes(accessibilityState.visualMode)) {
      accessibilityState.visualMode = 'light';
    }
    accessibilityState.fontScale = Math.min(160, Math.max(80, accessibilityState.fontScale));
    if (![0.75, 1, 1.25, 1.5, 2].includes(accessibilityState.speechSpeed)) accessibilityState.speechSpeed = 1;
  } catch (error) {
    console.warn('Accessibility preferences could not be restored.', error);
  }
};

const applyAccessibilityControls = () => {
  const visualClasses = ['dark-mode', 'high-contrast', 'inverted-colors', 'grayscale-mode', 'warm-reading-mode'];
  visualClasses.forEach((className) => document.body.classList.remove(className));
  const visualClass = {
    dark: 'dark-mode',
    contrast: 'high-contrast',
    inverted: 'inverted-colors',
    grayscale: 'grayscale-mode',
    warm: 'warm-reading-mode',
  }[accessibilityState.visualMode];
  if (visualClass) document.body.classList.add(visualClass);
  document.body.classList.toggle('dyslexia-font', accessibilityState.dyslexiaFont);
  document.body.classList.toggle('highlight-links', accessibilityState.highlightLinks);
  document.body.classList.toggle('increase-line-spacing', accessibilityState.lineSpacing);
  document.body.classList.toggle('increase-letter-spacing', accessibilityState.letterSpacing);
  document.body.classList.toggle('highlight-headings', accessibilityState.highlightHeadings);
  document.body.classList.toggle('simplified-layout', accessibilityState.simplifiedLayout);
  document.body.classList.toggle('large-cursor', accessibilityState.largeCursor);
  document.body.classList.toggle('focus-highlight', accessibilityState.focusHighlight);
  document.body.classList.toggle('highlight-controls', accessibilityState.highlightControls);
  document.body.classList.toggle('reduce-motion', accessibilityState.reduceMotion);
  document.body.style.setProperty('--reading-font', {
    system: 'Inter, "Segoe UI", Arial, sans-serif',
    'open-sans': '"Open Sans", Arial, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    atkinson: '"Atkinson Hyperlegible", Arial, sans-serif',
  }[accessibilityState.fontFamily] || 'Inter, "Segoe UI", Arial, sans-serif');
  document.documentElement.style.setProperty('--font-scale', `${accessibilityState.fontScale}%`);
  brandLogo.src = accessibilityState.visualMode === 'dark' || accessibilityState.visualMode === 'contrast'
    ? '/assets/accessscholar-logo-light.svg'
    : '/assets/accessscholar-logo.svg';
  readingRuler.hidden = !accessibilityState.readingRuler;
  readingMask.hidden = !accessibilityState.readingMask;
  document.querySelectorAll('[data-accessibility][aria-pressed]').forEach((button) => {
    const action = button.dataset.accessibility;
    const mode = action.startsWith('mode-') ? action.slice(5) : null;
    const stateKey = {
      'dyslexia-font': 'dyslexiaFont',
      'line-spacing': 'lineSpacing',
      'letter-spacing': 'letterSpacing',
      'highlight-headings': 'highlightHeadings',
      'highlight-links': 'highlightLinks',
      'simplified-layout': 'simplifiedLayout',
      'reading-ruler': 'readingRuler',
      'reading-mask': 'readingMask',
      'large-cursor': 'largeCursor',
      'focus-highlight': 'focusHighlight',
      'highlight-controls': 'highlightControls',
      'reduce-motion': 'reduceMotion',
    }[action];
    button.setAttribute('aria-pressed', String(mode
      ? accessibilityState.visualMode === (mode === 'light' ? 'light' : mode === 'contrast' ? 'contrast' : mode)
      : Boolean(accessibilityState[stateKey])));
  });
  document.querySelectorAll('[data-accessibility-setting]').forEach((control) => {
    const key = control.dataset.accessibilitySetting;
    if (key in accessibilityState) control.value = String(accessibilityState[key]);
  });
};

const saveAccessibilityState = () => {
  try {
    localStorage.setItem('accessScholarSettings', JSON.stringify(accessibilityState));
  } catch (error) {
    console.warn('Accessibility preferences could not be saved.', error);
    accessibilityStatus.textContent = 'Your settings changed, but could not be saved for your next visit.';
  }
};

const announceAccessibilityChange = (message) => {
  accessibilityStatus.textContent = message;
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message || body.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
};

const appendOptions = (select, values, label) => {
  select.replaceChildren(new Option(label, ''));
  values.forEach((value) => select.add(new Option(value, value)));
};

const fillCountrySelect = (select, label) => {
  select.replaceChildren(new Option(label, ''));
  countries.forEach((country) => select.add(new Option(country.name, country.code)));
};

const loadFilters = async () => {
  const [countriesResponse, sourcesResponse, categoriesResponse] = await Promise.all([
    fetchJson('/api/countries'),
    fetchJson('/api/sources'),
    fetchJson('/api/categories'),
  ]);
  countries = countriesResponse.countries;
  [
    [applicantCountryFilter, 'Any nationality'],
    [residenceCountryFilter, 'Any residence'],
    [destinationCountryFilter, 'Any destination'],
  ].forEach(([select, label]) => {
    fillCountrySelect(select, label);
  });
  fillCountrySelect(heroDestination, 'Anywhere');
  [
    ['profileNationality', 'Not specified'],
    ['profileResidence', 'Not specified'],
    ['profileDestination', 'Not specified'],
  ].forEach(([id, label]) => fillCountrySelect(document.getElementById(id), label));
  appendOptions(categoryFilter, categoriesResponse.categories, 'Any category');
  renderOfficialSources(sourcesResponse.sources);
  await renderCountryCards();
  restoreStudentProfile();
};

const profileFieldNames = [
  'applicantCountry', 'residenceCountry', 'destinationCountry', 'level',
  'fieldOfStudy', 'academicQualification', 'gpa', 'age', 'income',
  'disabilityStatus', 'disabilityCategory', 'financialNeed', 'fundingType',
];

const readStudentProfile = () => {
  const formData = new FormData(profileForm);
  const profile = Object.fromEntries(profileFieldNames.map((name) => [name, formData.get(name) || '']));
  ['gpa', 'age', 'income'].forEach((key) => {
    profile[key] = profile[key] === '' ? null : Number(profile[key]);
  });
  profile.financialNeed = profile.financialNeed === '' ? null : profile.financialNeed === 'true';
  profile.disabilityStatus = profile.disabilityStatus || 'unspecified';
  return profile;
};

const setStudentProfile = (profile) => {
  profileFieldNames.forEach((name) => {
    const control = profileForm.elements.namedItem(name);
    if (control) control.value = profile[name] ?? '';
  });
};

const restoreStudentProfile = () => {
  try {
    const savedProfile = JSON.parse(localStorage.getItem('accessScholarProfile') || 'null');
    if (savedProfile && typeof savedProfile === 'object' && !Array.isArray(savedProfile)) {
      setStudentProfile(savedProfile);
      profileStatus.textContent = 'A saved profile is available on this device. Review it before using it.';
    }
  } catch (error) {
    console.warn('Saved student profile could not be restored.', error);
    profileStatus.textContent = 'A saved profile could not be read. You can clear it and enter a new one.';
  }
};

const renderProfileMatches = (groups) => {
  profileMatches.replaceChildren();
  profileMatches.hidden = false;
  addText(profileMatches, 'h3', 'Your possible scholarship matches');
  addText(profileMatches, 'p', 'These results compare your profile with published criteria in verified records. They are not an eligibility decision; confirm all requirements with the provider.');
  const total = Object.values(groups).reduce((sum, items) => sum + items.length, 0);
  if (!total) {
    addText(profileMatches, 'p', 'No verified scholarship records are currently available to compare. Try the search again later; we do not create sample matches.', 'empty-state');
    return;
  }
  [
    ['strongMatch', 'Strong Match'],
    ['possibleMatch', 'Possible Match'],
    ['notEligible', 'Not Eligible'],
  ].forEach(([key, title]) => {
    const section = document.createElement('section');
    section.className = `match-group match-${key}`;
    addText(section, 'h4', `${title} (${groups[key].length})`);
    if (!groups[key].length) addText(section, 'p', 'No records in this group.');
    groups[key].forEach((scholarship) => {
      const article = document.createElement('article');
      article.className = 'match-card';
      addText(article, 'h5', scholarship.scholarshipName);
      addText(article, 'p', scholarship.providerName);
      const reasons = document.createElement('ul');
      (scholarship.matchReasons || []).forEach((reason) => addText(reasons, 'li', reason));
      article.append(reasons);
      const detailsLink = document.createElement('a');
      detailsLink.href = `/scholarship/${encodeURIComponent(scholarship.scholarshipId)}`;
      detailsLink.dataset.scholarshipRoute = scholarship.scholarshipId;
      detailsLink.textContent = 'Review verified details';
      article.append(detailsLink);
      section.append(article);
    });
    profileMatches.append(section);
  });
};

const findProfileMatches = async () => {
  profileStatus.textContent = 'Comparing your profile with verified records…';
  try {
    const result = await fetchJson('/api/scholarships/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(readStudentProfile()),
    });
    renderProfileMatches(result);
    profileStatus.textContent = 'Profile comparison complete. Eligibility is not guaranteed.';
  } catch (error) {
    console.error('Unable to compare the student profile with scholarship criteria.', error);
    profileStatus.textContent = 'Profile matching is temporarily unavailable. Please try again.';
  }
};

const slugForCountry = (country) => {
  const slugs = { US: 'usa', GB: 'uk' };
  return slugs[country.code] || country.name.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};
const countryNameFor = (value) => {
  const country = countries.find((item) => item.code.toLowerCase() === String(value).toLowerCase()
    || item.name.toLowerCase() === String(value).toLowerCase());
  return country ? country.name : value;
};

const renderCountryCards = () => {
  countryGrid.replaceChildren();
  countryGrid.setAttribute('aria-busy', 'true');
  const orderedCountries = [...countries].sort((a, b) => {
    const indexA = countryOrder.indexOf(a.code);
    const indexB = countryOrder.indexOf(b.code);
    return (indexA === -1 ? countryOrder.length : indexA) - (indexB === -1 ? countryOrder.length : indexB)
      || a.name.localeCompare(b.name);
  });
  orderedCountries.forEach((country) => {
    const count = country.verifiedScholarshipCount;
    const countLabel = Number.isInteger(count)
      ? `${count} verified ${count === 1 ? 'scholarship' : 'scholarships'}`
      : 'Count unavailable';
    const card = document.createElement('article');
    card.className = 'country-card';
    const flag = document.createElement('img');
    flag.src = `https://flagcdn.com/w80/${country.code.toLowerCase()}.png`;
    flag.alt = `${country.name} flag`;
    flag.loading = 'lazy';
    flag.width = 80;
    flag.height = 53;
    flag.addEventListener('error', () => {
      flag.hidden = true;
    }, { once: true });
    card.append(flag);
    const heading = addText(card, 'h3', country.name);
    heading.id = `country-${country.code}`;
    addText(card, 'span', countLabel, 'country-count');
    const link = document.createElement('a');
    link.href = `/scholarships/${slugForCountry(country)}`;
    link.dataset.countryRoute = country.code;
    link.setAttribute('aria-label', `Explore scholarships in ${country.name}: ${countLabel}`);
    link.textContent = 'Explore scholarships';
    card.append(link);
    countryGrid.append(card);
  });
  countryGrid.setAttribute('aria-busy', 'false');
};

const renderOfficialSources = (sources) => {
  sourcesList.replaceChildren();
  sources.forEach((source) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = source.name;
    item.append(link, document.createTextNode(` — ${source.accessStatus}`));
    sourcesList.append(item);
  });
  sourcesSection.hidden = sources.length === 0;
};

const addText = (parent, tagName, text, className) => {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text || '';
  parent.append(element);
  return element;
};

const safeApplicationUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
};

const createApplicationLink = (scholarship, className = 'apply-link') => {
  const url = safeApplicationUrl(scholarship.applicationUrl);
  if (!url || !scholarship.official) return null;

  const link = document.createElement('a');
  link.className = className;
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Apply Now';
  link.setAttribute('aria-label', `Apply for ${scholarship.name || scholarship.scholarshipName} on ${scholarship.providerName || 'the official provider website'}; opens in a new tab`);
  return link;
};

const createSourceLink = (scholarship) => {
  const url = safeApplicationUrl(scholarship.sourceUrl);
  if (!url || !scholarship.official) return null;

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'View official source';
  link.setAttribute('aria-label', `View ${scholarship.sourceName || 'the official source'} in a new tab`);
  return link;
};

const createReportButton = (scholarship) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'report-listing-button';
  button.dataset.reportScholarship = scholarship.scholarshipId;
  button.dataset.scholarshipName = scholarship.scholarshipName;
  button.textContent = 'Report incorrect information';
  return button;
};

const createScholarshipCard = (scholarship) => {
  const card = document.createElement('article');
  card.className = 'scholarship-card';

  const providerBrand = document.createElement('div');
  providerBrand.className = 'provider-brand';
  providerBrand.append(createProviderImage(scholarship));
  const providerName = document.createElement('span');
  providerName.className = 'provider-name';
  providerName.textContent = scholarship.providerName || 'Provider not specified';
  providerBrand.append(providerName);
  card.append(providerBrand);

  const heading = document.createElement('div');
  heading.className = 'scholarship-card-heading';
  addText(heading, 'span', 'Verified', 'badge official');
  if (scholarship.applicationStatus === 'open' || scholarship.applicationStatus === 'deadline_approaching') {
    addText(heading, 'span', scholarship.applicationStatus === 'open' ? 'Applications open' : 'Deadline approaching', 'badge application-status');
  }
  card.append(heading);
  addText(card, 'h3', scholarship.scholarshipName || 'Scholarship opportunity', 'scholarship-card-title');

  const facts = document.createElement('dl');
  facts.className = 'scholarship-facts';
  const destinations = (scholarship.studyDestinationCountries || []).map(countryNameFor);
  const levels = (scholarship.studyLevels || []).map(formatStudyLevel);
  [
    ['Study destination', destinations.length ? destinations.join(', ') : 'Not specified'],
    ['Education level', levels.length ? levels.join(', ') : 'Not specified'],
    ['Funding', formatFunding(scholarship)],
    ['Application deadline', formatDate(scholarship.applicationDeadline)],
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'scholarship-fact';
    addText(item, 'dt', label);
    addText(item, 'dd', value);
    facts.append(item);
  });
  card.append(facts);

  const eligibility = [];
  const nationalities = scholarship.applicantNationalities || [];
  if (nationalities.some((country) => String(country).toLowerCase() === 'all')) {
    eligibility.push('All nationalities');
  } else if (nationalities.length) {
    eligibility.push(`Eligible: ${nationalities.slice(0, 2).map(countryNameFor).join(', ')}${nationalities.length > 2 ? ` +${nationalities.length - 2}` : ''}`);
  }
  const disabilityLabels = {
    disability_specific: 'Disability-specific',
    open_to_disability: 'Open to students with disabilities',
    accommodations: 'Accommodations available',
    no_published_restriction: 'No published disability restriction',
  };
  if (disabilityLabels[scholarship.disabilityEligibility]) {
    eligibility.push(disabilityLabels[scholarship.disabilityEligibility]);
  }
  if (eligibility.length) {
    const eligibilityBadges = document.createElement('div');
    eligibilityBadges.className = 'scholarship-eligibility';
    eligibility.forEach((label) => addText(eligibilityBadges, 'span', label, 'eligibility-badge'));
    card.append(eligibilityBadges);
  }

  const actions = document.createElement('div');
  actions.className = 'scholarship-actions';
  const detailsLink = document.createElement('a');
  detailsLink.className = 'details-btn';
  detailsLink.href = `/scholarship/${encodeURIComponent(scholarship.scholarshipId)}`;
  detailsLink.dataset.scholarshipRoute = scholarship.scholarshipId;
  detailsLink.textContent = 'View details';
  actions.append(detailsLink);

  const applicationLink = createApplicationLink({
    ...scholarship,
    name: scholarship.scholarshipName,
    applicationUrl: scholarship.officialApplicationUrl,
    official: scholarship.verificationStatus === 'verified',
  });
  if (applicationLink) {
    applicationLink.classList.add('apply-link');
    actions.append(applicationLink);
  }
  card.append(actions);
  return card;
};

const createProviderFallback = (providerName = 'Provider') => {
  const fallback = document.createElement('span');
  fallback.className = 'provider-fallback';
  fallback.setAttribute('aria-hidden', 'true');
  fallback.textContent = providerName.split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  return fallback;
};

const createProviderImage = (scholarship) => {
  const providerName = scholarship.providerName || 'Provider';
  const logoUrl = safeApplicationUrl(scholarship.providerLogoUrl);
  if (!logoUrl) return createProviderFallback(providerName);
  const logo = document.createElement('img');
  logo.className = 'provider-logo';
  logo.src = logoUrl;
  logo.alt = `${providerName} official logo`;
  logo.loading = 'lazy';
  logo.decoding = 'async';
  logo.width = 64;
  logo.height = 64;
  logo.addEventListener('error', () => {
    logo.replaceWith(createProviderFallback(providerName));
  }, { once: true });
  return logo;
};

const formatDate = (value) => {
  if (!value) return 'Not published';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? 'Not published'
    : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
};

const formatStudyLevel = (value) => ({
  phd: 'PhD',
  master: "Master's",
  postgraduate: 'Postgraduate',
  undergraduate: 'Undergraduate',
  vocational: 'Vocational',
  diploma: 'Diploma',
  school: 'School',
  research: 'Research',
}[String(value).toLowerCase()] || value);

const formatFunding = (scholarship) => {
  if (scholarship.awardAmount !== null && scholarship.awardAmount !== undefined) {
    if (scholarship.currency) {
      try {
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: scholarship.currency,
          maximumFractionDigits: 0,
        }).format(scholarship.awardAmount);
      } catch {
        return `${scholarship.currency} ${scholarship.awardAmount}`;
      }
    }
    return String(scholarship.awardAmount);
  }
  const fundingType = String(scholarship.fundingType || '').toLowerCase();
  if (fundingType === 'full') return 'Fully funded';
  if (fundingType === 'partial') return 'Partial funding';
  return 'See official details';
};

const renderScholarships = (scholarships, pagination) => {
  resultsContainer.replaceChildren();
  resultsContainer.setAttribute('aria-busy', 'false');
  resultsCount.textContent = `${pagination.total} verified opportunit${pagination.total === 1 ? 'y' : 'ies'} found`;
  resultsPagination.hidden = pagination.totalPages <= 1;
  pageStatus.textContent = pagination.totalPages ? `Page ${pagination.page} of ${pagination.totalPages}` : '';
  previousPageButton.disabled = pagination.page <= 1;
  nextPageButton.disabled = pagination.page >= pagination.totalPages;

  if (pagination.total === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    addText(emptyState, 'h3', 'No verified scholarships currently match your selected criteria.');
    addText(emptyState, 'p', 'Try removing a filter or exploring another study destination. We only display opportunities with verified provider information and published eligibility.');
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'secondary-btn';
    resetButton.textContent = 'Clear all filters';
    resetButton.addEventListener('click', () => {
      searchForm.reset();
      resultsSort.value = 'latest';
      currentPage = 1;
      renderActiveFilters();
      fetchScholarships();
    });
    emptyState.append(resetButton);
    resultsContainer.append(emptyState);
    return;
  }

  const fragment = document.createDocumentFragment();
  scholarships.forEach((scholarship) => fragment.append(createScholarshipCard(scholarship)));
  resultsContainer.append(fragment);
};

const renderAwaitingVerification = (scholarships) => {
  awaitingVerificationResults.replaceChildren();
  awaitingVerificationSection.hidden = scholarships.length === 0;
  scholarships.forEach((scholarship) => {
    const card = document.createElement('article');
    card.className = 'scholarship-card pending-verification-card';
    const providerBrand = document.createElement('div');
    providerBrand.className = 'provider-brand';
    providerBrand.append(createProviderImage(scholarship));
    addText(providerBrand, 'span', scholarship.providerName || 'Provider details need review', 'provider-name');
    card.append(providerBrand);
    addText(card, 'span', 'Awaiting full verification', 'badge');
    addText(card, 'h3', scholarship.scholarshipName, 'scholarship-card-title');
    addText(card, 'p', 'Not a verified listing. Confirm all details with the official provider.', 'pending-card-note');
    const status = scholarship.applicationStatus === 'open'
      ? 'The official announcement reports fresh applications open; full record verification is pending.'
      : 'Application status has not been verified.';
    addText(card, 'p', status);
    addText(card, 'p', `Source checked: ${formatDate(scholarship.sourceCheckedAt)}`);
    const sourceUrl = safeApplicationUrl(scholarship.officialSourceUrl);
    if (sourceUrl) {
      const sourceLink = document.createElement('a');
      sourceLink.href = sourceUrl;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      sourceLink.textContent = `Check official source${scholarship.sourceName ? `: ${scholarship.sourceName}` : ''}`;
      card.append(sourceLink);
    }
    awaitingVerificationResults.append(card);
  });
};

const loadAwaitingVerification = async (params, signal) => {
  const pendingParams = new URLSearchParams(params);
  pendingParams.delete('applicationStatus');
  pendingParams.set('page', '1');
  pendingParams.set('limit', '6');
  try {
    const response = await fetchJson(`/api/scholarships/awaiting-verification?${pendingParams.toString()}`, { signal });
    if (!signal.aborted) renderAwaitingVerification(response.scholarships);
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('Unable to load opportunities awaiting verification.', error);
    awaitingVerificationSection.hidden = false;
    awaitingVerificationResults.replaceChildren();
    addText(awaitingVerificationResults, 'p', `Could not load records awaiting verification: ${error.message}`, 'error-state');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'secondary-btn';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => loadAwaitingVerification(params, signal));
    awaitingVerificationResults.append(retry);
  }
};

const renderActiveFilters = () => {
  activeFiltersContainer.replaceChildren();
  Array.from(searchForm.elements).forEach((field) => {
    if (!field.name || !field.value || field.name === 'sort') return;
    const tag = document.createElement('span');
    tag.className = 'active-filter-tag';
    const selectedOption = field instanceof HTMLSelectElement
      ? field.selectedOptions[0]?.textContent
      : field.value;
    tag.append(document.createTextNode(`${filterLabels[field.name] || field.name}: ${selectedOption || field.value}`));
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.textContent = '×';
    clearButton.setAttribute('aria-label', `Remove ${filterLabels[field.name] || field.name} filter`);
    clearButton.addEventListener('click', () => {
      field.value = '';
      currentPage = 1;
      renderActiveFilters();
      fetchScholarships();
    });
    tag.append(clearButton);
    activeFiltersContainer.append(tag);
  });
  if (resultsSort.value !== 'latest') {
    const tag = document.createElement('span');
    tag.className = 'active-filter-tag';
    tag.textContent = `Sort: ${resultsSort.selectedOptions[0].textContent}`;
    activeFiltersContainer.append(tag);
  }
};

const showSearchError = (error) => {
  console.error('Scholarship fetch failed:', error);
  resultsContainer.replaceChildren();
  resultsContainer.setAttribute('aria-busy', 'false');
  const errorState = document.createElement('div');
  errorState.className = 'empty-state error-state';
  addText(errorState, 'h3', error.status === 503 ? 'Scholarship data is temporarily unavailable.' : 'Could not connect to the scholarship service.');
  addText(errorState, 'p', error.status
    ? error.message
    : 'Check that the AccessScholar backend is running, then retry. Existing records are not replaced with sample data.');
  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'secondary-btn';
  retryButton.textContent = 'Try again';
  retryButton.addEventListener('click', retryScholarships);
  errorState.append(retryButton);
  resultsContainer.append(errorState);
  resultsCount.textContent = 'Scholarship service unavailable';
  resultsPagination.hidden = true;
};

async function retryScholarships() {
  try {
    await loadFilters();
    await fetchScholarships();
  } catch (error) {
    showSearchError(error);
  }
}

async function fetchScholarships() {
  shelfRequestToken += 1;
  if (currentSearchController) currentSearchController.abort();
  currentSearchController = new AbortController();
  const { signal } = currentSearchController;
  const params = new URLSearchParams();
  Array.from(searchForm.elements).forEach((field) => {
    if (field.name && field.value) params.set(field.name, field.value.trim());
  });
  params.set('sort', resultsSort.value);
  params.set('page', currentPage);

  syncSearchUrl();
  renderActiveFilters();
  resultsContainer.setAttribute('aria-busy', 'true');
  resultsCount.textContent = 'Searching scholarships...';

  try {
    const data = await fetchJson(`/api/scholarships?${params.toString()}`, { signal });
    if (!signal.aborted) {
      renderScholarships(data.scholarships, data.pagination);
      if (data.pagination.total > 0) await renderOpportunitySections();
      else opportunitySections.replaceChildren();
      if (!signal.aborted) await loadAwaitingVerification(params, signal);
    }
  } catch (error) {
    if (error.name !== 'AbortError') showSearchError(error);
  }
}

async function renderOpportunitySections() {
  const requestToken = ++shelfRequestToken;
  const commonParams = new URLSearchParams();
  Array.from(searchForm.elements).forEach((field) => {
    if (field.name && field.value) commonParams.set(field.name, field.value.trim());
  });
  const definitions = [
    { title: 'Featured Scholarships', endpoint: '/api/scholarships/featured', params: { sort: 'latest' } },
    { title: 'Disability Scholarships', params: { disability: 'true', sort: 'verified' } },
    { title: 'Latest Opportunities', params: { sort: 'latest' } },
    { title: 'Scholarships Closing Soon', params: { applicationStatus: 'deadline_approaching', sort: 'deadline' } },
    { title: 'Fully Funded Scholarships', params: { fundingType: 'full', sort: 'latest' } },
    { title: 'International Research Funding', params: { category: 'Research Funding', sort: 'latest' } },
    { title: 'Government Scholarships', params: { category: 'Government', sort: 'latest' } },
    { title: 'University Scholarships', params: { category: 'University', sort: 'latest' } },
    { title: 'Recently Verified Opportunities', params: { sort: 'verified' } },
  ];
  const groups = await Promise.all(definitions.map(async (definition) => {
    const params = new URLSearchParams(commonParams);
    Object.entries(definition.params).forEach(([key, value]) => params.set(key, value));
    params.set('page', '1');
    params.set('limit', '3');
    try {
      const endpoint = definition.endpoint || '/api/scholarships';
      const response = await fetchJson(`${endpoint}?${params.toString()}`);
      return { title: definition.title, scholarships: response.scholarships };
    } catch (error) {
      console.error(`Unable to load ${definition.title.toLowerCase()} section.`, error);
      return { title: definition.title, scholarships: [] };
    }
  }));
  if (requestToken !== shelfRequestToken) return;
  opportunitySections.replaceChildren();
  groups.filter((group) => group.scholarships.length > 0).forEach((group) => {
    const section = document.createElement('section');
    section.className = 'opportunity-shelf';
    const heading = addText(section, 'h2', group.title);
    heading.className = 'opportunity-shelf-title';
    const grid = document.createElement('div');
    grid.className = 'scholarship-grid';
    group.scholarships.forEach((scholarship) => grid.append(createScholarshipCard(scholarship)));
    section.append(grid);
    opportunitySections.append(section);
  });
}

const updatePageMetadata = (title, description) => {
  document.title = title;
  document.querySelector('meta[name="description"]').content = description;
  document.querySelector('meta[property="og:title"]').content = title;
  document.querySelector('meta[property="og:description"]').content = description;
  document.querySelector('link[rel="canonical"]').href = `${window.location.origin}${window.location.pathname}`;
};

const syncSearchUrl = () => {
  const destination = countries.find((country) => country.code === destinationCountryFilter.value);
  const path = destination ? `/scholarships/${slugForCountry(destination)}` : '/';
  const params = new URLSearchParams();
  Array.from(searchForm.elements).forEach((field) => {
    if (field.name && field.value) params.set(field.name, field.value.trim());
  });
  params.set('sort', resultsSort.value);
  params.set('page', currentPage);
  window.history.replaceState({}, '', `${path}?${params.toString()}`);
  if (destination) {
    document.getElementById('hero-title').textContent = `Scholarships for study in ${destination.name}`;
    document.getElementById('search-title').textContent = `Scholarships for study in ${destination.name}`;
    updatePageMetadata(`Scholarships in ${destination.name} | AccessScholar`, `Explore verified scholarship opportunities for study in ${destination.name}, matched to published eligibility.`);
  } else {
    document.getElementById('hero-title').textContent = 'Discover Scholarships. Unlock Your Future.';
    document.getElementById('search-title').textContent = 'Find Scholarships';
    updatePageMetadata('AccessScholar | Discover Scholarships. Unlock Your Future.', 'Explore verified scholarship opportunities matched to your nationality, study destination, education level, and eligibility.');
  }
};

const renderDetailError = (message) => {
  scholarshipDetailContent.replaceChildren();
  const state = document.createElement('div');
  state.className = 'empty-state';
  addText(state, 'h1', message);
  const link = document.createElement('a');
  link.className = 'primary-btn';
  link.href = '/#search';
  link.textContent = 'Browse scholarships';
  state.append(link);
  scholarshipDetailContent.append(state);
};

const displayValue = (value) => {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join('; ');
  return value || 'Not specified';
};

const createDetailSection = (parent, title, content) => {
  if (!content) return;
  addText(parent, 'h2', title);
  if (Array.isArray(content)) {
    const list = document.createElement('ul');
    content.forEach((item) => addText(list, 'li', item));
    parent.append(list);
  } else {
    addText(parent, 'p', displayValue(content));
  }
};

async function loadScholarshipDetail(id) {
  scholarshipDetailContent.replaceChildren();
  addText(scholarshipDetailContent, 'p', 'Loading verified scholarship details...');
  try {
    const response = await fetchJson(`/api/scholarships/${encodeURIComponent(id)}`);
    const scholarship = response.scholarship;
    const shell = document.createElement('article');
    shell.className = 'detail-shell';
    const provider = document.createElement('div');
    provider.className = 'detail-provider';
    provider.append(createProviderImage(scholarship));
    const providerDescription = document.createElement('div');
    addText(providerDescription, 'strong', scholarship.providerName);
    addText(providerDescription, 'div', 'Scholarship provider');
    provider.append(providerDescription);
    shell.append(provider);

    addText(shell, 'span', 'Verified listing', 'badge official');
    addText(shell, 'h1', scholarship.scholarshipName);
    addText(shell, 'p', scholarship.description || 'Review the provider’s official information and published requirements before applying.');
    createDetailSection(shell, 'Overview', scholarship.overview);
    const detailGrid = document.createElement('div');
    detailGrid.className = 'detail-row';
    [
      ['Study destination', (scholarship.studyDestinationCountries || []).map(countryNameFor).join(', ') || 'Not specified'],
      ['Eligible nationalities', (scholarship.applicantNationalities || []).map(countryNameFor).join(', ') || 'Not specified'],
      ['Eligible residence', (scholarship.eligibleResidenceCountries || []).map(countryNameFor).join(', ') || 'Not specified'],
      ['Study levels', displayValue(scholarship.studyLevels)],
      ['Scholarship type', scholarship.scholarshipCategory],
      ['Disability eligibility', scholarship.disabilityEligibility],
      ['Disability categories', displayValue(scholarship.disabilityCategories)],
      ['Funding type', scholarship.fundingType],
      ['Award amount', scholarship.awardAmount ? `${scholarship.currency || ''} ${scholarship.awardAmount}` : 'Not published'],
      ['Application opens', scholarship.applicationOpenDate],
      ['Application deadline', scholarship.applicationDeadline],
      ['Application status', scholarship.applicationStatus],
      ['Last verified', scholarship.lastVerifiedAt],
    ].forEach(([label, value]) => addDetailItem(detailGrid, label, value));
    shell.append(detailGrid);
    createDetailSection(shell, 'Eligibility criteria', scholarship.eligibilityDetails || scholarship.academicRequirements);
    createDetailSection(shell, 'Scholarship benefits', scholarship.scholarshipBenefits);
    createDetailSection(shell, 'Required documents', scholarship.requiredDocuments);
    createDetailSection(shell, 'Application procedure', scholarship.applicationProcedure);
    createDetailSection(shell, 'Income requirements', scholarship.incomeRequirements);

    const source = createSourceLink({
      ...scholarship,
      sourceUrl: scholarship.officialSourceUrl,
      official: scholarship.verificationStatus === 'verified',
    });
    const sourceSection = document.createElement('section');
    sourceSection.className = 'detail-source';
    addText(sourceSection, 'h2', 'Original information source');
    addText(sourceSection, 'p', scholarship.sourceName || scholarship.providerName);
    if (source) sourceSection.append(source);
    shell.append(sourceSection);

    const notice = document.createElement('p');
    notice.className = 'application-notice';
    notice.textContent = 'Apply Now opens the original provider website in a new tab, so you will leave AccessScholar. Applications are processed by the official scholarship provider; AccessScholar does not award scholarships or make admission decisions.';
    shell.append(notice);
    const applicationLink = createApplicationLink({
      ...scholarship,
      name: scholarship.scholarshipName,
      applicationUrl: scholarship.officialApplicationUrl,
      official: scholarship.verificationStatus === 'verified',
    }, 'primary-btn');
    if (applicationLink) shell.append(applicationLink);
    else addText(shell, 'p', 'An official application URL has not been verified. Check the original source for application instructions.');
    shell.append(createReportButton(scholarship));
    scholarshipDetailContent.replaceChildren(shell);
    detailBreadcrumb.textContent = scholarship.scholarshipName;
    updatePageMetadata(`${scholarship.scholarshipName} | AccessScholar`, `Verified details, eligibility and official application information for ${scholarship.scholarshipName}.`);
  } catch (error) {
    console.error('Could not load verified scholarship details.', error);
    renderDetailError('This verified scholarship could not be found.');
  }
}

const navigateTo = async (url) => {
  window.history.pushState({}, '', url);
  const routePromise = routeCurrentPage();
  const isDetailRoute = /^\/scholarship\/[^/]+\/?$/.test(window.location.pathname);
  const heading = isDetailRoute
    ? scholarshipDetailContent
    : document.getElementById('search-title');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
  await routePromise;
  const detailHeading = isDetailRoute
    ? scholarshipDetailContent.querySelector('h1')
    : null;
  if (detailHeading) {
    detailHeading.tabIndex = -1;
    detailHeading.focus();
  }
};

async function routeCurrentPage() {
  const routeToken = ++currentRouteToken;
  const path = decodeURIComponent(window.location.pathname);
  const countryPath = path.match(/^\/scholarships\/([^/]+)\/?$/);
  const detailPath = path.match(/^\/scholarship\/([^/]+)\/?$/);
  mainNav.classList.remove('is-open');
  navToggle.setAttribute('aria-expanded', 'false');
  if (detailPath) {
    homePage.hidden = true;
    scholarshipDetailPage.hidden = false;
    updatePageMetadata('Scholarship details | AccessScholar', 'Verified scholarship eligibility, benefits and official application information.');
    await loadScholarshipDetail(detailPath[1]);
    return;
  }
  scholarshipDetailPage.hidden = true;
  homePage.hidden = false;
  searchForm.reset();
  resultsSort.value = 'latest';
  const query = new URLSearchParams(window.location.search);
  query.forEach((value, key) => {
    const field = searchForm.elements.namedItem(key);
    if (field && key !== 'page' && key !== 'limit' && key !== 'sort') field.value = value;
  });
  if (['latest', 'deadline', 'funding', 'new', 'verified'].includes(query.get('sort'))) resultsSort.value = query.get('sort');
  currentPage = Number(query.get('page')) || 1;
  if (countryPath) {
    const country = countries.find((item) => slugForCountry(item) === countryPath[1]);
    if (!country) {
      updatePageMetadata('Study destination | AccessScholar', 'Browse supported study destinations and verified scholarship opportunities.');
      if (routeToken === currentRouteToken) renderDetailError('This study destination is not in the supported country list.');
      homePage.hidden = true;
      scholarshipDetailPage.hidden = false;
      return;
    }
    destinationCountryFilter.value = country.code;
    document.getElementById('hero-title').textContent = `Scholarships for study in ${country.name}`;
    const title = `Scholarships in ${country.name} | AccessScholar`;
    document.getElementById('search-title').textContent = `Scholarships for study in ${country.name}`;
    updatePageMetadata(title, `Explore verified scholarship opportunities for study in ${country.name}, matched to published eligibility.`);
  } else {
    document.getElementById('hero-title').textContent = 'Discover Scholarships. Unlock Your Future.';
    document.getElementById('search-title').textContent = 'Find Scholarships';
    updatePageMetadata('AccessScholar | Discover Scholarships. Unlock Your Future.', 'Explore verified scholarship opportunities matched to your nationality, study destination, education level, and eligibility.');
  }
  heroDestination.value = destinationCountryFilter.value;
  heroLevel.value = document.getElementById('levelFilter').value;
  heroDisability.value = document.getElementById('disabilityFilter').value;
  heroKeyword.value = document.getElementById('keywordInput').value;
  await fetchScholarships();
}

const addDetailItem = (parent, label, value) => {
  const item = document.createElement('div');
  item.className = 'detail-item';
  addText(item, 'span', label);
  addText(item, 'strong', value || 'Not provided');
  parent.append(item);
};

const toggleSpeech = (shouldRead) => {
  if (!('speechSynthesis' in window)) {
    announceAccessibilityChange('Text-to-speech is not available in this browser.');
    return;
  }
  window.speechSynthesis.cancel();
  speechUtterance = null;
  if (!shouldRead) {
    announceAccessibilityChange('Speech stopped.');
    return;
  }

  const text = document.getElementById('main-content').innerText.replace(/\s+/g, ' ').trim();
  if (!text) {
    announceAccessibilityChange('There is no page text available to read.');
    return;
  }
  speechUtterance = new SpeechSynthesisUtterance(text);
  speechUtterance.lang = document.documentElement.lang || 'en';
  speechUtterance.rate = accessibilityState.speechSpeed;
  speechUtterance.voice = window.speechSynthesis.getVoices()
    .find((voice) => voice.name === accessibilityState.speechVoice) || null;
  speechUtterance.onstart = () => announceAccessibilityChange('Reading page aloud.');
  speechUtterance.onend = () => {
    speechUtterance = null;
    announceAccessibilityChange('Finished reading the page.');
  };
  speechUtterance.onerror = () => {
    speechUtterance = null;
    announceAccessibilityChange('Speech could not be completed.');
  };
  window.speechSynthesis.speak(speechUtterance);
};

const handleAccessibilityChange = (action) => {
  const visualMode = {
    'mode-light': 'light',
    'mode-dark': 'dark',
    'mode-contrast': 'contrast',
    'mode-inverted': 'inverted',
    'mode-grayscale': 'grayscale',
    'mode-warm': 'warm',
  }[action];
  const stateKey = {
    'dyslexia-font': 'dyslexiaFont',
    'line-spacing': 'lineSpacing',
    'letter-spacing': 'letterSpacing',
    'highlight-headings': 'highlightHeadings',
    'highlight-links': 'highlightLinks',
    'simplified-layout': 'simplifiedLayout',
    'reading-ruler': 'readingRuler',
    'reading-mask': 'readingMask',
    'large-cursor': 'largeCursor',
    'focus-highlight': 'focusHighlight',
    'highlight-controls': 'highlightControls',
    'reduce-motion': 'reduceMotion',
  }[action];

  if (visualMode) {
    accessibilityState.visualMode = visualMode;
  } else if (stateKey) {
    accessibilityState[stateKey] = !accessibilityState[stateKey];
    if (action === 'reading-ruler' && accessibilityState.readingRuler) accessibilityState.readingMask = false;
    if (action === 'reading-mask' && accessibilityState.readingMask) accessibilityState.readingRuler = false;
    announceAccessibilityChange(`${action.replaceAll('-', ' ')} ${accessibilityState[stateKey] ? 'enabled' : 'disabled'}.`);
  } else if (action === 'font-increase') {
    accessibilityState.fontScale = Math.min(160, accessibilityState.fontScale + 10);
    announceAccessibilityChange(`Text size ${accessibilityState.fontScale} percent.`);
  } else if (action === 'font-decrease') {
    accessibilityState.fontScale = Math.max(80, accessibilityState.fontScale - 10);
    announceAccessibilityChange(`Text size ${accessibilityState.fontScale} percent.`);
  } else if (action === 'read-aloud') {
    toggleSpeech(true);
    return;
  } else if (action === 'pause-speech') {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      announceAccessibilityChange('Speech paused.');
    } else {
      announceAccessibilityChange('There is no active speech to pause.');
    }
    return;
  } else if (action === 'resume-speech') {
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      announceAccessibilityChange('Speech resumed.');
    } else {
      announceAccessibilityChange('There is no paused speech to resume.');
    }
    return;
  } else if (action === 'stop-aloud') {
    toggleSpeech(false);
    return;
  } else if (action === 'save-settings') {
    saveAccessibilityState();
    announceAccessibilityChange('Accessibility preferences saved on this device.');
    return;
  } else if (action === 'reset') {
    Object.assign(accessibilityState, defaultAccessibilityState);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    speechUtterance = null;
    announceAccessibilityChange('Accessibility preferences reset.');
  }

  applyAccessibilityControls();
  saveAccessibilityState();
};

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  currentPage = 1;
  fetchScholarships();
});

heroSearchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  document.getElementById('keywordInput').value = heroKeyword.value.trim();
  destinationCountryFilter.value = heroDestination.value;
  document.getElementById('levelFilter').value = heroLevel.value;
  document.getElementById('disabilityFilter').value = heroDisability.value;
  currentPage = 1;
  fetchScholarships();
  document.getElementById('search').scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('clearFilters').addEventListener('click', () => {
  searchForm.reset();
  currentPage = 1;
  resultsSort.value = 'latest';
  renderActiveFilters();
  fetchScholarships();
});

resultsSort.addEventListener('change', () => {
  currentPage = 1;
  fetchScholarships();
});

const desktopFilterQuery = window.matchMedia('(min-width: 761px)');
const syncFilterDrawerForViewport = () => {
  filterDrawer.open = desktopFilterQuery.matches;
};
syncFilterDrawerForViewport();
if (desktopFilterQuery.addEventListener) {
  desktopFilterQuery.addEventListener('change', syncFilterDrawerForViewport);
} else {
  desktopFilterQuery.addListener(syncFilterDrawerForViewport);
}

previousPageButton.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage -= 1;
    fetchScholarships();
  }
});

nextPageButton.addEventListener('click', () => {
  currentPage += 1;
  fetchScholarships();
});

document.querySelectorAll('[data-accessibility]').forEach((button) => {
  button.addEventListener('click', () => handleAccessibilityChange(button.dataset.accessibility));
});

document.querySelectorAll('[data-accessibility-setting]').forEach((control) => {
  control.addEventListener('change', () => {
    const key = control.dataset.accessibilitySetting;
    accessibilityState[key] = key === 'speechSpeed' ? Number(control.value) : control.value;
    applyAccessibilityControls();
    saveAccessibilityState();
    if (key === 'speechVoice' || key === 'speechSpeed') announceAccessibilityChange('Speech preference updated.');
  });
});

const updateSpeechVoiceOptions = () => {
  if (!('speechSynthesis' in window)) {
    document.getElementById('speechVoice').disabled = true;
    return;
  }
  const voiceSelect = document.getElementById('speechVoice');
  const currentVoice = accessibilityState.speechVoice;
  voiceSelect.replaceChildren(new Option('Browser default', ''));
  window.speechSynthesis.getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith('en'))
    .forEach((voice) => voiceSelect.add(new Option(`${voice.name} (${voice.lang})`, voice.name)));
  if (Array.from(voiceSelect.options).some((option) => option.value === currentVoice)) voiceSelect.value = currentVoice;
  else {
    accessibilityState.speechVoice = '';
    voiceSelect.value = '';
  }
};

if ('speechSynthesis' in window) {
  updateSpeechVoiceOptions();
  window.speechSynthesis.addEventListener('voiceschanged', updateSpeechVoiceOptions);
}

const contrastRatio = (foreground, background) => {
  const luminance = (hex) => {
    const channels = hex.match(/[0-9a-f]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
    const [red, green, blue] = channels.map((channel) => (
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

const updateContrastResult = () => {
  const ratio = contrastRatio(
    document.getElementById('contrastForeground').value,
    document.getElementById('contrastBackground').value,
  );
  const normalTextPasses = ratio >= 4.5;
  const largeTextPasses = ratio >= 3;
  document.getElementById('contrastResult').textContent = `Contrast ratio ${ratio.toFixed(2)}:1. ${normalTextPasses ? 'Passes' : 'Does not pass'} WCAG AA for normal text and ${largeTextPasses ? 'passes' : 'does not pass'} for large text. This tool is an estimate for the selected colors, not a full page audit.`;
};

document.getElementById('contrastForeground').addEventListener('input', updateContrastResult);
document.getElementById('contrastBackground').addEventListener('input', updateContrastResult);
updateContrastResult();

document.addEventListener('pointermove', (event) => {
  const top = `${Math.max(0, Math.min(window.innerHeight - 48, event.clientY - 24))}px`;
  if (accessibilityState.readingRuler) readingRuler.style.top = top;
  if (accessibilityState.readingMask) readingMask.style.top = top;
});

document.addEventListener('click', (event) => {
  const reportButton = event.target.closest('[data-report-scholarship]');
  if (!reportButton) return;
  document.getElementById('reportScholarshipId').value = reportButton.dataset.reportScholarship;
  document.getElementById('reportScholarshipName').textContent = reportButton.dataset.scholarshipName;
  reportStatus.textContent = '';
  reportForm.reset();
  document.getElementById('reportScholarshipId').value = reportButton.dataset.reportScholarship;
  reportDialog.showModal();
});

document.getElementById('closeReportDialog').addEventListener('click', () => reportDialog.close());

reportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(reportForm));
  reportStatus.textContent = 'Sending report…';
  try {
    const response = await fetchJson('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    reportStatus.textContent = response.message;
    reportForm.reset();
  } catch (error) {
    console.error('Scholarship information report could not be submitted.', error);
    reportStatus.textContent = error.message.includes('429')
      ? 'Too many reports were submitted from this connection. Please try again later.'
      : 'Your report could not be submitted. Please try again later.';
  }
});

document.getElementById('saveProfile').addEventListener('click', () => {
  try {
    localStorage.setItem('accessScholarProfile', JSON.stringify(readStudentProfile()));
    profileStatus.textContent = 'Your profile is saved only in this browser. You can clear it here at any time.';
  } catch (error) {
    console.error('Student profile could not be saved.', error);
    profileStatus.textContent = 'Your profile could not be saved in this browser.';
  }
});

document.getElementById('clearProfile').addEventListener('click', () => {
  try {
    localStorage.removeItem('accessScholarProfile');
    profileForm.reset();
    profileMatches.hidden = true;
    profileMatches.replaceChildren();
    profileStatus.textContent = 'Saved profile cleared from this browser.';
  } catch (error) {
    console.error('Saved student profile could not be cleared.', error);
    profileStatus.textContent = 'The saved profile could not be cleared. Check browser storage settings.';
  }
});

profileForm.addEventListener('submit', (event) => {
  event.preventDefault();
  findProfileMatches();
});

accessibilityLauncher.addEventListener('click', () => accessibilityDialog.showModal());
closeAccessibilityDialog.addEventListener('click', () => accessibilityDialog.close());

accessibilityDialog.addEventListener('click', (event) => {
  if (event.target === accessibilityDialog) accessibilityDialog.close();
});

navToggle.addEventListener('click', () => {
  const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.setAttribute('aria-expanded', String(!isExpanded));
  mainNav.classList.toggle('is-open', !isExpanded);
});

mainNav.addEventListener('click', () => {
  mainNav.classList.remove('is-open');
  navToggle.setAttribute('aria-expanded', 'false');
});

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-country-route], a[data-scholarship-route]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const destination = new URL(link.href);
  if (link.dataset.countryRoute) {
    const params = new URLSearchParams();
    Array.from(searchForm.elements).forEach((field) => {
      if (field.name && field.name !== 'destinationCountry' && field.value) params.set(field.name, field.value.trim());
    });
    if (resultsSort.value !== 'latest') params.set('sort', resultsSort.value);
    destination.search = params.toString();
  }
  navigateTo(destination.href);
});

window.addEventListener('popstate', () => {
  routeCurrentPage();
});

restoreAccessibilityState();
applyAccessibilityControls();
loadFilters()
  .then(() => routeCurrentPage())
  .catch((error) => {
    console.error('Unable to load scholarship filter data.', error);
    announceAccessibilityChange('Search filters could not be loaded. Check the server connection or try again.');
    showSearchError(error);
  });
