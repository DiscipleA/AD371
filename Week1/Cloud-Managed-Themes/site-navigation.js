(() => {
  "use strict";
  const escapeAttribute = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const renderThemeOptions = () => {
    const themes = window.portfolioThemeCloud?.getOrderedThemes?.()
      || window.PortfolioThemeRegistry?.getAll?.() || [];
    return themes.map((theme) => `
            <button class="portfolio-theme-menu__item" type="button" data-style-theme-option="${escapeAttribute(theme.id)}" aria-pressed="${theme.isDefault ? "true" : "false"}">
              <span>${escapeAttribute(theme.label)}</span>
              <span class="portfolio-theme-menu__status" data-style-theme-status>${theme.isDefault ? "Selected" : ""}</span>
            </button>`).join("");
  };

  // Standalone navigation: only local section anchors, with original controls.
  const renderNavigation = (mount) => {
    const sections = [
      ['problem-title', 'Problem & Scope'], ['concepts-title', 'Architecture Concepts'],
      ['architecture-title', 'System Architecture'], ['prompt-title', 'AI Prompt'],
      ['audit-title', 'Audit'], ['final-result', 'Working System'], ['verification-title', 'Verification']
    ];
    mount.outerHTML = `
      <header class="portfolio-banner">
        <div class="portfolio-banner__inner">
          <a class="portfolio-banner__profile" href="#main-content">Cloud Themes</a>
          <div class="portfolio-banner__actions">
            <div class="portfolio-theme-menu" data-open="false">
              <button class="portfolio-theme-menu__toggle" type="button" aria-expanded="false" aria-haspopup="true">Themes</button>
              <div class="portfolio-theme-menu__panel" aria-label="Theme controls" tabindex="-1" inert>
                <button class="portfolio-theme-menu__item portfolio-theme-menu__mode" type="button" data-theme-toggle aria-pressed="false">
                  <span>Dark / Light</span><span class="portfolio-theme-menu__status" data-theme-mode-label>Light Mode</span>
                </button>
                <div class="portfolio-theme-menu__divider" aria-hidden="true"></div>
                ${renderThemeOptions()}
              </div>
            </div>
            <nav class="portfolio-menu" data-open="false" aria-label="Showcase sections">
              <button class="portfolio-menu__toggle" type="button" aria-expanded="false" aria-haspopup="true">Menu</button>
              <div class="portfolio-menu__panel" aria-label="App Engineering Showcases" tabindex="-1" inert>
                ${sections.map(([id, label]) => `<a class="portfolio-menu__item" href="#${id}">${label}</a>`).join('')}
              </div>
            </nav>
          </div>
        </div>
      </header>`;
  };

  const setOpen = (element, button, open) => {
    if (!element || !button) return;
    element.dataset.open = String(open);
    button.setAttribute("aria-expanded", String(open));
    const panel = element.querySelector(":scope > div");
    if (panel) panel.inert = !open;
  };

  const closeNestedMenus = (menu, except = null) => {
    menu?.querySelectorAll(".portfolio-showcase-menu, .portfolio-build-menu").forEach((nestedMenu) => {
      if (nestedMenu === except) return;
      setOpen(nestedMenu, nestedMenu.querySelector(":scope > button"), false);
    });
  };

  const closeAllMenus = ({ except = null, restoreFocus = false } = {}) => {
    document.querySelectorAll(".portfolio-theme-menu, .portfolio-menu").forEach((menu) => {
      if (menu === except) return;
      const toggle = menu.querySelector(":scope > button");
      const wasOpen = menu.dataset.open === "true";
      setOpen(menu, toggle, false);
      closeNestedMenus(menu);
      if (restoreFocus && wasOpen) toggle?.focus();
    });
  };


  const canUseHoverMenus = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const openMenuForPointer = (menu) => {
    if (!menu) return;

    const toggle = menu.querySelector(":scope > button");

    if (menu.classList.contains("portfolio-theme-menu") || menu.classList.contains("portfolio-menu")) {
      closeAllMenus({ except: menu });
    }

    if (menu.classList.contains("portfolio-showcase-menu") || menu.classList.contains("portfolio-build-menu")) {
      const parentMenu = menu.closest(".portfolio-menu");
      closeNestedMenus(parentMenu, menu);
      setOpen(parentMenu, parentMenu?.querySelector(":scope > button"), true);
    }

    setOpen(menu, toggle, true);
  };

  const closeMenuForPointer = (menu) => {
    if (!menu) return;

    setOpen(menu, menu.querySelector(":scope > button"), false);

    if (menu.classList.contains("portfolio-menu")) {
      closeNestedMenus(menu);
    }
  };

  const reconcilingThemeMenus = new WeakSet();
  const bindPointerNavigationEvents = () => {
    document
      .querySelectorAll(".portfolio-theme-menu, .portfolio-menu, .portfolio-showcase-menu, .portfolio-build-menu")
      .forEach((menu) => {
        menu.addEventListener("pointerenter", (event) => {
          if (event.pointerType !== "mouse" || !canUseHoverMenus()) return;
          openMenuForPointer(menu);
        });

        menu.addEventListener("pointerleave", (event) => {
          if (event.pointerType !== "mouse" || !canUseHoverMenus()) return;
          closeMenuForPointer(menu);
        });

        menu.addEventListener("focusout", (event) => {
          const nextFocus = event.relatedTarget;
          // Chromium blurs a focused button when insertBefore moves it.
          // Only suppress that transient, targetless blur during reconciliation.
          if (nextFocus === null && reconcilingThemeMenus.has(menu)) return;
          if (nextFocus instanceof Node && menu.contains(nextFocus)) return;
          closeMenuForPointer(menu);
        });
      });
  };

  const bindNavigationEvents = () => {
    document.addEventListener("click", (event) => {
      const themeToggle = event.target.closest(".portfolio-theme-menu__toggle");
      if (themeToggle) {
        event.stopPropagation();
        const menu = themeToggle.closest(".portfolio-theme-menu");
        const next = menu?.dataset.open !== "true";
        closeAllMenus({ except: menu });
        setOpen(menu, themeToggle, next);
        return;
      }

      const menuToggle = event.target.closest(".portfolio-menu__toggle");
      if (menuToggle) {
        event.stopPropagation();
        const menu = menuToggle.closest(".portfolio-menu");
        const next = menu?.dataset.open !== "true";
        closeAllMenus({ except: menu });
        setOpen(menu, menuToggle, next);
        if (!next) closeNestedMenus(menu);
        return;
      }

      const showcaseToggle = event.target.closest(".portfolio-showcase-menu__toggle");
      if (showcaseToggle) {
        event.stopPropagation();
        const submenu = showcaseToggle.closest(".portfolio-showcase-menu");
        const parent = submenu?.closest(".portfolio-menu");
        const next = submenu?.dataset.open !== "true";
        closeNestedMenus(parent, submenu);
        setOpen(submenu, showcaseToggle, next);
        return;
      }

      const buildToggle = event.target.closest(".portfolio-build-menu__toggle");
      if (buildToggle) {
        event.stopPropagation();
        const submenu = buildToggle.closest(".portfolio-build-menu");
        const parent = submenu?.closest(".portfolio-menu");
        const next = submenu?.dataset.open !== "true";
        closeNestedMenus(parent, submenu);
        setOpen(submenu, buildToggle, next);
        return;
      }

      const menuChoice = event.target.closest(
        ".portfolio-theme-menu__item, .portfolio-menu__item, .portfolio-showcase-menu__item, .portfolio-build-menu__item"
      );

      if (menuChoice) {
        closeAllMenus();
        menuChoice.blur?.();
        return;
      }

      if (!event.target.closest(".portfolio-theme-menu, .portfolio-menu")) closeAllMenus();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAllMenus({ restoreFocus: true });
    });
  };

  const refreshThemeOrder = () => {
    const panel = document.querySelector(".portfolio-theme-menu__panel");
    if (!panel) return;
    const focused = document.activeElement;
    const menu = panel.closest(".portfolio-theme-menu");
    const wasOpen = menu?.dataset.open === "true";
    const restoreFocus = wasOpen && panel.contains(focused);
    if (menu) reconcilingThemeMenus.add(menu);
    try {
      // Pages may initially register only three packages. Add missing options
      // with the established markup once all local metadata becomes available.
      const template = document.createElement("template");
      template.innerHTML = renderThemeOptions();
      [...template.content.querySelectorAll("[data-style-theme-option]")].forEach((button) => {
        const exists = [...panel.querySelectorAll("[data-style-theme-option]")]
          .some((candidate) => candidate.dataset.styleThemeOption === button.dataset.styleThemeOption);
        if (!exists) panel.append(button);
      });
      window.portfolioThemeCloud?.getOrderedThemes().forEach((theme, index) => {
        const button = [...panel.querySelectorAll("[data-style-theme-option]")]
          .find((candidate) => candidate.dataset.styleThemeOption === theme.id);
        const options = [...panel.querySelectorAll("[data-style-theme-option]")];
        if (button && options[index] !== button) panel.insertBefore(button, options[index] || null);
      });
    } finally {
      try {
        if (wasOpen) setOpen(menu, menu.querySelector(":scope > button"), true);
        if (restoreFocus && panel.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
      } finally {
        if (menu) reconcilingThemeMenus.delete(menu);
      }
    }
  };
  document.addEventListener("portfolio-cloudthemechange", refreshThemeOrder);
  const initNavigation = () => {
    document.querySelectorAll("[data-portfolio-navigation]").forEach(renderNavigation);
    bindNavigationEvents();
    bindPointerNavigationEvents();
    document.dispatchEvent(new CustomEvent("portfolio-navigationready"));
    refreshThemeOrder();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNavigation, { once: true });
  } else {
    initNavigation();
  }
})();
