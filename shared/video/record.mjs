#!/usr/bin/env node
// يسجّل الفيديو التعريفي من الواجهة الحقيقية (ناتج البناء في leaders/) بخادم محاكاة (mock-server.js):
// يسير على خطوات الجولة الحيّة الثماني عشرة (leaders-app/src/tour-steps.js، المصدر الواحد للنص)، يكتب
// ويضغط فعلًا على الشاشة بمؤشر ظاهر، ويكتب فوق كل عنصر بطاقة شرح مضاءة، ويخرج MP4 وWebM وVTT وغلافًا
// إلى leaders-app/public/media/. التشغيل: node shared/video/record.mjs [--out=dir] [--port=4312]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createMockServer } from './mock-server.js';
import { VIDEO } from './scenes.js';
import { TOUR_STEPS } from '../../leaders-app/src/tour-steps.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(root, arg('out', 'leaders-app/public/media'));
const PORT = Number(arg('port', 4312));
const QUICK = process.argv.includes('--quick');   // تجربة سريعة: بلا انتظار قراءة
// الصوت: مجلد فيه segments.json (مدة مقطع كل خطوة بالثواني) وملفات 01.mp3 إلى 18.mp3؛ مدة عرض كل خطوة = مدة مقطعها، ويُدمج الصوت في الناتج
const AUDIO = arg('audio', '');
const SEGS = AUDIO ? JSON.parse(fs.readFileSync(path.join(AUDIO, 'segments.json'), 'utf8')) : null;
fs.mkdirSync(OUT, { recursive: true });
const W = 1920, H = 1080;

// ── خادم المعاينة للتطبيق المبني ──
const waitPort = (port, ms = 30000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const tryOnce = () => { const sock = net.connect(port, '127.0.0.1'); sock.once('connect', () => { sock.end(); resolve(); }); sock.once('error', () => { sock.destroy(); if (Date.now() - t0 > ms) reject(new Error('preview لم يبدأ')); else setTimeout(tryOnce, 300); }); };
  tryOnce();
});
const preview = spawn('npx', ['vite', 'preview', '--config', 'leaders-app/vite.config.js', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
await waitPort(PORT);

// ── طبقة الشرح داخل الصفحة: مؤشر، تعتيم وإضاءة، بطاقة بجوار العنصر، بطاقات العنوان والختام ──
const fonts = fs.readFileSync(path.join(root, 'home/assets/fonts/fonts.css'), 'utf8')
  .replace(/url\(\/assets\/fonts\/([^)]+)\)/g, (_, n) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(root, 'home/assets/fonts', n)).toString('base64')})`);
const logo = `data:image/svg+xml;base64,${fs.readFileSync(path.join(root, 'shared/brand/svg/milestone-impact-inverted.svg')).toString('base64')}`;
const overlay = `
(() => { const init = () => {
  const css = \`${fonts}
  #mi-ov *{box-sizing:border-box;font-family:"Noto Kufi Arabic",system-ui,sans-serif;direction:rtl}
  #mi-dim{position:fixed;z-index:9000;pointer-events:none;border:3px solid #C79A4B;border-radius:14px;box-shadow:0 0 0 9999px rgba(6,19,24,.5),0 0 0 8px rgba(199,154,75,.28);transition:all .45s cubic-bezier(.2,.8,.2,1);opacity:0}
  #mi-card{position:fixed;z-index:9001;pointer-events:none;width:560px;background:#0B272F;color:#EFE7D8;border:1px solid #C79A4B;border-radius:16px;padding:20px 24px;box-shadow:0 24px 60px rgba(0,0,0,.45);opacity:0;transform:translateY(10px);transition:opacity .35s ease,transform .35s ease}
  #mi-card .k{color:#C79A4B;font-size:14px;font-weight:700;letter-spacing:.02em;margin:0 0 6px;display:flex;justify-content:space-between;align-items:center}
  #mi-card .k i{display:inline-block;width:10px;height:10px;background:#A97A2E;transform:rotate(45deg);border-radius:2px;margin-left:8px}
  #mi-card h3{margin:0 0 8px;font-size:24px;line-height:1.3;color:#EFE7D8}
  #mi-card p{margin:0;font-size:17.5px;line-height:1.75;color:#D9E2E3}
  #mi-conn{position:fixed;z-index:9001;pointer-events:none;background:#C79A4B;width:3px;opacity:0;transition:opacity .35s ease}
  #mi-chip{position:fixed;z-index:9001;pointer-events:none;top:58px;right:24px;background:rgba(11,39,47,.9);color:#C79A4B;border:1px solid rgba(199,154,75,.5);border-radius:999px;padding:6px 16px;font-size:14px;font-weight:700;opacity:0;transition:opacity .3s}
  #mi-cursor{position:fixed;z-index:9002;pointer-events:none;width:30px;height:30px;border-radius:50%;border:3px solid #C79A4B;background:rgba(199,154,75,.25);transform:translate(-50%,-50%);transition:left .55s cubic-bezier(.2,.8,.2,1),top .55s cubic-bezier(.2,.8,.2,1),transform .15s;opacity:0}
  #mi-cursor.click{transform:translate(-50%,-50%) scale(.7);background:rgba(199,154,75,.6)}
  #mi-full{position:fixed;inset:0;z-index:9003;pointer-events:none;background:radial-gradient(ellipse at 15% 110%,#12414E 0%,#0B272F 45%,#061318 100%);color:#EFE7D8;display:flex;flex-direction:column;justify-content:center;padding:0 160px;opacity:0;transition:opacity .6s ease}
  #mi-full .fr{position:absolute;inset:36px;border:1px solid rgba(199,154,75,.35)}
  #mi-full img{height:64px;align-self:flex-start;margin-bottom:34px}
  #mi-full .e{color:#C79A4B;font-size:22px;font-weight:700;margin:0 0 14px}
  #mi-full h1{font-size:64px;margin:0 0 16px;line-height:1.25}
  #mi-full p{font-size:28px;margin:0;color:#C9D6D8;line-height:1.6;max-width:1200px}
  #mi-full .rule{width:120px;height:3px;background:linear-gradient(90deg,#A97A2E,#C79A4B);margin:22px 0}
  \`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const ov = document.createElement('div'); ov.id = 'mi-ov';
  ov.innerHTML = '<div id="mi-dim"></div><div id="mi-conn"></div><div id="mi-card"></div><div id="mi-chip"></div><div id="mi-cursor"></div><div id="mi-full"><div class="fr"></div><img src="${logo}"><p class="e"></p><h1></h1><div class="rule"></div><p class="t"></p></div>';
  document.body.appendChild(ov);
  const $ = (id) => document.getElementById(id);
  let anchorEl = null, follow = null;
  const place = () => {
    if (!anchorEl || !anchorEl.isConnected) return;
    const r = anchorEl.getBoundingClientRect();
    const dim = $('mi-dim'); dim.style.left = (r.left - 8) + 'px'; dim.style.top = (r.top - 8) + 'px'; dim.style.width = (r.width + 16) + 'px'; dim.style.height = (r.height + 16) + 'px';
    const card = $('mi-card'); const cw = 560, ch = card.offsetHeight || 180;
    // البطاقة تحت العنصر إن اتسع المكان وإلا فوقه، وإلا بجواره يسارًا؛ محاذاة يمنى (RTL)
    let left = Math.min(window.innerWidth - cw - 24, Math.max(24, r.right - cw)), top;
    if (r.bottom + 28 + ch < window.innerHeight - 24) top = r.bottom + 28;
    else if (r.top - 28 - ch > 24) top = r.top - 28 - ch;
    else { top = Math.max(24, Math.min(window.innerHeight - ch - 24, r.top)); left = Math.max(24, r.left - cw - 28); }
    card.style.left = left + 'px'; card.style.top = top + 'px';
    const conn = $('mi-conn');
    if (top >= r.bottom) { conn.style.left = (left + cw - 60) + 'px'; conn.style.top = (r.bottom + 8) + 'px'; conn.style.height = (top - r.bottom - 8) + 'px'; }
    else if (top + ch <= r.top) { conn.style.left = (left + cw - 60) + 'px'; conn.style.top = (top + ch) + 'px'; conn.style.height = (r.top - 8 - top - ch) + 'px'; }
    else conn.style.height = '0px';
  };
  window.__mi = {
    show(sel, n, total, title, text) {
      anchorEl = sel ? document.querySelector('[data-tour="' + sel + '"]') : null;
      const card = $('mi-card'); card.innerHTML = '<p class="k"><span><i></i>' + title + '</span><span>' + n + ' / ' + total + '</span></p><h3>' + title + '</h3><p>' + text + '</p>';
      $('mi-chip').textContent = 'الخطوة ' + n + ' من ' + total; $('mi-chip').style.opacity = 1;
      if (anchorEl) { place(); $('mi-dim').style.opacity = 1; $('mi-conn').style.opacity = 1; }
      else { $('mi-dim').style.opacity = 0; $('mi-conn').style.opacity = 0; card.style.left = (window.innerWidth - 560 - 48) + 'px'; card.style.top = '90px'; }
      card.style.opacity = 1; card.style.transform = 'translateY(0)';
      clearInterval(follow); follow = setInterval(place, 120);
    },
    hide() { clearInterval(follow); anchorEl = null; $('mi-dim').style.opacity = 0; $('mi-conn').style.opacity = 0; const c = $('mi-card'); c.style.opacity = 0; c.style.transform = 'translateY(10px)'; $('mi-chip').style.opacity = 0; },
    cursor(x, y) { const c = $('mi-cursor'); c.style.opacity = 1; c.style.left = x + 'px'; c.style.top = y + 'px'; },
    click() { const c = $('mi-cursor'); c.classList.add('click'); setTimeout(() => c.classList.remove('click'), 180); },
    cursorHide() { $('mi-cursor').style.opacity = 0; },
    full(eyebrow, title, text) { const f = $('mi-full'); f.querySelector('.e').textContent = eyebrow; f.querySelector('h1').textContent = title; f.querySelector('.t').textContent = text; f.style.opacity = 1; },
    fullHide() { $('mi-full').style.opacity = 0; },
  };
  }; if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
})();`;

// ── التسجيل ──
const srv = createMockServer();
const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const tmpVid = fs.mkdtempSync(path.join(OUT, '.rec-'));
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'ar-SA', recordVideo: { dir: tmpVid, size: { width: W, height: H } } });
const page = await context.newPage();
await page.route(/functions\/v1\/leaders-api/, async (route) => { const b = JSON.parse(route.request().postData() || '{}'); await route.fulfill({ json: srv.reply(b) }); });
await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
await page.addInitScript(overlay);

const t0 = Date.now();
const marks = [];   // للترجمة VTT: [من، إلى، النص]
const now = () => (Date.now() - t0) / 1000;
const sleep = (ms) => page.waitForTimeout(QUICK ? Math.min(ms, 400) : ms);
const readTime = (text, idx = -1) => (SEGS && idx >= 0 ? Math.round(SEGS[idx].dur * 1000) + 900 : Math.max(5000, Math.min(16000, text.split(/\s+/).length * 330)));
const ev = (code) => page.evaluate(code);
const say = async (idx, anchorOverride) => {
  const st = TOUR_STEPS[idx], total = TOUR_STEPS.length, anchor = anchorOverride === undefined ? st.anchor : anchorOverride;
  if (anchor) await page.locator(`[data-tour="${anchor}"]`).first().waitFor({ timeout: 8000 }).catch(() => {});
  if (anchor) await page.locator(`[data-tour="${anchor}"]`).first().scrollIntoViewIfNeeded().catch(() => {});
  await sleep(500);
  await page.evaluate(([a, n, t, title, text]) => window.__mi.show(a, n, t, title, text), [anchor, idx + 1, total, st.t, st.d]);
  const from = now();
  await sleep(readTime(st.d, idx));
  marks.push([from, now(), st.d]);
};
const hide = async () => { await ev('window.__mi.hide()'); await sleep(350); };
const moveTo = async (locator) => {
  const box = await locator.boundingBox(); if (!box) return;
  const x = box.x + Math.min(box.width - 10, Math.max(10, box.width * 0.5)), y = box.y + box.height / 2;
  await page.evaluate(([x, y]) => window.__mi.cursor(x, y), [x, y]); await sleep(600);
};
const click = async (locator) => { await moveTo(locator); await ev('window.__mi.click()'); await locator.click(); await sleep(450); };
const type = async (locator, text) => { await click(locator); await locator.fill(''); await locator.pressSequentially(text, { delay: QUICK ? 5 : 55 }); await sleep(350); };
const fullCard = async (eyebrow, title, text, ms, idx = -1) => { if (idx >= 0) ms = readTime(text, idx); await page.evaluate(([e, t, x]) => window.__mi.full(e, t, x), [eyebrow, title, text]); const from = now(); await sleep(ms); marks.push([from, now(), text]); await ev('window.__mi.fullHide()'); await sleep(700); };

await page.goto(`http://127.0.0.1:${PORT}/`);
await page.getByLabel('البريد الإلكتروني').waitFor();
await sleep(600);

// 1 الترحيب (بطاقة كاملة فوق شاشة الدخول)
await fullCard('برنامج إدارة المشروعات للقادة', 'كيف تعمل المنصة', TOUR_STEPS[0].d, readTime(TOUR_STEPS[0].d), 0);

// 2 أبواب الدخول: شرح ثم دخول فعلي بالبريد والاسم والرمز
await say(1);
await hide();
await type(page.getByLabel('البريد الإلكتروني'), 'sara@company.sa');
await click(page.getByRole('button', { name: 'متابعة' }));
await type(page.getByLabel('الاسم الكامل'), 'سارة عبدالله الأحمد');
await click(page.getByRole('button', { name: 'أرسل الرمز' }));
await page.getByRole('heading', { name: 'أرسلنا لك رابطًا ورمزًا' }).waitFor();
await sleep(800);
const code = page.locator('input[inputmode="numeric"], input[autocomplete="one-time-code"]').first();
await type(code, '246810');
const verify = page.getByRole('button', { name: /تحقق|ادخل|متابعة/ }).first();
if (await verify.isVisible().catch(() => false)) await click(verify);
await page.getByRole('heading', { name: /عرّفنا بك/ }).waitFor({ timeout: 15000 });
await ev('window.__mi.cursorHide()');

// 3 الملف: شرح ثم تعبئة فعلية
await say(2);
await hide();
await type(page.getByLabel(/رقم الجوال/), '0551234567');
await type(page.getByLabel(/المسمى الوظيفي/), 'مديرة إدارة المشاريع');
await type(page.getByLabel(/جهة العمل/), 'هيئة التحوّل الرقمي');
await type(page.getByLabel(/سنوات الخبرة/), '9');
const scope = page.getByLabel(/نطاق ما تقوده الآن/);
if (await scope.isVisible().catch(() => false)) { await moveTo(scope); await scope.selectOption({ index: 2 }).catch(() => {}); await sleep(400); }
await click(page.getByRole('button', { name: 'حفظ والانتقال لتحديد المستوى' }));
await page.getByRole('heading', { name: 'لنحدد نقطة انطلاقك' }).waitFor({ timeout: 15000 });
await ev('window.__mi.cursorHide()');

// 4 القياس: شرح ثم إجابة ثلاثة أسئلة وإرسال
await say(3);
await hide();
await click(page.getByRole('button', { name: 'ابدأ' }));
await sleep(600);
await click(page.getByRole('radio', { name: /غالبًا/ }).first());
await sleep(500);
const cont1 = page.getByRole('button', { name: /واصل إلى|التالي/ }).first();
if (await cont1.isVisible().catch(() => false)) await click(cont1);
await click(page.getByRole('radio', { name: /تغيّر سلوك المستفيدين/ }).first());
await sleep(500);
const cont2 = page.getByRole('button', { name: /واصل إلى|التالي/ }).first();
if (await cont2.isVisible().catch(() => false)) await click(cont2);
await click(page.getByRole('radio', { name: /دائمًا/ }).first());
await sleep(500);
await page.getByRole('heading', { name: 'أنهيت الأسئلة كلها' }).waitFor({ timeout: 10000 }).catch(() => {});
await click(page.getByRole('button', { name: 'أرسل واعرض نتيجتي' }));
await page.locator('[data-tour="journey-hero"]').waitFor({ timeout: 15000 });
await ev('window.__mi.cursorHide()');
await sleep(900);

// 5 إلى 9: الرحلة
for (const i of [4, 5, 6, 7, 8]) { await say(i); await hide(); }

// 10 الكتيب: تبويب كتيبي، الفهرس، ثم فتح باب
await click(page.locator('[data-tour="nav-handbook"]').first());
await page.locator('[data-tour="handbook-toc"]').waitFor({ timeout: 15000 });
await ev('window.__mi.cursorHide()');
await say(9);
await hide();
const ch = page.locator('[data-tour="handbook-toc"] button.toc-ch').nth(1);
if (await ch.isVisible().catch(() => false)) { await click(ch); await sleep(2200); await ev('window.__mi.cursorHide()'); }

// 11 المبادرة
await click(page.locator('[data-tour="nav-capstone"]').first());
await page.locator('[data-tour="capstone-sections"]').waitFor({ timeout: 15000 });
await ev('window.__mi.cursorHide()');
await say(10);
await hide();

// 12 القاعة
await click(page.locator('[data-tour="nav-hall"]').first());
await page.locator('[data-tour="hall"]').waitFor({ timeout: 15000 });
await ev('window.__mi.cursorHide()');
await say(11);
await hide();

// 13 طلبات الأقران: العودة إلى الرحلة، شرح، ثم طرح سؤال فعلًا
await click(page.locator('[data-tour="nav-home"]').first());
await page.locator('[data-tour="peer"]').waitFor({ timeout: 15000 });
await ev('window.__mi.cursorHide()');
await say(12);
await hide();
await click(page.locator('[data-tour="peer"]').getByRole('button', { name: 'اطلب توجيهًا' }));
await type(page.locator('[data-tour="peer"] textarea').first(), 'ما الفرق العملي بين معلم القيمة ومعلم الإنجاز في برنامج رقمنة الخدمات؟');
const send = page.locator('[data-tour="peer"]').getByRole('button', { name: /أرسل|اطلب/ }).last();
await click(send);
await sleep(1800);
await ev('window.__mi.cursorHide()');

// 14 الأثر (تبويب مقفل)، 15 الختامي والشهادة
await say(13); await hide();
await say(14); await hide();

// 16 الملف والأمان
await click(page.locator('[data-tour="nav-profile"]').first());
await page.locator('[data-tour="security"]').waitFor({ timeout: 15000 });
await ev('window.__mi.cursorHide()');
await say(15);
await hide();

// 17 البوابتان (بطاقة كاملة) و18 الختام (بطاقة كاملة)
await fullCard('ثلاث بوابات، منظومة واحدة', 'بوابتا الجهة والخبير', TOUR_STEPS[16].d, readTime(TOUR_STEPS[16].d), 16);
await fullCard('سؤال الختام', 'ما الممارسة الواحدة التي ستبدأها غدًا؟', TOUR_STEPS[17].d + ' leaders.sunkvalue.com', readTime(TOUR_STEPS[17].d) + 1500, 17);

const seconds = Math.ceil(now());
await context.close();
await browser.close();
preview.kill();

// ── الترميز والترجمة ──
const webmIn = fs.readdirSync(tmpVid).map((f) => path.join(tmpVid, f)).find((f) => f.endsWith('.webm'));
const run = (args) => new Promise((resolve, reject) => { const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' }); p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`)))); });
const base = path.join(OUT, VIDEO.file);
// الصوت: كل مقطع يبدأ مع بداية خطوته المسجَّلة (marks)، ثم يُدمج مع الصورة
let audioArgs = [], audioMap = [];
if (SEGS) {
  const inputs = [], delays = [];
  SEGS.forEach((_, i) => { inputs.push('-i', path.join(AUDIO, `${String(i + 1).padStart(2, '0')}.mp3`)); delays.push(`[${i + 1}]adelay=${Math.round(marks[i][0] * 1000)}|${Math.round(marks[i][0] * 1000)}[a${i}]`); });
  const mix = `${delays.join(';')};${SEGS.map((_, i) => `[a${i}]`).join('')}amix=inputs=${SEGS.length}:normalize=0:dropout_transition=0,aresample=48000[aout]`;
  audioArgs = [...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[aout]'];
  audioMap = ['-shortest'];
}
await run(['-i', webmIn, ...audioArgs, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-r', '24', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', ...(SEGS ? ['-c:a', 'aac', '-b:a', '128k'] : []), ...audioMap, '-movflags', '+faststart', `${base}.mp4`]);
await run(['-i', webmIn, ...audioArgs, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-r', '24', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', ...(SEGS ? ['-c:a', 'libopus', '-b:a', '96k'] : []), ...audioMap, `${base}.webm`]);
await run(['-ss', '3', '-i', `${base}.mp4`, '-frames:v', '1', '-q:v', '4', `${base}.jpg`]);
fs.rmSync(tmpVid, { recursive: true, force: true });
const ts = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = (s % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x}`; };
const vtt = ['WEBVTT', ''];
marks.forEach(([a, b, text], i) => vtt.push(String(i + 1), `${ts(a)} --> ${ts(b)}`, text, ''));
fs.writeFileSync(`${base}.vtt`, vtt.join('\n'));
fs.writeFileSync(`${base}.json`, JSON.stringify({ seconds, marks: marks.map(([a, b]) => [Number(a.toFixed(2)), Number(b.toFixed(2))]) }, null, 2));
for (const ext of ['mp4', 'webm']) {
  const size = fs.statSync(`${base}.${ext}`).size;
  console.log(`${VIDEO.file}.${ext}: ${(size / 1024 / 1024).toFixed(2)} ميجابايت`);
  if (size > VIDEO.maxBytes) { console.error(`✗ تجاوز السقف ${(VIDEO.maxBytes / 1024 / 1024).toFixed(0)} ميجابايت`); process.exit(1); }
}
console.log(`✓ ${seconds} ثانية، ${marks.length} ترجمة، ${OUT}`);
