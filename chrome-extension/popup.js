const defaultState = {
  visualMode: 'light',
  dyslexiaFont: false,
  highlightLinks: false,
  readMode: false,
  readingRuler: false,
  largeCursor: false,
  reduceMotion: false,
  fontScale: 100,
  speechSpeed: 1,
};

const state = { ...defaultState };
const status = document.getElementById('extensionStatus');

const updateButtonStates = () => {
  document.querySelectorAll('[data-action][aria-pressed]').forEach((button) => {
    const action = button.dataset.action;
    const stateKey = {
      'dark-mode': 'darkMode',
      'high-contrast': 'highContrast',
      'dyslexia-font': 'dyslexiaFont',
      'highlight-links': 'highlightLinks',
      'read-mode': 'readMode',
      'reading-ruler': 'readingRuler',
      'large-cursor': 'largeCursor',
      'reduce-motion': 'reduceMotion',
    }[action];
    const active = action === 'dark-mode'
      ? state.visualMode === 'dark'
      : action === 'high-contrast'
        ? state.visualMode === 'high-contrast'
        : Boolean(state[stateKey]);
    button.setAttribute('aria-pressed', String(active));
  });
  document.getElementById('speechSpeed').value = String(state.speechSpeed);
};

const persistState = () => {
  chrome.storage.local.set({ accessScholarSettings: state }, () => {
    if (chrome.runtime.lastError) {
      status.textContent = `Settings could not be saved: ${chrome.runtime.lastError.message}`;
      return;
    }
    status.textContent = 'Settings saved on this browser.';
  });
};

const sendToActiveTab = (message) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      status.textContent = `Unable to access the active tab: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (!tabs[0] || !tabs[0].id) {
      status.textContent = 'No active browser tab was found.';
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
      if (chrome.runtime.lastError) {
        status.textContent = 'This browser page does not allow extension tools. Try a regular website.';
        return;
      }
      if (response && response.ok === false) status.textContent = response.message;
      else if (response && response.message) status.textContent = response.message;
      else if (message.type === 'apply-accessibility') status.textContent = 'Settings applied to this page and saved for future pages.';
    });
  });
};

const applyToActiveTab = () => sendToActiveTab({ type: 'apply-accessibility', settings: state });

const handleAction = (action) => {
  if (['read-aloud', 'pause-aloud', 'resume-aloud', 'stop-aloud'].includes(action)) {
    const type = {
      'read-aloud': 'read-aloud',
      'pause-aloud': 'pause-aloud',
      'resume-aloud': 'resume-aloud',
      'stop-aloud': 'stop-aloud',
    }[action];
    sendToActiveTab({ type, settings: state });
    return;
  }
  switch (action) {
    case 'dark-mode':
      state.visualMode = state.visualMode === 'dark' ? 'light' : 'dark';
      break;
    case 'high-contrast':
      state.visualMode = state.visualMode === 'high-contrast' ? 'light' : 'high-contrast';
      break;
    case 'font-increase':
      state.fontScale = Math.min(160, state.fontScale + 10);
      break;
    case 'font-decrease':
      state.fontScale = Math.max(80, state.fontScale - 10);
      break;
    case 'dyslexia-font':
      state.dyslexiaFont = !state.dyslexiaFont;
      break;
    case 'highlight-links':
      state.highlightLinks = !state.highlightLinks;
      break;
    case 'read-mode':
      state.readMode = !state.readMode;
      break;
    case 'reading-ruler':
      state.readingRuler = !state.readingRuler;
      break;
    case 'large-cursor':
      state.largeCursor = !state.largeCursor;
      break;
    case 'reduce-motion':
      state.reduceMotion = !state.reduceMotion;
      break;
    case 'reset':
      Object.assign(state, defaultState);
      break;
    default:
      return;
  }
  persistState();
  updateButtonStates();
  applyToActiveTab();
};

chrome.storage.local.get('accessScholarSettings', (result) => {
  if (chrome.runtime.lastError) {
    status.textContent = `Saved settings could not be loaded: ${chrome.runtime.lastError.message}`;
    return;
  }
  if (result.accessScholarSettings) {
    const saved = result.accessScholarSettings;
    Object.assign(state, saved);
    if (!saved.visualMode) {
      if (saved.highContrast) state.visualMode = 'high-contrast';
      else if (saved.darkMode) state.visualMode = 'dark';
    }
  }
  state.fontScale = Math.min(160, Math.max(80, Number(state.fontScale) || 100));
  updateButtonStates();
  applyToActiveTab();
});

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => handleAction(button.dataset.action));
});

document.getElementById('speechSpeed').addEventListener('change', (event) => {
  state.speechSpeed = Number(event.target.value);
  persistState();
  applyToActiveTab();
});
