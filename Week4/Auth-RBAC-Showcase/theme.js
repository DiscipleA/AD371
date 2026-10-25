(() => {
  "use strict";

  const MODE_STORAGE_KEY = "gk-theme";
  const STYLE_STORAGE_KEY = "gk-style-theme";
  const THEME_CONTROLLER_URL = document.currentScript?.src
    || [...document.scripts].reverse().find((script) => /\/theme\.js(?:[?#]|$)/.test(script.src))?.src
    || new URL("/theme.js", document.baseURI).href;
  const PROJECT_ROOT_URL = new URL("./", THEME_CONTROLLER_URL);
  const DEFAULT_MODE = "light";
  const DEFAULT_STYLE = "gothic-stickerboard";
  const VALID_MODES = new Set(["dark", "light"]);
  // Undefined defers to storage; null explicitly clears a dimension for this session.
  const sessionChoices = { mode: undefined, styleTheme: undefined };
  const pendingPackages = new Map();
  const LOAD_TIMEOUT_MS = 3500;

  const registry = window.PortfolioThemeRegistry;
  if (!registry?.getAll || registry.getAll().length === 0) {
    console.error("Theme packages were not registered before theme.js loaded.");
    return;
  }

  const readStorage = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const writeStorage = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* Storage can be unavailable in restricted local previews. */
    }
  };

  const getDefaultStyle = () => registry.has(DEFAULT_STYLE)
    ? DEFAULT_STYLE
    : registry.getDefault()?.id || "standard";
  const isValidMode = (mode) => VALID_MODES.has(mode);
  const isValidStyle = (styleTheme) => registry.has(styleTheme);
  const isSafeStyleId = (styleTheme) => /^[a-z0-9-]+$/.test(String(styleTheme || ""));

  const loadStoredThemePackage = (styleTheme) => {
    if (!styleTheme || registry.has(styleTheme) || !isSafeStyleId(styleTheme)) {
      return Promise.resolve(registry.has(styleTheme));
    }
    if (pendingPackages.has(styleTheme)) return pendingPackages.get(styleTheme);
    const existing = document.querySelector(`script[data-dynamic-theme-package="${styleTheme}"]`);
    if (existing?.dataset.loadState === "loaded") {
      return Promise.resolve(registry.has(styleTheme));
    }
    const reuse = existing?.dataset.loadState === "loading";
    if (!reuse) existing?.remove();
    const script = reuse ? existing : document.createElement("script");
    const promise = new Promise((resolve) => {
      const finish = (loaded) => {
        clearTimeout(timer);
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
        script.dataset.loadState = loaded ? "loaded" : "failed";
        if (!loaded) script.remove();
        pendingPackages.delete(styleTheme);
        resolve(loaded && registry.has(styleTheme));
      };
      const onLoad = () => finish(true);
      const onError = () => finish(false);
      const timer = setTimeout(onError, LOAD_TIMEOUT_MS);
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      if (!reuse) {
        script.src = new URL(`styles/themes/${styleTheme}/theme-config.js`, PROJECT_ROOT_URL).href;
        script.dataset.dynamicThemePackage = styleTheme;
        script.dataset.loadState = "loading";
        document.head.append(script);
      }
    });
    pendingPackages.set(styleTheme, promise);
    return promise;
  };

  const readSavedPreferences = () => ({
    mode: sessionChoices.mode !== undefined ? sessionChoices.mode : readStorage(MODE_STORAGE_KEY),
    styleTheme: sessionChoices.styleTheme !== undefined ? sessionChoices.styleTheme : readStorage(STYLE_STORAGE_KEY)
  });
  const clearSavedPreferences = () => {
    sessionChoices.mode = null;
    sessionChoices.styleTheme = null;
    for (const key of [MODE_STORAGE_KEY, STYLE_STORAGE_KEY]) {
      try { window.localStorage.removeItem(key); } catch { /* Session reset still takes effect. */ }
    }
  };

  // Public current preferences describe the local renderer, not pending storage intent.
  const getCurrentPreferences = () => {
    const { theme: mode, styleTheme } = document.documentElement.dataset;
    return {
      mode: isValidMode(mode) ? mode : DEFAULT_MODE,
      styleTheme: isValidStyle(styleTheme) ? styleTheme : getDefaultStyle()
    };
  };

  const getDesiredPreferences = () => {
    const { mode: storedMode, styleTheme: storedStyle } = readSavedPreferences();

    return {
      mode: isValidMode(storedMode) ? storedMode : DEFAULT_MODE,
      styleTheme: isValidStyle(storedStyle) ? storedStyle : getDefaultStyle()
    };
  };

  const ensureStyleLink = () => {
    const links = [...document.querySelectorAll("[data-style-theme-stylesheet]")];
    let link = links.find((candidate) =>
      candidate.hasAttribute("data-prepaint-theme-stylesheet")
    ) || links[0];

    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.dataset.styleThemeStylesheet = "";
      document.head.append(link);
    }

    /*
     * Historical pages retain their original bootstrap theme link. Once the
     * controller is running, keep the pre-paint link as the sole authoritative
     * theme stylesheet and remove duplicate bootstrap links.
     */
    links.forEach((candidate) => {
      if (candidate !== link) candidate.remove();
    });

    link.dataset.styleThemeStylesheet = "";
    return link;
  };

  const applyThemeStylesheet = (theme) => {
    const link = ensureStyleLink();
    if (theme.stylesheet && link.href !== theme.stylesheet) {
      link.href = theme.stylesheet;
    }
    link.dataset.activeStyleTheme = theme.id;
  };

  const updateThemeMeta = (mode, theme) => {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.append(meta);
    }
    meta.content = theme.colors?.[mode] || theme.colors?.dark || "#030712";
  };

  const updateThemeIcons = (theme) => {
    document.querySelectorAll("link[data-theme-managed-icon]").forEach((link) => link.remove());

    theme.icons.forEach((icon) => {
      const link = document.createElement("link");
      link.rel = icon.rel;
      if (icon.type) link.type = icon.type;
      if (icon.sizes) link.sizes = icon.sizes;
      link.href = icon.href;
      link.dataset.themeManagedIcon = theme.id;
      document.head.append(link);
    });
  };

  const updateControls = (mode, styleTheme) => {
    const nextMode = mode === "dark" ? "light" : "dark";
    const nextModeTitle = `${nextMode[0].toUpperCase()}${nextMode.slice(1)}`;

    document.querySelectorAll("[data-theme-toggle]").forEach((toggle) => {
      const label = toggle.querySelector("[data-theme-mode-label]");
      if (label) {
        label.textContent = `${nextModeTitle} Mode`;
      } else if (toggle.hasAttribute("data-profile-theme-toggle")) {
        toggle.textContent = `${nextModeTitle} Theme`;
      } else {
        toggle.textContent = `${nextModeTitle} Mode`;
      }

      toggle.dataset.themeState = mode;
      toggle.setAttribute("aria-label", `Current color mode is ${mode}. Switch to ${nextMode} mode.`);
      toggle.setAttribute("aria-pressed", String(mode === "light"));
      toggle.title = `Switch to ${nextMode} mode`;
    });

    document.querySelectorAll("[data-style-theme-option]").forEach((button) => {
      const isActive = button.dataset.styleThemeOption === styleTheme;
      button.dataset.active = String(isActive);
      button.setAttribute("aria-pressed", String(isActive));
      const status = button.querySelector("[data-style-theme-status]");
      if (status) status.textContent = isActive ? "Selected" : "";
    });

    const selectedTheme = registry.get(styleTheme);
    document.querySelectorAll("[data-current-style-theme]").forEach((label) => {
      label.textContent = selectedTheme?.label || registry.getDefault()?.label || "Standard";
    });
  };

  const applyPreferences = ({ mode, styleTheme, persist = false } = {}) => {
    const current = getCurrentPreferences();
    const explicitMode = isValidMode(mode);
    const explicitStyle = isValidStyle(styleTheme);
    mode ??= current.mode;
    styleTheme ??= current.styleTheme;
    const safeMode = isValidMode(mode) ? mode : DEFAULT_MODE;
    const safeStyle = isValidStyle(styleTheme) ? styleTheme : getDefaultStyle();
    const theme = registry.get(safeStyle) || registry.getDefault();

    document.documentElement.dataset.theme = safeMode;
    document.documentElement.dataset.styleTheme = theme.id;
    applyThemeStylesheet(theme);
    updateThemeMeta(safeMode, theme);
    updateThemeIcons(theme);
    updateControls(safeMode, theme.id);

    if (persist) {
      if (explicitMode) {
        sessionChoices.mode = safeMode;
        writeStorage(MODE_STORAGE_KEY, safeMode);
      }
      if (explicitStyle) {
        sessionChoices.styleTheme = theme.id;
        writeStorage(STYLE_STORAGE_KEY, theme.id);
      }
    }

    document.dispatchEvent(new CustomEvent("portfolio-themechange", {
      detail: { mode: safeMode, styleTheme: theme.id, theme, persist }
    }));

    return { mode: safeMode, styleTheme: theme.id };
  };

  const syncPreferences = async () => {
    const storedStyle = readSavedPreferences().styleTheme;

    if (isSafeStyleId(storedStyle) && !registry.has(storedStyle)) {
      await loadStoredThemePackage(storedStyle);
    }

    if (!isValidStyle(storedStyle) && !registry.has(DEFAULT_STYLE)) {
      await loadStoredThemePackage(DEFAULT_STYLE);
    }

    return applyPreferences(getDesiredPreferences());
  };

  const ready = syncPreferences();

  document.addEventListener("click", (event) => {
    const modeToggle = event.target.closest("[data-theme-toggle]");
    if (modeToggle) {
      const current = getCurrentPreferences();
      applyPreferences({
        mode: current.mode === "dark" ? "light" : "dark",
        persist: true
      });
      return;
    }

    const styleButton = event.target.closest("[data-style-theme-option]");
    if (!styleButton) return;
    const requestedStyle = styleButton.dataset.styleThemeOption;
    if (!isValidStyle(requestedStyle)) return;

    applyPreferences({ styleTheme: requestedStyle, persist: true });
  });

  document.addEventListener("DOMContentLoaded", () => { void syncPreferences(); });
  document.addEventListener("portfolio-navigationready", () => { void syncPreferences(); });

  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === MODE_STORAGE_KEY || event.key === STYLE_STORAGE_KEY) {
      if (event.key === null || event.key === MODE_STORAGE_KEY) sessionChoices.mode = event.key === null ? null : event.newValue;
      if (event.key === null || event.key === STYLE_STORAGE_KEY) sessionChoices.styleTheme = event.key === null ? null : event.newValue;
      document.dispatchEvent(new CustomEvent("portfolio-themechange", { detail: { persist: true } }));
      void syncPreferences();
    }
  });

  const ensureKnownTheme = async (styleTheme) => {
    const installed = new Set([
      "standard", "playful-pop", "raggedy-granite", "glossy-marble",
      "luminous-midnight", "gothic-stickerboard", "baroque-plexiglas"
    ]);
    if (!installed.has(styleTheme)) throw new Error("Theme is not an installed portfolio package.");
    if (!await loadStoredThemePackage(styleTheme)) throw new Error("Unable to load the installed theme package.");
    return registry.get(styleTheme);
  };
  const applyKnownPreferences = async (preferences, shouldApply = () => true) => {
    await ensureKnownTheme(preferences.styleTheme);
    if (!shouldApply()) return null;
    return applyPreferences(preferences);
  };
  window.portfolioTheme = Object.freeze({
    applyPreferences,
    applyKnownPreferences,
    ensureKnownTheme,
    readSavedPreferences,
    clearSavedPreferences,
    getCurrentPreferences,
    getThemes: registry.getAll,
    ready
  });

})();
