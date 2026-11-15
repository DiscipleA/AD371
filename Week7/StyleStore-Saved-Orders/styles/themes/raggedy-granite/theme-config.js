(() => {
  "use strict";
  const base = new URL("./", document.currentScript.src);
  window.PortfolioThemeRegistry?.register({
    id: "raggedy-granite",
    label: "Raggedy Granite",
    order: 30,
    stylesheet: new URL("theme.css", base).href,
    colors: { dark: "#171816", light: "#e8e2d3" },
    icons: [
      { rel: "icon", type: "image/svg+xml", href: new URL("assets/icons/favicon.svg", base).href },
      { rel: "apple-touch-icon", sizes: "180x180", href: new URL("assets/icons/apple-touch-icon.svg", base).href }
    ]
  });
})();
