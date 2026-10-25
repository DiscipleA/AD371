(() => {
  "use strict";
  const base = new URL("./", document.currentScript.src);
  window.PortfolioThemeRegistry?.register({
    id: "gothic-stickerboard",
    label: "Gothic Stickerboard",
    order: 60,
    stylesheet: new URL("theme.css", base).href,
    colors: { dark: "#151014", light: "#eee4cf" },
    icons: [
      { rel: "icon", type: "image/svg+xml", href: new URL("assets/icons/favicon.svg", base).href },
      { rel: "apple-touch-icon", sizes: "180x180", href: new URL("assets/icons/apple-touch-icon.svg", base).href }
    ]
  });
})();
