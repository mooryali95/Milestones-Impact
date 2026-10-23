// ════════════════════════════════════════════════════════════════
// شهادات المشاركة: الإصدار والتحقق العام والإدارة
// ════════════════════════════════════════════════════════════════
// الإصدار تلقائي حين تصير حالة المشارك «أنهى البرنامج»، ويحفظ لقطة ثابتة
// (snapshot) لكل ما يظهر على الشهادة، ويقفل الاسم. التوقيع HMAC للحقول
// الحاكمة بسرّ الخادم، فلا تمر شهادة عُدّلت لقطتها في القاعدة دون أن يظهر
// ذلك عند التحقق. صفحة التحقق عامة برقم الشهادة، بحد طلبات لكل عنوان.
import { audit, certificateMail, CONFIG, db, Fail, must, sendMail } from './core.ts';
import { trackKey } from './logic.js';

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
const signed = (s: any) => [s.serial, s.name_ar, s.name_en || '', s.program_ar, s.track_ar || '', s.hours || '', s.issued_at, s.org?.name || ''].join('|');

async function hmac(text: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(`cert:${CONFIG.pepper}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── مصدر واحد لما يظهر على الشهادة ──
// الإعداد العام (certificate_settings) ثم تخصيص الجهة (organizations.cert) فوقه.
// profileFor هي الدالة الوحيدة التي تحل الاثنين؛ الإصدار والمعاينة يمرّان بها.
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

export function profileFor(global: Body, orgCert: Body | null | undefined): Profile {
  const o = orgCert || {};
  return {
    program_ar: o.program_ar || global.program_ar,
    program_en: o.program_en || global.program_en,
    hours: o.hours ?? global.hours ?? null,
    signatory: 'signatory' in o ? o.signatory : global.signatory ?? null,
  };
}

const ORG_FIELDS = 'id, name, name_en, logo, cert_cobrand, cert';
const orgRow = async (id: string | null | undefined) =>
  id ? (await db.from('organizations').select(ORG_FIELDS).eq('id', id).maybeSingle()).data : null;

// اللقطة: كل ما يظهر على الشهادة، من مصدر واحد
function snapshotOf(x: { serial: string; issuedAt: string; name_ar: string; name_en: string | null; track: any; start: string; end: string; org: any; profile: Profile }) {
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
    issued_at: x.issuedAt,
    org: o ? { id: o.id, name: o.name, name_en: o.name_en || null, logo: o.cert_cobrand && o.logo ? o.logo : null } : null,
    signatories: pr.signatory ? [pr.signatory] : [],
    verify_url: verifyUrl(x.serial),
  };
}

async function buildSnapshot(p: any, serial: string, issuedAt: string) {
  const [cfg, pl, org, enr] = await Promise.all([
    settings(),
    db.from('placements').select('dimension, level').eq('participant_id', p.id),
    orgRow(p.organization_id),
    db.from('enrollments').select('cohorts(starts_on, ends_on)').eq('participant_id', p.id).order('created_at', { ascending: false }).limit(1),
  ]);
  const key = trackKey(Object.fromEntries((pl.data || []).map((x: any) => [x.dimension, x.level])));
  const track = key ? (await db.from('tracks').select('title_ar, title_en').eq('key', key).maybeSingle()).data : null;
  const cohort = (enr.data?.[0] as any)?.cohorts;
  return snapshotOf({
    serial, issuedAt, name_ar: p.full_name, name_en: p.name_en || null, track,
    start: cohort?.starts_on || p.created_at, end: cohort?.ends_on || issuedAt,
    org, profile: profileFor(cfg, org?.cert),
  });
}

async function insertCertificate(p: any, by: string | null) {
  if (!String(p.full_name || '').trim()) throw new Fail('اسم المشارك مطلوب قبل إصدار الشهادة');
  const issuedAt = new Date().toISOString();
  for (let i = 0; i < 4; i++) {
    const serial = newSerial();
    const snapshot = await buildSnapshot(p, serial, issuedAt);
    const { data, error } = await db.from('certificates')
      .insert({ serial, participant_id: p.id, snapshot, signature: await hmac(signed(snapshot)), issued_at: issuedAt, issued_by: by })
      .select('id, serial').single();
    if (!error) {
      if (!p.name_locked_at) await db.from('participants').update({ name_locked_at: issuedAt }).eq('id', p.id);
      await audit(by ? 'admin' : 'system', by, 'certificate.issue', 'certificates', data.id, null, { serial });
      sendMail(p.email, 'شهادة مشاركتك في برنامج القادة', certificateMail(p.full_name, verifyUrl(serial)))
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

// يُستدعى عند تغيير الحالة إلى «أنهى البرنامج»؛ لا يُصدر ثانية إن وُجدت سارية
export async function issueOnCompletion(participantId: string, by: string | null) {
  const cfg = await settings();
  if (!cfg.enabled) return null;
  const { data: existing } = await db.from('certificates').select('id').eq('participant_id', participantId).eq('status', 'valid').maybeSingle();
  if (existing) return null;
  const { data: p } = await db.from('participants').select('*').eq('id', participantId).single();
  return insertCertificate(p, by);
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
  const authentic = (await hmac(signed(c.snapshot))) === c.signature;
  let replacement = null;
  if (c.replaced_by) replacement = (await db.from('certificates').select('serial').eq('id', c.replaced_by).maybeSingle()).data?.serial || null;
  return {
    success: true, found: true, authentic,
    status: authentic ? c.status : 'invalid',
    revoked_at: c.revoked_at, replacement,
    certificate: c.snapshot,
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

export async function issue(a: Actor, b: Body) {
  const id = String(b.participant_id);
  const { data: p } = await db.from('participants').select('*').eq('id', id).maybeSingle();
  if (!p) throw new Fail('المشارك غير موجود', 404);
  if (p.status !== 'completed') throw new Fail('تُصدر الشهادة لمن أنهى البرنامج فقط');
  const { data: existing } = await db.from('certificates').select('id').eq('participant_id', id).eq('status', 'valid').maybeSingle();
  if (existing) throw new Fail('للمشارك شهادة سارية. استعمل إعادة الإصدار لتصحيحها', 409, 'exists');
  return { success: true, certificate: await insertCertificate(p, a.email) };
}

export async function revoke(a: Actor, b: Body) {
  const reason = String(b.reason || '').trim().slice(0, 500);
  if (!reason) throw new Fail('سبب الإلغاء مطلوب');
  const { data: c } = await db.from('certificates').select('id, status').eq('id', String(b.id)).maybeSingle();
  if (!c || c.status !== 'valid') throw new Fail('الشهادة غير سارية', 409);
  must(await db.from('certificates').update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: a.email, revoke_reason: reason }).eq('id', c.id));
  await audit('admin', a.email, 'certificate.revoke', 'certificates', c.id, null, { reason });
  return { success: true };
}

// استبدال شهادة سارية بإصدار جديد من البيانات الحالية: القديمة «استُبدلت» وتشير إلى الجديدة
async function replace(oldId: string, participantId: string, by: string, reason: string) {
  must(await db.from('certificates').update({ status: 'replaced', revoked_at: new Date().toISOString(), revoked_by: by, revoke_reason: reason }).eq('id', oldId).eq('status', 'valid'));
  const { data: p } = await db.from('participants').select('*').eq('id', participantId).single();
  const fresh = await insertCertificate(p, by);
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

// معاينة بالمصدر نفسه الذي يُصدر منه: إعداد عام أو جهة، باسم تجريبي
export async function preview(b: Body) {
  const [cfg, org] = await Promise.all([settings(), orgRow(b.organization_id)]);
  const draft = b.settings ? { ...cfg, ...cleanProfile(b.settings) } : cfg;
  const cert = b.cert ? cleanProfile(b.cert, true) : org?.cert;
  const now = new Date().toISOString();
  return {
    success: true,
    certificate: snapshotOf({
      serial: `MI-LDR-${now.slice(0, 4)}-SAMPLE`, issuedAt: now, name_ar: 'اسم المشارك كما في ملفه', name_en: 'Participant Name',
      track: { title_ar: 'مسار التوازن القيادي', title_en: 'Balanced Leadership Track' }, start: now, end: now,
      org, profile: profileFor(draft, cert),
    }),
  };
}

export async function settingsGet() {
  const { count } = await db.from('organizations').select('id', { count: 'exact', head: true }).neq('cert', '{}');
  return { success: true, settings: await settings(), customized_orgs: count ?? 0 };
}

export async function settingsSave(a: Actor, b: Body) {
  const s = b.settings || {};
  const row = { id: 1, enabled: s.enabled !== false, ...cleanProfile({ program_ar: '', program_en: '', hours: null, signatory: null, ...s }), updated_by: a.email, updated_at: new Date().toISOString() };
  must(await db.from('certificate_settings').upsert(row));
  await audit('admin', a.email, 'certificate.settings', 'certificate_settings', '1', null, { ...row, signatory: row.signatory?.name || null });
  return { success: true, settings: row };
}
