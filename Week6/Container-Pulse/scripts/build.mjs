import { build } from 'vite';
import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist');
await build({
  configFile: false, root, publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  oxc: { jsx: { runtime: 'automatic' } },
  build: {
    outDir: out, emptyOutDir: true, sourcemap: false,
    lib: { entry: resolve(root, 'src/main.jsx'), formats: ['es'], fileName: () => 'assets/pulse.js', cssFileName: 'pulse' },
    rollupOptions: { output: { assetFileNames: 'assets/[name][extname]', chunkFileNames: 'assets/[name]-[hash].js' } }
  }
});
await cp(resolve(root, 'styles'), resolve(out, 'styles'), { recursive: true });
for (const file of ['theme.js', 'site-navigation.js', 'copy-code.js', 'config.js']) await cp(resolve(root, file), resolve(out, file));
const css = (await readdir(resolve(out, 'assets'))).filter(name => name.endsWith('.css'));
if (css.length !== 1) throw new Error('Expected exactly one compiled React stylesheet.');
let html = await readFile(resolve(root, 'index.html'), 'utf8');
const entry = /<script type="module" src="\.\/src\/main\.jsx"><\/script>/;
if (!entry.test(html)) throw new Error('React entry is missing.');
html = html.replace(entry, '<script type="module" src="./assets/pulse.js"></script>');
html = html.replace('</head>', `<link rel="stylesheet" href="./assets/${css[0]}">\n</head>`);
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'index.html'), html);
console.log('Built isolated static showcase in dist/; source, environment files, tests and infrastructure excluded.');
