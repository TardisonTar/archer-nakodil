'use strict';
(() => {
  const STORAGE_KEY = 'crec-theme';
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const readSavedTheme = () => {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch {
      return null;
    }
  };

  const preferredTheme = () => readSavedTheme() || (media.matches ? 'dark' : 'light');

  const applyTheme = (theme, persist = false) => {
    const next = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = next;
    root.style.colorScheme = next;

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', next === 'dark' ? '#0d1219' : '#081c3b');

    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      const dark = next === 'dark';
      toggle.setAttribute('aria-checked', String(dark));
      toggle.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
      toggle.dataset.theme = next;
    }

    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Storage can be unavailable in privacy modes. */ }
    }
  };

  applyTheme(preferredTheme());

  const bind = () => {
    applyTheme(root.dataset.theme || preferredTheme());
    const toggle = document.getElementById('theme-toggle');
    if (!toggle || toggle.dataset.bound === 'true') return;
    toggle.dataset.bound = 'true';
    toggle.addEventListener('click', () => {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();

  const syncSystemTheme = event => {
    if (!readSavedTheme()) applyTheme(event.matches ? 'dark' : 'light');
  };
  if (typeof media.addEventListener === 'function') media.addEventListener('change', syncSystemTheme);
  else if (typeof media.addListener === 'function') media.addListener(syncSystemTheme);

  window.CRECTheme = Object.freeze({
    get: () => root.dataset.theme || preferredTheme(),
    set: theme => applyTheme(theme, true)
  });
})();
