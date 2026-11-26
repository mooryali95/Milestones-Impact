// متابعات بريد الورشة الثلاث (قرار المالك 2026-11-22)، بالخادم كله وقاعدة في الذاكرة (_fake_db.ts):
//   1. المدرب المسمى يصله ما يصل المدعوين: الدعوة والتحديث بملف التقويم نفسه، وعند استبداله بريد للسابق يزيل الموعد ودعوة للجديد.
//   2. سحب موعد جلسة أُعلنت يبلّغ المدعوين والمدرب بملف إلغاء، بعدد يراه المدير قبل التأكيد وله ألا يبلّغ.
//   3. جلسة غُيّر موعدها بلا إبلاغ ثم أُلغيت: المدعوون يُبلَّغون بإلغاء الموعد الذي في يدهم (من سجل العمليات)، والبريد يقوله.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { installFake, resendCalls, withNet, placeOrgMembers } from './_fake_db.ts';
const V = await import('./activities.ts');
const { CONFIG, DEMO_MAIL_DOMAIN, MAIL_GALLERY, WORKSHOP_CANCEL_MAIL, WORKSHOP_TRAINER_MAIL, WORKSHOP_UNDATE_MAIL, drainMailQueue } = await import('./core.ts');
const { resetOptionalReady } = await import('./workshop-optional.ts');
const { programSnapshot } = await import('./logic.js');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROG = U(880001), COHORT = U(880002), V1 = U(880003), ORG = U(880004), OTHER = U(880005);
const REQ_W = U(880010);
const TRAINER = U(880030), SECOND = U(880031), ELSE = U(880032), TWIN = U(880033), DEMO = U(880034);
const ADMIN = { email: 'a@example.sa' };
const NOW = Date.now();
const DAY = 864e5;
const iso = (ms: number) => new Date(NOW + ms).toISOString();

// سجل العمليات في القاعدة مرقم بمعرّف متصاعد (bigint identity)، والقاعدة في الذاكرة تعطي معرّفًا عشوائيًا: جدول يرقّم صفوفه
// بترتيب إدراجها، فيُقرأ آخر السجل أولًا كما في القاعدة
function numbered(): Row[] {
  const rows: Row[] = [];
  let n = 0;
  const push = rows.push.bind(rows);
  rows.push = (...added: Row[]) => { for (const r of added) r.id = String(++n).padStart(12, '0'); return push(...added); };
  return rows;
}

function world() {
  resetOptionalReady();
  const who = (n: number, name: string, extra: Row = {}) => ({ id: U(880100 + n), full_name: name, email: `n${n}@example.sa`, organization_id: ORG, organization_name: 'جهة', status: 'enrolled', is_demo: false, is_test: false, profile_completed_at: '2026-10-01T08:00:00Z', ...extra });
  const ps = [who(1, 'سارة الأحمد'), who(2, 'فهد العمري'), who(3, 'نورة السالم'), who(4, 'حساب اختبار', { is_test: true, email: 'twin@x.sa' }), who(5, 'منسحب', { status: 'withdrawn' }),
    who(6, 'حساب العرض', { is_demo: true, organization_id: null, email: 'demo@example.sa' }), who(7, 'خالد', { organization_id: null })];
  const stages = [{ program_id: PROG, key: 'training', title_ar: 'التدريب', sort: 1, active: true, duration_days: 7 }];
  const reqs = [{ id: REQ_W, program_id: PROG, stage_key: 'training', code: 'T-ATTEND', kind: 'workshop', dimension: null, level: null, sort: 1, required: true, title_ar: 'الأيام التدريبية', config: { verify: 'qr', sessions_required: 2 }, active: true }];
  const cohort = (id: string, name: string, extra: Row = {}) => ({ id, name, is_default: false, organization_id: null, status: 'running', program_id: PROG, program_version_id: V1, starts_on: '2026-11-01', created_at: '2026-10-01', delivery: {}, schedule: {}, hidden_requirements: [], ...extra });
  const expert = (id: string, full_name: string, email: string) => ({ id, full_name, email, status: 'active', roles: ['coach'] });
  const tables: Record<string, Row[]> = {
    participants: ps,
    programs: [{ id: PROG, name: 'برنامج القادة', is_default: true, archived_at: null }],
    program_versions: [{ id: V1, program_id: PROG, number: 1, label: 'النسخة 1', data: programSnapshot(stages, reqs), created_at: '2026-10-01T00:00:00Z' }],
    cohorts: [cohort(COHORT, 'دفعة الجهة', { organization_id: ORG, advisor_expert_id: TRAINER }), cohort(OTHER, 'دفعة أخرى', { created_at: '2026-10-02', advisor_expert_id: ELSE })],
    enrollments: [
      { participant_id: ps[5].id, cohort_id: COHORT, status: 'active', created_at: '2026-10-06T08:00:00Z' },
      { participant_id: ps[6].id, cohort_id: OTHER, status: 'active', created_at: '2026-10-06T08:00:00Z' },
    ],
    placements: ps.flatMap((p) => ['milestone', 'impact', 'leadership'].map((dimension) => ({ participant_id: p.id, dimension, level: 'intermediate', approved_at: '2026-10-05T08:00:00Z', participants: p }))),
    journey_stages: stages, stage_requirements: reqs,
    workshop_sessions: [], workshop_attendance: [], participant_requirements: [],
    // TWIN: خبير بريده بريد حساب اختبار بين المشاركين. DEMO: خبير بريده على نطاق حساب العرض
    experts: [expert(TRAINER, 'د. منى القحطاني', 'mona@x.sa'), expert(SECOND, 'أ. خالد العتيبي', 'khalid@x.sa'), expert(ELSE, 'مدرب دفعة أخرى', 'else@x.sa'), expert(TWIN, 'خبير بحساب اختبار', 'twin@x.sa'), expert(DEMO, 'خبير العرض', `trainer@${DEMO_MAIL_DOMAIN}`)],
    cohort_experts: [{ cohort_id: COHORT, expert_id: SECOND }, { cohort_id: COHORT, expert_id: TWIN }, { cohort_id: COHORT, expert_id: DEMO }],
    audit_log: numbered(), mail_events: [], mail_queue: [],
  };
  placeOrgMembers(tables);
  const f = installFake(tables);
  return { ps, tables, f };
}
type W = ReturnType<typeof world>;
const REAL = (w: W) => [w.ps[0].email, w.ps[1].email, w.ps[2].email].sort();
const D1 = { starts_at: iso(3 * DAY), ends_at: iso(3 * DAY + 6 * 36e5) };
const D2 = { starts_at: iso(5 * DAY), ends_at: iso(5 * DAY + 6 * 36e5) };
const newDay = (extra: Row = {}) => ({ requirement_id: REQ_W, cohort_id: COHORT, title_ar: 'ورشة التفاوض', mode: 'in_person', location_ar: 'قاعة الملك فهد', join_url: null, ...D1, active: true, counting: 'mandatory', ...extra });
const rowOf = (w: W, id: string) => w.tables.workshop_sessions.find((s) => s.id === id)!;
const edit = (id: string, extra: Row = {}) => { const { counting: _c, ...row } = newDay(extra); return { ...row, id }; };
async function withMail<T>(fn: (calls: { url: string; body: any }[]) => Promise<T>, cap = 100) {
  const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap, alertEmail: CONFIG.alertEmail };
  Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: cap, alertEmail: '' });
  try { return await withNet(fn); } finally { Object.assign(CONFIG, saved); }
}
type Call = { url: string; body: any };
const mails = (calls: Call[], from = 0) => resendCalls(calls).slice(from);
const addr = (c: Call) => [c.body.to].flat()[0];
const to = (list: Call[]) => list.map(addr).sort();
const ics = (c: Call) => new TextDecoder().decode(Uint8Array.from(atob(c.body.attachments[0].content), (ch) => ch.charCodeAt(0)));
const seqOf = (c: Call) => Number(/SEQUENCE:(\d+)/.exec(ics(c))?.[1] ?? -1);
const uidOf = (c: Call) => /UID:([^\r\n]+)/.exec(ics(c))?.[1];
const startOf = (c: Call) => /DTSTART:([^\r\n]+)/.exec(ics(c))?.[1];
const stamp = (v: string) => new Date(v).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const audits = (w: W, action: string) => w.tables.audit_log.filter((x) => x.action === action).map((x) => x.after);
const toTrainer = (list: Call[], email = 'mona@x.sa') => list.filter((m) => addr(m) === email);
// الساعة تتقدم ثواني بين خطوتين، كما بين نقرتين: ملف لاحق بلا ختم يأخذ رقمه من الساعة
async function later<T>(fn: () => Promise<T>, ms = 5000): Promise<T> {
  const clock = Date.now;
  Date.now = () => clock() + ms;
  try { return await fn(); } finally { Date.now = clock; }
}

Deno.test('المدرب تصله الدعوة مع المدعوين: بريد واحد بملف التقويم ورقم التسلسل نفسيهما، بالعدد وحده، ولا تتكرر بإعادة الحفظ', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: TRAINER }), invite: true });
      assertEquals([r.invite, to(mails(calls))], [{ sent: 3, failed: 0, total: 3, trainer: 'sent' }, [...REAL(w), 'mona@x.sa'].sort()]);
      const member = mails(calls)[0], trainer = toTrainer(mails(calls))[0];
      assertEquals([trainer.body.subject, uidOf(trainer), seqOf(trainer), trainer.body.attachments[0].filename], [WORKSHOP_TRAINER_MAIL.invite.subject, uidOf(member), seqOf(member), 'session.ics']);
      assert(ics(trainer).includes('METHOD:PUBLISH') && startOf(trainer) === stamp(D1.starts_at));
      // العدد والدفعة والمكان، ولا اسم مشارك ولا بريده
      const html = trainer.body.html as string;
      assert(html.includes('دُعي من المشاركين') && html.includes('دفعة الجهة') && html.includes('قاعة الملك فهد') && html.includes('ورشة التفاوض'));
      for (const p of w.ps) assert(!html.includes(p.full_name) && !html.includes(p.email) && !trainer.body.text.includes(p.full_name), `لا شيء عن ${p.full_name}`);
      assertEquals(audits(w, 'workshop.invite'), [{ sent: 3, failed: 0, total: 3, on_save: true, trainer: 'sent' }]);
      // إعادة الحفظ نفسه: لا بريد ثانٍ لأحد
      const n = mails(calls).length;
      const again: any = await V.workshopSave(ADMIN, { row: edit(r.id, { expert_id: TRAINER }), invite: true });
      assertEquals([again.invite, again.trainer, mails(calls).length], [{ skipped: 'invited' }, undefined, n]);
      // زر الدعوة لجلسة لم تُدعَ، ثم إعادة الإرسال الصريحة: المدرب مع المدعوين في كليهما
      const b: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'من الزر', expert_id: TRAINER }) });
      assertEquals(mails(calls).length, n);
      const sent: any = await V.workshopInvite(ADMIN, { id: b.id });
      assertEquals([sent.trainer, to(mails(calls, n))], ['sent', [...REAL(w), 'mona@x.sa'].sort()]);
      const m = mails(calls).length;
      await V.workshopInvite(ADMIN, { id: b.id, again: true });
      assertEquals(to(mails(calls, m)), [...REAL(w), 'mona@x.sa'].sort());
      assert(seqOf(mails(calls, m)[0]) > seqOf(mails(calls, n)[0]), 'إعادة الإرسال أعلى');
      // بلا مدرب: كما كانت، لا مفتاح للمدرب في الرد
      const plain: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'بلا مدرب' }), invite: true });
      assertEquals(plain.invite, { sent: 3, failed: 0, total: 3 });
    });
  } finally { w.f.restore(); }
});

Deno.test('بريد المدرب لا يصل هوية عرض أو اختبار، وللجلسة عن بعد يحمل الرابط، وبحصة البريد ينتظر في الطابور وينتهي بموعد الجلسة', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      // مدرب بريده بريد حساب اختبار بين المشاركين، ومدرب بريده على نطاق حساب العرض: لا بريد لهما، والمدعوون كما هم
      for (const id of [TWIN, DEMO]) {
        const n = mails(calls).length;
        const r: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: `لمدرب ${id.slice(-2)}`, expert_id: id }), invite: true });
        assertEquals([r.invite.sent, r.invite.trainer ?? null, to(mails(calls, n))], [3, null, REAL(w)]);
        const pv: any = await V.workshopSave(ADMIN, { row: edit(r.id, { expert_id: id, active: false }), preview: true });
        assertEquals(pv.leave.notify, { members: 3, trainer: null });
      }
      // عن بعد: الرابط سطر في بريد المدرب وفي ملفه
      const n = mails(calls).length;
      const o: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'عن بعد', mode: 'online', location_ar: null, join_url: 'https://meet.example.com/x', expert_id: TRAINER }), invite: true });
      const t = toTrainer(mails(calls, n))[0];
      assert(o.invite.trainer === 'sent' && t.body.html.includes('https://meet.example.com/x') && t.body.html.includes('عن بعد') && ics(t).includes('URL:https://meet.example.com/x'));
    });
  } finally { w.f.restore(); }
  // السقف 2 (حصة غير الرموز منه 1): دعوة واحدة تخرج، وبريد المدرب ينتظر بملفه وموعد انتهائه، ثم يخرجه الطابور
  const w2 = world();
  try {
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: TRAINER }), invite: true });
      assertEquals([r.invite.sent, r.invite.queued, r.invite.trainer], [1, 2, 'queued']);
      const q = w2.tables.mail_queue.filter((m) => m.subject === WORKSHOP_TRAINER_MAIL.invite.subject);
      assertEquals(q.map((m) => [m.to_email, m.kind, m.ref, m.expires_at, m.attachments?.[0]?.filename]), [['mona@x.sa', 'bulk', r.id, D1.starts_at, 'session.ics']]);
      // إلغاء الجلسة يترك دعوة المدرب المنتظرة فلا تخرج بعده
      await V.workshopSave(ADMIN, { row: edit(r.id, { expert_id: TRAINER, active: false }) });
      assertEquals(q.map((m) => [!!m.gave_up_at, m.last_error]), [[true, 'superseded']]);
      CONFIG.mailDailyCap = 100;
      const n = mails(calls).length;
      await drainMailQueue();
      assert(mails(calls, n).every((m) => m.body.subject !== WORKSHOP_TRAINER_MAIL.invite.subject));
    }, 2);
  } finally { w2.f.restore(); }
});

Deno.test('المدرب يصله تحديث الموعد أو المكان أو الطريقة والرابط مع المدعوين، بريد واحد، ولا يتكرر بإعادة الحفظ', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: TRAINER }), invite: true });
      const invite = toTrainer(mails(calls))[0];
      let n = mails(calls).length;
      const c: any = await V.workshopSave(ADMIN, { row: edit(r.id, { ...D2, expert_id: TRAINER }), notify_change: true });
      assertEquals([c.change, to(mails(calls, n))], [{ sent: 3, failed: 0, total: 3, trainer: 'sent' }, [...REAL(w), 'mona@x.sa'].sort()]);
      const change = toTrainer(mails(calls, n))[0];
      assertEquals([change.body.subject, uidOf(change), startOf(change), seqOf(change) > seqOf(invite), seqOf(change)], [WORKSHOP_TRAINER_MAIL.change.subject, uidOf(invite), stamp(D2.starts_at), true, seqOf(mails(calls, n)[0])]);
      assert(change.body.html.includes('تغيّر موعد الجلسة التدريبية التي أنت مدربها.') && change.body.html.includes('أُبلغ من المشاركين'));
      // الحفظ نفسه معادًا: لا تغيّر فلا بريد
      n = mails(calls).length;
      await V.workshopSave(ADMIN, { row: edit(r.id, { ...D2, expert_id: TRAINER }), notify_change: true });
      assertEquals(mails(calls).length, n);
      // صارت عن بعد برابط: تغيّر المكان، والرابط في بريد المدرب
      const o: any = await V.workshopSave(ADMIN, { row: edit(r.id, { ...D2, expert_id: TRAINER, mode: 'online', location_ar: null, join_url: 'https://meet.example.com/y' }), notify_change: true });
      const online = toTrainer(mails(calls, n))[0];
      assert(o.change.trainer === 'sent' && online.body.html.includes('تغيّر مكان الجلسة التدريبية التي أنت مدربها.') && online.body.html.includes('https://meet.example.com/y'));
      // تغيير بلا اختيار الإبلاغ: لا بريد للمدرب كما لا بريد للمدعوين
      n = mails(calls).length;
      await V.workshopSave(ADMIN, { row: edit(r.id, { ...D1, expert_id: TRAINER, mode: 'online', location_ar: null, join_url: 'https://meet.example.com/y' }) });
      assertEquals(mails(calls).length, n);
    });
  } finally { w.f.restore(); }
});

Deno.test('استبدال المدرب في جلسة معلنة: للسابق بريد واحد بملف يزيل الموعد، وللجديد الدعوة، ولا بريد للمشاركين، ولا يتكرر', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: TRAINER }), invite: true });
      const invite = toTrainer(mails(calls))[0];
      let n = mails(calls).length;
      const s: any = await V.workshopSave(ADMIN, { row: edit(r.id, { expert_id: SECOND }) });
      assertEquals([s.released, s.trainer, to(mails(calls, n))], ['sent', 'sent', ['khalid@x.sa', 'mona@x.sa']]);
      const out = toTrainer(mails(calls, n))[0], inn = toTrainer(mails(calls, n), 'khalid@x.sa')[0];
      assertEquals([out.body.subject, inn.body.subject], [WORKSHOP_TRAINER_MAIL.release.subject, WORKSHOP_TRAINER_MAIL.invite.subject]);
      assert(ics(out).includes('METHOD:CANCEL') && uidOf(out) === uidOf(invite) && seqOf(out) > seqOf(invite), 'ملف يزيل موعد السابق');
      assert(ics(inn).includes('METHOD:PUBLISH') && uidOf(inn) === uidOf(invite) && startOf(inn) === stamp(D1.starts_at));
      assert(out.body.html.includes('لم تعد مدرب الجلسة التدريبية التالية') && !out.body.html.includes('من المشاركين'));
      assertEquals(audits(w, 'workshop.trainer-notice'), [{ kind: 'release', trainer: 'sent', expert_id: TRAINER }, { kind: 'invite', trainer: 'sent', expert_id: SECOND }]);
      assert(rowOf(w, r.id).invited_at, 'تبقى مدعوة');
      // الطلب نفسه معادًا، وطلبان معًا لاستبدال آخر: بريد واحد لكل مدرب
      n = mails(calls).length;
      await V.workshopSave(ADMIN, { row: edit(r.id, { expert_id: SECOND }) });
      assertEquals(mails(calls).length, n);
      await Promise.all([1, 2].map(() => V.workshopSave(ADMIN, { row: edit(r.id, { expert_id: TRAINER }) })));
      assertEquals(to(mails(calls, n)), ['khalid@x.sa', 'mona@x.sa']);
      // إلغاء لاحق يعلو دعوة المدرب الجديد فيزيلها
      n = mails(calls).length;
      const back = toTrainer(mails(calls))[toTrainer(mails(calls)).length - 1];
      await V.workshopSave(ADMIN, { row: edit(r.id, { expert_id: TRAINER, active: false }) });
      const gone = toTrainer(mails(calls, n))[0];
      assert(ics(gone).includes('METHOD:CANCEL') && seqOf(gone) > seqOf(back), 'الإلغاء أعلى من دعوة المدرب');
      // إزالة المدرب: للسابق بريد، ولا دعوة لأحد. وتسمية مدرب لجلسة لم تُعلن: لا بريد حتى تُدعى
      const x: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'يُزال مدربها', expert_id: TRAINER }), invite: true });
      n = mails(calls).length;
      const off: any = await V.workshopSave(ADMIN, { row: edit(x.id, { title_ar: 'يُزال مدربها', expert_id: '' }) });
      assertEquals([off.released, off.trainer, to(mails(calls, n)), rowOf(w, x.id).expert_id], ['sent', undefined, ['mona@x.sa'], null]);
      const q: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'لم تُعلن' }) });
      n = mails(calls).length;
      const named: any = await V.workshopSave(ADMIN, { row: edit(q.id, { title_ar: 'لم تُعلن', expert_id: TRAINER }) });
      assertEquals([named.released, named.trainer, mails(calls).length], [undefined, undefined, n]);
    });
  } finally { w.f.restore(); }
});

Deno.test('استبدال المدرب مع تغيير الموعد وإبلاغ المدعوين: السابق يُزال موعده القديم، والجديد تصله الدعوة بالموعد الجديد لا التحديث', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: TRAINER }), invite: true });
      const n = mails(calls).length;
      const c: any = await V.workshopSave(ADMIN, { row: edit(r.id, { ...D2, expert_id: SECOND }), notify_change: true });
      assertEquals([c.released, c.change, to(mails(calls, n))], ['sent', { sent: 3, failed: 0, total: 3, trainer: 'sent' }, [...REAL(w), 'khalid@x.sa', 'mona@x.sa'].sort()]);
      const out = toTrainer(mails(calls, n))[0], inn = toTrainer(mails(calls, n), 'khalid@x.sa')[0];
      assertEquals([out.body.subject, startOf(out), inn.body.subject, startOf(inn)], [WORKSHOP_TRAINER_MAIL.release.subject, stamp(D1.starts_at), WORKSHOP_TRAINER_MAIL.invite.subject, stamp(D2.starts_at)]);
    });
  } finally { w.f.restore(); }
});

Deno.test('سحب موعد جلسة معلنة: المعاينة بالعدد، وبريد واحد للمدعوين والمدرب بملف إلغاء، والجلسة باقية بلا موعد، ثم دعوة الموعد الجديد أعلى', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: TRAINER }), invite: true });
      const invite = mails(calls)[0];
      let n = mails(calls).length;
      const none = { starts_at: null, ends_at: null, expert_id: TRAINER };
      const pv: any = await V.workshopSave(ADMIN, { row: edit(r.id, none), preview: true });
      assertEquals([pv.leave, mails(calls).length, rowOf(w, r.id).starts_at], [{ kind: 'undate', notify: { members: 3, trainer: 'د. منى القحطاني' }, skipped: null, uncomplete: 0 }, n, D1.starts_at]);
      const u: any = await V.workshopSave(ADMIN, { row: edit(r.id, none) });
      assertEquals([u.undate, u.cancel, to(mails(calls, n))], [{ sent: 3, failed: 0, total: 3, trainer: 'sent' }, undefined, [...REAL(w), 'mona@x.sa'].sort()]);
      const member = mails(calls, n).find((m) => addr(m) === w.ps[0].email)!, trainer = toTrainer(mails(calls, n))[0];
      assertEquals([member.body.subject, trainer.body.subject], [WORKSHOP_UNDATE_MAIL.subject, WORKSHOP_TRAINER_MAIL.undate.subject]);
      assert(member.body.html.includes('سُحب موعد الجلسة التدريبية التالية') && member.body.html.includes('الموعد المسحوب') && member.body.html.includes('تصلك دعوة بموعدها الجديد') && member.body.text.includes('سُحب موعد'));
      for (const m of mails(calls, n)) {
        assert(ics(m).includes('METHOD:CANCEL') && ics(m).includes('STATUS:CANCELLED'));
        assertEquals([uidOf(m), startOf(m), seqOf(m) > seqOf(invite), m.body.attachments[0].filename], [uidOf(invite), stamp(D1.starts_at), true, 'cancel.ics']);
      }
      // الجلسة قائمة بلا موعد وبلا ختم، ومدربها باقٍ
      const row = rowOf(w, r.id);
      assertEquals([row.active, row.starts_at, row.invited_at, row.expert_id], [true, null, null, TRAINER]);
      assertEquals(audits(w, 'workshop.cancel-notice'), [{ sent: 3, failed: 0, total: 3, trainer: 'sent', reason: 'undate', starts_at: D1.starts_at }]);
      // الطلب نفسه معادًا: لا بريد ثانٍ. وإلغاؤها بعده لا يبلّغ: لا موعد في يد أحد
      n = mails(calls).length;
      const again: any = await V.workshopSave(ADMIN, { row: edit(r.id, none) });
      const pc: any = await V.workshopSave(ADMIN, { row: edit(r.id, { ...none, active: false }), preview: true });
      assertEquals([again.undate, mails(calls).length, pc.leave.notify, pc.leave.skipped], [undefined, n, null, 'undated']);
      // موعد جديد ودعوته: الدعوة المعتادة برقم تسلسل أعلى من ملف السحب، للمدعوين والمدرب
      const back: any = await later(() => V.workshopSave(ADMIN, { row: edit(r.id, { ...D2, expert_id: TRAINER }), invite: true }));
      assertEquals([back.invite, to(mails(calls, n))], [{ sent: 3, failed: 0, total: 3, trainer: 'sent' }, [...REAL(w), 'mona@x.sa'].sort()]);
      const fresh = mails(calls, n)[0];
      assert(ics(fresh).includes('METHOD:PUBLISH') && uidOf(fresh) === uidOf(invite) && startOf(fresh) === stamp(D2.starts_at) && seqOf(fresh) > seqOf(member), 'الدعوة الجديدة أعلى من السحب');
    });
  } finally { w.f.restore(); }
});

Deno.test('سحب الموعد: طلبان معًا يرسلان مرة، والمدير يختار ألا يبلّغ، ولا بريد لجلسة لم تُعلن أو انتهت أو عامة', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const none = { starts_at: null, ends_at: null };
      const r: any = await V.workshopSave(ADMIN, { row: newDay(), invite: true });
      let n = mails(calls).length;
      const both: any[] = await Promise.all([1, 2].map(() => V.workshopSave(ADMIN, { row: edit(r.id, none) })));
      assertEquals([mails(calls).length, both.map((x) => x.undate?.sent ?? x.undate?.skipped ?? null).sort()], [n + 3, [3, 'already'].sort()]);
      // «لا تبلّغ أحدًا»: يُكتب في السجل ولا يخرج بريد
      const q: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'بلا إبلاغ' }), invite: true });
      n = mails(calls).length;
      const o: any = await V.workshopSave(ADMIN, { row: edit(q.id, { title_ar: 'بلا إبلاغ', ...none }), notify_cancel: false });
      assertEquals([o.undate, mails(calls).length, rowOf(w, q.id).starts_at, audits(w, 'workshop.cancel-notice').at(-1)], [{ skipped: 'opted_out' }, n, null, { reason: 'undate', skipped: 'opted_out' }]);
      // لم تُعلن: لا بريد، والمعاينة تقول السبب
      const a: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'لم تُعلن' }) });
      const pa: any = await V.workshopSave(ADMIN, { row: edit(a.id, { title_ar: 'لم تُعلن', ...none }), preview: true });
      const ua: any = await V.workshopSave(ADMIN, { row: edit(a.id, { title_ar: 'لم تُعلن', ...none }) });
      assertEquals([pa.leave, ua.undate], [{ kind: 'undate', notify: null, skipped: 'unannounced', uncomplete: 0 }, { skipped: 'unannounced' }]);
      // أُعلنت ثم انتهت: لا بريد
      const e: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'انتهت' }), invite: true });
      Object.assign(rowOf(w, e.id), { starts_at: iso(-DAY), ends_at: iso(-DAY + 36e5) });
      const ue: any = await V.workshopSave(ADMIN, { row: edit(e.id, { title_ar: 'انتهت', ...none }) });
      // عامة لكل الدفعات
      const g: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'عامة', cohort_id: '' }) });
      const ug: any = await V.workshopSave(ADMIN, { row: edit(g.id, { title_ar: 'عامة', cohort_id: '', ...none }) });
      assertEquals([ue.undate, ug.undate, mails(calls).length], [{ skipped: 'ended' }, { skipped: 'general' }, n + 3]);
    });
  } finally { w.f.restore(); }
});

Deno.test('جلسة غُيّر موعدها بلا إبلاغ ثم أُلغيت: المدعوون يُبلَّغون بإلغاء الموعد الذي في يدهم، والمعاينة والبريد يقولانه، والملف بمعرّف دعوتهم', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: TRAINER }), invite: true });
      const invite = mails(calls)[0];
      let n = mails(calls).length;
      // تغيير الموعد بلا اختيار الإبلاغ: لا بريد، والختم يُفرَّغ كما كان
      await V.workshopSave(ADMIN, { row: edit(r.id, { ...D2, expert_id: TRAINER }) });
      assertEquals([mails(calls).length, rowOf(w, r.id).invited_at, rowOf(w, r.id).starts_at], [n, null, D2.starts_at]);
      const pv: any = await V.workshopSave(ADMIN, { row: edit(r.id, { ...D2, expert_id: TRAINER, active: false }), preview: true });
      assertEquals(pv.leave, { kind: 'cancel', notify: { members: 3, trainer: 'د. منى القحطاني' }, skipped: null, uncomplete: 0, told_at: D1.starts_at });
      const c: any = await V.workshopSave(ADMIN, { row: edit(r.id, { ...D2, expert_id: TRAINER, active: false }) });
      assertEquals([c.cancel, to(mails(calls, n))], [{ sent: 3, failed: 0, total: 3, trainer: 'sent', stale: true }, [...REAL(w), 'mona@x.sa'].sort()]);
      const member = mails(calls, n).find((m) => addr(m) === w.ps[0].email)!;
      // البريد يقول أي موعد يُلغى: آخر ما أُبلغوا به، لا المخزَّن الذي لم يعلموا به
      const told = new Date(D1.starts_at).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
      const stored = new Date(D2.starts_at).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
      assert(member.body.html.includes(WORKSHOP_CANCEL_MAIL.staleLead) && member.body.html.includes(told) && !member.body.html.includes(stored), 'الموعد الملغى هو الذي أُبلغوا به');
      for (const m of mails(calls, n)) {
        assert(ics(m).includes('METHOD:CANCEL'));
        assertEquals([uidOf(m), startOf(m), seqOf(m) > seqOf(invite)], [uidOf(invite), stamp(D1.starts_at), true]);
      }
      assertEquals(audits(w, 'workshop.cancel-notice'), [{ sent: 3, failed: 0, total: 3, trainer: 'sent', stale: true, reason: 'cancel', starts_at: D1.starts_at }]);
      // الطلب معادًا: لا بريد ثانٍ
      n = mails(calls).length;
      await V.workshopSave(ADMIN, { row: edit(r.id, { ...D2, expert_id: TRAINER, active: false }) });
      assertEquals(mails(calls).length, n);
    });
  } finally { w.f.restore(); }
});

Deno.test('«دُعي من قبل» من سجل العمليات: الحذف وسحب الموعد بعد تغيير صامت يبلّغان، وما أُبلغ بإلغائه أو انتهى أو دُعي في دفعة أخرى لا يُبلَّغ', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const quiet = async (title: string) => {
        const r: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: title }), invite: true });
        await V.workshopSave(ADMIN, { row: edit(r.id, { title_ar: title, ...D2 }) });
        return r.id as string;
      };
      // الحذف
      const d = await quiet('تُحذف');
      let n = mails(calls).length;
      const pd: any = await V.workshopDelete(ADMIN, { id: d, preview: true });
      const del: any = await V.workshopDelete(ADMIN, { id: d });
      assertEquals([pd.leave.notify, pd.leave.told_at, del.cancel, to(mails(calls, n)), startOf(mails(calls, n)[0])], [{ members: 3, trainer: null }, D1.starts_at, { sent: 3, failed: 0, total: 3, stale: true }, REAL(w), stamp(D1.starts_at)]);
      // سحب الموعد بعد تغيير صامت: الموعد المسحوب هو الذي في يدهم
      const u = await quiet('يُسحب موعدها');
      n = mails(calls).length;
      const und: any = await V.workshopSave(ADMIN, { row: edit(u, { title_ar: 'يُسحب موعدها', starts_at: null, ends_at: null }) });
      assertEquals([und.undate, startOf(mails(calls, n)[0]), mails(calls, n)[0].body.subject], [{ sent: 3, failed: 0, total: 3, stale: true }, stamp(D1.starts_at), WORKSHOP_UNDATE_MAIL.subject]);
      // ثم إلغاؤها: أُبلغوا بالسحب، فلا شيء في يدهم ولا بريد
      n = mails(calls).length;
      const cu: any = await V.workshopSave(ADMIN, { row: edit(u, { title_ar: 'يُسحب موعدها', starts_at: null, ends_at: null, active: false }) });
      assertEquals([cu.cancel, mails(calls).length], [{ skipped: 'undated' }, n]);
      // سحب بلا إبلاغ ثم إلغاء: الموعد ما زال في يدهم، فيُبلَّغون به
      const k = await quiet('سحب بلا إبلاغ');
      await V.workshopSave(ADMIN, { row: edit(k, { title_ar: 'سحب بلا إبلاغ', starts_at: null, ends_at: null }), notify_cancel: false });
      n = mails(calls).length;
      const ck: any = await V.workshopSave(ADMIN, { row: edit(k, { title_ar: 'سحب بلا إبلاغ', starts_at: null, ends_at: null, active: false }) });
      assertEquals([ck.cancel, startOf(mails(calls, n)[0])], [{ sent: 3, failed: 0, total: 3, stale: true }, stamp(D1.starts_at)]);
      // تغيير صامت ثم دعوة الموعد الجديد من زرها ثم إلغاء: الموعد المخزَّن هو ما في يدهم، فلا «stale»
      const z = await quiet('أُعيدت دعوتها');
      await later(() => V.workshopInvite(ADMIN, { id: z }));
      n = mails(calls).length;
      const cz: any = await V.workshopSave(ADMIN, { row: edit(z, { title_ar: 'أُعيدت دعوتها', ...D2, active: false }) });
      assertEquals([cz.cancel, startOf(mails(calls, n)[0]), mails(calls, n)[0].body.html.includes(WORKSHOP_CANCEL_MAIL.lead)], [{ sent: 3, failed: 0, total: 3 }, stamp(D2.starts_at), true]);
      // الموعد الذي أُبلغوا به انتهى، والمخزَّن قادم لم يعلموا به: لا بريد
      const e = await quiet('انتهى ما أُبلغوا به');
      const first = w.tables.audit_log.find((x) => x.entity_id === e && x.action === 'workshop.create')!;
      Object.assign(first.after, { starts_at: iso(-2 * DAY), ends_at: iso(-2 * DAY + 36e5) });
      n = mails(calls).length;
      const pe: any = await V.workshopSave(ADMIN, { row: edit(e, { title_ar: 'انتهى ما أُبلغوا به', ...D2, active: false }), preview: true });
      assertEquals([pe.leave.notify, pe.leave.skipped, mails(calls).length], [null, 'ended', n]);
      // دُعيت في دفعتها ثم نُقلت بلا إبلاغ إلى دفعة أخرى وغُيّر موعدها: أعضاء الدفعة الجديدة لم يُدعوا، فلا بريد لهم بإلغائها
      const m: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'نُقلت' }), invite: true });
      await V.workshopSave(ADMIN, { row: edit(m.id, { title_ar: 'نُقلت', cohort_id: OTHER }), notify_cancel: false });
      n = mails(calls).length;
      const pm: any = await V.workshopSave(ADMIN, { row: edit(m.id, { title_ar: 'نُقلت', cohort_id: OTHER, active: false }), preview: true });
      const cm: any = await V.workshopSave(ADMIN, { row: edit(m.id, { title_ar: 'نُقلت', cohort_id: OTHER, active: false }) });
      assertEquals([pm.leave.skipped, cm.cancel, mails(calls).length], ['unannounced', { skipped: 'unannounced' }, n]);
      // تعذّرت قراءة السجل: كأن لا دعوة، فلا بريد بلا يقين (السلوك السابق)
      const b = await quiet('والسجل متعذر');
      w.f.restore();
      placeOrgMembers(w.tables);
      const f2 = installFake(w.tables, { fail: (table, op) => (table === 'audit_log' && op.kind === 'select' ? { message: 'down' } : null) });
      try {
        const pb: any = await V.workshopSave(ADMIN, { row: edit(b, { title_ar: 'والسجل متعذر', ...D2, active: false }), preview: true });
        assertEquals(pb.leave.skipped, 'unannounced');
      } finally { f2.restore(); }
    });
  } finally { w.f.restore(); }
});

Deno.test('قوالب المتابعات في معرض البريد: دعوة المدرب وتحديثه وسحب الموعد واستبدال المدرب، بلا شرطة طويلة ولا تحوّط', () => {
  const by = Object.fromEntries((MAIL_GALLERY as any[]).map((m) => [m.key, m]));
  const keys = ['workshop-invite-to-trainer', 'workshop-change-trainer', 'workshop-undate', 'workshop-undate-trainer', 'workshop-release-trainer', 'workshop-cancel-stale', 'workshop-cancel-trainer'];
  const html = Object.fromEntries(keys.map((k) => [k, by[k].html() as string]));
  assertEquals(keys.map((k) => by[k].subject), ['دعوة: جلسة تدريبية أنت مدربها', 'تحديث: جلسة تدريبية أنت مدربها', 'سُحب الموعد: جلستك التدريبية', 'سُحب الموعد: جلسة تدريبية أنت مدربها', 'تغيّر المدرب: جلسة تدريبية كنت مدربها', 'أُلغيت: جلستك التدريبية', 'أُلغيت: جلسة تدريبية أنت مدربها']);
  assert(html['workshop-invite-to-trainer'].includes('دُعي من المشاركين') && html['workshop-invite-to-trainer'].includes('أضف الموعد إلى تقويمك من المرفق'));
  assert(html['workshop-change-trainer'].includes('تغيّر موعد الجلسة التدريبية التي أنت مدربها ومكانها.') && html['workshop-change-trainer'].includes('الملف المرفق يحدّث الموعد'));
  assert(html['workshop-undate'].includes('الموعد المسحوب') && html['workshop-undate-trainer'].includes('الموعد المسحوب'));
  assert(html['workshop-cancel-stale'].includes('آخر موعد أبلغناك به'));
  // المدرب تصله الدعوة الآن، فالموعد في تقويمه: لا «إن كان فيه»
  assert(!html['workshop-cancel-trainer'].includes('إن كان فيه') && html['workshop-cancel-trainer'].includes('الملف المرفق يزيل الموعد من تقويمك، وإن بقي فاحذفه'));
  for (const k of keys) assert(!/[–—]/.test(html[k]), k);
});
