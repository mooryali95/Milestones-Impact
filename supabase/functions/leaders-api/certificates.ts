// ════════════════════════════════════════════════════════════════
// شهادات المشاركة: الإصدار والتحقق العام والإدارة
// ════════════════════════════════════════════════════════════════
// D05: «شهادة إتمام بنجاح» تصدر آليًا وحصرًا عند اعتماد تقييم ختامي بقرار اجتاز أو اجتاز بملاحظات
// (final.ts)، لا بتغيير الحالة ولا يدويًا. إعادة فتح التقييم تعلّقها، والاسترداد يلغيها، والإجراء اليدوي
// الوحيد التعليق أو الإلغاء بتعليل وصلاحية super. تحفظ لقطة ثابتة لكل ما يظهر على الشهادة وتقفل الاسم.
// التوقيع HMAC للحقول الحاكمة بمفتاح مستقل عن ملح الجلسات بمعرّف مفتاح (kid)، فتدوير الملح لا يبطل شهادة،
// وتدوير المفتاح لا يبطل ما صدر. صفحة التحقق عامة برقم الشهادة، بحد طلبات لكل عنوان.
import { alertOps, audit, certificateMail, CONFIG, db, Fail, must, nameConfirmMail, sendMail } from './core.ts';
import { certProfile, programHours, trackKey } from './logic.js';
import { displayTitles } from './profiles.ts';
import { cohortOf, defaultProgramId, journeyDefinition } from './programs.ts';

type Body = Record<string, any>;
type Actor = { email: string };

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const enc = new TextEncoder();

export const verifyUrl = (serial: string) => `${CONFIG.appUrl}/v/${serial}`;

function newSerial(at = new Date()) {
  const r = crypto.getRandomValues(new Uint8Array(6));
  return `MI-LDR-${at.getUTCFullYear()}-${Array.from(r, (n) => ALPHABET[n % ALPHABET.length]).join('')}`;
}

// الحقول الحاكمة فقط: تغيير أيّها يُبطل التوقيع
// الدفعة أُضيفت لاحقًا: تدخل التوقيع حين توجد فقط، فتبقى الشهادات السابقة صحيحة
// نوع الشهادة وقرارها وإصدار المعادلة (D05) تدخل التوقيع حين توجد، فتبقى السابقة صحيحة
const signed = (s: any) => [s.serial, s.name_ar, s.name_en || '', s.program_ar, s.track_ar || '', s.hours || '', s.issued_at, s.org?.name || '',
  ...(s.cohort_ar ? [s.cohort_ar] : []), ...(s.kind ? [s.kind, s.decision || '', s.formula_version ?? ''] : [])].join('|');

async function hmacWith(secret: string, text: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}
// مفاتيح التوقيع (D05): الحالي بمعرّفه، والسابقة للتحقق وحده ({"k1":"..."} في LEADERS_CERT_PREVIOUS_KEYS).
// التوقيع القديم بلا معرّف مشتق من ملح الجلسات، ويبقى قابلًا للتحقق ما بقي الملح نفسه.
export const certKeys = () => {
  let previous: Record<string, string> = {};
  try { previous = JSON.parse(Deno.env.get('LEADERS_CERT_PREVIOUS_KEYS') || '{}') || {}; } catch { previous = {}; }
  return { kid: Deno.env.get('LEADERS_CERT_KEY_ID') || 'k1', key: Deno.env.get('LEADERS_CERT_SIGNING_KEY') || '', previous };
};
export async function signCertificate(text: string) {
  const { kid, key } = certKeys();
  if (key.length < 32) {
    await alertOps('cert_key_missing', { note: 'LEADERS_CERT_SIGNING_KEY غير مضبوط أو أقصر من 32 حرفًا؛ لا تصدر شهادة' });
    throw new Fail('إصدار الشهادات متوقف حتى يُضبط مفتاح التوقيع', 503, 'cert_key_missing');
  }
  return `${kid}:${await hmacWith(key, text)}`;
}
export async function checkCertificate(text: string, signature: string) {
  const m = String(signature || '').match(/^([a-z0-9_-]{1,20}):([0-9a-f]{64})$/);
  if (!m) return CONFIG.pepper ? (await hmacWith(`cert:${CONFIG.pepper}`, text)) === signature : false;
  const { kid, key, previous } = certKeys();
  const secret = m[1] === kid ? key : previous[m[1]];
  return !!secret && (await hmacWith(secret, text)) === m[2];
}

// ── مصدر واحد لما يظهر على الشهادة ──
// الإعداد العام (certificate_settings)، ثم تخصيص البرنامج (programs.cert)، ثم تخصيص
// الجهة (organizations.cert) فوقهما. profileFor هي الدالة الوحيدة التي تحل الطبقات؛
// الإصدار والمعاينة يمرّان بها.
const DEFAULTS = { enabled: true, program_ar: 'برنامج القادة', program_en: 'Leaders Program', hours: null, signatory: null };
type Signatory = { name: string; title: string; image?: string };
type Profile = { program_ar: string; program_en: string; hours: number | null; signatory: Signatory | null };

async function settings() {
  const { data } = await db.from('certificate_settings').select('*').eq('id', 1).maybeSingle();
  return { ...DEFAULTS, ...(data || {}) };
}

// تحقق واحد لحقول الإعداد، للعام وللجهة. partial: الحقل الغائب يبقى غائبًا (يُورث)
function cleanSignatory(x: any): Signatory | null {
  if (x == null) return null;
  const name = String(x.name || '').trim().slice(0, 120);
  if (!name) throw new Fail('اسم الموقّع مطلوب، أو اختر «بلا موقّع»');
  const title = String(x.title || '').trim().slice(0, 160);
  const image = typeof x.image === 'string' && x.image.startsWith('data:image/png;base64,') && x.image.length <= 300000 ? x.image : null;
  return { name, title, ...(image ? { image } : {}) };
}
export function cleanProfile(s: Body, partial = false) {
  const out: Body = {};
  const text = (k: string, max: number) => {
    if (!(k in s)) return;
    const v = String(s[k] ?? '').trim().slice(0, max);
    if (v) out[k] = v; else if (!partial) out[k] = (DEFAULTS as any)[k];
  };
  text('program_ar', 200);
  text('program_en', 200);
  if ('hours' in s) {
    const h = s.hours == null || s.hours === '' ? null : Math.round(Number(s.hours));
    if (h != null && !(h >= 1 && h <= 2000)) throw new Fail('عدد الساعات بين 1 و2000');
    if (h != null || !partial) out.hours = h;
  }
  if ('signatory' in s) out.signatory = cleanSignatory(s.signatory);
  return out;
}

export const profileFor = (global: Body, ...layers: (Body | null | undefined)[]): Profile => certProfile(global, ...layers);

const ORG_FIELDS = 'id, name, name_en, logo, cert_cobrand, cert';
const orgRow = async (id: string | null | undefined) =>
  id ? (await db.from('organizations').select(ORG_FIELDS).eq('id', id).maybeSingle()).data : null;
const programCert = async (id: string | null | undefined) =>
  id ? ((await db.from('programs').select('cert').eq('id', id).maybeSingle()).data?.cert || {}) : {};

// اللقطة: كل ما يظهر على الشهادة، من مصدر واحد
function snapshotOf(x: { serial: string; issuedAt: string; name_ar: string; name_en: string | null; track: any; start: string; end: string; org: any; profile: Profile; cohort?: string | null }) {
  const { profile: pr, org: o } = x;
  return {
    serial: x.serial,
    name_ar: x.name_ar,
    name_en: x.name_en,
    program_ar: pr.program_ar,
    program_en: pr.program_en,
    track_ar: x.track?.title_ar || null,
    track_en: x.track?.title_en || null,
    hours: pr.hours,
    start: x.start,
    end: x.end,
    cohort_ar: x.cohort || null,
    issued_at: x.issuedAt,
    org: o ? { id: o.id, name: o.name, name_en: o.name_en || null, logo: o.cert_cobrand && o.logo ? o.logo : null } : null,
    signatories: pr.signatory ? [pr.signatory] : [],
    verify_url: verifyUrl(x.serial),
  };
}

// الدفعة كما تحددها رحلة المشارك (تسجيله، أو دفعة جهته، أو المفتوحة)، وبرنامجها
async function buildSnapshot(p: any, serial: string, issuedAt: string, final: FinalRef | null = null) {
  const [cfg, pl, org, { cohort }] = await Promise.all([
    settings(),
    db.from('placements').select('dimension, level').eq('participant_id', p.id),
    orgRow(p.organization_id),
    cohortOf(p),
  ]);
  const levels = Object.fromEntries((pl.data || []).map((x: any) => [x.dimension, x.level]));
  const key = trackKey(levels);
  const [track, prCert, def] = await Promise.all([
    // الشهادة تحمل اسم ملف التعريف الذي رآه المشارك، لا عنوان المسار الداخلي
    key ? displayTitles().then((t) => (t[key] ? { title_ar: t[key].ar, title_en: t[key].en } : null)) : null,
    programCert(cohort?.program_id || await defaultProgramId()),
    journeyDefinition(p),
  ]);
  // الساعات المكتوبة في الإعداد تتقدم؛ وإلا فمن أنشطة رحلة المشارك نفسها
  const profile = profileFor(cfg, prCert, org?.cert);
  // ولا تُكتب ناقصة: نشاط بلا مدة يعني أن الحساب غير مكتمل، فتُترك فارغة كما كانت
  if (profile.hours == null) {
    const h = programHours(def.requirements, levels);
    if (!h.missing.length && h.hours) profile.hours = h.hours;
  }
  const snap = snapshotOf({
    serial, issuedAt, name_ar: p.full_name, name_en: p.name_en || null, track,
    start: cohort?.starts_on || p.created_at, end: cohort?.ends_on || issuedAt,
    cohort: cohort && !cohort.is_default ? cohort.name : null,
    org, profile,
  });
  // D02: إصدار المحتوى الذي أتم عليه البرنامج، في اللقطة لا في التوقيع
  const release = { content_release: (cohort as any)?.content_release ?? null };
  // D05: نوع الشهادة وقرار الختامي وإصدار معادلته وبرنامجه
  return final ? { ...snap, ...release, kind: 'completion_success', decision: final.decision, formula_version: final.formula_version ?? null, program_id: final.program_id } : { ...snap, ...release };
}

export type FinalRef = { decision: string; formula_version?: number | null; program_id: string };
export const PASSING = ['pass', 'pass_notes'];

async function insertCertificate(p: any, by: string | null, final: FinalRef | null = null) {
  if (!String(p.full_name || '').trim()) throw new Fail('اسم المشارك مطلوب قبل إصدار الشهادة');
  const issuedAt = new Date().toISOString();
  for (let i = 0; i < 4; i++) {
    const serial = newSerial();
    const snapshot = await buildSnapshot(p, serial, issuedAt, final);
    const { data, error } = await db.from('certificates')
      .insert({ serial, participant_id: p.id, snapshot, signature: await signCertificate(signed(snapshot)), issued_at: issuedAt, issued_by: by })
      .select('id, serial').single();
    if (!error) {
      if (!p.name_locked_at) await db.from('participants').update({ name_locked_at: issuedAt }).eq('id', p.id);
      await audit(by ? 'admin' : 'system', by, 'certificate.issue', 'certificates', data.id, null, { serial });
      sendMail(p.email, 'شهادة إتمامك بنجاح برنامج القادة', certificateMail(p.full_name, verifyUrl(serial)), [], { ref: `participant:${p.id}` })
        .catch((e) => console.error('certificate mail:', e));
      return data;
    }
    // تصادم الرقم نادر جدًا: نعيد بالرقم التالي. غير ذلك (شهادة سارية موجودة مثلًا) يُرفع
    if (!String(error.message).includes('certificates_serial_key')) {
      if (String(error.message).includes('certificates_one_valid')) return null;
      throw new Fail('تعذّر إصدار الشهادة', 500);
    }
  }
  throw new Fail('تعذّر توليد رقم شهادة', 500);
}

// ── دورة الشهادة من التقييم الختامي (D05) ──
// يُستدعى عند اعتماد التقييم الختامي. اجتاز أو اجتاز بملاحظات: تصدر، أو تُعاد المعلّقة إن طابق قرارها،
// وإلا تُستبدل بجديدة. يُمدَّد أو لم يجتز: لا يصدر شيء، وتُلغى المعلّقة.
export async function onFinalApproved(participantId: string, final: FinalRef, by: string | null) {
  const cfg = await settings();
  const { data: certs } = await db.from('certificates').select('id, status, snapshot').eq('participant_id', participantId).in('status', ['valid', 'suspended']);
  const valid = (certs || []).find((c: any) => c.status === 'valid');
  const suspended = (certs || []).find((c: any) => c.status === 'suspended');
  if (!PASSING.includes(final.decision)) {
    for (const c of [valid, suspended]) if (c) await setStatus(c.id, 'revoked', by || 'system', `قرار ختامي: ${final.decision}`);
    return null;
  }
  if (valid) return null;
  if (suspended && suspended.snapshot?.decision === final.decision) {
    await setStatus(suspended.id, 'valid', by || 'system', null);
    await audit('system', by, 'certificate.restore', 'certificates', suspended.id, null, { decision: final.decision });
    return { id: suspended.id, serial: suspended.snapshot?.serial };
  }
  if (suspended) await setStatus(suspended.id, 'replaced', by || 'system', 'اعتماد ختامي جديد');
  if (!cfg.enabled) return null;
  const { data: p } = await db.from('participants').select('*').eq('id', participantId).single();
  // الشهادة الجديدة تنتظر تأكيد صاحبها اسمه كما سيُطبع (7.3)؛ تأكيده يصدرها (issueAfterNameConfirm)
  if (!p.name_confirmed_at) {
    await audit('system', by, 'certificate.awaiting-name', 'participants', p.id, null, { decision: final.decision });
    if (p.email && !p.is_demo) sendMail(p.email, 'أكّد اسمك لتصدر شهادتك', nameConfirmMail(p.full_name, CONFIG.appUrl), [], { ref: `participant:${p.id}` })
      .catch((e) => console.error('name confirm mail:', e));
    return { awaiting_name: true };
  }
  return insertCertificate(p, by, final);
}

// بعد تأكيد الاسم: إن كان التقييم الختامي معتمدًا بقرار ناجح ولا شهادة سارية، تصدر الآن بقرار التقييم نفسه
export async function issueAfterNameConfirm(participantId: string) {
  const { data: rec } = await db.from('final_evaluations').select('program_id, decision, snapshot, status')
    .eq('participant_id', participantId).eq('status', 'approved').order('decided_at', { ascending: false }).limit(1).maybeSingle();
  if (!rec) return null;
  const decision = String(rec.decision || rec.snapshot?.decision || '');
  if (!PASSING.includes(decision)) return null;
  return onFinalApproved(participantId, { decision, formula_version: rec.snapshot?.config_version ?? null, program_id: rec.program_id }, null);
}

// إعادة فتح التقييم الختامي تعلّق الشهادة السارية حتى يُعتمد من جديد
export async function suspendForReopen(participantId: string, by: string, note: string) {
  const { data: c } = await db.from('certificates').select('id').eq('participant_id', participantId).eq('status', 'valid').maybeSingle();
  if (c) await setStatus(c.id, 'suspended', by, `إعادة فتح التقييم الختامي: ${note}`.slice(0, 500));
}

// الاسترداد يلغي الشهادة السارية أو المعلّقة (سياسة الاسترداد)
export async function revokeForRefund(participantId: string) {
  const { data: certs } = await db.from('certificates').select('id').eq('participant_id', participantId).in('status', ['valid', 'suspended']);
  for (const c of certs || []) await setStatus(c.id, 'revoked', 'creem', 'استرداد الرسوم');
}

// تغيير الحالة بأثره، والحالة المخزنة هي المطلوبة نفسها: تعذّر التعليق يفشل ولا يصير إلغاءً (D05)
async function setStatus(id: string, status: 'valid' | 'suspended' | 'revoked' | 'replaced', by: string, reason: string | null) {
  const patch: Body = status === 'valid' ? { status, revoked_at: null, revoked_by: null, revoke_reason: null }
    : { status, revoked_at: new Date().toISOString(), revoked_by: by, revoke_reason: reason };
  const { error } = await db.from('certificates').update(patch).eq('id', id);
  if (error) throw new Fail('تعذّر تحديث حالة الشهادة', 500, 'db_error');
  await audit('system', by, `certificate.${status}`, 'certificates', id, null, { reason });
}

// ── التحقق العام ──
const PUBLIC_LIMIT = 40; // طلبًا لكل عنوان في 10 دقائق

export async function verify(b: Body, ctx: { ip: string | null; ua: string | null }) {
  const serial = String(b.serial || '').trim().toUpperCase();
  if (ctx.ip) {
    const since = new Date(Date.now() - 10 * 60e3).toISOString();
    const { count } = await db.from('certificate_checks').select('id', { count: 'exact', head: true }).eq('ip', ctx.ip).gte('created_at', since);
    if ((count ?? 0) >= PUBLIC_LIMIT) throw new Fail('طلبات كثيرة، حاول بعد دقائق', 429, 'rate');
  }
  const valid = /^MI-LDR-[0-9]{4}-[0-9A-Z]{6}$/.test(serial);
  const { data: c } = valid
    ? await db.from('certificates').select('serial, status, snapshot, signature, issued_at, revoked_at, replaced_by').eq('serial', serial).maybeSingle()
    : { data: null };
  await db.from('certificate_checks').insert({ serial: valid ? serial : null, found: !!c, ip: ctx.ip, user_agent: ctx.ua });
  if (!c) return { success: true, found: false };
  const authentic = await checkCertificate(signed(c.snapshot), c.signature);
  let replacement = null;
  if (c.replaced_by) replacement = (await db.from('certificates').select('serial').eq('id', c.replaced_by).maybeSingle()).data?.serial || null;
  // D05: غير السارية تُعرض حالتها وحدها، بلا اسم ولا تفاصيل شخصية
  const shown = authentic && c.status === 'valid';
  return {
    success: true, found: true, authentic,
    status: authentic ? c.status : 'invalid',
    revoked_at: c.revoked_at, replacement,
    certificate: shown ? c.snapshot : null,
  };
}

// ── للمشارك ──
export async function mine(p: any) {
  const { data } = await db.from('certificates').select('serial, status, snapshot, issued_at')
    .eq('participant_id', p.id).eq('status', 'valid').maybeSingle();
  return { success: true, certificate: data?.snapshot || null, name_locked: !!p.name_locked_at };
}

// ── للإدارة ──
export async function list(b: Body) {
  let q = db.from('certificates')
    .select('id, serial, status, issued_at, issued_by, revoked_at, revoked_by, revoke_reason, participant_id, name_ar:snapshot->>name_ar, name_en:snapshot->>name_en, org_id:snapshot->org->>id, org_name:snapshot->org->>name')
    .order('issued_at', { ascending: false }).limit(1000);
  if (b.status) q = q.eq('status', String(b.status));
  if (b.participant_id) q = q.eq('participant_id', String(b.participant_id));
  if (b.organization_id) q = q.eq('snapshot->org->>id', String(b.organization_id));
  const { data } = await q;
  const { count } = await db.from('certificate_checks').select('id', { count: 'exact', head: true });
  return { success: true, certificates: data || [], checks: count ?? 0 };
}

export async function get(b: Body) {
  const { data } = await db.from('certificates').select('*').eq('id', String(b.id)).maybeSingle();
  if (!data) throw new Fail('الشهادة غير موجودة', 404);
  const { data: checks } = await db.from('certificate_checks').select('created_at, found').eq('serial', data.serial).order('created_at', { ascending: false }).limit(20);
  return { success: true, certificate: data, checks: checks || [] };
}

// لا إصدار يدويًا أبدًا (D05): الاستثناء يُعالج داخل الختامي بحوكمته (التعديل الكبير بتوقيعين)
export async function issue(_a: Actor, _b: Body) {
  throw new Fail('تصدر الشهادة من اعتماد التقييم الختامي بقرار اجتاز أو اجتاز بملاحظات، لا يدويًا', 409, 'cert_from_final');
}

// الإجراء اليدوي الوحيد: تعليق السارية أو إلغاء السارية والمعلّقة، بتعليل (وصلاحية super في index.ts)
export async function revoke(a: Actor, b: Body) {
  const reason = String(b.reason || '').trim().slice(0, 500);
  if (reason.length < 5) throw new Fail('سبب الإلغاء أو التعليق مطلوب');
  const to = b.suspend === true ? 'suspended' : 'revoked';
  const { data: c } = await db.from('certificates').select('id, status').eq('id', String(b.id)).maybeSingle();
  if (!c || !(to === 'suspended' ? ['valid'] : ['valid', 'suspended']).includes(c.status)) throw new Fail(to === 'suspended' ? 'تُعلَّق السارية وحدها' : 'الشهادة ليست سارية ولا معلّقة', 409);
  await setStatus(c.id, to, a.email, reason);
  return { success: true, status: to };
}

// استبدال شهادة سارية بإصدار جديد من البيانات الحالية: القديمة «استُبدلت» وتشير إلى الجديدة
async function replace(oldId: string, participantId: string, by: string, reason: string) {
  const { data: old } = await db.from('certificates').select('snapshot').eq('id', oldId).maybeSingle();
  must(await db.from('certificates').update({ status: 'replaced', revoked_at: new Date().toISOString(), revoked_by: by, revoke_reason: reason }).eq('id', oldId).eq('status', 'valid'));
  const { data: p } = await db.from('participants').select('*').eq('id', participantId).single();
  // التصحيح يحمل نوع الشهادة وقرارها وإصدار معادلتها من السابقة نفسها، فلا يصير التصحيح إصدارًا جديدًا
  const o: any = old?.snapshot || {};
  const fresh = await insertCertificate(p, by, o.kind ? { decision: o.decision, formula_version: o.formula_version, program_id: o.program_id } : null);
  if (fresh) await db.from('certificates').update({ replaced_by: fresh.id }).eq('id', oldId);
  return fresh;
}

const reasonOf = (b: Body, msg: string) => {
  const r = String(b.reason || '').trim().slice(0, 500);
  if (!r) throw new Fail(msg);
  return r;
};

// إعادة الإصدار لتصحيح الاسم أو البيانات
export async function reissue(a: Actor, b: Body) {
  const reason = reasonOf(b, 'سبب إعادة الإصدار مطلوب');
  const { data: old } = await db.from('certificates').select('id, status, participant_id').eq('id', String(b.id)).maybeSingle();
  if (!old || old.status !== 'valid') throw new Fail('تُعاد الشهادة السارية فقط', 409);
  const patch: Body = {};
  if (typeof b.name_ar === 'string' && b.name_ar.trim()) patch.full_name = b.name_ar.trim().slice(0, 120);
  if (typeof b.name_en === 'string') patch.name_en = b.name_en.trim().slice(0, 120) || null;
  if (Object.keys(patch).length) must(await db.from('participants').update(patch).eq('id', old.participant_id));
  const fresh = await replace(old.id, old.participant_id, a.email, reason);
  await audit('admin', a.email, 'certificate.reissue', 'certificates', old.id, null, { reason, replaced_by: fresh?.id, ...patch });
  return { success: true, certificate: fresh };
}

// إعادة إصدار كل الشهادات السارية لمشاركي جهة بإعدادها الحالي
export async function reissueOrg(a: Actor, b: Body) {
  const reason = reasonOf(b, 'سبب إعادة الإصدار مطلوب');
  const orgId = String(b.organization_id || '');
  const { data: ps } = await db.from('participants').select('id').eq('organization_id', orgId);
  const ids = (ps || []).map((p: any) => p.id);
  if (!ids.length) return { success: true, count: 0 };
  const { data: certs } = await db.from('certificates').select('id, participant_id').eq('status', 'valid').in('participant_id', ids);
  let count = 0;
  for (const c of certs || []) { if (await replace(c.id, c.participant_id, a.email, reason)) count++; }
  await audit('admin', a.email, 'certificate.reissue-org', 'organizations', orgId, null, { reason, count });
  return { success: true, count };
}

// معاينة بالمصدر نفسه الذي يُصدر منه: إعداد عام أو برنامج أو جهة، باسم تجريبي.
// program_cert مسودة البرنامج، وcert مسودة الجهة؛ الغائب يُقرأ من المحفوظ.
// ونوعها نوع كل إصدار جديد (D05): «شهادة إتمام بنجاح» بقرار اجتاز، لا «شهادة مشاركة» القديمة
export async function preview(b: Body) {
  const [cfg, org, saved] = await Promise.all([settings(), orgRow(b.organization_id), programCert(b.program_id || await defaultProgramId())]);
  const draft = b.settings ? { ...cfg, ...cleanProfile(b.settings) } : cfg;
  const cert = b.cert ? cleanProfile(b.cert, true) : org?.cert;
  const prCert = b.program_cert ? cleanProfile(b.program_cert, true) : saved;
  const now = new Date().toISOString();
  return {
    success: true,
    certificate: {
      ...snapshotOf({
        serial: `MI-LDR-${now.slice(0, 4)}-SAMPLE`, issuedAt: now, name_ar: 'اسم المشارك كما في ملفه', name_en: 'Participant Name',
        track: { title_ar: 'القيادة من خلال الآخرين', title_en: 'Leading Through Others' }, start: now, end: now,
        org, profile: profileFor(draft, prCert, cert),
      }),
      kind: 'completion_success', decision: 'pass',
    },
  };
}

export async function settingsGet() {
  const [orgs, progs] = await Promise.all([
    db.from('organizations').select('id', { count: 'exact', head: true }).neq('cert', '{}'),
    db.from('programs').select('id', { count: 'exact', head: true }).neq('cert', '{}'),
  ]);
  // ما ستكتبه الشهادة إن تُرك حقل الساعات فارغًا: من أنشطة البرنامج الافتراضي
  const def = await journeyDefinition({});
  return { success: true, settings: await settings(), customized_orgs: orgs.count ?? 0, customized_programs: progs.count ?? 0, computed_hours: programHours(def.requirements) };
}

export async function settingsSave(a: Actor, b: Body) {
  const s = b.settings || {};
  const row = { id: 1, enabled: s.enabled !== false, ...cleanProfile({ program_ar: '', program_en: '', hours: null, signatory: null, ...s }), updated_by: a.email, updated_at: new Date().toISOString() };
  must(await db.from('certificate_settings').upsert(row));
  await audit('admin', a.email, 'certificate.settings', 'certificate_settings', '1', null, { ...row, signatory: (row as any).signatory?.name || null });
  return { success: true, settings: row };
}
