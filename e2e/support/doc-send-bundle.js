// يبني للاختبار حزمة متصفح واحدة من مسار PDF المتصفح الحقيقي (pdf.js وdoc.js وinstitutional.js) بـ esbuild، فيُشغَّل
// buildPdf وcollectBreaks وplanPages نفسها في Chromium على وثائق من الحزمة نفسها. لا يمس الناتج المبني ولا المصدر
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raw = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: resolve(a.resolveDir, a.path.replace(/\?raw$/, '')), namespace: 'raw' }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({ contents: `export default ${JSON.stringify(readFileSync(a.path, 'utf8'))};`, loader: 'js' }));
  },
};

export async function docSendBundle() {
  const entry = `
    export { buildPdf, collectBreaks, planPages, PAGE } from './src/lib/brand/pdf.js';
    export { documentHtml } from './src/lib/brand/doc.js';
    export { finalDocument, EXPORT_PRESETS } from './src/lib/brand/institutional.js';
  `;
  const r = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'js' },
    bundle: true, format: 'iife', globalName: 'DOCSEND', write: false, platform: 'browser', plugins: [raw], logLevel: 'silent',
    define: { 'import.meta.env': '{}' },
  });
  return r.outputFiles[0].text;
}
