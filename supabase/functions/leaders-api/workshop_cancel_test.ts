// بريد إلغاء الورشة (قرار المالك 2026-11-22). هنا الخادم كله بقاعدة في الذاكرة (_fake_db.ts):
// من دُعي إلى جلسة لم تنتهِ ثم أُلغيت أو حُذفت أو نُقلت عن دفعته يصله بريد واحد بملف إلغاء التقويم (METHOD:CANCEL، بمعرّف الدعوة
// نفسه ورقم تسلسل أعلى من كل دعوة وتغيير)، وللمدرب المسمى بريد. المدير يرى العدد قبل التأكيد من القراءة نفسها وله ألا يبلّغ.
// لا بريد لجلسة لم تُعلن أو انتهت أو بلا موعد أو عامة، ولا لحساب العرض ولا حساب اختبار، ولا مرتين بإعادة الطلب.
// وتغيير الوسم لا يلغي شيئًا. وإعادة الملغاة تدعو من جديد باختيار المدير برقم تسلسل أعلى من الإلغاء.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { installFake, resendCalls, withNet } from './_fake_db.ts';
const V = await import('./activities.ts');
const { CONFIG, Fail, MAIL_GALLERY, WORKSHOP_CANCEL_MAIL, WORKSHOP_TRAINER_MAIL, drainMailQueue } = await import('./core.ts');
const { resetOptionalReady } = await import('./workshop-optional.ts');
const { programSnapshot } = await import('./logic.js');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROG = U(990001), COHORT = U(990002), V1 = U(990003), ORG = U(990004), OTHER = U(990005);
const REQ_W = U(990010), REQ_A = U(990011), D1 = U(990020), D2 = U(990021);
const TRAINER = U(990030), ELSE = U(990031);
const ADMIN = { email: 'a@example.sa' };
const NOW = Date.now();
const DAY = 864e5;
const iso = (ms: number) => new Date(NOW + ms).toISOString();

// مرحلتان: التدريب (حضور يومين) ثم التطبيق. سارة ونورة حضرتا اليومين (أتمتا التدريب)، وفهد حضر يومًا واحدًا.
// ومعهم في الدفعة حساب اختبار، ومنسحب، وحساب العرض، وحساب عرض الدفعة. وخالد في دفعة أخرى
function world() {
  resetOptionalReady();
  const who = (n: number, name: string, extra: Row = {}) => ({ id: U(990100 + n), full_name: name, email: `c${n}@example.sa`, organization_id: ORG, organization_name: 'جهة', status: 'enrolled', is_demo: false, is_test: false, profile_completed_at: '2026-10-01T08:00:00Z', ...extra });
  const ps = [who(1, 'سارة الأحمد'), who(2, 'فهد العمري'), who(3, 'نورة السالم'), who(4, 'حساب اختبار', { is_test: true }), who(5, 'منسحب', { status: 'withdrawn' }),
    who(6, 'حساب العرض', { is_demo: true, organization_id: null, email: 'demo@example.sa' }), who(7, 'عرض الدفعة', { is_demo: true, organization_id: null, demo_cohort_id: COHORT, email: 'demo-c@example.sa' }),
    who(8, 'خالد', { organization_id: null })];
  const stages = [
    { program_id: PROG, key: 'training', title_ar: 'التدريب', sort: 1, active: true, duration_days: 7 },
    { program_id: PROG, key: 'apply', title_ar: 'التطبيق', sort: 2, active: true, duration_days: 7 },
  ];
  const reqs = [
    { id: REQ_W, program_id: PROG, stage_key: 'training', code: 'T-ATTEND', kind: 'workshop', dimension: null, level: null, sort: 1, required: true, title_ar: 'الأيام التدريبية', config: { verify: 'qr', sessions_required: 2 }, active: true },
    { id: REQ_A, program_id: PROG, stage_key: 'apply', code: 'A-DO', kind: 'manual', dimension: null, level: null, sort: 1, required: true, title_ar: 'طبّق في عملك', active: true },
  ];
  const session = (id: string, title: string, at: number, extra: Row = {}) => ({ id, requirement_id: REQ_W, cohort_id: COHORT, title_ar: title, mode: 'in_person', location_ar: 'القاعة', join_url: null, active: true, secret: 's'.repeat(32),
    starts_at: iso(at), ends_at: iso(at + 72e5), invited_at: null, reminded_day_at: null, reminded_hour_at: null, expert_id: null, optional: false, ...extra });
  const cohort = (id: string, name: string, extra: Row = {}) => ({ id, name, is_default: false, organization_id: null, status: 'running', program_id: PROG, program_version_id: V1, starts_on: '2026-11-01', created_at: '2026-10-01', delivery: {}, schedule: {}, hidden_requirements: [], ...extra });
  const tables: Record<string, Row[]> = {
    participants: ps,
    programs: [{ id: PROG, name: 'برنامج القادة', is_default: true, archived_at: null }],
    program_versions: [{ id: V1, program_id: PROG, number: 1, label: 'النسخة 1', data: programSnapshot(stages, reqs), created_at: '2026-10-01T00:00:00Z' }],
    cohorts: [cohort(COHORT, 'دفعة الجهة', { organization_id: ORG, advisor_expert_id: TRAINER }), cohort(OTHER, 'دفعة أخرى', { created_at: '2026-10-02', advisor_expert_id: ELSE })],
    enrollments: [
      { participant_id: ps[5].id, cohort_id: COHORT, status: 'active', created_at: '2026-10-06T08:00:00Z' },
      { participant_id: ps[6].id, cohort_id: COHORT, status: 'active', created_at: '2026-10-06T08:00:00Z' },
      { participant_id: ps[7].id, cohort_id: OTHER, status: 'active', created_at: '2026-10-06T08:00:00Z' },
    ],
    placements: ps.flatMap((p) => ['milestone', 'impact', 'leadership'].map((dimension) => ({ participant_id: p.id, dimension, level: 'intermediate', approved_at: '2026-10-05T08:00:00Z', participants: p }))),
    journey_stages: stages, stage_requirements: reqs,
    workshop_sessions: [session(D1, 'اليوم 1', -6 * DAY), session(D2, 'اليوم 2', -4 * DAY)],
    workshop_attendance: [
      { session_id: D1, participant_id: ps[0].id, method: 'qr' }, { session_id: D2, participant_id: ps[0].id, method: 'qr' },
      { session_id: D1, participant_id: ps[1].id, method: 'qr' },
      { session_id: D1, participant_id: ps[2].id, method: 'qr' }, { session_id: D2, participant_id: ps[2].id, method: 'qr' },
    ],
    participant_requirements: [],
    experts: [{ id: TRAINER, full_name: 'د. منى القحطاني', email: 'mona@x.sa', status: 'active', roles: ['coach'] }, { id: ELSE, full_name: 'مدرب دفعة أخرى', email: 'else@x.sa', status: 'active', roles: ['coach'] }],
    cohort_experts: [], audit_log: [], mail_events: [], mail_queue: [],
  };
  const f = installFake(tables);
  return { ps, tables, f };
}
type W = ReturnType<typeof world>;
const REAL = (w: W) => [w.ps[0].email, w.ps[1].email, w.ps[2].email].sort();
const newDay = (extra: Row = {}) => ({ requirement_id: REQ_W, cohort_id: COHORT, title_ar: 'ورشة التفاوض', mode: 'in_person', location_ar: 'قاعة الملك فهد', join_url: null, starts_at: iso(3 * DAY), ends_at: iso(3 * DAY + 6 * 36e5), active: true, counting: 'optional', ...extra });
const rowOf = (w: W, id: string) => w.tables.workshop_sessions.find((s) => s.id === id)!;
const edit = (id: string, extra: Row = {}) => { const { counting: _c, ...row } = newDay(extra); return { ...row, id }; };
async function withMail<T>(fn: (calls: { url: string; body: any }[]) => Promise<T>, cap = 100) {
  const saved = { resendKey: CONFIG.resendKey, mailDailyCap: CONFIG.mailDailyCap, alertEmail: CONFIG.alertEmail };
  Object.assign(CONFIG, { resendKey: 're_test', mailDailyCap: cap, alertEmail: '' });
  try { return await withNet(fn); } finally { Object.assign(CONFIG, saved); }
}
type Call = { url: string; body: any };
const mails = (calls: Call[], from = 0) => resendCalls(calls).slice(from);
const to = (list: Call[]) => list.map((c) => [c.body.to].flat()[0]).sort();
const ics = (c: Call) => new TextDecoder().decode(Uint8Array.from(atob(c.body.attachments[0].content), (ch) => ch.charCodeAt(0)));
const seqOf = (c: Call) => Number(/SEQUENCE:(\d+)/.exec(ics(c))?.[1] ?? -1);
const uidOf = (c: Call) => /UID:([^\r\n]+)/.exec(ics(c))?.[1];
const audits = (w: W, action: string) => w.tables.audit_log.filter((x) => x.action === action).map((x) => x.after);

Deno.test('الإلغاء: من دُعي يصله بريد واحد بملف إلغاء بالمعرّف نفسه، وللمدرب بريد، والعدد من المعاينة نفسها، ولا يتكرر بإعادة الطلب', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: TRAINER }), invite: true });
      // المدرب المسمى تصله الدعوة مع المدعوين (المتابعة 1، 2026-11-22)
      assertEquals(to(mails(calls)), [...REAL(w), 'mona@x.sa'].sort());
      const invite = mails(calls)[0];
      // المعاينة: العدد والمدرب من القراءة التي يرسل بها، بلا كتابة ولا بريد
      const n = mails(calls).length;
      const pv: any = await V.workshopSave(ADMIN, { row: edit(r.id, { active: false }), preview: true });
      assertEquals(pv.leave, { kind: 'cancel', notify: { members: 3, trainer: 'د. منى القحطاني' }, skipped: null, uncomplete: 0 });
      assertEquals([mails(calls).length, rowOf(w, r.id).active], [n, true]);
      const c: any = await V.workshopSave(ADMIN, { row: edit(r.id, { active: false }) });
      assertEquals(c.cancel, { sent: 3, failed: 0, total: 3, trainer: 'sent' });
      const out = mails(calls, n);
      // أعضاء الدفعة الفعليون والمدرب: لا حساب العرض ولا عرض الدفعة ولا حساب الاختبار ولا المنسحب ولا عضو دفعة أخرى
      assertEquals(to(out), [...REAL(w), 'mona@x.sa'].sort());
      const member = out.find((m) => [m.body.to].flat()[0] === w.ps[0].email)!;
      const trainer = out.find((m) => [m.body.to].flat()[0] === 'mona@x.sa')!;
      assertEquals([member.body.subject, trainer.body.subject], [WORKSHOP_CANCEL_MAIL.subject, WORKSHOP_TRAINER_MAIL.cancel.subject]);
      // الجملة لمن يتجاهل برنامجه الملف، والوسم في العنوان كما في الدعوة
      assert(member.body.html.includes('أُلغيت الجلسة التدريبية') && member.body.html.includes('وإن بقي فاحذفه') && member.body.html.includes('ورشة التفاوض (اختيارية)') && member.body.html.includes('د. منى القحطاني'));
      assert(member.body.text.includes('أُلغيت الجلسة التدريبية') && member.body.text.includes('وإن بقي فاحذفه'), 'النسخة النصية تحمل الجملة');
      assert(trainer.body.html.includes('دفعة الجهة') && trainer.body.html.includes('أُبلغ من المشاركين'));
      for (const m of out) {
        const cal = ics(m);
        assertEquals([m.body.attachments[0].filename, m.body.attachments[0].content_type], ['cancel.ics', 'text/calendar; charset=utf-8; method=CANCEL']);
        assert(cal.includes('METHOD:CANCEL') && cal.includes('STATUS:CANCELLED') && !cal.includes('VALARM'), 'ملف إلغاء بلا تنبيه');
        assertEquals([uidOf(m), uidOf(invite)], [`${r.id}@sunkvalue.com`, `${r.id}@sunkvalue.com`]);
        assert(seqOf(m) > seqOf(invite), 'رقم تسلسل الإلغاء أعلى من الدعوة');
      }
      assertEquals(audits(w, 'workshop.cancel-notice').map((x) => [x.sent, x.total, x.trainer, x.reason]), [[3, 3, 'sent', 'cancel']]);
      // إعادة الطلب نفسه، وحفظ آخر للملغاة: لا بريد ثانٍ
      const again: any = await V.workshopSave(ADMIN, { row: edit(r.id, { active: false }) });
      await V.workshopSave(ADMIN, { row: edit(r.id, { active: false, title_ar: 'عنوان آخر' }) });
      assertEquals([again.cancel, mails(calls).length], [undefined, n + 4]);
      // الملغاة لا تُدعى من زر الدعوة
      const e = await assertRejects(() => V.workshopInvite(ADMIN, { id: r.id, again: true }), Fail) as any;
      assertEquals(e.code, 'inactive');
    });
  } finally { w.f.restore(); }
});

Deno.test('طلبا إلغاء معًا يرسلان مرة واحدة، والمدير يختار ألا يبلّغ فلا يخرج بريد ويُكتب في السجل', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay(), invite: true });
      const n = mails(calls).length;
      const both: any[] = await Promise.all([V.workshopSave(ADMIN, { row: edit(r.id, { active: false }) }), V.workshopSave(ADMIN, { row: edit(r.id, { active: false }) })]);
      assertEquals(mails(calls).length, n + 3);
      assertEquals(both.map((x) => x.cancel?.sent ?? x.cancel?.skipped ?? null).sort(), [3, 'already'].sort());
      // «لا تبلّغ أحدًا»: لجلسة أُنشئت بالخطأ
      const q: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'بالخطأ' }), invite: true });
      const m = mails(calls).length;
      const c: any = await V.workshopSave(ADMIN, { row: edit(q.id, { active: false }), notify_cancel: false });
      assertEquals([c.cancel, mails(calls).length, rowOf(w, q.id).active], [{ skipped: 'opted_out' }, m, false]);
      assertEquals(audits(w, 'workshop.cancel-notice').at(-1), { reason: 'cancel', skipped: 'opted_out' });
    });
  } finally { w.f.restore(); }
});

Deno.test('لا بريد إلغاء لجلسة لم تُعلن، أو انتهت، أو بلا موعد، أو عامة، والمعاينة تقول السبب', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const skipOf = async (id: string, row: Row) => {
        const pv: any = await V.workshopSave(ADMIN, { row: { ...row, id, active: false }, preview: true });
        const c: any = await V.workshopSave(ADMIN, { row: { ...row, id, active: false } });
        return [pv.leave.notify, pv.leave.skipped, c.cancel];
      };
      // لم تُعلن
      const a: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'لم تُعلن' }) });
      assertEquals(await skipOf(a.id, edit(a.id)), [null, 'unannounced', { skipped: 'unannounced' }]);
      // أُعلنت ثم انتهت
      const b: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'انتهت' }), invite: true });
      Object.assign(rowOf(w, b.id), { starts_at: iso(-DAY), ends_at: iso(-DAY + 36e5) });
      const n = mails(calls).length;
      assertEquals(await skipOf(b.id, edit(b.id, { starts_at: iso(-DAY), ends_at: iso(-DAY + 36e5) })), [null, 'ended', { skipped: 'ended' }]);
      // بلا موعد (ختم بقي من قبل)
      const c: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'بلا موعد', starts_at: null, ends_at: null }) });
      rowOf(w, c.id).invited_at = iso(-36e5);
      assertEquals(await skipOf(c.id, edit(c.id, { starts_at: null, ends_at: null })), [null, 'undated', { skipped: 'undated' }]);
      // عامة لكل الدفعات
      const g: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'عامة', cohort_id: '', counting: 'mandatory' }) });
      rowOf(w, g.id).invited_at = iso(-36e5);
      assertEquals(await skipOf(g.id, edit(g.id, { cohort_id: '' })), [null, 'general', { skipped: 'general' }]);
      assertEquals([mails(calls).length, audits(w, 'workshop.cancel-notice').length], [n, 0]);
    });
  } finally { w.f.restore(); }
});

Deno.test('ترتيب أرقام التسلسل: دعوة ثم تغيير ثم إلغاء ثم دعوة الإعادة، بمعرّف واحد، ولو تتابعت في ثانية واحدة', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay({ expert_id: TRAINER }), invite: true });
      const invite = mails(calls)[0];
      let n = mails(calls).length;
      const moved = { starts_at: iso(4 * DAY), ends_at: iso(4 * DAY + 6 * 36e5) };
      await V.workshopSave(ADMIN, { row: edit(r.id, { ...moved, expert_id: TRAINER }), notify_change: true });
      const change = mails(calls, n)[0];
      n = mails(calls).length;
      await V.workshopSave(ADMIN, { row: edit(r.id, { ...moved, active: false }) });
      const cancel = mails(calls, n)[0];
      n = mails(calls).length;
      // المعاينة قبل الإعادة: العدد والمدرب، ولا بريد قبل التأكيد
      const pv: any = await V.workshopSave(ADMIN, { row: edit(r.id, moved), preview: true });
      assertEquals([pv.leave, mails(calls).length], [{ kind: 'restore', notify: { members: 3, trainer: 'د. منى القحطاني' }, skipped: null }, n]);
      const back: any = await V.workshopSave(ADMIN, { row: edit(r.id, moved), reinvite: true });
      assertEquals(back.invite, { sent: 3, failed: 0, total: 3, restored: true, trainer: 'sent' });
      const after = mails(calls, n);
      assertEquals(to(after), [...REAL(w), 'mona@x.sa'].sort());
      const again = after.find((m) => m.body.subject === 'دعوة: جلستك التدريبية')!;
      const told = after.find((m) => m.body.subject === WORKSHOP_TRAINER_MAIL.restore.subject)!;
      const order = [invite, change, cancel, again].map(seqOf);
      assert(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), `ترتيب التسلسل ${order.join(' ')}`);
      assertEquals(new Set([invite, change, cancel, again, told].map(uidOf)).size, 1);
      assertEquals([ics(change).includes('METHOD:PUBLISH'), ics(cancel).includes('METHOD:CANCEL'), ics(again).includes('METHOD:PUBLISH'), again.body.attachments[0].filename, seqOf(told)], [true, true, true, 'session.ics', seqOf(again)]);
      assert(rowOf(w, r.id).active && rowOf(w, r.id).invited_at, 'عادت مدعوة');
      assertEquals(audits(w, 'workshop.invite').at(-1), { sent: 3, failed: 0, total: 3, on_save: true, restored: true, trainer: 'sent' });
      // إعادة الطلب نفسه لا تدعو ثانية، وزر الدعوة بعدها يعلو ما سبقه
      n = mails(calls).length;
      await V.workshopSave(ADMIN, { row: edit(r.id, moved), reinvite: true });
      assertEquals(mails(calls).length, n);
      await V.workshopInvite(ADMIN, { id: r.id, again: true });
      assert(seqOf(mails(calls, n)[0]) > seqOf(again), 'إعادة الإرسال من الزر أعلى');
    });
  } finally { w.f.restore(); }
});

Deno.test('الإعادة بلا اختيار الدعوة لا ترسل شيئًا وتبقى الجلسة بلا دعوة، والتي لم تُعلن قبل إلغائها لا تُعرض دعوتها', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay(), invite: true });
      await V.workshopSave(ADMIN, { row: edit(r.id, { active: false }) });
      const n = mails(calls).length;
      const back: any = await V.workshopSave(ADMIN, { row: edit(r.id) });
      assertEquals([back.invite, mails(calls).length, rowOf(w, r.id).active, rowOf(w, r.id).invited_at], [undefined, n, true, null]);
      // ثم يدعوها المدير من زرها بعد ثوانٍ: رقم تسلسلها من الساعة، أعلى من الإلغاء فلا يتجاهلها التقويم.
      // (الختم فُرّغ بالإعادة، فالترتيب هنا بالساعة وحدها: دعوة من الزر في ثانية الإلغاء نفسها لا يضمنها ختم)
      const clock = Date.now;
      Date.now = () => clock() + 5000;
      try { await V.workshopInvite(ADMIN, { id: r.id }); } finally { Date.now = clock; }
      assert(seqOf(mails(calls, n)[0]) > seqOf(mails(calls, n - 3)[0]));
      const q: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'لم تُعلن' }) });
      await V.workshopSave(ADMIN, { row: edit(q.id, { active: false }) });
      const pv: any = await V.workshopSave(ADMIN, { row: edit(q.id), preview: true });
      const m = mails(calls).length;
      const res: any = await V.workshopSave(ADMIN, { row: edit(q.id), reinvite: true });
      assertEquals([pv.leave, res.invite, mails(calls).length], [{ kind: 'restore', notify: null, skipped: 'unannounced' }, undefined, m]);
    });
  } finally { w.f.restore(); }
});

Deno.test('الحذف والنقل إلى دفعة أخرى أو إلى كل الدفعات يبلّغان من دُعي، وتغيير الوسم لا يرسل إلغاء', async () => {
  const w = world();
  try {
    await withMail(async (calls) => {
      // الحذف: معاينة بالعدد، ثم بريد واحد، والصف يزول
      const d: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'تُحذف', expert_id: TRAINER }), invite: true });
      let n = mails(calls).length;
      const pv: any = await V.workshopDelete(ADMIN, { id: d.id, preview: true });
      assertEquals([pv.leave, !!rowOf(w, d.id)], [{ kind: 'delete', notify: { members: 3, trainer: 'د. منى القحطاني' }, skipped: null, uncomplete: 0 }, true]);
      const del: any = await V.workshopDelete(ADMIN, { id: d.id });
      assertEquals([del.cancel, rowOf(w, d.id), to(mails(calls, n))], [{ sent: 3, failed: 0, total: 3, trainer: 'sent' }, undefined, [...REAL(w), 'mona@x.sa'].sort()]);
      assert(mails(calls, n).every((m) => ics(m).includes('METHOD:CANCEL') && uidOf(m) === `${d.id}@sunkvalue.com`));
      n = mails(calls).length;
      assertEquals([(await V.workshopDelete(ADMIN, { id: d.id }) as any).success, mails(calls).length], [true, n]);
      // حذف بلا إبلاغ
      const d2: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'بالخطأ' }), invite: true });
      n = mails(calls).length;
      assertEquals([(await V.workshopDelete(ADMIN, { id: d2.id, notify_cancel: false }) as any).cancel, mails(calls).length], [{ skipped: 'opted_out' }, n]);
      // النقل إلى دفعة أخرى: أعضاء الأولى يُبلَّغون والمدرب الذي لم يبقَ، والجديدة لم تُدعَ بعد
      const m: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'تُنقل', expert_id: TRAINER }), invite: true });
      n = mails(calls).length;
      const mp: any = await V.workshopSave(ADMIN, { row: edit(m.id, { title_ar: 'تُنقل', cohort_id: OTHER }), preview: true });
      assertEquals(mp.leave, { kind: 'move', notify: { members: 3, trainer: 'د. منى القحطاني' }, skipped: null, uncomplete: 0 });
      const mv: any = await V.workshopSave(ADMIN, { row: edit(m.id, { title_ar: 'تُنقل', cohort_id: OTHER }) });
      assertEquals([mv.cancel, to(mails(calls, n)), rowOf(w, m.id).cohort_id, rowOf(w, m.id).invited_at, rowOf(w, m.id).expert_id], [{ sent: 3, failed: 0, total: 3, trainer: 'sent' }, [...REAL(w), 'mona@x.sa'].sort(), OTHER, null, null]);
      assertEquals(audits(w, 'workshop.cancel-notice').at(-1).reason, 'move');
      // ثم تُدعى الدفعة الجديدة من الحفظ نفسه أو من زرها
      n = mails(calls).length;
      await V.workshopInvite(ADMIN, { id: m.id });
      assertEquals(to(mails(calls, n)), [w.ps[7].email]);
      // جعلها عامة: أعضاء دفعتها يُبلَّغون
      n = mails(calls).length;
      const gen: any = await V.workshopSave(ADMIN, { row: edit(m.id, { title_ar: 'تُنقل', cohort_id: '' }) });
      assertEquals([gen.cancel.sent, to(mails(calls, n)), rowOf(w, m.id).cohort_id], [1, [w.ps[7].email], null]);
      // تغيير الوسم: الجلسة باقية لجمهورها، فلا إلغاء
      const f: any = await V.workshopSave(ADMIN, { row: newDay({ title_ar: 'يتغير وسمها' }), invite: true });
      n = mails(calls).length;
      const flip: any = await V.workshopSave(ADMIN, { row: { ...edit(f.id, { title_ar: 'يتغير وسمها' }), counting: 'mandatory' }, counting_confirm: true });
      assertEquals([flip.success, flip.cancel, mails(calls).length, rowOf(w, f.id).optional, !!rowOf(w, f.id).invited_at], [true, undefined, n, false, true]);
      const fp: any = await V.workshopSave(ADMIN, { row: { ...edit(f.id, { title_ar: 'يتغير وسمها' }), counting: 'optional' }, preview: true });
      assertEquals(fp.leave, null);
    });
  } finally { w.f.restore(); }
});

Deno.test('تحذير سحب الاكتمال: إلغاء يوم إلزامي حضره من أتم يعدّهم للمدير قبل التأكيد، ولا يغيّر السلوك القائم', async () => {
  const w = world();
  try {
    // اليوم 2 انتهى وحضرته سارة ونورة فأتمتا التدريب (يومان من يومين). إلغاؤه يسحب اكتمالهما، ولا بريد لجلسة انتهت
    const row = { requirement_id: REQ_W, cohort_id: COHORT, title_ar: 'اليوم 2', mode: 'in_person', location_ar: 'القاعة', join_url: null, starts_at: rowOf(w, D2).starts_at, ends_at: rowOf(w, D2).ends_at, id: D2 };
    const pv: any = await V.workshopSave(ADMIN, { row: { ...row, active: false }, preview: true });
    assertEquals(pv.leave, { kind: 'cancel', notify: null, skipped: 'ended', uncomplete: 2 });
    // السلوك كما كان: يُلغى بلا حفظ اكتمال ولا كتابة تقدم
    const c: any = await V.workshopSave(ADMIN, { row: { ...row, active: false } });
    assertEquals([c.success, rowOf(w, D2).active, w.tables.participant_requirements.length], [true, false, 0]);
    // يوم اختياري أو بلا حضور: لا تحذير
    Object.assign(rowOf(w, D2), { active: true, optional: true });
    assertEquals((await V.workshopSave(ADMIN, { row: { ...row, active: false }, preview: true }) as any).leave.uncomplete, 0);
    const fresh: any = await V.workshopSave(ADMIN, { row: newDay({ counting: 'mandatory' }) });
    assertEquals((await V.workshopSave(ADMIN, { row: edit(fresh.id, { active: false }), preview: true }) as any).leave.uncomplete, 0);
  } finally { w.f.restore(); }
});

Deno.test('بحصة البريد: بريد الإلغاء ينتظر في الطابور بملفه وينتهي بموعد الجلسة الأصلي، ودعوة لم تخرج بعد لا تخرج بعد الإلغاء', async () => {
  const w = world();
  try {
    // سقف 2 (حصة غير الرموز منه 1): دعوة واحدة تخرج واثنتان تنتظران
    await withMail(async (calls) => {
      const r: any = await V.workshopSave(ADMIN, { row: newDay(), invite: true });
      assertEquals([r.invite.sent, r.invite.queued, mails(calls).length], [1, 2, 1]);
      const starts = rowOf(w, r.id).starts_at;
      const c: any = await V.workshopSave(ADMIN, { row: edit(r.id, { active: false }) });
      assertEquals([c.cancel.sent, c.cancel.queued, c.cancel.total, mails(calls).length], [0, 3, 3, 1]);
      const q = w.tables.mail_queue;
      // الدعوتان المنتظرتان تُركتا، والإلغاء ينتظر بملفه وموعد انتهائه
      assertEquals(q.filter((m) => m.subject === 'دعوة: جلستك التدريبية').map((m) => [!!m.gave_up_at, m.last_error]), [[true, 'superseded'], [true, 'superseded']]);
      const waiting = q.filter((m) => m.subject === WORKSHOP_CANCEL_MAIL.subject);
      assertEquals(waiting.map((m) => [m.kind, m.ref, m.expires_at, m.attachments?.[0]?.filename, m.gave_up_at ?? null]), REAL(w).map(() => ['bulk', r.id, starts, 'cancel.ics', null]));
      assertEquals(waiting.map((m) => m.to_email).sort(), REAL(w));
      // الطابور يخرجها لاحقًا بملفها، والدعوة المتروكة لا تخرج
      CONFIG.mailDailyCap = 100;
      const n = mails(calls).length;
      await drainMailQueue();
      const out = mails(calls, n);
      assertEquals([out.length, out.every((m) => m.body.subject === WORKSHOP_CANCEL_MAIL.subject && m.body.attachments[0].filename === 'cancel.ics')], [3, true]);
    }, 2);
    // إعادة الجلسة تترك ما ينتظر من بريد إلغائها
    const w2 = world();
    try {
      await withMail(async () => {
        const r: any = await V.workshopSave(ADMIN, { row: newDay(), invite: true });
        CONFIG.mailDailyCap = 3;
        await V.workshopSave(ADMIN, { row: edit(r.id, { active: false }) });
        const pending = () => w2.tables.mail_queue.filter((m) => m.subject === WORKSHOP_CANCEL_MAIL.subject && !m.sent_at && !m.gave_up_at).length;
        assert(pending() > 0);
        await V.workshopSave(ADMIN, { row: edit(r.id) });
        assertEquals(pending(), 0);
      });
    } finally { w2.f.restore(); }
  } finally { w.f.restore(); }
});

Deno.test('قوالب الإلغاء في معرض البريد: للمدعو وللمدرب، وعودة الجلسة للمدرب', () => {
  const by = Object.fromEntries((MAIL_GALLERY as any[]).map((m) => [m.key, m]));
  const cancel = by['workshop-cancel'].html(), trainer = by['workshop-cancel-trainer'].html(), restore = by['workshop-restore-trainer'].html();
  assertEquals([by['workshop-cancel'].subject, by['workshop-cancel-trainer'].subject, by['workshop-restore-trainer'].subject], ['أُلغيت: جلستك التدريبية', 'أُلغيت: جلسة تدريبية أنت مدربها', 'أُعيدت: جلسة تدريبية أنت مدربها']);
  assert(cancel.includes('الموعد الملغى') && cancel.includes('الملف المرفق يزيل الموعد من تقويمك، وإن بقي فاحذفه'));
  assert(trainer.includes('أُبلغ من المشاركين') && trainer.includes('دفعة الخريف') && restore.includes('دُعي من المشاركين'));
  // لا شرطة طويلة ولا متوسطة في نص البريد
  for (const html of [cancel, trainer, restore]) assert(!/[–—]/.test(html));
});
