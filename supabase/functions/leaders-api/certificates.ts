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

async function settings() {
  const { data } = await db.from('certificate_settings').select('*').eq('id', 1).maybeSingle();
  return data || { enabled: true, program_ar: 'برنامج القادة', program_en: 'Leaders Program', hours: null, signatories: [] };
}

// لقطة الشهادة من بيانات المشارك الحالية
async function buildSnapshot(p: any, serial: string, issuedAt: string) {
  const [cfg, pl, org, enr] = await Promise.all([
    settings(),
    db.from('placements').select('dimension, level').eq('participant_id', p.id),
    p.organization_id ? db.from('organizations').select('name, name_en, logo, cert_cobrand').eq('id', p.organization_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('enrollments').select('cohorts(starts_on, ends_on)').eq('participant_id', p.id).order('created_at', { ascending: false }).limit(1),
  ]);
  const key = trackKey(Object.fromEntries((pl.data || []).map((x: any) => [x.dimension, x.level])));
  const track = key ? (await db.from('tracks').select('title_ar, title_en').eq('key', key).maybeSingle()).data : null;
  const cohort = (enr.data?.[0] as any)?.cohorts;
  const o: any = org.data;
  return {
    serial,
    name_ar: p.full_name,
    name_en: p.name_en || null,
    program_ar: cfg.program_ar,
    program_en: cfg.program_en,
    track_ar: track?.title_ar || null,
    track_en: track?.title_en || null,
    hours: cfg.hours || null,
    start: cohort?.starts_on || p.created_at,
    end: cohort?.ends_on || issuedAt,
    issued_at: issuedAt,
    org: o ? { name: o.name, name_en: o.name_en || null, logo: o.cert_cobrand && o.logo ? o.logo : null } : null,
    signatories: (cfg.signatories || []).slice(0, 1),
    verify_url: verifyUrl(serial),
  };
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
    .select('id, serial, status, issued_at, issued_by, revoked_at, revoked_by, revoke_reason, participant_id, name_ar:snapshot->>name_ar, name_en:snapshot->>name_en, org_name:snapshot->org->>name')
    .order('issued_at', { ascending: false }).limit(1000);
  if (b.status) q = q.eq('status', String(b.status));
  if (b.participant_id) q = q.eq('participant_id', String(b.participant_id));
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

// إعادة الإصدار لتصحيح الاسم أو البيانات: القديمة «استُبدلت» وتشير إلى الجديدة
export async function reissue(a: Actor, b: Body) {
  const reason = String(b.reason || '').trim().slice(0, 500);
  if (!reason) throw new Fail('سبب إعادة الإصدار مطلوب');
  const { data: old } = await db.from('certificates').select('id, status, participant_id').eq('id', String(b.id)).maybeSingle();
  if (!old || old.status !== 'valid') throw new Fail('تُعاد الشهادة السارية فقط', 409);
  const patch: Body = {};
  if (typeof b.name_ar === 'string' && b.name_ar.trim()) patch.full_name = b.name_ar.trim().slice(0, 120);
  if (typeof b.name_en === 'string') patch.name_en = b.name_en.trim().slice(0, 120) || null;
  if (Object.keys(patch).length) must(await db.from('participants').update(patch).eq('id', old.participant_id));
  must(await db.from('certificates').update({ status: 'replaced', revoked_at: new Date().toISOString(), revoked_by: a.email, revoke_reason: reason }).eq('id', old.id));
  const { data: p } = await db.from('participants').select('*').eq('id', old.participant_id).single();
  const fresh = await insertCertificate(p, a.email);
  if (fresh) await db.from('certificates').update({ replaced_by: fresh.id }).eq('id', old.id);
  await audit('admin', a.email, 'certificate.reissue', 'certificates', old.id, null, { reason, replaced_by: fresh?.id, ...patch });
  return { success: true, certificate: fresh };
}

export async function settingsGet() {
  return { success: true, settings: await settings() };
}

export async function settingsSave(a: Actor, b: Body) {
  const s = b.settings || {};
  const signatories = (Array.isArray(s.signatories) ? s.signatories : []).slice(0, 1).map((x: any) => {
    const name = String(x?.name || '').trim().slice(0, 120);
    const title = String(x?.title || '').trim().slice(0, 160);
    const image = typeof x?.image === 'string' && x.image.startsWith('data:image/png;base64,') && x.image.length <= 300000 ? x.image : null;
    if (!name) throw new Fail('اسم الموقّع مطلوب');
    return { name, title, ...(image ? { image } : {}) };
  });
  const hours = s.hours == null || s.hours === '' ? null : Math.round(Number(s.hours));
  if (hours != null && !(hours >= 1 && hours <= 2000)) throw new Fail('عدد الساعات بين 1 و2000');
  const row = {
    id: 1, enabled: s.enabled !== false,
    program_ar: String(s.program_ar || '').trim().slice(0, 200) || 'برنامج القادة',
    program_en: String(s.program_en || '').trim().slice(0, 200) || 'Leaders Program',
    hours, signatories, updated_by: a.email, updated_at: new Date().toISOString(),
  };
  must(await db.from('certificate_settings').upsert(row));
  await audit('admin', a.email, 'certificate.settings', 'certificate_settings', '1', null, { ...row, signatories: signatories.map((x: any) => x.name) });
  return { success: true, settings: row };
}
