(() => {
  "use strict";
  const base = new URL("./", document.currentScript.src);
  window.PortfolioThemeRegistry?.register({
    id: "baroque-plexiglas",
    label: "Baroque Plexiglas",
    order: 70,
    stylesheet: new URL("theme.css", base).href,
    colors: { dark: "#120f1a", light: "#eef4f3" },
    icons: [
      { rel: "icon", type: "image/svg+xml", href: new URL("assets/icons/favicon.svg", base).href },
      { rel: "apple-touch-icon", sizes: "180x180", href: new URL("assets/icons/apple-touch-icon.svg", base).href }
    ]
  });
})();
