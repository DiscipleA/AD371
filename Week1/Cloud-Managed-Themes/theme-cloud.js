/* Cloud configuration is data, never remote CSS or executable code.
 * The current portfolio controller remains the only theme renderer.
 */
(function (root, factory) {
  'use strict';
  const core = factory();
  if (typeof module === 'object' && module.exports) { module.exports = core; return; }
  root.PortfolioThemeCloudCore = core;
  if (!root.document || !root.portfolioTheme || root.portfolioThemeCloud) return;

  const CACHE_KEY = 'portfolio-cloud-theme-settings-v1';
  const LOCAL = core.normalizeSettings({
    id: 'portfolio', default_theme: 'gothic-stickerboard', default_mode: 'light',
    theme_order: [...core.THEME_IDS]
  });
  const readCache = () => {
    try {
      const saved = JSON.parse(root.localStorage.getItem(CACHE_KEY));
      if (saved?.projectUrl !== root.PortfolioThemeCloudConnection?.projectUrl) return null;
      return core.normalizeSettings(saved.settings);
    } catch { return null; }
  };
  const cached = readCache();
  let state = Object.freeze({
    status: 'idle', source: cached ? 'cache' : 'local', settings: cached || LOCAL,
    httpStatus: null, durationMs: null, fetchedAt: null, error: '', simulation: false
  });
  let revision = 0;
  let selectionEpoch = 0;
  let activeController = null;

  const publish = (next) => {
    state = Object.freeze({ ...state, ...next });
    root.document.dispatchEvent(new CustomEvent('portfolio-cloudthemechange', { detail: state }));
    return state;
  };
  const rememberSelection = (event) => {
    if (event.detail?.persist === true) selectionEpoch += 1;
  };
  root.document.addEventListener('portfolio-themechange', rememberSelection);

  const apply = async (settings, ticket) => {
    while (ticket === revision) {
      // Resolve after the response, then retry if explicit choices change while
      // metadata loads. A partial choice overrides only its own dimension.
      const epoch = selectionEpoch;
      const preferences = core.resolvePreferences(settings, root.portfolioTheme.readSavedPreferences());
      try {
        await root.portfolioTheme.applyKnownPreferences(preferences,
          () => ticket === revision && epoch === selectionEpoch);
      } catch (error) {
        if (ticket !== revision) return;
        if (epoch !== selectionEpoch) continue;
        // Renderer availability is independent of a successful configuration read.
        // Leave the current valid local renderer untouched, including its mode.
        publish({ error: `Configuration available, but theme ${preferences.styleTheme} could not load. Keeping the current local renderer. ${error.message}` });
      }
      if (epoch === selectionEpoch) return;
    }
  };
  const reload = async ({ simulateOffline = false } = {}) => {
    const ticket = ++revision;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const start = performance.now();
    let observedStatus = null;
    publish({ status: 'loading', httpStatus: null, durationMs: null, error: '', simulation: simulateOffline });
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      if (simulateOffline) throw new Error('Offline simulation: network request intentionally skipped.');
      const observedFetch = async (url, options) => {
        const response = await root.fetch(url, options);
        observedStatus = response.status;
        return response;
      };
      const result = await core.readRemote(observedFetch, root.PortfolioThemeCloudConnection, controller.signal);
      if (ticket !== revision) return state;
      const fetchedAt = new Date().toISOString();
      try {
        root.localStorage.setItem(CACHE_KEY, JSON.stringify({
          projectUrl: root.PortfolioThemeCloudConnection.projectUrl,
          settings: result.settings, fetchedAt
        }));
      } catch { /* Restricted storage must not break rendering or network reads. */ }
      publish({ settings: result.settings, source: 'supabase', status: 'connected',
        httpStatus: result.httpStatus, durationMs: Math.round(performance.now() - start), fetchedAt,
        error: '', simulation: false });
      await apply(result.settings, ticket);
    } catch (error) {
      if (ticket !== revision) return state;
      const fallback = readCache();
      const settings = fallback || LOCAL;
      publish({ settings, source: fallback ? 'cache' : 'local', status: 'fallback',
        httpStatus: observedStatus, durationMs: Math.round(performance.now() - start),
        error: error.name === 'AbortError' ? 'Request timed out. Local theme controls remain available.' : error.message,
        simulation: simulateOffline });
      await apply(settings, ticket);
    } finally {
      clearTimeout(timer);
    }
    return state;
  };

  const orderedThemes = () => {
    const themes = root.PortfolioThemeRegistry.getAll();
    const rank = new Map(state.settings.theme_order.map((id, index) => [id, index]));
    return themes.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
  };
  const useCloudDefaults = async () => {
    // Explicit opt-in from the showcase: clears this browser's choices only.
    root.portfolioTheme.clearSavedPreferences();
    const ticket = ++revision;
    ++selectionEpoch;
    activeController?.abort();
    if (state.status === 'loading') publish({ status: 'fallback', error: 'Request cancelled by your selection.' });
    await apply(state.settings, ticket);
    root.document.dispatchEvent(new CustomEvent('portfolio-cloudthemechange', { detail: state }));
  };

  root.portfolioThemeCloud = Object.freeze({
    getState: () => state, reload, getOrderedThemes: orderedThemes, useCloudDefaults
  });
  // Start the GET independently of every local metadata package, even the
  // initial renderer. Individual package completions backfill cards/menu.
  void reload();
  for (const id of core.THEME_IDS) {
    void root.portfolioTheme.ensureKnownTheme(id).then(() => {
      root.document.dispatchEvent(new CustomEvent('portfolio-cloudthemechange', { detail: state }));
    }).catch(() => { /* One failed package must not suppress the API or other packages. */ });
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const THEME_IDS = Object.freeze([
    'standard', 'playful-pop', 'raggedy-granite', 'glossy-marble',
    'luminous-midnight', 'gothic-stickerboard', 'baroque-plexiglas'
  ]);
  const known = new Set(THEME_IDS);
  const normalizeSettings = (record) => {
    if (!record || record.id !== 'portfolio') throw new Error('Invalid theme configuration identity.');
    if (!known.has(record.default_theme)) throw new Error('Unknown default theme.');
    if (!['light', 'dark'].includes(record.default_mode)) throw new Error('Invalid default mode.');
    const order = record.theme_order;
    if (!Array.isArray(order) || order.length !== THEME_IDS.length || new Set(order).size !== THEME_IDS.length
      || order.some((id) => !known.has(id))) throw new Error('Theme order must contain every installed theme exactly once.');
    return Object.freeze({ id: 'portfolio', default_theme: record.default_theme,
      default_mode: record.default_mode, theme_order: Object.freeze([...order]) });
  };
  const resolvePreferences = (record, saved = {}) => {
    const settings = normalizeSettings(record);
    return { mode: ['light', 'dark'].includes(saved.mode) ? saved.mode : settings.default_mode,
      styleTheme: known.has(saved.styleTheme) ? saved.styleTheme : settings.default_theme };
  };
  const readRemote = async (fetchImpl, connection, signal) => {
    let url;
    try { url = new URL(connection?.projectUrl); } catch { throw new Error('Invalid Supabase project URL.'); }
    if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)
      || url.username || url.password || url.port || (url.pathname !== '/' && url.pathname !== '')) {
      throw new Error('Invalid Supabase project URL.');
    }
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(connection?.publishableKey || '')) {
      throw new Error('A publishable browser key is required. Secret keys are prohibited.');
    }
    const endpoint = new URL('/rest/v1/portfolio_theme_settings', url);
    endpoint.search = new URLSearchParams({ id: 'eq.portfolio', select: 'id,default_theme,default_mode,theme_order' }).toString();
    const response = await fetchImpl(endpoint.href, {
      method: 'GET', headers: { apikey: connection.publishableKey, Accept: 'application/json' },
      cache: 'no-store', signal
    });
    if (!response.ok) throw new Error(`Supabase returned HTTP ${response.status}.`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Expected exactly one configuration row.');
    return { settings: normalizeSettings(rows[0]), httpStatus: response.status };
  };
  return Object.freeze({ THEME_IDS, normalizeSettings, resolvePreferences, readRemote });
});
