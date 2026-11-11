// ════════════════════════════════════════════════════════════════
// استيراد المشاركين دفعة واحدة: المصدر الواحد لقراءة الجدول الملصوق والتحقق من صفوفه
// ════════════════════════════════════════════════════════════════
// تُستعمل في اللوحة (معاينة فورية) وفي الخادم (التحقق نفسه قبل الكتابة)، فلا يختلف ما يُعرض عمّا يُحفظ.
import { isEmail, normalizeEmail, normalizePhone } from './logic.js';

export const IMPORT_MAX = 300;
export const IMPORT_STATUS_AR = {
  ok: 'جاهز', invalid: 'ناقص أو غير صحيح', duplicate: 'مكرر في الجدول', exists: 'مسجل من قبل', created: 'أُضيف', failed: 'تعذّرت إضافته',
};
const PHONE_LIKE = /^[+\d٠-٩][\d٠-٩\s\-()]{6,}$/;

// نص ملصوق من Excel (أعمدة بعلامة جدولة) أو ملف CSV (فاصلة أو فاصلة منقوطة): الأعمدة تُعرف بمحتواها لا بترتيبها.
// الخلية التي فيها بريد هي البريد، والتي تشبه رقمًا هي الجوال، وأول ما سواهما الاسم، وثانيه المسمى الوظيفي.
// كل سطر غير فارغ صف برقم سطره، ولو كان بريده معيبًا أو غائبًا: يظهر في المعاينة «ناقصًا» ولا يسقط بصمت.
// المستثنى سطر العناوين وحده: أول سطر لا بريد فيه ولا «@» ولا رقم جوال.
export function parseImport(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const rows = [];
  let first = true;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
    const cells = line.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim()).filter(Boolean);
    const email = cells.find((c) => isEmail(normalizeEmail(c))) || cells.find((c) => c.includes('@')) || '';
    const rest = cells.filter((c) => c !== email);
    const phone = rest.find((c) => PHONE_LIKE.test(c)) || '';
    const header = first && !email && !phone;
    first = false;
    if (header) return;
    const words = rest.filter((c) => c !== phone);
    rows.push({ line: i + 1, full_name: words[0] || '', email, phone, job_title: words[1] || '' });
  });
  return rows;
}

// الحد في المرة الواحدة: رسالة واحدة تعرضها اللوحة قبل الإرسال، ويرفض بها الخادم ما تجاوزه
export const importLimitIssue = (n) => (n > IMPORT_MAX ? `في الجدول ${n} صفًا، والحد ${IMPORT_MAX} صفًا في المرة الواحدة. قسّمه دفعات.` : '');

// يتحقق من الصفوف ويوحّد صيغها. existing: مجموعة عناوين مسجلة من قبل (فارغة في المعاينة قبل سؤال الخادم).
export function checkImport(rows, existing = new Set()) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).slice(0, IMPORT_MAX).map((r) => {
    // رقم السطر في الجدول الملصوق، ليجد المدير الصف المعيب فيصححه
    const line = Number.isInteger(r?.line) && r.line > 0 ? r.line : null;
    const full_name = String(r?.full_name || '').trim().slice(0, 120);
    const email = normalizeEmail(r?.email);
    const rawPhone = String(r?.phone || '').trim();
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    const job_title = String(r?.job_title || '').trim().slice(0, 120) || null;
    const base = { line, full_name, email, phone, job_title };
    if (!email) return { ...base, status: 'invalid', reason: 'البريد مطلوب' };
    if (!isEmail(email)) return { ...base, status: 'invalid', reason: 'البريد غير صحيح' };
    if (full_name.length < 3) return { ...base, status: 'invalid', reason: 'الاسم مطلوب (3 أحرف على الأقل)' };
    if (rawPhone && !phone) return { ...base, status: 'invalid', reason: 'رقم الجوال غير صحيح' };
    if (seen.has(email)) return { ...base, status: 'duplicate', reason: 'البريد مكرر في الجدول' };
    seen.add(email);
    if (existing.has(email)) return { ...base, status: 'exists', reason: 'مسجل من قبل، ولم يُغيَّر' };
    return { ...base, status: 'ok' };
  });
}

export const importCounts = (checked) => checked.reduce((n, r) => ({ ...n, [r.status]: (n[r.status] || 0) + 1 }), {});
