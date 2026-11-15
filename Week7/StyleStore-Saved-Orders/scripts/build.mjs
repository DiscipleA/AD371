import { build } from 'vite';
import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist');
// Build only the React island. The inspected HTML shell, runtime theme links,
// and theme-owned assets stay separate instead of being merged by Vite.
await build({
  configFile: false,
  root,
  publicDir: false,
  // Library mode intentionally leaves process.env untouched unless defined.
  // Resolve React's production branch at build time, not in the browser.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  oxc: { jsx: { runtime: 'automatic' } },
  build: {
    outDir: out,
    emptyOutDir: true,
    sourcemap: false,
    lib: { entry: resolve(root, 'src/main.jsx'), formats: ['es'], fileName: () => 'assets/stylestore.js', cssFileName: 'stylestore' },
    rollupOptions: { output: { assetFileNames: 'assets/[name][extname]', chunkFileNames: 'assets/[name]-[hash].js' } }
  }
});
for (const directory of ['styles', 'assets']) {
  await cp(resolve(root, directory), resolve(out, directory), { recursive: true });
}
for (const file of ['theme.js', 'site-navigation.js', 'copy-code.js', 'config.js']) {
  await cp(resolve(root, file), resolve(out, file));
}
const cssFiles = (await readdir(resolve(out, 'assets'))).filter(name => name.endsWith('.css'));
if (cssFiles.length !== 1) throw new Error(`Expected one React stylesheet, got ${cssFiles.length}`);
let html = await readFile(resolve(root, 'index.html'), 'utf8');
const scriptPattern = /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']\.\/src\/main\.jsx["'])[^>]*>\s*<\/script>/;
if (!scriptPattern.test(html)) throw new Error('React island entry script missing from inspected HTML');
html = html.replace(scriptPattern, '<script type="module" src="./assets/stylestore.js"></script>');
// The island owns its emitted CSS. Do not ship both source and compiled links.
html = html.replace(/<link\b[^>]*href=["']\.\/styles\/storefront\.css["'][^>]*>\s*/g, '');
html = html.replace('</head>', `  <link rel="stylesheet" href="./assets/${cssFiles[0]}">\n</head>`);
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'index.html'), html);
console.log('Static showcase built in dist/; infrastructure, tests, docs and dependencies excluded.');
