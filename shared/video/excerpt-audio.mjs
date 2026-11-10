#!/usr/bin/env node
// صوت فيديو المشارك من تسجيل الجولة الكاملة: يكتب مقتطفات PARTICIPANT_BEATS ونصوص الخطوات كما سُجّلت (spoken في tour-steps.js، المصدر الواحد)
// ثم يشغّل excerpt-audio.py فيقصّها من مقاطع الجولة ويضم كل سطر في مقطع، ويتحقق من كل قص بتفريغه ومقارنته بنصه.
// الاستخدام: node shared/video/excerpt-audio.mjs <segdir> <outdir> [--model=large-v3-turbo]
//   segdir: مقاطع الجولة 01.mp3 إلى 18.mp3 (ناتج npm run video:audio على التسجيل المتصل)
// ثم: npm run video:record -- --cut=participant --audio=<outdir>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PARTICIPANT_LINES, TOUR_STEPS, spoken } from '../../leaders-app/src/tour-steps.js';

const [seg, out, ...rest] = process.argv.slice(2);
if (!seg || !out) { console.error('node shared/video/excerpt-audio.mjs <segdir> <outdir> [--model=...]'); process.exit(2); }
const idx = Object.fromEntries(TOUR_STEPS.map((s, i) => [s.key, i + 1]));
const spec = {
  steps: TOUR_STEPS.map((s, i) => ({ i: i + 1, key: s.key, text: spoken(s) })),
  lines: PARTICIPANT_LINES.map((l) => ({ step: l.step, clips: l.clips.map((text) => ({ i: idx[l.step], text })) })),
};
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mi-excerpt-')), 'spec.json');
fs.writeFileSync(file, JSON.stringify(spec));
const r = spawnSync('python3', ['-I', path.join(path.dirname(new URL(import.meta.url).pathname), 'excerpt-audio.py'), seg, file, out, ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 1);
