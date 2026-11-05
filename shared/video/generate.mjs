#!/usr/bin/env node
// يولّد الفيديو التعريفي للمشارك من نص المشاهد (scenes.js) بهوية المنصة نفسها:
// مشاهد HTML تُحسب من الزمن (حتمية)، تُلتقط إطارًا إطارًا بـPlaywright وتُدفع إلى ffmpeg
// عبر الأنبوب (بلا ملفات إطارات على القرص)، فيخرج MP4 (H.264) وWebM (VP9) وملف ترجمة VTT
// إلى leaders-app/public/media/. التشغيل: node shared/video/generate.mjs [--seconds=N] [--out=dir]
// الحجم يُفحص ضد VIDEO.maxBytes ويُفشل التوليد إن تجاوزه.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SCENES, TEXT, VIDEO } from './scenes.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(root, arg('out', 'leaders-app/public/media'));
const SECONDS = Number(arg('seconds', VIDEO.seconds));
const { fps, width, height } = VIDEO;
fs.mkdirSync(OUT, { recursive: true });

const data = (p, type) => `data:${type};base64,${fs.readFileSync(path.join(root, p)).toString('base64')}`;
const fonts = fs.readFileSync(path.join(root, 'home/assets/fonts/fonts.css'), 'utf8')
  .replace(/url\(\/assets\/fonts\/([^)]+)\)/g, (_, n) => `url(${data('home/assets/fonts/' + n, 'font/woff2')})`);
const logo = data('home/assets/brand/svg/milestone-impact-inverted.svg', 'image/svg+xml');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── الصفحة: كل المشاهد طبقات، وdocument.__setTime(t) يضبط ما يظهر ──
const css = `${fonts}
*{margin:0;box-sizing:border-box}
html,body{width:${width}px;height:${height}px;overflow:hidden}
body{background:radial-gradient(ellipse at 15% 110%,#12414E 0%,#0B272F 45%,#061318 100%);font-family:"Noto Kufi Arabic",sans-serif;color:#EFE7D8;position:relative}
.frame{position:absolute;inset:28px;border:1px solid rgba(199,154,75,.35);pointer-events:none}
.logo{position:absolute;left:70px;top:58px;height:46px}
.site{position:absolute;right:76px;top:66px;font-family:"Noto Sans",sans-serif;font-size:18px;color:rgba(239,231,216,.5);letter-spacing:.08em}
.scene{position:absolute;inset:0;opacity:0}
.wrap{position:absolute;inset:0;padding:120px 96px 150px}
.k{display:flex;align-items:center;gap:14px;color:#C79A4B;font-size:22px;font-weight:600}
.d{width:14px;height:14px;background:#A97A2E;transform:rotate(45deg);border-radius:2px}
h1{font-size:56px;font-weight:800;line-height:1.3}
.rule{width:110px;height:3px;background:linear-gradient(90deg,#A97A2E,#C79A4B);margin:22px 0}
.cap{position:absolute;left:80px;right:80px;bottom:52px;background:rgba(6,19,24,.78);border:1px solid rgba(199,154,75,.3);padding:18px 28px;font-size:26px;line-height:1.7;text-align:center;border-radius:4px;min-height:84px}
.card{background:#fff;color:#0B272F;border-radius:6px;padding:26px 30px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.login{width:520px;margin:0 auto}
.ey{color:#A97A2E;font-size:14px;letter-spacing:.2em;font-weight:600}
.in{border:1px solid rgba(11,39,47,.25);border-radius:3px;padding:12px 14px;font-size:18px;color:#4A6A72;margin:10px 0;font-family:"Noto Sans",sans-serif}
.g{border:1px solid rgba(11,39,47,.25);border-radius:3px;padding:12px;text-align:center;font-size:18px;font-weight:600}
.btnb{background:#0B272F;color:#fff;text-align:center;padding:12px;border-radius:3px;font-size:18px;font-weight:700;margin-top:8px}
.ribbon{display:flex;align-items:center;gap:12px;background:#EFE7D8;border-right:4px solid #A97A2E;padding:10px 14px;border-radius:3px;font-size:16px;margin-bottom:12px}
.ribbon i{width:10px;height:10px;border-radius:50%;background:#A97A2E}
.phases{display:flex;gap:22px;margin-top:26px}
.ph{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(199,154,75,.3);padding:22px 24px;border-radius:4px;transition:none}
.ph b{display:block;color:#C79A4B;font-size:24px;margin-bottom:10px}
.ph ul{list-style:none;font-size:19px;line-height:1.9;color:rgba(239,231,216,.9)}
.ph li::before{content:"◆";color:#A97A2E;font-size:11px;margin-left:10px;vertical-align:middle}
.ph.on{background:rgba(169,122,46,.16);border-color:#C79A4B}
.ph.dim{opacity:.45}
.jcard{width:760px;margin:0 auto}
.stage{display:flex;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid rgba(11,39,47,.1);font-size:22px}
.stage:last-child{border-bottom:0}
.dot{width:36px;height:36px;border-radius:50%;background:#EAF0F0;color:#0B272F;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;flex:none}
.dot.ok{background:#0B272F;color:#fff}.dot.on{background:#A97A2E;color:#fff}
.chip{margin-right:auto;font-size:15px;padding:4px 10px;border-radius:999px;background:#EAF0F0;color:#4A6A72;white-space:nowrap}
.chip.on{background:#A97A2E;color:#fff}
.next{display:flex;align-items:center;justify-content:space-between;background:#EFE7D8;border-radius:4px;padding:14px 18px;margin-bottom:14px;font-size:20px}
.btn{background:#A97A2E;color:#fff;padding:10px 20px;border-radius:3px;font-size:18px;font-weight:700}
.tools{display:grid;grid-template-columns:1fr 1fr;gap:20px;width:860px;margin:10px auto 0}
.tool{background:rgba(255,255,255,.06);border:1px solid rgba(199,154,75,.3);border-radius:4px;padding:24px 26px;display:flex;gap:18px;align-items:flex-start}
.tool .k2{font-size:34px;line-height:1}
.tool b{display:block;font-size:24px;color:#C79A4B;margin-bottom:6px}
.tool p{font-size:18px;color:rgba(239,231,216,.85);line-height:1.6}
.cert{width:620px;margin:0 auto;text-align:center}
.cert h2{font-size:30px;margin:10px 0}
.badge{display:inline-block;border:2px solid #A97A2E;color:#A97A2E;padding:6px 18px;border-radius:999px;font-size:16px;font-family:"Noto Sans",sans-serif;letter-spacing:.1em;margin-top:12px}
.cta{display:inline-block;margin-top:22px;background:#A97A2E;color:#fff;padding:12px 34px;border-radius:3px;font-size:22px;font-weight:700}
.url{font-family:"Noto Sans",sans-serif;font-size:22px;color:#C79A4B;letter-spacing:.06em;margin-top:14px}
.reveal{opacity:0}
`;

const T = TEXT;
const scenesHtml = {
  title: `<div class="wrap" style="display:flex;flex-direction:column;justify-content:center">
    <div class="k reveal" data-at="0.3"><span class="d"></span>${esc(T.brand)}</div>
    <h1 class="reveal" data-at="0.9" style="margin-top:20px">${esc(T.title)}</h1>
    <div class="rule reveal" data-at="1.6"></div>
    <p class="reveal" data-at="2.0" style="font-size:30px;color:rgba(239,231,216,.8)">${esc(T.subtitle)}</p></div>`,
  signin: `<div class="wrap"><div class="card login">
    <div class="ribbon reveal" data-at="8"><i></i>${esc(T.signin.org)}</div>
    <p class="ey">${esc(T.signin.eyebrow)}</p><h2 style="font-size:28px;margin:8px 0 6px">${esc(T.signin.h)}</h2>
    <p style="font-size:16px;color:#4A6A72;margin-bottom:14px">${esc(T.signin.p)}</p>
    <div class="g reveal" data-at="1">${esc(T.signin.google)}</div>
    <p class="reveal" data-at="2" style="text-align:center;color:#4A6A72;font-size:14px;margin:10px 0">${esc(T.signin.or)}</p>
    <div class="in reveal" data-at="2.6" dir="ltr">${esc(T.signin.email)}</div>
    <div class="btnb reveal" data-at="3.4">${esc(T.signin.btn)}</div></div></div>`,
  phases: `<div class="wrap" style="padding-top:110px"><div class="k"><span class="d"></span>${esc(T.phasesHead)}</div>
    <div class="phases">${T.phases.map((p, i) => `<div class="ph" data-ph="${i}"><b>${esc(p.title)}</b><ul>${p.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div></div>`,
  journey: `<div class="wrap" style="padding-top:96px"><div class="card jcard">
    <div class="next reveal" data-at="0.4"><span>${esc(T.journey.next)} <b>${esc(T.journey.nextItem)}</b></span><span class="btn">${esc(T.journey.btn)}</span></div>
    ${T.journey.rows.map(([t, c, s], i) => `<div class="stage reveal" data-at="${1.2 + i * 0.9}"><span class="dot ${s}">${s === 'ok' ? '✓' : i + 1}</span>${esc(t)}<span class="chip ${s}">${esc(c)}</span></div>`).join('')}
    </div></div>`,
  tools: `<div class="wrap" style="padding-top:100px"><div class="k" style="justify-content:center"><span class="d"></span>بعد اعتماد مسارك</div>
    <div class="tools">${T.tools.map((x, i) => `<div class="tool reveal" data-at="${0.6 + i * 2.2}"><span class="k2">${x.k}</span><div><b>${esc(x.t)}</b><p>${esc(x.d)}</p></div></div>`).join('')}</div></div>`,
  closing: `<div class="wrap" style="padding-top:110px"><div class="card cert reveal" data-at="0.2"><p class="ey">${esc(T.closing.eyebrow)}</p><h2>${esc(T.closing.name)}</h2>
    <p style="color:#4A6A72;font-size:17px">${esc(T.closing.p)}</p><span class="badge">${esc(T.closing.badge)}</span></div>
    <div class="reveal" data-at="3" style="text-align:center"><span class="cta">${esc(T.closing.cta)}</span><div class="url" dir="ltr">${esc(T.site)}</div></div></div>`,
};

const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="frame"></div><img class="logo" src="${logo}"><div class="site" dir="ltr">${esc(T.site)}</div>
${SCENES.map((s) => `<div class="scene" id="s-${s.id}" data-from="${s.from}" data-to="${s.to}">${scenesHtml[s.id] || ''}</div>`).join('')}
<div class="cap" id="cap"></div>
<script>
const SCENES = ${JSON.stringify(SCENES)};
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
window.__setTime = (t) => {
  let capText = '';
  for (const s of SCENES) {
    const el = document.getElementById('s-' + s.id);
    const fadeIn = ease((t - s.from) / 0.7), fadeOut = ease((s.to - t) / 0.7);
    const op = Math.min(fadeIn, fadeOut);
    el.style.opacity = op;
    const local = t - s.from;
    el.querySelectorAll('.reveal').forEach((r) => {
      const at = Number(r.dataset.at || 0);
      const p = ease((local - at) / 0.5);
      r.style.opacity = p; r.style.transform = 'translateY(' + ((1 - p) * 10) + 'px)';
    });
    if (s.id === 'phases') {
      const segs = s.captions;
      el.querySelectorAll('.ph').forEach((ph, i) => {
        const seg = segs[i];
        const on = seg && t >= seg[0] && t < seg[1];
        const seen = seg && t >= seg[0];
        ph.className = 'ph' + (on ? ' on' : seen ? '' : ' dim');
        ph.style.opacity = ease((local - 0.3 - i * 0.6) / 0.5);
      });
    }
    if (op > 0.5) for (const [a, b, text] of s.captions) if (t >= a && t < b) capText = text;
  }
  const cap = document.getElementById('cap');
  cap.textContent = capText;
  cap.style.opacity = capText ? 1 : 0;
};
</script></body></html>`;

// ── الترجمة ──
const ts = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = (s % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x}`; };
const vtt = ['WEBVTT', ''];
let n = 1;
for (const s of SCENES) for (const [a, b, text] of s.captions) { vtt.push(String(n++), `${ts(a)} --> ${ts(b)}`, text, ''); }
fs.writeFileSync(path.join(OUT, `${VIDEO.file}.vtt`), vtt.join('\n'));

// ── الإطارات إلى ffmpeg ──
const encode = (outFile, codecArgs) => {
  const args = ['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', ...codecArgs, outFile];
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => { p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${outFile} exited ${c}`)))); p.on('error', reject); });
  return { stdin: p.stdin, done };
};

// متصفح Playwright: المثبّت مسبقًا في بيئة الوكيل إن وُجد، وإلا الافتراضي (npx playwright install chromium)
const preinstalled = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(fs.existsSync(preinstalled) ? { executablePath: preinstalled } : {});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);

const mp4 = encode(path.join(OUT, `${VIDEO.file}.mp4`), ['-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-tune', 'stillimage']);
const webm = encode(path.join(OUT, `${VIDEO.file}.webm`), ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p']);
const frames = Math.round(SECONDS * fps);
const write = (stream, buf) => new Promise((resolve) => (stream.write(buf) ? resolve() : stream.once('drain', resolve)));
const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.__setTime(t), f / fps);
  const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
  await Promise.all([write(mp4.stdin, buf), write(webm.stdin, buf)]);
  if (f % (fps * 10) === 0) console.log(`إطار ${f}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}ث)`);
}
mp4.stdin.end(); webm.stdin.end();
await browser.close();
await Promise.all([mp4.done, webm.done]);

for (const ext of ['mp4', 'webm']) {
  const size = fs.statSync(path.join(OUT, `${VIDEO.file}.${ext}`)).size;
  console.log(`${VIDEO.file}.${ext}: ${(size / 1024 / 1024).toFixed(2)} ميجابايت`);
  if (size > VIDEO.maxBytes) { console.error(`✗ تجاوز السقف ${(VIDEO.maxBytes / 1024 / 1024).toFixed(0)} ميجابايت`); process.exit(1); }
}
// صورة الغلاف (poster) من الثانية الثانية
await new Promise((resolve, reject) => {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '2', '-i', path.join(OUT, `${VIDEO.file}.mp4`), '-frames:v', '1', '-q:v', '4', path.join(OUT, `${VIDEO.file}.jpg`)], { stdio: 'inherit' });
  p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`poster exited ${c}`)))); p.on('error', reject);
});
console.log(`✓ ${frames} إطارًا، ${SECONDS} ثانية، ${OUT}`);
