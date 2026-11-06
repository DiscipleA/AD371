(() => {
  "use strict";
  const base = new URL("./", document.currentScript.src);
  window.PortfolioThemeRegistry?.register({
    id: "luminous-midnight",
    label: "Luminous Midnight",
    order: 50,
    stylesheet: new URL("theme.css", base).href,
    colors: { dark: "#050816", light: "#edf4ff" },
    icons: [
      { rel: "icon", type: "image/svg+xml", href: new URL("assets/icons/favicon.svg", base).href },
      { rel: "apple-touch-icon", sizes: "180x180", href: new URL("assets/icons/apple-touch-icon.svg", base).href }
    ]
  });
})();
