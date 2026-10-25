(() => {
  "use strict";

  /*
   * PRE-PAINT THEME BOOTSTRAP
   *
   * Resolve the user's real style family and color mode while the parser is
   * still inside <head>. This prevents historical pages that bootstrap with
   * Standard/Dark from painting that state before theme.js can load the real
   * theme package.
   */
  if (!window.__portfolioThemePrepaintDone) {
    window.__portfolioThemePrepaintDone = true;

    const MODE_STORAGE_KEY = "gk-theme";
    const STYLE_STORAGE_KEY = "gk-style-theme";
    const DEFAULT_MODE = "light";
    const DEFAULT_STYLE = "gothic-stickerboard";
    const VALID_MODES = new Set(["dark", "light"]);
    const VALID_STYLES = new Set([
      "standard",
      "playful-pop",
      "raggedy-granite",
      "glossy-marble",
      "luminous-midnight",
      "gothic-stickerboard",
      "baroque-plexiglas"
    ]);

    const readStorage = (key) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    };

    const storedMode = readStorage(MODE_STORAGE_KEY);
    const storedStyle = readStorage(STYLE_STORAGE_KEY);
    const initialMode = VALID_MODES.has(storedMode) ? storedMode : DEFAULT_MODE;
    const initialStyle = VALID_STYLES.has(storedStyle) ? storedStyle : DEFAULT_STYLE;

    document.documentElement.dataset.theme = initialMode;
    document.documentElement.dataset.styleTheme = initialStyle;

    const registryScriptUrl = document.currentScript?.src;
    if (registryScriptUrl) {
      const projectRoot = new URL("../../", registryScriptUrl);
      const themeStylesheetUrl = new URL(
        `styles/themes/${initialStyle}/theme.css`,
        projectRoot
      ).href;

      /*
       * Parser-insert the selected stylesheet so it is render-blocking on the
       * first visit, instead of waiting for theme.js -> theme-config.js -> CSS.
       * initialStyle is restricted to the allowlist above.
       */
      document.write(
        `<link rel="stylesheet" href="${themeStylesheetUrl}" ` +
        `data-prepaint-theme-stylesheet data-style-theme-stylesheet ` +
        `data-active-style-theme="${initialStyle}">`
      );
    }
  }

  const existing = window.PortfolioThemeRegistry;
  if (existing?.register && existing?.getAll) return;

  const themes = new Map();

  const normalizeAssetUrl = (value) => {
    if (!value) return "";
    try {
      return new URL(value, document.baseURI).href;
    } catch {
      return String(value);
    }
  };

  const register = (definition) => {
    if (!definition || typeof definition !== "object") return;
    const id = String(definition.id || "").trim();
    const label = String(definition.label || "").trim();
    if (!id || !label) return;

    const normalized = {
      id,
      label,
      order: Number.isFinite(definition.order) ? definition.order : 999,
      isDefault: Boolean(definition.isDefault),
      stylesheet: normalizeAssetUrl(definition.stylesheet),
      colors: {
        dark: definition.colors?.dark || "#030712",
        light: definition.colors?.light || "#f3f6fb"
      },
      icons: Array.isArray(definition.icons)
        ? definition.icons
            .filter((icon) => icon?.href && icon?.rel)
            .map((icon) => ({
              rel: String(icon.rel),
              type: icon.type ? String(icon.type) : "",
              sizes: icon.sizes ? String(icon.sizes) : "",
              href: normalizeAssetUrl(icon.href)
            }))
        : []
    };

    themes.set(id, Object.freeze(normalized));
  };

  const get = (id) => themes.get(id) || null;
  const getAll = () => [...themes.values()].sort((a, b) => a.order - b.order);
  const getDefault = () => getAll().find((theme) => theme.isDefault) || getAll()[0] || null;
  const has = (id) => themes.has(id);

  window.PortfolioThemeRegistry = Object.freeze({ register, get, getAll, getDefault, has });
})();
