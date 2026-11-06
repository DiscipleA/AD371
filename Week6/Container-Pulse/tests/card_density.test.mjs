import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/pulse-showcase.css', import.meta.url), 'utf8');
test('Audit descriptions remain within the inspected reference density', () => {
  const audit = html.split('id="audit-title"')[1].split('</section>')[0];
  const descriptions = [...audit.matchAll(/<article class="audit-item"><h3>.*?<\/h3><p>(.*?)<\/p>/gs)].map(m => m[1]);
  assert.equal(descriptions.length, 4);
  for (const description of descriptions) assert.ok(description.length <= 153, 'Audit prose exceeds the inspected Week5 maximum');
});
test('Working System explanation notes retain three compact desktop columns', () => {
  const result = html.split('id="final-result"')[1].split('</section>')[0];
  assert.equal((result.match(/class="result-note"/g) ?? []).length, 3);
  assert.match(css, /#final-result \.result-explanation\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /#final-result \.result-note\s*\{[^}]*padding:\s*1rem/);
});
