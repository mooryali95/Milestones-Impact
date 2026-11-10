// تدقيق الإنتاج، الجولة 1 (2026-11-10): صحة الخادم.
// 7.2 تعريف واحد لإتمام الباب، 7.3 الاسم على الشهادة وتأكيده، 7.8 الاستبانة بعد الحضور، 4.6 التوقيعان في كل الأوضاع،
// 4.5 أجل روابط الاستعمال الواحد بعد القرار، 9.8 حساب العرض خارج إحصاءات الأثر، 9.9 رموز العناوين في اللوحة.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import {
  certNameEnOk, certNameOk, chapterCompletion, gateSurveys, LINK_AFTER_DECISION_DAYS, linkAfterDecisionOk, readingVerdict, renderJourneyText, SURVEY_WAITS_AR,
} from '../../supabase/functions/leaders-api/logic.js';
import { approvalState, finalEditors, voteBlock } from '../../supabase/functions/leaders-api/final.js';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('7.2 إتمام الباب بتعريف واحد في الكتيب والرحلة', () => {
  const read80 = { words: 400, active_seconds: 600, slices: Array(20).fill(30) };
  it('الاختبار وحده لا يُتم الباب، والقراءة وحدها لا تُتمه', () => {
    expect(chapterCompletion(readingVerdict(null), true)).toMatchObject({ complete: false, reading: { state: 'unread' } });
    expect(chapterCompletion(readingVerdict(read80), false).complete).toBe(false);
    expect(chapterCompletion(readingVerdict(read80), true)).toMatchObject({ complete: true, reading: { state: 'read', pct: 100 } });
  });
  it('الخادم يرسل complete في فهرس الكتيب، والكتيب يعدّ به', () => {
    expect(read('supabase/functions/leaders-api/participant.ts')).toContain('...chapterCompletion(readingVerdict(read[m.id]), !!done[m.id]),');
    const hb = read('leaders-app/src/screens/Handbook.jsx');
    expect(hb).toContain('const complete = (c) => (c.complete ?? !!c.done);');
    expect(hb).toContain('const doneN = list.filter(complete).length;');
    expect(hb).toContain('بقيت القراءة');
  });
});

describe('7.3 الاسم على الشهادة', () => {
  it('اسمان بالحروف، والإنجليزي لاتيني واسمان', () => {
    for (const n of ['سارة الأحمد', 'عبد الله بن محمد', 'مُحمَّد العلي']) expect(certNameOk(n), n).toBe(true);
    for (const n of ['OmarManzoma', 'O', 'سارة 2', '', 'سارة @الأحمد']) expect(certNameOk(n), n).toBe(false);
    expect(certNameEnOk('Sarah Alahmad')).toBe(true);
    for (const n of ['adafa', 'سارة الأحمد', 'Sarah 2', 'A B']) expect(certNameEnOk(n), n).toBe(false);
  });
  it('الواجهة والخادم بالفحص نفسه، والخادم يفحص ما تغيّر وحده', () => {
    expect(read('leaders-app/src/screens/Profile.jsx')).toContain('export const certName = certNameOk;');
    const p = read('supabase/functions/leaders-api/participant.ts');
    expect(p).toContain("if ('full_name' in patch && patch.full_name !== p.full_name && !certNameOk(patch.full_name)) {");
    expect(p).toContain("patch.name_en !== (p.name_en || null) && !certNameEnOk(patch.name_en)");
    expect(p).toContain("if ('name_confirmed_at' in p) patch.name_confirmed_at = null;");
  });
  it('الشهادة الجديدة تنتظر تأكيد الاسم، والتأكيد يصدرها بقرار التقييم نفسه', () => {
    const cert = read('supabase/functions/leaders-api/certificates.ts');
    const on = cert.slice(cert.indexOf('export async function onFinalApproved('), cert.indexOf('export async function issueAfterNameConfirm('));
    expect(on).toMatch(/if \('name_confirmed_at' in p && !p\.name_confirmed_at\) \{[\s\S]*'certificate\.awaiting-name'[\s\S]*return \{ awaiting_name: true \};\n\s+\}\n\s+return insertCertificate\(p, by, final\);/);
    expect(cert).toMatch(/export async function issueAfterNameConfirm[\s\S]*\.eq\('status', 'approved'\)[\s\S]*PASSING\.includes\(decision\)[\s\S]*onFinalApproved\(/);
    expect(read('supabase/functions/leaders-api/index.ts')).toMatch(/'profile\.confirm-name': async \(p\) => \{[\s\S]*P\.confirmName\(p\)[\s\S]*Z\.issueAfterNameConfirm\(p\.id\)/);
    expect(read('leaders-app/src/screens/Journey.jsx')).toContain('هكذا يظهر اسمك على الشهادة');
  });
});

describe('ترحيل 20261110210000_leaders_name_confirmation', () => {
  const NAME = '20261110210000_leaders_name_confirmation';
  const SQL = read(`supabase/migrations/${NAME}.sql`);
  it('متسامح قبل تطبيقه، ومن صدرت شهادته يُعد مؤكِّدًا، وإعادته آمنة', async () => {
    expect(gateOf(SQL, NAME).gate).toBe('tolerant');
    const db = new PGlite();
    await db.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key);
      create table leaders.participants (id int primary key, name_locked_at timestamptz);
      insert into leaders.participants values (1, '2026-11-01T10:00:00Z'), (2, null);`);
    await db.exec(SQL);
    await db.exec(SQL);
    const { rows } = await db.query('select id, name_confirmed_at from leaders.participants order by id');
    expect(rows[0].name_confirmed_at).not.toBeNull();
    expect(rows[1].name_confirmed_at).toBeNull();
    expect((await db.query(`select 1 from leaders.schema_migrations where name = '${NAME}'`)).rows).toHaveLength(1);
  });
});

describe('7.8 استبانة أيام التدريب بعد الحضور', () => {
  const survey = { id: 's', kind: 'survey', code: 'T-REACT', status: 'pending' };
  it('تنتظر أول حضور، وما أُرسل قبله يبقى، ولا شرط في مرحلة بلا حضور', () => {
    const none = gateSurveys([{ id: 'a', kind: 'workshop', status: 'pending', activity: { count: 0 } }, survey]);
    expect(none[1].waits).toBe(SURVEY_WAITS_AR);
    const one = gateSurveys([{ id: 'a', kind: 'workshop', status: 'pending', activity: { count: 1 } }, survey]);
    expect(one[1].waits).toBeUndefined();
    const sent = gateSurveys([{ id: 'a', kind: 'workshop', activity: { count: 0 } }, { ...survey, status: 'done' }]);
    expect(sent[1].waits).toBeUndefined();
    expect(gateSurveys([survey])[0].waits).toBeUndefined();
  });
  it('الخادم يرفض الإرسال المنتظر بحكم الرحلة نفسها، والواجهة تعرض السبب', () => {
    expect(read('supabase/functions/leaders-api/participant.ts')).toMatch(/const waits = stage\.items\.find\(\(i: any\) => i\.id === r\.id\)\?\.waits;\n\s+if \(waits\) throw new Fail\(waits, 409, 'survey_waits'\);/);
    expect(read('leaders-app/src/screens/Journey.jsx')).toContain('if (item.waits) return');
  });
});

describe('4.6 توقيعان للتعديل الكبير في كل الأوضاع', () => {
  const yes = (n) => Array.from({ length: n }, (_, i) => ({ by: `e${i}@x.sa`, vote: 'approve' }));
  it('خبير واحد: توقيعان للتعديل الكبير، واللجنة: لا أقل من توقيعين صراحةً وإن تغيّر حدها الأدنى', () => {
    expect(approvalState(yes(1), { approval: 'expert' }).done).toBe(true);
    expect(approvalState(yes(1), { approval: 'expert' }, { largeAdjust: true })).toMatchObject({ done: false, need: 2 });
    // حجم اللجنة لا يقل عن 2 في finalConfig، فالحد كان يتحقق ضمنًا؛ الآن مكتوب في approvalState نفسه
    const maj = { approval: 'committee_majority', committee_size: 2 };
    expect(approvalState(yes(1), maj, { largeAdjust: true })).toMatchObject({ done: false, need: 2, large_adjust: true });
    expect(approvalState(yes(2), maj, { largeAdjust: true }).done).toBe(true);
    const una = { approval: 'committee_unanimous', committee_size: 3 };
    expect(approvalState(yes(2), una, { largeAdjust: true })).toMatchObject({ done: false, need: 3 });
    const src = read('supabase/functions/leaders-api/final.js');
    expect(src).toContain('const floor = largeAdjust ? 2 : 1;');
    expect(src.match(/Math\.max\([^)]*floor\)/g)).toHaveLength(2);
  });
  it('من حفظ تعديلًا في مسودة لا يعتمده ولو رفعه غيره', () => {
    const record = { submitted_by: 'b@x.sa', adjust: { score: { value: 80, reason: 'تعليل كافٍ للتعديل' }, edited_by: ['a@x.sa'] } };
    expect(finalEditors(record)).toEqual(['b@x.sa', 'a@x.sa']);
    expect(voteBlock('A@x.sa', record, {})).toMatch(/لا يعتمده بنفسه/);
    expect(voteBlock('c@x.sa', record, {})).toBeNull();
    const t = read('supabase/functions/leaders-api/final.ts');
    expect(t).toContain('adjust = { ...adjust, edited_by: touched ? [...new Set([...prior, String(a.email).toLowerCase()])] : prior };');
  });
});

describe('4.5 روابط الاستعمال الواحد بعد القرار', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  it('اطلاع 30 يومًا بعد القرار ثم يُغلق', () => {
    expect(LINK_AFTER_DECISION_DAYS).toBe(30);
    expect(linkAfterDecisionOk(null, now)).toBe(true);
    expect(linkAfterDecisionOk('2026-10-20T12:00:00Z', now)).toBe(true);
    expect(linkAfterDecisionOk('2026-10-01T12:00:00Z', now)).toBe(false);
  });
  it('مطبّق في الروابط الأربعة', () => {
    const base = 'supabase/functions/leaders-api/';
    expect(read(base + 'impact.ts')).toContain("if (r.status === 'submitted' && !linkAfterDecisionOk(r.submitted_at)) throw new Fail(LINK_CLOSED_AR, 410, 'closed');");
    expect(read(base + 'capstone.ts')).toContain("if (c.sponsor_status !== 'pending' && !linkAfterDecisionOk(c.sponsor_at)) throw new Fail(LINK_CLOSED_AR, 410, 'closed');");
    expect(read(base + 'tracking.ts')).toContain("!linkAfterDecisionOk(u.verify_at)) throw new Fail(LINK_CLOSED_AR, 410, 'closed');");
    expect(read(base + 'experts.ts')).toContain("if (r.status !== 'offered' && !linkAfterDecisionOk(r.accepted_at || r.updated_at)) throw new Fail(LINK_CLOSED_AR, 410, 'gone');");
  });
});

describe('9.8 و9.9', () => {
  it('تقرير الأثر بلا حساب العرض', () => {
    const impact = read('supabase/functions/leaders-api/impact.ts');
    expect(impact.slice(impact.indexOf('export async function adminReport'))).toContain(".select('id, full_name, email, organization_id, status, organizations(name)').eq('is_demo', false);");
  });
  it('عناوين المتطلبات في لوحة الحضور برموزها مملوءة', () => {
    const r = { code: 'T-ATTEND', title_ar: 'حضور الأيام التدريبية ({days:T-ATTEND})', config: { sessions_required: 4 } };
    expect(renderJourneyText(r.title_ar, { reqs: [r] })).not.toContain('{');
    const a = read('admin-app/src/screens/Activities.jsx');
    expect(a).toContain('const reqTitle = (r) => renderJourneyText(');
    expect(a).not.toMatch(/<b>\{r\.title_ar\}<\/b>/);
  });
});
