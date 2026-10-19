/* Live inspector: all remote text is rendered with textContent, never HTML.
 * The demo uses the shared service and controller; it owns no duplicate themes.
 */
(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const setText = (id, text) => { const node = byId(id); if (node) node.textContent = text; };
  const cards = new Map();
  const renderCards = () => {
    const host = byId('cloud-cards');
    if (!host) return;
    const themes = window.portfolioThemeCloud?.getOrderedThemes()
      || window.PortfolioThemeRegistry?.getAll() || [];
    const search = (byId('cloud-filter')?.value || '').trim().slice(0, 80).toLocaleLowerCase();
    const current = document.documentElement.dataset.styleTheme;
    let visible = 0;
    themes.forEach((theme, index) => {
      let card = cards.get(theme.id);
      if (!card) {
        card = document.createElement('article');
        card.className = 'cloud-lab__theme-card';
        const content = document.createElement('div');
        const heading = document.createElement('h4');
        heading.textContent = theme.label;
        const description = document.createElement('p');
        description.textContent = theme.id;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.styleThemeOption = theme.id;
        button.setAttribute('aria-label', `Preview ${theme.label}`);
        content.append(heading, description);
        card.append(content, button);
        cards.set(theme.id, card);
      }
      // Keep the same button nodes so keyboard focus survives ordinary updates.
      if (host.children[index] !== card) host.insertBefore(card, host.children[index] || null);
      const button = card.querySelector('button');
      button.setAttribute('aria-pressed', String(theme.id === current));
      button.textContent = theme.id === current ? 'Selected' : 'Preview';
      card.hidden = !`${theme.label} ${theme.id}`.toLocaleLowerCase().includes(search);
      if (!card.hidden) visible += 1;
    });
    byId('cloud-empty').hidden = visible !== 0;
  };
  const render = () => {
    const state = window.portfolioThemeCloud?.getState();
    renderCards();
    if (!state) {
      ['cloud-reload', 'cloud-offline', 'cloud-defaults'].forEach((id) => { byId(id).disabled = true; });
      setText('cloud-status', window.portfolioThemeCloudLoadError ? 'Cloud unavailable · local fallback' : 'Starting…');
      setText('cloud-message', window.portfolioThemeCloudLoadError || 'Waiting for the cloud service. No API read has been verified. Local theme controls remain available.');
      setText('cloud-source', 'Bundled defaults');
      setText('cloud-http', '—');
      setText('cloud-duration', '—');
      setText('cloud-count', '—');
      setText('cloud-current-value', `${window.PortfolioThemeRegistry?.get(document.documentElement.dataset.styleTheme)?.label || document.documentElement.dataset.styleTheme} · ${document.documentElement.dataset.theme}`);
      return;
    }
    const loading = state.status === 'loading';
    ['cloud-reload', 'cloud-offline', 'cloud-defaults'].forEach((id) => { byId(id).disabled = loading; });
    const status = state.simulation ? 'Offline simulation' : ({
      idle: 'Starting…', loading: 'Reading Supabase…', connected: 'Connected · live data', fallback: 'Fallback active'
    }[state.status] || state.status);
    setText('cloud-status', status);
    setText('cloud-source', { supabase: 'Supabase · live read', cache: 'Cache · last valid settings', local: 'Bundled defaults' }[state.source]);
    setText('cloud-http', state.simulation ? 'Not requested' : (state.httpStatus === null ? '—' : String(state.httpStatus)));
    setText('cloud-duration', state.simulation ? 'Not requested' : (state.durationMs === null ? '—' : `${state.durationMs} ms`));
    setText('cloud-count', state.status === 'connected' && !state.simulation ? '1' : '—');
    setText('cloud-message', loading ? 'Reading the public configuration. Local theme controls remain available.'
      : state.error || (state.status === 'connected' && state.httpStatus === 200 && !state.simulation
        ? 'Configuration loaded successfully. Your explicit style and mode choices take precedence over site defaults.'
        : 'No successful API read in this page session. Local theme controls remain available.'));
    const themeLabel = (id) => window.PortfolioThemeRegistry.get(id)?.label || id;
    setText('cloud-default-value', `${themeLabel(state.settings.default_theme)} · ${state.settings.default_mode}`);
    setText('cloud-current-value', `${themeLabel(document.documentElement.dataset.styleTheme)} · ${document.documentElement.dataset.theme}`);
    setText('cloud-fetched', state.fetchedAt || 'No successful request in this page session');
    setText('cloud-json', JSON.stringify(state.settings, null, 2));
  };
  const reportError = (error) => setText('cloud-message', `Unable to apply settings: ${error.message}`);
  byId('cloud-reload').addEventListener('click', () => void window.portfolioThemeCloud?.reload().catch(reportError));
  byId('cloud-offline').addEventListener('click', () => void window.portfolioThemeCloud?.reload({ simulateOffline: true }).catch(reportError));
  byId('cloud-defaults').addEventListener('click', () => void window.portfolioThemeCloud?.useCloudDefaults().catch(reportError));
  byId('cloud-filter').addEventListener('input', renderCards);
  document.addEventListener('portfolio-cloudthemechange', render);
  document.addEventListener('portfolio-themechange', render);
  render();
})();
