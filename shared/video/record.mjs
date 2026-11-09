#!/usr/bin/env node
// يسجّل الفيديو التعريفي من الواجهة الحقيقية (ناتج البناء في leaders/) بخادم محاكاة (mock-server.js):
// يسير على خطوات الجولة الحيّة الثماني عشرة (leaders-app/src/tour-steps.js، المصدر الواحد للنص)، يكتب
// ويضغط فعلًا على الشاشة بمؤشر ظاهر، ويكتب فوق كل عنصر بطاقة شرح مضاءة، ويخرج MP4 وWebM وVTT وغلافًا
// إلى leaders-app/public/media/. التشغيل: node shared/video/record.mjs [--out=dir] [--port=4312] [--audio=dir] [--quick] [--cut=participant]
// --cut=participant: فيديو المشارك (PARTICIPANT_LINES وPARTICIPANT_VIDEO): ست محطات بصيغة المخاطب على شاشات الجولة نفسها.
// مع --audio تُعرض كل بطاقة بطول كلامها، وتأتي الكتابة والضغط أثناء الجملة التي تصفها (atWord)، ويُدمج الصوت في الناتج.
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createMockServer } from './mock-server.js';
import { PARTICIPANT_VIDEO, VIDEO } from './scenes.js';
import { PARTICIPANT_BEATS, PARTICIPANT_LINES, TOUR_STEPS } from '../../leaders-app/src/tour-steps.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = path.resolve(root, arg('out', 'leaders-app/public/media'));
const PORT = Number(arg('port', 4312));
const QUICK = process.argv.includes('--quick');   // تجربة سريعة: بلا انتظار قراءة
const PART = arg('cut', 'tour') === 'participant';
// المقاطع بالترتيب: خطوات الجولة، أو أسطر فيديو المشارك (لكل منها نص يُقرأ، ومنه الترجمة والصوت)
const ITEMS = PART ? PARTICIPANT_LINES : TOUR_STEPS.map((st) => ({ ...st, text: st.d }));
const OUTV = PART ? PARTICIPANT_VIDEO : VIDEO;
// الصوت: مجلد فيه segments.json (لكل خطوة: speech = ثوانٍ من بداية مقطعها إلى آخر كلمة فيه) وملفات 01.mp3 إلى 18.mp3
// مقطوعة من تسجيل واحد على حدود الكلام (shared/video/cut-audio.py)؛ البطاقة تبقى حتى آخر كلمة، ويُدمج الصوت في الناتج
const AUDIO = arg('audio', '');
const SEGS = AUDIO ? JSON.parse(fs.readFileSync(path.join(AUDIO, 'segments.json'), 'utf8')) : null;
if (SEGS && (SEGS.length !== ITEMS.length || SEGS.some((x) => !(x.speech > 0)))) throw new Error(`segments.json: يلزم ${ITEMS.length} مقطعًا لكل منها speech`);
fs.mkdirSync(OUT, { recursive: true });
const W = 1920, H = 1080;
// شريط أسفل الإطار يحمل لون الخطوة الجارية: تسجيل Playwright لا يطابق ساعة الحائط (يتمدد ثوانيَ عند الكتابة الكثيفة)،
// فتُقرأ لحظة ظهور كل بطاقة من الإطارات نفسها، ويُقصّ الشريط من الناتج النهائي
const STRIP = 16;
const markRGB = (n) => [40 + n * 10, 0, 200];

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
  #mi-mark{position:fixed;left:0;right:0;bottom:0;height:${STRIP}px;z-index:9999;pointer-events:none;background:#000}
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
  ov.innerHTML = '<div id="mi-mark"></div><div id="mi-dim"></div><div id="mi-conn"></div><div id="mi-card"></div><div id="mi-chip"></div><div id="mi-cursor"></div><div id="mi-full"><div class="fr"></div><img src="${logo}"><p class="e"></p><h1></h1><div class="rule"></div><p class="t"></p></div>';
  document.body.appendChild(ov);
  const $ = (id) => document.getElementById(id);
  let anchorSel = null, anchorEl = null, follow = null;
  const place = () => {
    if (anchorSel && (!anchorEl || !anchorEl.isConnected)) anchorEl = document.querySelector('[data-tour="' + anchorSel + '"]');
    if (!anchorEl) return;
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
    // head: سطر علوي واحد (المحطة n من 6) بدل الاسم والعدّاد والشارة، لفيديو المشارك
    show(sel, n, total, title, text, mark, head) {
      $('mi-mark').style.background = 'rgb(' + (40 + (mark || n) * 10) + ',0,200)';
      anchorSel = sel || null; anchorEl = sel ? document.querySelector('[data-tour="' + sel + '"]') : null;
      const card = $('mi-card'); card.innerHTML = '<p class="k"><span><i></i>' + (head || title) + '</span>' + (head ? '' : '<span>' + n + ' / ' + total + '</span>') + '</p><h3>' + title + '</h3><p>' + text + '</p>';
      $('mi-chip').textContent = 'الخطوة ' + n + ' من ' + total; $('mi-chip').style.opacity = head ? 0 : 1;
      if (anchorEl) { place(); $('mi-dim').style.opacity = 1; $('mi-conn').style.opacity = 1; }
      else { $('mi-dim').style.opacity = 0; $('mi-conn').style.opacity = 0; card.style.left = (window.innerWidth - 560 - 48) + 'px'; card.style.top = '90px'; }
      card.style.opacity = 1; card.style.transform = 'translateY(0)';
      clearInterval(follow); follow = setInterval(place, 120);
    },
    hide() { clearInterval(follow); anchorSel = null; anchorEl = null; $('mi-mark').style.background = '#000'; $('mi-dim').style.opacity = 0; $('mi-conn').style.opacity = 0; const c = $('mi-card'); c.style.opacity = 0; c.style.transform = 'translateY(10px)'; $('mi-chip').style.opacity = 0; },
    cursor(x, y) { const c = $('mi-cursor'); c.style.opacity = 1; c.style.left = x + 'px'; c.style.top = y + 'px'; },
    click() { const c = $('mi-cursor'); c.classList.add('click'); setTimeout(() => c.classList.remove('click'), 180); },
    cursorHide() { $('mi-cursor').style.opacity = 0; },
    full(eyebrow, title, text, n) { $('mi-mark').style.background = 'rgb(' + (40 + n * 10) + ',0,200)'; const f = $('mi-full'); f.querySelector('.e').textContent = eyebrow; f.querySelector('h1').textContent = title; f.querySelector('.t').textContent = text; f.style.opacity = 1; },
    fullHide() { $('mi-mark').style.background = '#000'; $('mi-full').style.opacity = 0; },
  };
  }; if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
})();`;

// ── التسجيل ──
const srv = createMockServer();
const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const tmpVid = fs.mkdtempSync(path.join(OUT, '.rec-'));
const context = await browser.newContext({ viewport: { width: W, height: H + STRIP }, deviceScaleFactor: 1, locale: 'ar-SA', recordVideo: { dir: tmpVid, size: { width: W, height: H + STRIP } } });
const page = await context.newPage();
await page.route(/functions\/v1\/leaders-api/, async (route) => { const b = JSON.parse(route.request().postData() || '{}'); await route.fulfill({ json: srv.reply(b) }); });
await page.addInitScript(() => localStorage.setItem('mi_leaders_welcome_seen', 'true'));
await page.addInitScript(overlay);

const t0 = Date.now();
const marks = [];   // للترجمة VTT: [من، إلى، النص]
const now = () => (Date.now() - t0) / 1000;
const sleep = (ms) => page.waitForTimeout(QUICK ? Math.min(ms, 400) : ms);
// مدة كلام الخطوة بالثواني: من مقطعها الصوتي، وإلا من طول النص
// بلا صوت في فيديو المشارك: زمن قراءة البطاقة نفسها (نحو 140 كلمة في الدقيقة) لأنها ما يقرؤه المشاهد
const speechSec = (text, idx) => (SEGS && idx >= 0 ? SEGS[idx].speech : PART ? Math.max(4.5, Math.min(14, text.split(/\s+/).length * 0.43)) : Math.max(5, Math.min(16, text.split(/\s+/).length * 0.33)));
const ev = (code) => page.evaluate(code);
let cur = null;     // الخطوة الجارية: فهرسها، لحظة بدء كلامها، نصها، وهل بطاقتها كاملة
// تُظهر بطاقة الخطوة فيبدأ كلامها من هذه اللحظة؛ الحركة تأتي بعدها أثناء الكلام، ثم end() ينتظر انتهاءه ويخفي البطاقة
const begin = async (idx, anchorOverride) => {
  const st = TOUR_STEPS[idx], anchor = anchorOverride === undefined ? st.anchor : anchorOverride;
  if (anchor) { await page.locator(`[data-tour="${anchor}"]`).first().waitFor({ timeout: 8000 }).catch(() => {}); await page.locator(`[data-tour="${anchor}"]`).first().scrollIntoViewIfNeeded().catch(() => {}); }
  await sleep(500);
  await page.evaluate(([a, n, t, title, text]) => window.__mi.show(a, n, t, title, text), [anchor, idx + 1, TOUR_STEPS.length, st.t, st.d]);
  cur = { idx, from: now(), text: st.d, full: false };
};
// سطر من فيديو المشارك: شاشة خطوته في الجولة، والبطاقة باسم المحطة وعدّادها (المحطة n من 6)، والشريط برقم السطر
const beginLine = async (idx, anchorOverride) => {
  const ln = PARTICIPANT_LINES[idx], st = TOUR_STEPS.find((x) => x.key === ln.step);
  const anchor = anchorOverride === undefined ? st.anchor : anchorOverride;
  if (anchor) { await page.locator(`[data-tour="${anchor}"]`).first().waitFor({ timeout: 8000 }).catch(() => {}); await page.locator(`[data-tour="${anchor}"]`).first().scrollIntoViewIfNeeded().catch(() => {}); }
  await sleep(300);
  const total = PARTICIPANT_BEATS.length;
  await page.evaluate(([a, n, t, title, text, mark, chip]) => window.__mi.show(a, n, t, title, text, mark, chip), [anchor, ln.beat, total, ln.title, ln.text, idx + 1, `المحطة ${ln.beat} من ${total}`]);
  cur = { idx, from: now(), text: ln.text, full: false };
};
const fullBegin = async (eyebrow, title, text, idx) => {
  await page.evaluate(([e, t, x, n]) => window.__mi.full(e, t, x, n), [eyebrow, title, text, idx + 1]);
  cur = { idx, from: now(), text: ITEMS[idx].text, full: true };
};
// ينتظر حتى تُقال كلمة بعينها من نص الخطوة (بموضعها النسبي في النص) ليأتي الفعل مع الجملة التي تصفه
const atWord = async (word) => {
  const words = cur.text.split(/\s+/), k = words.findIndex((w) => w.includes(word));
  if (k < 0) throw new Error(`الكلمة «${word}» ليست في نص الخطوة ${cur.idx + 1}`);
  const t = cur.from + speechSec(cur.text, cur.idx) * (k / words.length) - now();
  if (t > 0) await sleep(t * 1000);
};
// ينتظر انتهاء كلام الخطوة (مهما سبقته الحركة) ثم يسجّل موضعها للترجمة ويخفي البطاقة
const end = async (padMs = PART ? 300 : 500) => {
  const remain = cur.from + speechSec(cur.text, cur.idx) + padMs / 1000 - now();
  if (remain > 0) await sleep(remain * 1000);
  marks.push([cur.from, now(), cur.text]);
  if (cur.full) { await ev('window.__mi.fullHide()'); await sleep(700); } else { await ev('window.__mi.hide()'); await sleep(350); }
  cur = null;
};
const say = async (idx, anchorOverride) => { await begin(idx, anchorOverride); await end(); };
const moveTo = async (locator) => {
  const box = await locator.boundingBox(); if (!box) return;
  const x = box.x + Math.min(box.width - 10, Math.max(10, box.width * 0.5)), y = box.y + box.height / 2;
  await page.evaluate(([x, y]) => window.__mi.cursor(x, y), [x, y]); await sleep(PART ? 450 : 600);
};
const click = async (locator) => { await moveTo(locator); await ev('window.__mi.click()'); await locator.click(); await sleep(PART ? 300 : 450); };
const type = async (locator, text) => { await click(locator); await locator.fill(''); await locator.pressSequentially(text, { delay: QUICK ? 5 : PART ? 30 : 55 }); await sleep(PART ? 200 : 350); };
// حقل يُملأ دفعة واحدة (أرقام قصيرة) أو يُترك إن سبق ملؤه من الجهة
const put = async (locator, text) => { if (await locator.inputValue().catch(() => '')) return; await click(locator); await locator.fill(text); await sleep(150); };
const cursorHide = () => ev('window.__mi.cursorHide()');

await page.goto(`http://127.0.0.1:${PORT}/`);
await page.getByLabel('البريد الإلكتروني').waitFor();
await sleep(600);

// فيديو المشارك: خمسة عشر سطرًا في ست محطات، كل سطر على شاشة خطوته من الجولة، والحركة مع الكلمة التي تصفها
async function participantFlow() {
  srv.s.approveOnSubmit = false;   // «قيد المراجعة» بعد الإرسال، ثم يعتمد المستشار قبل محطة التأهيل
  // ما يتغير على الخادم لا يظهر في الصورة: عدد أسئلة المحاكاة غير عدد الأداة الفعالة
  await page.addStyleTag({ content: '.quiz-head > span.small:not(.muted){visibility:hidden}' }).catch(() => {});
  const L = (i) => PARTICIPANT_LINES[i];

  // المحطة 1: بطاقة كاملة فوق شاشة الدخول
  await fullBegin('برنامج إدارة المشروعات للقادة', L(0).title, L(0).text, 0);
  await end(800);

  // المحطة 2: الدخول بالبريد، ورمز الجهة الراعية في خطوة الاسم مع «رمزها»، ثم الملف
  await beginLine(1);
  await atWord('ببريدك');
  await type(page.getByLabel('البريد الإلكتروني'), 'sara@company.sa');
  await click(page.getByRole('button', { name: 'متابعة' }));
  await type(page.getByLabel('الاسم الكامل'), 'سارة عبدالله الأحمد');
  await atWord('رمزها');
  const sponsor = page.getByLabel(/رمز الجهة الراعية/);
  if (await sponsor.isVisible().catch(() => false)) await type(sponsor, 'HTR-2026');
  await click(page.getByRole('button', { name: 'أرسل الرمز' }));
  await page.getByRole('heading', { name: 'أرسلنا لك رابطًا ورمزًا' }).waitFor();
  await cursorHide();
  await end();
  await type(page.locator('input[inputmode="numeric"], input[autocomplete="one-time-code"]').first(), '246810');
  const verify = page.getByRole('button', { name: /تحقق|ادخل|متابعة/ }).first();
  if (await verify.isVisible().catch(() => false)) await click(verify);
  await page.locator('h1', { hasText: 'عرّفنا بك' }).first().waitFor({ timeout: 15000 });   // h3 بطاقة المحطة تحمل الاسم نفسه
  await cursorHide();

  await beginLine(2);
  await atWord('تُعرّفنا');
  await put(page.getByLabel(/رقم الجوال/), '0551234567');
  await type(page.getByLabel(/المسمى الوظيفي/), 'مديرة إدارة المشاريع');
  await put(page.getByLabel(/جهة العمل/), 'هيئة التحوّل الرقمي');
  await put(page.getByLabel(/سنوات الخبرة/), '9');
  await atWord('ونطاق');
  const scope = page.getByLabel(/نطاق ما تقوده الآن/);
  if (await scope.isVisible().catch(() => false)) { await moveTo(scope); await scope.selectOption({ index: 2 }).catch(() => {}); await sleep(400); }
  await cursorHide();
  await end();
  await click(page.getByRole('button', { name: 'حفظ والانتقال لتحديد المستوى' }));
  await page.getByRole('heading', { name: 'لنحدد نقطة انطلاقك' }).waitFor({ timeout: 15000 });
  await cursorHide();

  // المحطة 3: سطر الزمن بلا رقم ولا عدد أسئلة (يعرضهما التطبيق من الأداة الفعالة)، ثم الإجابة مع «وتُحفظ»
  await page.locator('[data-tour="assessment"] .alert.info').first().evaluate((el) => { el.textContent = '⏱ بلا حد زمني. تُحفظ إجاباتك أولًا بأول.'; }).catch(() => {});
  await beginLine(3);
  await atWord('زمني'); await click(page.getByRole('button', { name: 'ابدأ' })); await sleep(500);
  await atWord('وتُحفظ'); await click(page.getByRole('radio', { name: /غالبًا/ }).first()); await sleep(400);
  for (const [label, pick] of [[/واصل إلى|التالي/, /تغيّر سلوك المستفيدين/], [/واصل إلى|التالي/, /دائمًا/]]) {
    const next = page.getByRole('button', { name: label }).first();
    if (await next.isVisible().catch(() => false)) await click(next);
    await click(page.getByRole('radio', { name: pick }).first()); await sleep(300);
  }
  await page.getByRole('heading', { name: 'أنهيت الأسئلة كلها' }).waitFor({ timeout: 10000 }).catch(() => {});
  await cursorHide();
  await end();
  await click(page.getByRole('button', { name: 'أرسل واعرض نتيجتي' }));
  await page.locator('[data-tour="journey-hero"]').waitFor({ timeout: 15000 });
  await cursorHide();
  await sleep(700);
  await beginLine(4);
  await end();

  // يعتمد المستشار المسار، فتُفتح محطة التأهيل بمعالمها وتقييمها المستمر
  srv.s.approved = true;
  await page.reload();
  await page.locator('[data-tour="next-step"]').waitFor({ timeout: 15000 });
  await sleep(700);
  for (const i of [5, 6, 7]) { await beginLine(i); await end(); }

  // المحطة 5: الكتيب ويُفتح باب مع «وتختم»، والمبادرة، والقاعة، وطلب التوجيه
  await click(page.locator('[data-tour="nav-handbook"]').first());
  await page.locator('[data-tour="handbook-toc"]').waitFor({ timeout: 15000 });
  await cursorHide();
  await beginLine(8);
  await atWord('وتختم');
  const ch = page.locator('[data-tour="handbook-toc"] button.toc-ch').nth(1);
  if (await ch.isVisible().catch(() => false)) { await click(ch); await sleep(700); await cursorHide(); }
  await end();
  await click(page.locator('[data-tour="nav-capstone"]').first());
  await page.locator('[data-tour="capstone-sections"]').waitFor({ timeout: 15000 });
  await cursorHide();
  await beginLine(9); await end();
  await click(page.locator('[data-tour="nav-hall"]').first());
  await page.locator('[data-tour="hall"]').waitFor({ timeout: 15000 });
  await cursorHide();
  await beginLine(10); await end();
  await click(page.locator('[data-tour="nav-home"]').first());
  await page.locator('[data-tour="peer"]').waitFor({ timeout: 15000 });
  await cursorHide();
  await beginLine(11);
  await atWord('توجيهًا');
  await click(page.locator('[data-tour="peer"]').getByRole('button', { name: 'اطلب توجيهًا' }));
  await type(page.locator('[data-tour="peer"] textarea').first(), 'ما الفرق العملي بين معلم القيمة ومعلم الإنجاز في برنامج رقمنة الخدمات؟');
  await click(page.locator('[data-tour="peer"]').getByRole('button', { name: /أرسل|اطلب/ }).last());
  await sleep(700);
  await cursorHide();
  await end();

  // المحطة 6: الأثر، ثم صفحة التحقق العامة من الشهادة، ثم الدعوة
  await beginLine(12); await end();
  await page.goto(`http://127.0.0.1:${PORT}/v/MI-LDR-2026-000142`);
  await page.locator('[data-tour="verify"] .vf-state').waitFor({ timeout: 15000 });
  await sleep(500);
  await beginLine(13, 'verify'); await end();
  await fullBegin(L(14).title, 'ابدأ رحلتك', 'عرّفنا بك، ثم حدّد نقطة انطلاقك. leaders.sunkvalue.com', 14);
  await end(2000);
}

// الجولة الكاملة: الخطوات الثماني عشرة بصوت المقدّم
async function tourFlow() {
  // 1 الترحيب: بطاقة كاملة فوق شاشة الدخول
  await fullBegin('برنامج إدارة المشروعات للقادة', 'كيف تعمل المنصة', TOUR_STEPS[0].d, 0);
  await end(800);

  // 2 أبواب الدخول: مع «ببريده» يُكتب البريد والاسم ويُرسل الرمز؛ وبعد الكلام يُكتب الرمز فيُدخل
  await begin(1);
  await atWord('ببريده');
  await type(page.getByLabel('البريد الإلكتروني'), 'sara@company.sa');
  await click(page.getByRole('button', { name: 'متابعة' }));
  await type(page.getByLabel('الاسم الكامل'), 'سارة عبدالله الأحمد');
  await click(page.getByRole('button', { name: 'أرسل الرمز' }));
  await page.getByRole('heading', { name: 'أرسلنا لك رابطًا ورمزًا' }).waitFor();
  await cursorHide();
  await end();
  const code = page.locator('input[inputmode="numeric"], input[autocomplete="one-time-code"]').first();
  await type(code, '246810');
  const verify = page.getByRole('button', { name: /تحقق|ادخل|متابعة/ }).first();
  if (await verify.isVisible().catch(() => false)) await click(verify);
  await page.getByRole('heading', { name: /عرّفنا بك/ }).waitFor({ timeout: 15000 });
  await cursorHide();

  // 3 الملف: كل حقل يُملأ عند ذكره في الكلام، ثم الحفظ بعده
  await begin(2);
  await atWord('بيانات'); await type(page.getByLabel(/رقم الجوال/), '0551234567');
  await atWord('المسمى'); await type(page.getByLabel(/المسمى الوظيفي/), 'مديرة إدارة المشاريع');
  await atWord('وجهة'); await type(page.getByLabel(/جهة العمل/), 'هيئة التحوّل الرقمي');
  await atWord('وسنوات'); await type(page.getByLabel(/سنوات الخبرة/), '9');
  await atWord('ونطاق');
  const scope = page.getByLabel(/نطاق ما تقوده الآن/);
  if (await scope.isVisible().catch(() => false)) { await moveTo(scope); await scope.selectOption({ index: 2 }).catch(() => {}); await sleep(400); }
  await cursorHide();
  await end();
  await click(page.getByRole('button', { name: 'حفظ والانتقال لتحديد المستوى' }));
  await page.getByRole('heading', { name: 'لنحدد نقطة انطلاقك' }).waitFor({ timeout: 15000 });
  await cursorHide();

  // 4 القياس: البدء مع «الأطر»، وإجابة كل طبقة عند ذكرها، ثم الإرسال بعد الكلام
  await begin(3);
  await atWord('الأطر'); await click(page.getByRole('button', { name: 'ابدأ' })); await sleep(600);
  await atWord('الممارسة'); await click(page.getByRole('radio', { name: /غالبًا/ }).first()); await sleep(500);
  const cont1 = page.getByRole('button', { name: /واصل إلى|التالي/ }).first();
  if (await cont1.isVisible().catch(() => false)) await click(cont1);
  await atWord('المواقف'); await click(page.getByRole('radio', { name: /تغيّر سلوك المستفيدين/ }).first()); await sleep(500);
  const cont2 = page.getByRole('button', { name: /واصل إلى|التالي/ }).first();
  if (await cont2.isVisible().catch(() => false)) await click(cont2);
  await atWord('المعرفة'); await click(page.getByRole('radio', { name: /دائمًا/ }).first()); await sleep(500);
  await page.getByRole('heading', { name: 'أنهيت الأسئلة كلها' }).waitFor({ timeout: 10000 }).catch(() => {});
  await cursorHide();
  await end();
  await click(page.getByRole('button', { name: 'أرسل واعرض نتيجتي' }));
  await page.locator('[data-tour="journey-hero"]').waitFor({ timeout: 15000 });
  await cursorHide();
  await sleep(900);

  // 5 إلى 9: الرحلة، بطاقة على كل جزء
  for (const i of [4, 5, 6, 7, 8]) await say(i);

  // 10 الكتيب: تبويب كتيبي والفهرس، ويُفتح باب عند «يقرأ»
  await click(page.locator('[data-tour="nav-handbook"]').first());
  await page.locator('[data-tour="handbook-toc"]').waitFor({ timeout: 15000 });
  await cursorHide();
  await begin(9);
  await atWord('يقرأ');
  const ch = page.locator('[data-tour="handbook-toc"] button.toc-ch').nth(1);
  if (await ch.isVisible().catch(() => false)) { await click(ch); await sleep(900); await cursorHide(); }
  await end();

  // 11 المبادرة
  await click(page.locator('[data-tour="nav-capstone"]').first());
  await page.locator('[data-tour="capstone-sections"]').waitFor({ timeout: 15000 });
  await cursorHide();
  await say(10);

  // 12 القاعة
  await click(page.locator('[data-tour="nav-hall"]').first());
  await page.locator('[data-tour="hall"]').waitFor({ timeout: 15000 });
  await cursorHide();
  await say(11);

  // 13 طلبات الأقران: العودة إلى الرحلة، وعند «يطرحه» يُكتب سؤال، وعند «يجيب» يُرسل
  await click(page.locator('[data-tour="nav-home"]').first());
  await page.locator('[data-tour="peer"]').waitFor({ timeout: 15000 });
  await cursorHide();
  await begin(12);
  await atWord('يطرحه');
  await click(page.locator('[data-tour="peer"]').getByRole('button', { name: 'اطلب توجيهًا' }));
  await type(page.locator('[data-tour="peer"] textarea').first(), 'ما الفرق العملي بين معلم القيمة ومعلم الإنجاز في برنامج رقمنة الخدمات؟');
  await atWord('يجيب');
  await click(page.locator('[data-tour="peer"]').getByRole('button', { name: /أرسل|اطلب/ }).last());
  await sleep(900);
  await cursorHide();
  await end();

  // 14 الأثر (تبويب مقفل)، 15 الختامي والشهادة
  await say(13);
  await say(14);

  // 16 الملف والأمان
  await click(page.locator('[data-tour="nav-profile"]').first());
  await page.locator('[data-tour="security"]').waitFor({ timeout: 15000 });
  await cursorHide();
  await say(15);

  // 17 البوابتان و18 الختام: بطاقتان كاملتان
  await fullBegin('ثلاث بوابات، منظومة واحدة', 'بوابتا الجهة والخبير', TOUR_STEPS[16].d, 16);
  await end(800);
  await fullBegin('سؤال الختام', 'ما الممارسة الواحدة التي ستبدأها غدًا؟', TOUR_STEPS[17].d + ' leaders.sunkvalue.com', 17);
  await end(2000);
}

try { if (PART) await participantFlow(); else await tourFlow(); } catch (e) {
  // لقطة لحظة الفشل بجوار الناتج لتشخيصها
  await page.screenshot({ path: path.join(OUT, 'record-failure.png') }).catch(() => {});
  throw e;
}

await context.close();
await browser.close();
preview.kill();

// ── الترميز والترجمة ──
const webmIn = fs.readdirSync(tmpVid).map((f) => path.join(tmpVid, f)).find((f) => f.endsWith('.webm'));
const run = (args) => new Promise((resolve, reject) => { const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' }); p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`)))); });
const base = path.join(OUT, OUTV.file);
const FPS = 24;
// لحظات الخطوات من الإطارات: متوسط لون الشريط في كل إطار (بالمعدل نفسه الذي يُرمَّز به الناتج)، وأول إطار يحمل لون الخطوة هو ظهورها
const strip = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', webmIn, '-vf', `fps=${FPS},crop=${W}:${STRIP}:0:${H},scale=1:1:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
const frames = strip.length / 3;
const onsets = [], offsets = [];
let expect = 1, inside = false;
for (let f = 0; f < frames; f++) {
  const r = strip[f * 3], g = strip[f * 3 + 1], b = strip[f * 3 + 2];
  const lit = b > 120 && g < 70, n = lit ? Math.round((r - 40) / 10) : 0;
  if (!inside && lit && n === expect) { onsets.push(f / FPS); inside = true; }
  else if (inside && !lit) { offsets.push(f / FPS); inside = false; expect++; }
}
if (inside) { offsets.push(frames / FPS); expect++; }
if (onsets.length !== ITEMS.length) throw new Error(`قراءة شريط الخطوات: ${onsets.length} من ${ITEMS.length}`);
const seconds = Math.ceil(frames / FPS);
const FADE = 0.3;   // الصوت يبدأ حين تكتمل البطاقة
const cues = onsets.map((t, i) => [t, Math.min(offsets[i], i + 1 < onsets.length ? onsets[i + 1] - 0.2 : frames / FPS), ITEMS[i].text]);
// الصوت: كل مقطع يبدأ مع بداية خطوته المسجَّلة (marks)، ثم يُدمج مع الصورة
let audioArgs = [], audioMap = [];
if (SEGS) {
  const inputs = [], delays = [];
  SEGS.forEach((_, i) => { inputs.push('-i', path.join(AUDIO, `${String(i + 1).padStart(2, '0')}.mp3`)); const ms = Math.round((onsets[i] + FADE) * 1000); delays.push(`[${i + 1}]adelay=${ms}|${ms}[a${i}]`); });
  const mix = `${delays.join(';')};${SEGS.map((_, i) => `[a${i}]`).join('')}amix=inputs=${SEGS.length}:normalize=0:dropout_transition=0,aresample=48000,apad[aout]`;
  audioArgs = [...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[aout]'];
  audioMap = ['-shortest'];
}
await Promise.all([run(['-i', webmIn, ...audioArgs, '-vf', `fps=${FPS},crop=${W}:${H}:0:0`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', ...(SEGS ? ['-c:a', 'aac', '-b:a', '128k'] : []), ...audioMap, '-movflags', '+faststart', `${base}.mp4`]),
  run(['-i', webmIn, ...audioArgs, '-vf', `fps=${FPS},crop=${W}:${H}:0:0`, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', ...(SEGS ? ['-c:a', 'libopus', '-b:a', '96k'] : []), ...audioMap, `${base}.webm`])]);
await run(['-ss', '3', '-i', `${base}.mp4`, '-frames:v', '1', '-q:v', '4', `${base}.jpg`]);
fs.rmSync(tmpVid, { recursive: true, force: true });
const ts = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = (s % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x}`; };
const vtt = ['WEBVTT', ''];
cues.forEach(([a, b, text], i) => vtt.push(String(i + 1), `${ts(a)} --> ${ts(b)}`, text, ''));
fs.writeFileSync(`${base}.vtt`, vtt.join('\n'));
fs.writeFileSync(`${base}.json`, JSON.stringify({ seconds, marks: cues.map(([a, b]) => [Number(a.toFixed(2)), Number(b.toFixed(2))]), wall: marks.map(([a, b]) => [Number(a.toFixed(2)), Number(b.toFixed(2))]) }, null, 2));
for (const ext of ['mp4', 'webm']) {
  const size = fs.statSync(`${base}.${ext}`).size;
  console.log(`${OUTV.file}.${ext}: ${(size / 1024 / 1024).toFixed(2)} ميجابايت`);
  if (size > OUTV.maxBytes) { console.error(`✗ تجاوز السقف ${(OUTV.maxBytes / 1024 / 1024).toFixed(0)} ميجابايت`); process.exit(1); }
}
console.log(`✓ ${seconds} ثانية، ${cues.length} خطوة من الإطارات (فرق ساعة الحائط ${(marks[marks.length - 1][0] - onsets[onsets.length - 1]).toFixed(1)} ث)، ${OUT}`);
