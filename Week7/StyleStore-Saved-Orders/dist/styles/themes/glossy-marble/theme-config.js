(() => {
  "use strict";
  const base = new URL("./", document.currentScript.src);
  window.PortfolioThemeRegistry?.register({
    id: "glossy-marble",
    label: "Glossy Marble",
    order: 40,
    stylesheet: new URL("theme.css", base).href,
    colors: { dark: "#111820", light: "#f2f4f3" },
    icons: [
      { rel: "icon", type: "image/svg+xml", href: new URL("assets/icons/favicon.svg", base).href },
      { rel: "apple-touch-icon", sizes: "180x180", href: new URL("assets/icons/apple-touch-icon.svg", base).href }
    ]
  });
})();
