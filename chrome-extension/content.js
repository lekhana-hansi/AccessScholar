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

let activeUtterance = null;
let currentSettings = { ...defaultState };

const applyAccessibilityState = (settings = defaultState) => {
  currentSettings = { ...defaultState, ...settings };
  if (!currentSettings.visualMode) {
    if (settings.highContrast) currentSettings.visualMode = 'high-contrast';
    else if (settings.darkMode) currentSettings.visualMode = 'dark';
    else currentSettings.visualMode = 'light';
  }
  const body = document.body;
  body.classList.toggle('accessscholar-dark', currentSettings.visualMode === 'dark');
  body.classList.toggle('accessscholar-high-contrast', currentSettings.visualMode === 'high-contrast');
  body.classList.toggle('accessscholar-dyslexia-font', Boolean(currentSettings.dyslexiaFont));
  body.classList.toggle('accessscholar-highlight-links', Boolean(currentSettings.highlightLinks));
  body.classList.toggle('accessscholar-read-mode', Boolean(currentSettings.readMode));
  body.classList.toggle('accessscholar-large-cursor', Boolean(currentSettings.largeCursor));
  body.classList.toggle('accessscholar-reduce-motion', Boolean(currentSettings.reduceMotion));
  document.documentElement.style.setProperty('--accessscholar-font-scale', `${currentSettings.fontScale}%`);

  let ruler = document.getElementById('accessscholar-reading-ruler');
  if (currentSettings.readingRuler) {
    if (!ruler) {
      ruler = document.createElement('div');
      ruler.id = 'accessscholar-reading-ruler';
      ruler.className = 'accessscholar-reading-ruler';
      ruler.setAttribute('aria-hidden', 'true');
      document.documentElement.append(ruler);
    }
    ruler.hidden = false;
  } else if (ruler) {
    ruler.hidden = true;
  }
};

const stopSpeech = () => {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  activeUtterance = null;
};

const handleSpeech = (type, settings = currentSettings) => {
  if (!('speechSynthesis' in window)) return { ok: false, message: 'Text-to-speech is not supported on this page.' };
  if (type === 'stop-aloud') {
    stopSpeech();
    return { ok: true, message: 'Speech stopped.' };
  }
  if (type === 'pause-aloud') {
    if (!window.speechSynthesis.speaking || window.speechSynthesis.paused) {
      return { ok: false, message: 'There is no active speech to pause.' };
    }
    window.speechSynthesis.pause();
    return { ok: true, message: 'Speech paused.' };
  }
  if (type === 'resume-aloud') {
    if (!window.speechSynthesis.paused) return { ok: false, message: 'There is no paused speech to resume.' };
    window.speechSynthesis.resume();
    return { ok: true, message: 'Speech resumed.' };
  }

  stopSpeech();
  const text = document.body.innerText.replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, message: 'No page text is available to read.' };
  activeUtterance = new SpeechSynthesisUtterance(text);
  activeUtterance.rate = Math.min(2, Math.max(0.75, Number(settings.speechSpeed) || 1));
  activeUtterance.lang = document.documentElement.lang || 'en';
  activeUtterance.onend = () => { activeUtterance = null; };
  activeUtterance.onerror = () => { activeUtterance = null; };
  window.speechSynthesis.speak(activeUtterance);
  return { ok: true, message: 'Reading this page aloud.' };
};

chrome.storage.local.get('accessScholarSettings', (result) => {
  if (chrome.runtime.lastError) {
    console.error('AccessScholar accessibility preferences could not be loaded.', chrome.runtime.lastError.message);
    return;
  }
  applyAccessibilityState(result.accessScholarSettings || defaultState);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.accessScholarSettings) {
    applyAccessibilityState(changes.accessScholarSettings.newValue || defaultState);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'apply-accessibility') {
    applyAccessibilityState(message.settings);
    chrome.storage.local.set({ accessScholarSettings: message.settings }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, message: 'Settings could not be saved.' });
        return;
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  if (['read-aloud', 'pause-aloud', 'resume-aloud', 'stop-aloud'].includes(message.type)) {
    sendResponse(handleSpeech(message.type, message.settings));
    return true;
  }
  return false;
});
