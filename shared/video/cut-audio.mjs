#!/usr/bin/env node
// يكتب نصوص الخطوات من tour-steps.js (المصدر الواحد) ثم يشغّل cut-audio.py لتقطيع التسجيل الواحد إلى مقطع لكل خطوة.
// الاستخدام: node shared/video/cut-audio.mjs <voice.mp3> <outdir> [--model=large-v3-turbo]
// يحتاج python3 مع faster-whisper وnumpy (pip install faster-whisper) وffmpeg. ثم: npm run video:record -- --audio=<outdir>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOUR_STEPS } from '../../leaders-app/src/tour-steps.js';

const [src, out, ...rest] = process.argv.slice(2);
if (!src || !out) { console.error('node shared/video/cut-audio.mjs <voice.mp3> <outdir> [--model=...]'); process.exit(2); }
const steps = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mi-steps-')), 'steps.json');
fs.writeFileSync(steps, JSON.stringify(TOUR_STEPS.map((s, i) => ({ i: i + 1, key: s.key, text: s.d }))));
const r = spawnSync('python3', ['-I', path.join(path.dirname(new URL(import.meta.url).pathname), 'cut-audio.py'), src, steps, out, ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 1);
