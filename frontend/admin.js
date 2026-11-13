const adminLogin = document.getElementById('adminLogin');
const adminTokenInput = document.getElementById('adminToken');
const adminStatus = document.getElementById('adminStatus');
const adminReports = document.getElementById('adminReports');
const databaseDashboard = document.getElementById('databaseDashboard');
const databaseMetrics = document.getElementById('databaseMetrics');
const adminSources = document.getElementById('adminSources');
const ingestionLogs = document.getElementById('ingestionLogs');
const verificationQueue = document.getElementById('verificationQueue');
const importStatus = document.getElementById('importStatus');
let adminToken = '';
const accessStatus = document.getElementById('adminAccessStatus');
const accessDialog = document.getElementById('adminAccessDialog');
const accessDefaults = {
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
const accessState = { ...accessDefaults };
let adminUtterance = null;

const applyAdminAccessibility = () => {
  const classes = ['dark-mode', 'high-contrast', 'inverted-colors', 'grayscale-mode', 'warm-reading-mode'];
  classes.forEach((className) => document.body.classList.remove(className));
  const modeClass = {
    dark: 'dark-mode',
    contrast: 'high-contrast',
    inverted: 'inverted-colors',
    grayscale: 'grayscale-mode',
    warm: 'warm-reading-mode',
  }[accessState.visualMode];
  if (modeClass) document.body.classList.add(modeClass);
  const bodyClasses = {
    lineSpacing: 'increase-line-spacing',
    letterSpacing: 'increase-letter-spacing',
    highlightHeadings: 'highlight-headings',
    dyslexiaFont: 'dyslexia-font',
    highlightLinks: 'highlight-links',
    simplifiedLayout: 'simplified-layout',
    largeCursor: 'large-cursor',
    focusHighlight: 'focus-highlight',
    highlightControls: 'highlight-controls',
    reduceMotion: 'reduce-motion',
  };
  Object.entries(bodyClasses).forEach(([key, className]) => document.body.classList.toggle(className, accessState[key]));
  document.body.style.setProperty('--reading-font', {
    system: 'Inter, "Segoe UI", Arial, sans-serif',
    'open-sans': '"Open Sans", Arial, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    atkinson: '"Atkinson Hyperlegible", Arial, sans-serif',
  }[accessState.fontFamily] || 'Inter, "Segoe UI", Arial, sans-serif');
  document.documentElement.style.setProperty('--font-scale', `${accessState.fontScale}%`);
  document.getElementById('adminReadingRuler').hidden = !accessState.readingRuler;
  document.getElementById('adminReadingMask').hidden = !accessState.readingMask;
  document.querySelectorAll('#adminAccessDialog [data-accessibility][aria-pressed]').forEach((button) => {
    const action = button.dataset.accessibility;
    const mode = action.startsWith('mode-') ? action.slice(5) : null;
    const keys = {
      'line-spacing': 'lineSpacing',
      'letter-spacing': 'letterSpacing',
      'highlight-headings': 'highlightHeadings',
      'dyslexia-font': 'dyslexiaFont',
      'highlight-links': 'highlightLinks',
      'simplified-layout': 'simplifiedLayout',
      'reading-ruler': 'readingRuler',
      'reading-mask': 'readingMask',
      'large-cursor': 'largeCursor',
      'focus-highlight': 'focusHighlight',
      'highlight-controls': 'highlightControls',
      'reduce-motion': 'reduceMotion',
    };
    button.setAttribute('aria-pressed', String(mode
      ? accessState.visualMode === (mode === 'contrast' ? 'contrast' : mode)
      : Boolean(accessState[keys[action]])));
  });
  document.querySelectorAll('#adminAccessDialog [data-accessibility-setting]').forEach((control) => {
    control.value = String(accessState[control.dataset.accessibilitySetting]);
  });
};

const saveAdminAccessibility = () => {
  try {
    localStorage.setItem('accessScholarSettings', JSON.stringify(accessState));
  } catch (error) {
    console.error('Accessibility preferences could not be saved.', error);
    accessStatus.textContent = 'Preferences changed but could not be saved on this browser.';
  }
};

try {
  const saved = JSON.parse(localStorage.getItem('accessScholarSettings') || '{}');
  Object.entries(accessDefaults).forEach(([key, value]) => {
    if (typeof saved[key] === typeof value) accessState[key] = saved[key];
  });
  if (!saved.visualMode) {
    if (saved.highContrast) accessState.visualMode = 'contrast';
    else if (saved.darkMode) accessState.visualMode = 'dark';
  }
} catch (error) {
  console.warn('Accessibility preferences could not be restored.', error);
}
applyAdminAccessibility();

const requestAdmin = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${adminToken}`,
    },
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Admin request failed.');
  return body;
};

const showReports = (reports) => {
  adminReports.replaceChildren();
  if (reports.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'There are no submitted reports.';
    adminReports.append(empty);
    return;
  }
  reports.forEach((report) => {
    const article = document.createElement('article');
    article.className = 'admin-report';
    const title = document.createElement('h2');
    title.textContent = `${report.reason.replaceAll('_', ' ')} — ${report.status}`;
    const details = document.createElement('p');
    details.textContent = report.details;
    const metadata = document.createElement('p');
    metadata.textContent = `Scholarship ID: ${report.scholarshipId} · Submitted: ${new Date(report.submittedAt).toLocaleString()}`;
    const link = document.createElement('a');
    link.href = `/scholarship/${encodeURIComponent(report.scholarshipId)}`;
    link.textContent = 'Review listing';
    article.append(title, details, metadata, link);
    if (report.status === 'pending') {
      const actions = document.createElement('div');
      actions.className = 'actions-wrap';
      ['reviewed', 'dismissed'].forEach((status) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary-btn';
        button.textContent = `Mark ${status}`;
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            await requestAdmin(`/api/admin/reports/${encodeURIComponent(report.id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status }),
            });
            await loadReports();
          } catch (error) {
            button.disabled = false;
            adminStatus.textContent = error.message;
          }
        });
        actions.append(button);
      });
      article.append(actions);
    }
    adminReports.append(article);
  });
};

const loadReports = async () => {
  adminStatus.textContent = 'Loading reports…';
  try {
    const result = await requestAdmin('/api/admin/reports');
    showReports(result.reports);
    adminStatus.textContent = 'Reports loaded. Verify each claim using the official source.';
  } catch (error) {
    adminReports.replaceChildren();
    adminStatus.textContent = error.message;
  }
};

const renderDatabaseMetrics = (summary) => {
  databaseMetrics.replaceChildren();
  [
    ['Scholarship records', summary.scholarshipTotal],
    ['Active verified opportunities', summary.activeScholarships],
    ['Expired records', summary.expiredScholarships],
    ['Awaiting verification', summary.pendingVerification],
    ['Official sources', summary.sourceTotal],
    ['Active sources', summary.activeSources],
    ['Failed sources', summary.failedSources],
    ['Last successful refresh', summary.lastSuccessfulSync ? new Date(summary.lastSuccessfulSync).toLocaleString() : 'No successful sync yet'],
  ].forEach(([label, value]) => {
    const tile = document.createElement('article');
    tile.className = 'admin-metric';
    const heading = document.createElement('h3');
    heading.textContent = label;
    const content = document.createElement('p');
    content.textContent = String(value ?? 0);
    tile.append(heading, content);
    databaseMetrics.append(tile);
  });
};

const renderDataSources = (sources, canManageSources) => {
  adminSources.replaceChildren();
  if (!sources.length) {
    adminSources.append(document.createTextNode('No sources are registered in the database.'));
    return;
  }
  sources.forEach((source) => {
    const article = document.createElement('article');
    article.className = 'admin-report';
    const title = document.createElement('h4');
    title.textContent = `${source.name} · ${source.country}`;
    const details = document.createElement('p');
    details.textContent = `${source.integrationMethod} · ${source.lastSyncStatus || 'never'} · Last success: ${source.lastSuccessfulSync ? new Date(source.lastSuccessfulSync).toLocaleString() : 'none'}`;
    const error = document.createElement('p');
    error.textContent = source.lastError ? `Last error: ${source.lastError}` : '';
    article.append(title, details, error);
    if (canManageSources) {
      const toggle = document.createElement('button');
      toggle.className = 'secondary-btn';
      toggle.type = 'button';
      toggle.textContent = source.enabled ? 'Disable source' : 'Enable source';
      toggle.addEventListener('click', async () => {
        toggle.disabled = true;
        try {
          await requestAdmin(`/api/admin/sources/${encodeURIComponent(source.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !source.enabled }),
          });
          await loadDatabaseData();
        } catch (requestError) {
          adminStatus.textContent = requestError.message;
          toggle.disabled = false;
        }
      });
      article.append(toggle);
    }
    adminSources.append(article);
  });
};

const renderVerificationQueue = (scholarships) => {
  verificationQueue.replaceChildren();
  if (!scholarships.length) {
    verificationQueue.append(document.createTextNode('No scholarships are awaiting verification.'));
    return;
  }
  scholarships.forEach((scholarship) => {
    const article = document.createElement('article');
    article.className = 'admin-report';
    const title = document.createElement('h4');
    title.textContent = scholarship.scholarshipName;
    const provider = document.createElement('p');
    provider.textContent = `Provider: ${scholarship.providerName} · Source: ${scholarship.sourceName}`;
    const source = document.createElement('a');
    source.href = scholarship.officialSourceUrl;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'Open official source';
    const form = document.createElement('form');
    form.className = 'admin-import-form';
    const statusLabel = document.createElement('label');
    statusLabel.textContent = 'Application status after review';
    const status = document.createElement('select');
    [
      ['unknown', 'Unknown'],
      ['open', 'Open'],
      ['opening_soon', 'Opening soon'],
      ['closed', 'Closed'],
      ['expired', 'Expired'],
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      status.append(option);
    });
    statusLabel.append(status);
    const deadlineLabel = document.createElement('label');
    deadlineLabel.textContent = 'Official deadline (optional)';
    const deadline = document.createElement('input');
    deadline.type = 'date';
    deadline.value = scholarship.applicationDeadline || '';
    deadlineLabel.append(deadline);
    const applicationLabel = document.createElement('label');
    applicationLabel.textContent = 'Official application URL (confirm source host)';
    const application = document.createElement('input');
    application.type = 'url';
    application.value = scholarship.officialApplicationUrl || '';
    application.required = true;
    applicationLabel.append(application);
    const confirmationLabel = document.createElement('label');
    const confirmation = document.createElement('input');
    confirmation.type = 'checkbox';
    confirmation.required = true;
    confirmationLabel.append(confirmation, document.createTextNode(' I checked the official source and verified the listing facts.'));
    const verify = document.createElement('button');
    verify.type = 'submit';
    verify.className = 'primary-btn';
    verify.textContent = 'Save review and mark verified';
    form.append(statusLabel, deadlineLabel, applicationLabel, confirmationLabel, verify);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      verify.disabled = true;
      try {
        await requestAdmin(`/api/admin/scholarships/${encodeURIComponent(scholarship.scholarshipId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verification_status: 'verified',
            application_status: status.value,
            last_verified_at: new Date().toISOString(),
            last_source_checked_at: new Date().toISOString(),
            application_deadline: deadline.value || null,
            official_application_url: application.value,
          }),
        });
        adminStatus.textContent = `${scholarship.scholarshipName} review saved.`;
        await loadDatabaseData();
      } catch (error) {
        adminStatus.textContent = error.message;
        verify.disabled = false;
      }
    });
    article.append(title, provider, source, form);
    verificationQueue.append(article);
  });
};

const renderIngestionLogs = (logs) => {
  ingestionLogs.replaceChildren();
  if (!logs.length) {
    ingestionLogs.append(document.createTextNode('No ingestion runs have been recorded.'));
    return;
  }
  logs.forEach((log) => {
    const article = document.createElement('article');
    article.className = 'admin-report';
    const title = document.createElement('h4');
    title.textContent = `${log.source_name || 'Manual import'} · ${log.status}`;
    const counts = document.createElement('p');
    counts.textContent = `Started: ${new Date(log.started_at).toLocaleString()} · Found: ${log.records_discovered} · Added: ${log.records_imported} · Updated: ${log.records_updated} · Duplicates: ${log.duplicate_records} · Rejected: ${log.records_rejected}`;
    const message = document.createElement('p');
    message.textContent = log.error_message || '';
    article.append(title, counts, message);
    ingestionLogs.append(article);
  });
};

const loadDatabaseData = async () => {
  try {
    const [dashboard, sources, logs, queue] = await Promise.all([
      requestAdmin('/api/admin/dashboard'),
      requestAdmin('/api/admin/sources'),
      requestAdmin('/api/admin/ingestion-logs'),
      requestAdmin('/api/admin/scholarships?verificationStatus=awaiting_verification'),
    ]);
    databaseDashboard.hidden = false;
    renderDatabaseMetrics(dashboard.summary);
    const canManageSources = dashboard.storage === 'postgresql';
    renderDataSources(sources.sources, canManageSources);
    renderIngestionLogs(logs.logs);
    renderVerificationQueue(queue.scholarships);
    document.getElementById('runSourceRefresh').disabled = !canManageSources;
    document.getElementById('sourceManagementNote').textContent = canManageSources
      ? 'Manage registered sources and permitted feed refreshes here.'
      : 'Source registry changes and automatic refresh require PostgreSQL. Local CSV imports use the registered sources shown below.';
    document.querySelectorAll('#addSourceForm input, #addSourceForm select, #addSourceForm button')
      .forEach((control) => { control.disabled = !canManageSources; });
    adminStatus.textContent = dashboard.storage === 'json_development_fallback'
      ? 'Local JSON catalog is active. Verified CSV imports are saved to the catalog used by search.'
      : 'PostgreSQL catalog is active.';
  } catch (error) {
    databaseDashboard.hidden = false;
    databaseMetrics.replaceChildren();
    adminSources.replaceChildren();
    ingestionLogs.replaceChildren();
    verificationQueue.replaceChildren();
    adminStatus.textContent = `Database administration unavailable: ${error.message}`;
  }
};

adminLogin.addEventListener('submit', (event) => {
  event.preventDefault();
  adminToken = adminTokenInput.value;
  adminTokenInput.value = '';
  loadReports();
  loadDatabaseData();
});

document.getElementById('adminLogout').addEventListener('click', () => {
  adminToken = '';
  adminReports.replaceChildren();
  databaseDashboard.hidden = true;
  adminStatus.textContent = 'Admin token cleared from memory.';
});

document.getElementById('runSourceRefresh').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  adminStatus.textContent = 'Running due official-source feeds. Manual-only sources are not scraped.';
  try {
    const result = await requestAdmin('/api/admin/refresh', { method: 'POST' });
    adminStatus.textContent = result.results.length
      ? 'Source refresh finished. Check logs for per-source outcomes.'
      : 'No JSON feed is currently due. Manual-only sources require a verified import.';
    await loadDatabaseData();
  } catch (error) {
    adminStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

const exportBtn = document.getElementById('exportScholarshipCsv');
if (exportBtn) {
  exportBtn.addEventListener('click', async () => {
    try {
      adminStatus.textContent = 'Preparing scholarship CSV export…';
      const response = await fetch('/api/admin/export-csv', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!response.ok) throw new Error('Failed to export CSV.');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accessscholar-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      adminStatus.textContent = 'Scholarship CSV downloaded.';
    } catch (error) {
      adminStatus.textContent = error.message;
    }
  });
}

document.getElementById('addSourceForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  values.refreshIntervalHours = Number(values.refreshIntervalHours);
  try {
    await requestAdmin('/api/admin/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    form.reset();
    adminStatus.textContent = 'Official source added.';
    await loadDatabaseData();
  } catch (error) {
    adminStatus.textContent = error.message;
  }
});

document.getElementById('csvImportForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const csv = document.getElementById('csvImportData').value;
  importStatus.textContent = 'Importing and validating CSV records…';
  try {
    const result = await requestAdmin('/api/admin/import-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv }),
    });
    importStatus.textContent = `Found ${result.discovered}; added ${result.imported}; updated ${result.updated}; duplicates ${result.duplicates}; rejected ${result.rejected.length}. ${result.rejected.map((item) => `Row ${item.row}: ${item.error}`).join(' ')}`;
    await loadDatabaseData();
  } catch (error) {
    importStatus.textContent = error.message;
  }
});

document.getElementById('adminAccessLauncher').addEventListener('click', () => accessDialog.showModal());
document.getElementById('adminAccessClose').addEventListener('click', () => accessDialog.close());

accessDialog.querySelectorAll('[data-accessibility]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.accessibility;
    const modes = {
      'mode-light': 'light',
      'mode-dark': 'dark',
      'mode-contrast': 'contrast',
      'mode-inverted': 'inverted',
      'mode-grayscale': 'grayscale',
      'mode-warm': 'warm',
    };
    const toggles = {
      'line-spacing': 'lineSpacing',
      'letter-spacing': 'letterSpacing',
      'highlight-headings': 'highlightHeadings',
      'dyslexia-font': 'dyslexiaFont',
      'highlight-links': 'highlightLinks',
      'simplified-layout': 'simplifiedLayout',
      'reading-ruler': 'readingRuler',
      'reading-mask': 'readingMask',
      'large-cursor': 'largeCursor',
      'focus-highlight': 'focusHighlight',
      'highlight-controls': 'highlightControls',
      'reduce-motion': 'reduceMotion',
    };
    if (modes[action]) accessState.visualMode = modes[action];
    else if (toggles[action]) {
      const key = toggles[action];
      accessState[key] = !accessState[key];
      if (action === 'reading-ruler' && accessState.readingRuler) accessState.readingMask = false;
      if (action === 'reading-mask' && accessState.readingMask) accessState.readingRuler = false;
    } else if (action === 'font-increase') accessState.fontScale = Math.min(160, accessState.fontScale + 10);
    else if (action === 'font-decrease') accessState.fontScale = Math.max(80, accessState.fontScale - 10);
    else if (action === 'read-aloud') {
      if (!('speechSynthesis' in window)) {
        accessStatus.textContent = 'Text-to-speech is not available in this browser.';
        return;
      }
      window.speechSynthesis.cancel();
      adminUtterance = new SpeechSynthesisUtterance(document.getElementById('main-content').innerText);
      adminUtterance.lang = document.documentElement.lang || 'en';
      adminUtterance.rate = accessState.speechSpeed;
      adminUtterance.voice = window.speechSynthesis.getVoices().find((voice) => voice.name === accessState.speechVoice) || null;
      window.speechSynthesis.speak(adminUtterance);
      accessStatus.textContent = 'Reading the admin page aloud.';
      return;
    } else if (action === 'pause-speech') {
      if (!('speechSynthesis' in window) || !window.speechSynthesis.speaking || window.speechSynthesis.paused) {
        accessStatus.textContent = 'There is no active speech to pause.';
        return;
      }
      window.speechSynthesis.pause();
      accessStatus.textContent = 'Speech paused.';
      return;
    } else if (action === 'resume-speech') {
      if (!('speechSynthesis' in window) || !window.speechSynthesis.paused) {
        accessStatus.textContent = 'There is no paused speech to resume.';
        return;
      }
      window.speechSynthesis.resume();
      accessStatus.textContent = 'Speech resumed.';
      return;
    } else if (action === 'stop-aloud') {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      adminUtterance = null;
      accessStatus.textContent = 'Speech stopped.';
      return;
    } else if (action === 'save-settings') {
      saveAdminAccessibility();
      accessStatus.textContent = 'Accessibility preferences saved on this device.';
      return;
    } else if (action === 'reset') {
      Object.assign(accessState, accessDefaults);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      adminUtterance = null;
      accessStatus.textContent = 'Accessibility preferences reset.';
    }
    applyAdminAccessibility();
    saveAdminAccessibility();
    accessStatus.textContent = 'Accessibility preferences updated.';
  });
});

document.querySelectorAll('#adminAccessDialog [data-accessibility-setting]').forEach((control) => {
  control.addEventListener('change', () => {
    const key = control.dataset.accessibilitySetting;
    accessState[key] = key === 'speechSpeed' ? Number(control.value) : control.value;
    applyAdminAccessibility();
    saveAdminAccessibility();
    accessStatus.textContent = 'Accessibility preference updated.';
  });
});

const updateAdminContrast = () => {
  const luminance = (hex) => {
    const channels = hex.match(/[0-9a-f]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
    const [red, green, blue] = channels.map((channel) => (
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const values = [
    luminance(document.getElementById('adminContrastForeground').value),
    luminance(document.getElementById('adminContrastBackground').value),
  ].sort((a, b) => b - a);
  const ratio = (values[0] + 0.05) / (values[1] + 0.05);
  document.getElementById('adminContrastResult').textContent = `Contrast ratio ${ratio.toFixed(2)}:1. ${ratio >= 4.5 ? 'Passes' : 'Does not pass'} WCAG AA for normal text and ${ratio >= 3 ? 'passes' : 'does not pass'} for large text.`;
};

document.getElementById('adminContrastForeground').addEventListener('input', updateAdminContrast);
document.getElementById('adminContrastBackground').addEventListener('input', updateAdminContrast);
updateAdminContrast();

if ('speechSynthesis' in window) {
  const fillVoiceList = () => {
    const select = document.getElementById('adminSpeechVoice');
    const currentVoice = accessState.speechVoice;
    select.replaceChildren(new Option('Browser default', ''));
    window.speechSynthesis.getVoices()
      .filter((voice) => voice.lang.toLowerCase().startsWith('en'))
      .forEach((voice) => select.add(new Option(`${voice.name} (${voice.lang})`, voice.name)));
    if (Array.from(select.options).some((option) => option.value === currentVoice)) select.value = currentVoice;
    else {
      accessState.speechVoice = '';
      select.value = '';
    }
  };
  fillVoiceList();
  window.speechSynthesis.addEventListener('voiceschanged', fillVoiceList);
} else {
  document.getElementById('adminSpeechVoice').disabled = true;
}

document.addEventListener('pointermove', (event) => {
  const top = `${Math.max(0, Math.min(window.innerHeight - 48, event.clientY - 24))}px`;
  if (accessState.readingRuler) document.getElementById('adminReadingRuler').style.top = top;
  if (accessState.readingMask) document.getElementById('adminReadingMask').style.top = top;
});
