#!/usr/bin/env node
// صوت فيديو المشارك من النص المعتمد (PARTICIPANT_LINES في leaders-app/src/tour-steps.js، المصدر الواحد) بـElevenLabs:
// مقطع لكل سطر (01.mp3 إلى NN.mp3) وsegments.json (speech لكل سطر)، بالصوت والإعدادات التي اعتمدها المالك في 2026-11-10.
// بعد التوليد (المونتاج): رفع 5 dB، ثم محدِّد ذروة عند -0.5 dBFS بلا تسوية تلقائية، فلا يتشوّه الصوت.
// الاستخدام: ELEVENLABS_API_KEY=... node shared/video/tts-audio.mjs <outdir> [--only=3,7]
//   ثم: npm run video:record -- --cut=participant --audio=<outdir>
// المفتاح في الترويسة xi-api-key؛ في بيئة الوكيل يحقنه وكيل الشبكة، فتكفي قيمة شكلية (proxy-injected).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PARTICIPANT_LINES } from '../../leaders-app/src/tour-steps.js';

export const VOICE = {
  id: 'yEYsYg0uw4fWwUeTSSyC',           // Nawaf Al-Enezi (عربي، رجالي)
  model: 'eleven_v4',
  // Clone strength في الواجهة = style في الواجهة البرمجية
  settings: { stability: 0.5, similarity_boost: 0.49, style: 0.15, use_speaker_boost: true },
  gainDb: 5,
  limitDb: -0.5,
};

const out = process.argv[2];
if (!out) { console.error('الاستخدام: node shared/video/tts-audio.mjs <outdir> [--only=1,2]'); process.exit(2); }
const only = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) || '').split(',').filter(Boolean).map(Number);
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('ELEVENLABS_API_KEY مطلوب (في بيئة الوكيل: proxy-injected)'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const seconds = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
const limit = 10 ** (VOICE.limitDb / 20);

const segs = [];
for (const [k, line] of PARTICIPANT_LINES.entries()) {
  const n = String(k + 1).padStart(2, '0');
  const raw = path.join(out, `${n}.raw.mp3`), fin = path.join(out, `${n}.mp3`);
  if (!only.length || only.includes(k + 1) || !fs.existsSync(raw)) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE.id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: line.text, model_id: VOICE.model, language_code: 'ar', voice_settings: VOICE.settings }),
    });
    if (!r.ok) throw new Error(`السطر ${k + 1}: ElevenLabs ${r.status} ${(await r.text()).slice(0, 200)}`);
    fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
  }
  // قص الصمت في الطرفين، ثم الرفع والمحدِّد (level=0: بلا تسوية تلقائية ترفع الضجيج)
  ff(['-i', raw, '-af', [
    'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05',
    'areverse', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12', 'areverse',
    `volume=${VOICE.gainDb}dB`, `alimiter=limit=${limit.toFixed(4)}:level=0:attack=5:release=50`,
  ].join(','), '-ar', '44100', '-b:a', '192k', fin]);
  const speech = Number(seconds(fin).toFixed(3));
  segs.push({ i: k + 1, speech });
  console.log(`✓ ${n} ${speech.toFixed(2)}ث  ${line.text.slice(0, 60)}`);
}
fs.writeFileSync(path.join(out, 'segments.json'), JSON.stringify(segs, null, 1));
console.log(`✓ ${segs.length} مقطعًا، ${segs.reduce((a, s) => a + s.speech, 0).toFixed(1)} ثانية كلامًا، في ${out}`);
