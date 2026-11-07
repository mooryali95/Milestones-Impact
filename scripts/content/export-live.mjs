#!/usr/bin/env node
// تصدير المحتوى الحي قراءةً ومقارنته بالمستودع (D01)، وهو كشف الانحراف المحلي ما دامت Actions موقوفة.
//   SUPABASE_ACCESS_TOKEN=... node scripts/content/export-live.mjs                 يصدّر ويطبع تقرير الفرق
//   node scripts/content/export-live.mjs --from=.content-live/<التاريخ>/live.json  يعيد المقارنة من تصدير سابق
//   ... --check                       رمز 1 إن وُجد أي فرق (كشف الانحراف)
//   ... --adopt=body,reflection --to=v3.1   ينسخ الإصدار الحالي إلى إصدار جديد بمتن الأبواب المختلفة وتأملها من الإنتاج
//   ... --adopt=body,reflection,quiz --to=v3.1  ومعهما الاختبار (مُقاس: بقرار مسمّى فقط)
// ثم: node scripts/handbook/build-version.mjs --from=<الحالي> --to=v3.1 فيُولَّد ترحيل محروس (الإصدار المرحَّل مجمّد).
// القراءة عبر Management API بأوامر select وحدها، والتصدير في .content-live/ خارج Git (محتوى بلا بيانات شخصية).
// المصالحة: شغّل بـ --adopt على فرع، وراجع git diff، وافتح طلب دمج بتقرير الفرق. لا دفع إلى main ولا رمز GitHub في الدوال.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirOf, ROOT, VERSION } from '../handbook/content.mjs';
import { chapterFile, diffContent, renderReport, repoContent } from './live.mjs';

const REF = process.env.SUPABASE_PROJECT_REF || 'eormhcupwgwpllhrfxxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const has = (k) => process.argv.includes(`--${k}`);
const adopt = arg('adopt').split(',').filter(Boolean);
if (adopt.some((x) => !['body', 'reflection', 'quiz'].includes(x))) { console.error('--adopt يقبل body وreflection وquiz'); process.exit(2); }
const to = arg('to');
if (adopt.length && (!/^v\d+(\.\d+)+$/.test(to || '') || existsSync(dirOf(to)))) { console.error(`--adopt يحتاج --to=<إصدار جديد غير موجود> بعد ${VERSION}، مثل ${VERSION}.1`); process.exit(2); }

export const QUERIES = {
  handbook_modules: 'select to_jsonb(h) as r from leaders.handbook_modules h order by dimension, sort',
  questions: `select to_jsonb(q) || jsonb_build_object('instrument_key', i.key) as r
    from leaders.questions q join leaders.instruments i on i.id = q.instrument_id order by i.key, q.sort`,
  instruments: 'select to_jsonb(i) as r from leaders.instruments i order by key',
  learning_models: 'select to_jsonb(m) as r from leaders.learning_models m order by dimension, sort',
  katon_topics: 'select to_jsonb(t) as r from leaders.katon_topics t order by sort',
  katon_sentences: `select to_jsonb(s) || jsonb_build_object('topic_key', t.key) as r
    from leaders.katon_sentences s join leaders.katon_topics t on t.id = s.topic_id order by t.sort, s.sort`,
};

async function query(sql) {
  if (!/^\s*select\b/i.test(sql)) throw new Error('قراءة فقط');
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 400)}`);
  return (await r.json()).map((x) => x.r);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const at = new Date().toISOString().slice(0, 10);
  let live;
  let dir;
  if (arg('from')) {
    live = JSON.parse(readFileSync(arg('from'), 'utf8'));
    dir = join(arg('from'), '..');
  } else {
    if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN مطلوب للقراءة من الإنتاج، أو --from=<تصدير سابق>'); process.exit(2); }
    live = {};
    for (const [k, sql] of Object.entries(QUERIES)) {
      try { live[k] = await query(sql); } catch (e) { console.error(`! ${k}: ${e.message}`); live[k] = []; }
    }
    dir = arg('out') || join(ROOT, '.content-live', at);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'live.json'), JSON.stringify(live, null, 1));
  }
  const repo = repoContent();
  const diffs = diffContent(live, repo);
  const report = renderReport(diffs, { at });
  writeFileSync(join(dir, 'report.md'), report);
  console.log(report);
  console.log(`النماذج التعليمية في الإنتاج: ${(live.learning_models || []).length}، بلا ملف مصدر في المستودع بعد (المرحلة الثانية من D10).`);
  console.log(`التصدير والتقرير في ${dir}`);

  if (adopt.length) {
    const byId = new Map((live.handbook_modules || []).map((m) => [`${m.dimension}/${m.chapter_key}`, m]));
    const changed = new Set(diffs.filter((x) => x.kind === 'handbook' && x.status === 'changed').map((x) => x.id));
    mkdirSync(dirOf(to), { recursive: true });
    for (const [id, c] of repo.handbook) writeFileSync(join(dirOf(to), c.file), chapterFile(c, byId.get(id), changed.has(id) ? adopt : []));
    console.log(`نُسخ ${VERSION} إلى ${to}، ومنها ${changed.size} بابًا بقيم الإنتاج (${adopt.join('، ')}).`);
    console.log(`ثم: node scripts/handbook/build-version.mjs --from=${VERSION} --to=${to}، ومتحقق الكتاب، وطلب دمج بالتقرير أعلاه.`);
  }
  if (has('check') && diffs.some((x) => x.status !== 'same')) process.exit(1);
}
