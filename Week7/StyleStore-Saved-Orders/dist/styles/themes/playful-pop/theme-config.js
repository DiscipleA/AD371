(() => {
  "use strict";
  const base = new URL("./", document.currentScript.src);
  window.PortfolioThemeRegistry?.register({
    id: "playful-pop",
    label: "Playful Pop",
    order: 20,
    stylesheet: new URL("theme.css", base).href,
    colors: { dark: "#17112b", light: "#fff7ec" },
    icons: [
      { rel: "icon", type: "image/svg+xml", href: new URL("assets/icons/favicon.svg", base).href },
      { rel: "apple-touch-icon", sizes: "180x180", href: new URL("assets/icons/apple-touch-icon.svg", base).href }
    ]
  });
})();
