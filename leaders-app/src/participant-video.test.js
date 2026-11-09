// فيديو المشارك (2026-11-09): الملفات والترجمة من PARTICIPANT_BEATS وحدها، وقواعد النص التي تمنع عودة الانحراف:
// كل مقتطف حرفي من نص خطوته (فهو ما في التسجيل)، ولا رقم يتغير من اللوحة، ولا لغة لوحة أو حساب عرض،
// ولا ادعاء خالف قرارات اللجنة في الجولة الكاملة (D03 وD05 وD06 وD17 وD20).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARTICIPANT_VIDEO } from '../../shared/video/scenes.js';
import { PARTICIPANT_BEATS, PARTICIPANT_LINES, TOUR_STEPS } from './tour-steps.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const all = PARTICIPANT_LINES.map((l) => l.text).join(' ');
const words = all.split(/\s+/).filter(Boolean).length;

describe('نص فيديو المشارك', () => {
  it('ست محطات، وكل سطر على شاشة خطوة قائمة في الجولة', () => {
    expect(PARTICIPANT_BEATS).toHaveLength(6);
    const keys = new Set(TOUR_STEPS.map((s) => s.key));
    for (const l of PARTICIPANT_LINES) expect(keys.has(l.step), l.step).toBe(true);
    for (const b of PARTICIPANT_BEATS) expect(b.title.split(/\s+/).length).toBeLessThanOrEqual(4);
  });

  it('كل مقتطف نص متصل من خطوته في الجولة، يبدأ وينتهي عند حد كلمة', () => {
    const d = Object.fromEntries(TOUR_STEPS.map((s) => [s.key, s.d.split(/\s+/)]));
    for (const l of PARTICIPANT_LINES) {
      expect(l.clips.length).toBeGreaterThan(0);
      for (const c of l.clips) {
        const w = c.split(/\s+/), t = d[l.step];
        // الكلمة الأخيرة قد تُقتطع قبل علامة الوقف التي تليها في النص («جهته،» تنتهي «جهته»)
        const at = t.findIndex((_, k) => w.every((x, j) => t[k + j] === x || (j === w.length - 1 && t[k + j]?.replace(/[،؛.:؟!]$/, '') === x)));
        expect(at, `${l.step}: ${c}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('نحو ثلاث دقائق كلامًا: بين 150 و260 كلمة', () => {
    expect(words).toBeGreaterThanOrEqual(150);
    expect(words).toBeLessThanOrEqual(260);
  });

  it('بلا شرطة ولا رقم ولا لغة مقدّم أو لوحة أو حساب عرض', () => {
    const titles = PARTICIPANT_BEATS.map((b) => b.title).join(' ');
    expect(`${titles} ${all}`).not.toMatch(/[-\u2010-\u2015\u2212\u0640]/);
    expect(all).not.toMatch(/[0-9\u0660-\u0669]/);
    for (const w of ['لنرى', 'نسير معًا', 'حساب العرض', 'البرنامج الحقيقي', 'اللوحة', 'الكود', 'مصدر واحد', 'بوابة']) expect(all).not.toContain(w);
  });

  it('لا ادعاء خالف القرارات: مدة القياس، والقاعة، والشهادة، والرعاية، والقياس الأخير', () => {
    expect(all).not.toMatch(/دقيقة|دقائق/);                   // المدة من الأداة الفعالة على الشاشة (D03)
    expect(all).not.toContain('شهادة مشاركة');                // «إتمام بنجاح» وحدها (D05)
    expect(all).not.toMatch(/عشر مراحل/);                    // عدد المراحل يُضبط من الإعداد
    const hall = PARTICIPANT_LINES.find((l) => l.step === 'hall').text;
    expect(hall).not.toMatch(/يُحتسب|تقييم/);                 // القاعة للتعلم (D17)
    expect(all).not.toMatch(/تلقائيًا|تُغطّى/);              // الرعاية ضمن مقاعد العقد (D20)
    expect(all).not.toMatch(/بالأداة نفسها|المكسب/);          // أداة موازية، والتغير وصف لا درجة (D06)
    expect(all).not.toMatch(/أسبوعًا بعد أسبوع/);             // الاتجاه آخر التقييمات بما قبلها
  });
});

describe('ملفات فيديو المشارك', () => {
  const base = `leaders-app/public/media/${PARTICIPANT_VIDEO.file}`;
  it('الملفات الخمسة موجودة وتحت السقف، والمدة مطابقة ودون ثلاث دقائق', () => {
    for (const ext of ['mp4', 'webm', 'vtt', 'jpg', 'json']) {
      const p = join(root, `${base}.${ext}`);
      expect(existsSync(p), p).toBe(true);
      expect(statSync(p).size).toBeLessThanOrEqual(PARTICIPANT_VIDEO.maxBytes);
    }
    const meta = JSON.parse(read(`${base}.json`));
    expect(PARTICIPANT_VIDEO.seconds).toBe(meta.seconds);
    expect(meta.seconds).toBeLessThanOrEqual(180);
    expect(meta.marks).toHaveLength(PARTICIPANT_LINES.length);
  });

  it('الترجمة سطر لكل سطر من النص بالترتيب، ومتصلة', () => {
    const vtt = read(`${base}.vtt`);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    let at = 0;
    for (const l of PARTICIPANT_LINES) { const k = vtt.indexOf(l.text, at); expect(k, l.text).toBeGreaterThan(at - 1); at = k + l.text.length; }
    const times = [...vtt.matchAll(/(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})/g)].map((m) => m.slice(1, 3));
    expect(times).toHaveLength(PARTICIPANT_LINES.length);
    for (let i = 1; i < times.length; i++) expect(times[i][0] >= times[i - 1][1]).toBe(true);
  });

  it('تطبيق القادة يعرض فيديو المشارك، والجولة الكاملة تبقى لصفحة البرنامج', () => {
    expect(read('leaders-app/src/IntroVideo.jsx')).toMatch(/PARTICIPANT_VIDEO as VIDEO/);
    expect(read('leaders-app/src/Onboarding.jsx')).toMatch(/PARTICIPANT_VIDEO as VIDEO/);
  });
});
