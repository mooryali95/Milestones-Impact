#!/usr/bin/env node
// يكتب نصوص الخطوات كما تُسجَّل (spoken) من tour-steps.js (المصدر الواحد) ثم يشغّل cut-audio.py لتقطيع التسجيل الواحد إلى مقطع لكل خطوة.
// الاستخدام: node shared/video/cut-audio.mjs <voice.mp3> <outdir> [--model=large-v3-turbo] [--cut=participant]
// --cut=participant: أسطر فيديو المشارك (PARTICIPANT_LINES، مقطع لكل سطر) بدل خطوات الجولة الكاملة
// يحتاج python3 مع faster-whisper وnumpy (pip install faster-whisper) وffmpeg. ثم: npm run video:record -- --audio=<outdir>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PARTICIPANT_LINES, TOUR_STEPS, spoken } from '../../leaders-app/src/tour-steps.js';

const args = process.argv.slice(2);
const cut = args.find((a) => a.startsWith('--cut='))?.slice(6) || 'tour';
const [src, out, ...rest] = args.filter((a) => !a.startsWith('--cut='));
if (!src || !out) { console.error('node shared/video/cut-audio.mjs <voice.mp3> <outdir> [--model=...]'); process.exit(2); }
const steps = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mi-steps-')), 'steps.json');
const items = cut === 'participant' ? PARTICIPANT_LINES.map((l, i) => ({ i: i + 1, key: l.step, text: l.text })) : TOUR_STEPS.map((s, i) => ({ i: i + 1, key: s.key, text: spoken(s) }));
fs.writeFileSync(steps, JSON.stringify(items));
const r = spawnSync('python3', ['-I', path.join(path.dirname(new URL(import.meta.url).pathname), 'cut-audio.py'), src, steps, out, ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 1);
