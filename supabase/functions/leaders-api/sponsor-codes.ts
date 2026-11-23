// ════════════════════════════════════════════════════════════════
// رموز الرعاية (ترحيل 20261126100000): رموز تولّدها الإدارة لكل جهة، يكتبها المشارك في «رشّحتك جهة؟»
// ════════════════════════════════════════════════════════════════
// رمز رابط الجهة (invite_code) لا يُقبل مكتوبًا (قرار المالك)، ورابطها /j/ يعمل كما كان (resolveOrg). الرمز يربط بالجهة فقط، والمقعد
// يحكمه التثبيت القائم (pinSponsorFor). الاستهلاك لحظة الربط الفعلي وحدها (redeem_sponsor_code ذرية في القاعدة)، فمن
// يُرد قبل الربط (قرار سارٍ للإدارة، sponsorDecision) لا يأخذ استخدامًا.
// قبل الترحيل: غياب الجدول يُعامل كرمز غير معروف، وأفعال الإدارة ترد not_migrated.
import { audit, db, Fail, must } from './core.ts';
import { missingTable } from './missing-column.ts';
import {
  cleanExpiry, cleanMaxUses, codePrefix, codeState, formatCode, NOTE_MAX, normalizeSponsorCode, CUSTOM_CODE_RE, RANDOM_CHARS, SPONSOR_CODE_RE, SPONSOR_CODE_RULE_AR, SPONSOR_CODE_SPENT_AR,
} from './sponsor-codes.js';

type Body = Record<string, any>;
const COLS = 'id, organization_id, code, max_uses, used, expires_at, active, note, created_by, created_at';
const missingFn = (e: any) => !!e && ['PGRST202', '42883'].includes(String(e.code));
const NOT_MIGRATED = () => new Fail('رموز الرعاية غير مفعّلة بعد: يلزم تطبيق ترحيل القاعدة', 409, 'not_migrated');

// الرمز وجهته إن وُجد (أيًا كانت حالته)، أو null. الجهة الموقوفة كرمز غير معروف، كرمز رابطها
export async function findSponsorCode(code: unknown, orgCols = 'id, name, short_name, color, status') {
  const c = normalizeSponsorCode(code);
  if (!SPONSOR_CODE_RE.test(c)) return null;
  const { data, error } = await db.from('sponsor_codes').select(COLS).eq('code', c).maybeSingle();
  if (error) { if (missingTable(error)) return null; throw error; }
  if (!data) return null;
  const { data: org } = await db.from('organizations').select(orgCols).eq('id', data.organization_id).maybeSingle() as { data: any };
  if (!org || org.status === 'inactive') return null;
  return { row: data, org, state: codeState(data) };
}

// الاستهلاك الذري لحظة الربط: true عند النجاح (أو استعمال سابق للمشارك نفسه)، وإلا السبب
export async function redeemSponsorCode(code: string, participantId: string): Promise<{ ok: boolean; reason: string; org_id?: string }> {
  const { data, error } = await db.rpc('redeem_sponsor_code', { p_code: normalizeSponsorCode(code), p_participant: participantId });
  if (error) { if (missingFn(error) || missingTable(error)) return { ok: false, reason: 'unknown' }; throw error; }
  const r = Array.isArray(data) ? data[0] : data;
  return r?.reason === 'ok' && r.org_id ? { ok: true, reason: 'ok', org_id: r.org_id } : { ok: false, reason: String(r?.reason || 'unknown') };
}

// للربط من «رشّحتك جهة؟» بعد حسم القرار: يرمي برد الرمز المستنفد إن سبقه غيره إلى آخر استخدام
export async function consumeSponsorCode(code: string, participantId: string) {
  const r = await redeemSponsorCode(code, participantId);
  if (!r.ok) {
    await audit('participant', participantId, 'sponsor.code-spent', 'sponsor_codes', null, null, { code, reason: r.reason });
    throw new Fail(SPONSOR_CODE_SPENT_AR, 409, 'sponsor_code_spent');
  }
  return r;
}

// الاستهلاك والربط معًا في معاملة واحدة (redeem_and_link_sponsor_code، ترحيل 20261128100000): إن تعذّر الربط بعد الاستهلاك أُلغي
// الاستهلاك، فلا يبقى استخدام معدود بلا ربط. يعيد صف المشارك بعد الربط. قبل الترحيل (الدالة غائبة) يعود إلى الطريق القديم:
// الاستهلاك ثم الربط (consumeSponsorCode)، كما كان. للمشارك جهة في الأثناء: 409 كرد الحساب المرتبط
export async function redeemAndLink(code: string, participantId: string, orgId: string) {
  const { data, error } = await db.rpc('redeem_and_link_sponsor_code', { p_code: normalizeSponsorCode(code), p_participant: participantId });
  if (error && missingFn(error)) {
    await consumeSponsorCode(code, participantId);
    return must(await db.from('participants').update({ organization_id: orgId, org_via: 'link' }).eq('id', participantId).is('organization_id', null).select('*').single());
  }
  if (error) {
    if (String((error as any).code) === 'P0005') throw new Fail('حسابك مرتبط بجهة راعية. لتغييرها تواصل مع الإدارة.', 409);
    throw error;
  }
  const r = Array.isArray(data) ? data[0] : data;
  if (r?.reason !== 'ok' || !r.org_id) {
    await audit('participant', participantId, 'sponsor.code-spent', 'sponsor_codes', null, null, { code, reason: String(r?.reason || 'unknown') });
    throw new Fail(SPONSOR_CODE_SPENT_AR, 409, 'sponsor_code_spent');
  }
  return must(await db.from('participants').select('*').eq('id', participantId).single());
}

// ── الإدارة ──
const orgIdOf = (b: Body) => {
  const id = String(b.org_id || b.organization_id || '').trim();
  if (!id) throw new Fail('اختر الجهة');
  return id;
};

export async function adminList(b: Body) {
  const orgId = orgIdOf(b);
  const { data, error } = await db.from('sponsor_codes').select(COLS).eq('organization_id', orgId).order('created_at', { ascending: false });
  if (error) { if (missingTable(error)) return { success: true, ready: false, codes: [] }; throw error; }
  const codes = data || [];
  const ids = codes.map((c: any) => c.id);
  const uses = ids.length ? must(await db.from('sponsor_code_uses').select('code_id, participant_id, used_at').in('code_id', ids).order('used_at', { ascending: false })) as any[] : [];
  const pids = [...new Set(uses.map((u) => u.participant_id))];
  // counting-exempt: أسماء من استعملوا الرمز وبريدهم بمعرّفاتهم لعرضها للمدير، لا عدّ ولا قائمة مشاركين
  const people = pids.length ? must(await db.from('participants').select('id, full_name, email').in('id', pids)) as any[] : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return {
    success: true, ready: true,
    codes: codes.map((c: any) => ({
      ...c, state: codeState(c),
      users: uses.filter((u) => u.code_id === c.id).map((u) => ({ participant_id: u.participant_id, used_at: u.used_at, full_name: byId.get(u.participant_id)?.full_name || '', email: byId.get(u.participant_id)?.email || '' })),
    })),
  };
}

// رمز رابط جهة بالنص نفسه يجعل الرمز ملتبسًا (يُفحص رمز الرابط أولًا)، فيُرد
async function codeTaken(code: string) {
  const { data: org } = await db.from('organizations').select('id').ilike('invite_code', code).maybeSingle();
  if (org) return true;
  const { data: sc } = await db.from('sponsor_codes').select('id').eq('code', code).maybeSingle();
  return !!sc;
}

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export async function adminCreate(a: { email: string }, b: Body) {
  const orgId = orgIdOf(b);
  const { data: org } = await db.from('organizations').select('id, name, name_en, short_name, status, contract_ends').eq('id', orgId).maybeSingle();
  if (!org) throw new Fail('الجهة غير موجودة', 404);
  const max = cleanMaxUses(b.max_uses);
  if (max.error) throw new Fail(max.error);
  if (org.status === 'inactive') throw new Fail('الجهة موقوفة: فعّلها أولًا، فرموزها لا تعمل وهي موقوفة', 409, 'org_inactive');
  // بلا تاريخ انتهاء: ينتهي بانتهاء عقد الجهة إن سُجل (ويُفحص الانتهاء لحظة الاستهلاك أيضًا)
  const fromContract = (b.expires_at === '' || b.expires_at == null) && !!org.contract_ends;
  const exp = cleanExpiry(fromContract ? org.contract_ends : b.expires_at);
  if (exp.error) throw new Fail(exp.error);
  if (exp.value && new Date(exp.value).getTime() <= Date.now()) {
    throw new Fail(fromContract ? 'انتهى عقد الجهة المسجل: حدد تاريخ انتهاء للرمز أو حدّث العقد' : 'تاريخ الانتهاء مضى');
  }
  const note = String(b.note || '').trim().slice(0, NOTE_MAX) || null;
  let code = normalizeSponsorCode(b.code);
  // جدول غير مرحَّل يُكشف قبل توليد الرمز
  const probe = await db.from('sponsor_codes').select('id').limit(1);
  if (probe.error) { if (missingTable(probe.error)) throw NOT_MIGRATED(); throw probe.error; }
  if (code) {
    if (!CUSTOM_CODE_RE.test(code)) throw new Fail(`الرمز: ${SPONSOR_CODE_RULE_AR}. اتركه فارغًا ليُولَّد رمز`);
    if (await codeTaken(code)) throw new Fail('هذا الرمز مستعمل لجهة أو رمز آخر. اختر غيره أو اتركه فارغًا', 409, 'code_taken');
  } else {
    const prefix = codePrefix(org);
    for (let i = 0; i < 8 && !code; i++) {
      const c = formatCode(prefix, randomBytes(RANDOM_CHARS));
      if (!(await codeTaken(c))) code = c;
    }
    if (!code) throw new Fail('تعذّر توليد رمز فريد، حاول مرة أخرى', 409, 'code_taken');
  }
  const row = { organization_id: orgId, code, max_uses: max.value, used: 0, expires_at: exp.value, active: true, note, created_by: a.email };
  const { data, error } = await db.from('sponsor_codes').insert(row).select(COLS).single();
  if (error) {
    if (String(error.code) === '23505') throw new Fail('هذا الرمز مستعمل لجهة أو رمز آخر. اختر غيره أو اتركه فارغًا', 409, 'code_taken');
    throw error;
  }
  await audit('admin', a.email, 'sponsor-code.create', 'sponsor_codes', data.id, null, { organization_id: orgId, code, max_uses: row.max_uses, expires_at: row.expires_at });
  return { success: true, code: { ...data, state: codeState(data), users: [] } };
}

export async function adminUpdate(a: { email: string }, b: Body) {
  const id = String(b.id || '').trim();
  if (!id) throw new Fail('اختر الرمز');
  const { data: cur, error: e0 } = await db.from('sponsor_codes').select(COLS).eq('id', id).maybeSingle();
  if (e0) { if (missingTable(e0)) throw NOT_MIGRATED(); throw e0; }
  if (!cur) throw new Fail('الرمز غير موجود', 404);
  const patch: Body = {};
  if ('active' in b) patch.active = b.active !== false;
  if ('max_uses' in b) {
    const m = cleanMaxUses(b.max_uses);
    if (m.error) throw new Fail(m.error);
    // خفض الحد دون ما استُعمل لا يسحب ربطًا قائمًا، فيُرد ليُفهم
    if (m.value != null && m.value < Number(cur.used || 0)) throw new Fail(`استعمل الرمز ${cur.used} مشاركًا، فلا يقل الحد عن ذلك`);
    patch.max_uses = m.value;
  }
  if ('expires_at' in b) {
    const x = cleanExpiry(b.expires_at);
    if (x.error) throw new Fail(x.error);
    patch.expires_at = x.value;
  }
  if ('note' in b) patch.note = String(b.note || '').trim().slice(0, NOTE_MAX) || null;
  if (!Object.keys(patch).length) throw new Fail('لا تعديل');
  const data = must(await db.from('sponsor_codes').update(patch).eq('id', id).select(COLS).single()) as any;
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, (cur as any)[k]]));
  await audit('admin', a.email, 'sponsor-code.update', 'sponsor_codes', id, before, patch);
  return { success: true, code: { ...data, state: codeState(data) } };
}
