// مقارنة المحتوى الحي بأصله في المستودع (D01): منطق بلا شبكة، يختبره content-export.test.js
// ويستعمله scripts/content/export-live.mjs. المستودع هو الأصل، فكل فرق إما تعديل من اللوحة
// يُصدَّر إلى المستودع (نص غير مُقاس) وإما انحراف يُحسم بقرار (محتوى مُقاس).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadChapters, ROOT } from '../handbook/content.mjs';

// أحدث مصدر في المستودع لكل أداة حية
export const QUESTION_SOURCES = { 'baseline-v4': 'v4.2', 'post-v2': 'v4.2', 'baseline-v5': 'v5.2', 'post-v3': 'v5.2' };   // v5.2 بعد طبقة الموازنة (D03): قبل تطبيق ترحيلها يظهر الفرق متوقعًا
// حقول الفقرة المقارنة؛ المُقاس منها لا يُعدَّل من اللوحة (content-lock.js)
export const QUESTION_FIELDS = ['code', 'dimension', 'tier', 'kind', 'weight', 'text_ar', 'help_ar', 'text_rater_ar', 'options', 'anchor_code', 'retro', 'form', 'competency_ar', 'chapter_key'];
export const HANDBOOK_FIELDS = ['body_md', 'quiz_md', 'reflection_ar'];
export const UNMEASURED = new Set(['help_ar', 'body_md', 'reflection_ar']);

const norm = (v) => {
  if (v === undefined || v === '') return null;
  if (typeof v === 'string') { const t = v.replace(/\r\n/g, '\n').trim(); return t === '' ? null : t; }
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.map((o) => (o && typeof o === 'object' ? { label: norm(o.label), score: Number(o.score) } : norm(o)));
  return v;
};
const numeric = new Set(['weight']);
const val = (f, v) => (numeric.has(f) && v != null && v !== '' ? Number(v) : norm(v));
const eq = (f, a, b) => JSON.stringify(val(f, a)) === JSON.stringify(val(f, b));
export const fingerprint = (row, fields) => createHash('sha256').update(JSON.stringify(fields.map((f) => val(f, row[f])))).digest('hex').slice(0, 16);

export function repoContent(root = ROOT) {
  const handbook = new Map(loadChapters().map((c) => [`${c.dimension}/${c.chapter_key}`, c]));
  const questions = new Map();
  for (const [inst, ver] of Object.entries(QUESTION_SOURCES)) {
    const items = JSON.parse(readFileSync(join(root, `supabase/content/questions/${ver}/items.json`), 'utf8'));
    for (const it of items.filter((x) => x.instrument === inst)) questions.set(it.id, { ...it, source: ver });
  }
  const katon = new Map(JSON.parse(readFileSync(join(root, 'supabase/content/katon/v1/topics.json'), 'utf8')).map((t) => [t.key, t]));
  return { handbook, questions, katon };
}

// live: { handbook_modules: [], questions: [] (مع instrument_key), katon_topics: [], katon_sentences: [] (مع topic_key) }
export function diffContent(live, repo) {
  const out = [];
  const push = (kind, id, status, fields = [], row = {}) => out.push({
    kind, id, status, fields, measured: fields.some((f) => !UNMEASURED.has(f)), updated_by: row.updated_by || null, updated_at: row.updated_at || null,
  });

  const seen = new Set();
  for (const m of live.handbook_modules || []) {
    const id = `${m.dimension}/${m.chapter_key}`;
    seen.add(id);
    const r = repo.handbook.get(id);
    if (!r) { push('handbook', id, 'live_only', [], m); continue; }
    const fields = HANDBOOK_FIELDS.filter((f) => !eq(f, m[f], r[f]));
    if (r.min_level && !eq('min_level', m.min_level, r.min_level)) fields.push('min_level');
    push('handbook', id, fields.length ? 'changed' : 'same', fields, m);
  }
  for (const id of repo.handbook.keys()) if (!seen.has(id)) push('handbook', id, 'repo_only');

  const qseen = new Set();
  for (const q of live.questions || []) {
    if (!QUESTION_SOURCES[q.instrument_key]) continue;
    qseen.add(q.id);
    const r = repo.questions.get(q.id);
    if (!r) { push('question', `${q.instrument_key}/${q.code}`, 'live_only', [], q); continue; }
    const fields = QUESTION_FIELDS.filter((f) => f in r && !eq(f, q[f], r[f]));
    push('question', `${q.instrument_key}/${q.code}`, fields.length ? 'changed' : 'same', fields, q);
  }
  const liveInst = new Set((live.questions || []).map((q) => q.instrument_key));
  for (const [id, r] of repo.questions) if (!qseen.has(id) && liveInst.has(r.instrument)) push('question', `${r.instrument}/${r.code}`, 'repo_only');

  const sentencesOf = (key) => (live.katon_sentences || []).filter((s) => s.topic_key === key).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  for (const t of live.katon_topics || []) {
    const r = repo.katon.get(t.key);
    if (!r) { push('katon', t.key, 'live_only', [], t); continue; }
    const fields = [];
    if (!eq('title_ar', t.title_ar, r.title_ar)) fields.push('title_ar');
    const ls = sentencesOf(t.key);
    const rs = r.sentences || [];
    if (ls.length !== rs.length) fields.push('sentences');
    else ls.forEach((s, i) => { for (const f of ['text_ar', 'key', 'question']) if (!eq(f, s[f], rs[i][f]) && !fields.includes(`sentence.${f}`)) fields.push(`sentence.${f}`); });
    push('katon', t.key, fields.length ? 'changed' : 'same', fields, t);
  }
  return out;
}

const STATUS_AR = { same: 'مطابق', changed: 'مختلف', live_only: 'في الإنتاج وحده', repo_only: 'في المستودع وحده' };
const KIND_AR = { handbook: 'أبواب الكتاب', question: 'فقرات القياس', katon: 'موضوعات كاتون' };

export function renderReport(diffs, meta = {}) {
  const L = [`# فرق المحتوى الحي عن المستودع${meta.at ? ` (${meta.at})` : ''}`, ''];
  L.push('المستودع هو الأصل (D01). النص غير المُقاس المختلف يُصدَّر إلى المستودع بطلب دمج، والمُقاس المختلف يُحسم بقرار قبل أي مراجعة خبراء.', '');
  L.push('| النوع | مطابق | مختلف (مُقاس) | مختلف (نص فقط) | في الإنتاج وحده | في المستودع وحده |', '|---|---|---|---|---|---|');
  for (const k of Object.keys(KIND_AR)) {
    const d = diffs.filter((x) => x.kind === k);
    if (!d.length) continue;
    const n = (s, m) => d.filter((x) => x.status === s && (m === undefined || x.measured === m)).length;
    L.push(`| ${KIND_AR[k]} | ${n('same')} | ${n('changed', true)} | ${n('changed', false)} | ${n('live_only')} | ${n('repo_only')} |`);
  }
  const bad = diffs.filter((x) => x.status !== 'same');
  if (bad.length) {
    L.push('', '| النوع | المعرّف | الحالة | الحقول | آخر تعديل |', '|---|---|---|---|---|');
    for (const x of bad) L.push(`| ${KIND_AR[x.kind]} | \`${x.id}\` | ${STATUS_AR[x.status]}${x.measured ? '، مُقاس' : ''} | ${x.fields.join('، ')} | ${[x.updated_by, x.updated_at && String(x.updated_at).slice(0, 16)].filter(Boolean).join(' ') || ''} |`);
  } else L.push('', 'لا فرق: الإنتاج يطابق المستودع.');
  return L.join('\n') + '\n';
}

// ملف الباب كما يقرؤه parseChapter، بقيم الإنتاج للحقول المعتمدة (adopt: body وreflection وquiz).
// مستوى الباب حقل نظامي يحمله الإنتاج وحده اليوم، فيُنقل إلى الترويسة كلما مُرر صف الإنتاج.
export function chapterFile(c, live, adopt = []) {
  const pick = (f) => (adopt.includes(f.replace('_md', '').replace('_ar', '')) && live?.[f] != null ? String(live[f]).trim() : c[f]);
  const level = c.min_level || live?.min_level || null;
  const meta = [`chapter_key: ${c.chapter_key}`, `dimension: ${c.dimension}`, ...(level ? [`min_level: ${level}`] : [])];
  return `---\n${meta.join('\n')}\n---\n${pick('body_md')}\n---QUIZ---\n${pick('quiz_md')}\n---REFLECTION---\n${pick('reflection_ar')}\n`;
}
