// ════════════════════════════════════════════════════════════════
// مشاركة وثيقة المبادرة برابط خاص، وملاحظات من يفتحه
// ════════════════════════════════════════════════════════════════
// التصور: docs/content/2026-11-15-تصور-تصدير-المبادرة-ومشاركتها-v1.md. المنطق الخالص في share.js.
// للمشارك: capstone.shares · capstone.share-create · capstone.share-update · capstone.share-revoke · capstone.note-mark
// مفتوحة برابط: share.get · share.note
// الرمز لا يُحفظ (بصمته فقط)، ويُعرض لصاحبه مرة واحدة عند الإنشاء كرابط الراعي. غياب الجدولين قبل الترحيل لا يعطّل شيئًا.
import { audit, CONFIG, db, Fail, hash, mailButton, must, randomToken, sendMail } from './core.ts';
import { bdi, mailNote, mailShell, mailText, mailTitle } from '../_shared/mail.ts';
import { visibilityOfParticipant } from './visibility.ts';
import { cleanNote, cleanShareInput, MAX_ACTIVE_SHARES, NOTE_LIMITS, NOTIFY_EVERY_MS, ownerView, publicDoc, shareState } from './share.js';
import { shareDocFor } from './capstone.ts';
import { docTicket } from './pdf-ticket.ts';

type Body = Record<string, any>;
const DAY = 864e5;
const missing = (e: any) => /capstone_share|does not exist|42P01/i.test(String(e?.message || e?.code || e));
// قبل ترحيل show_readiness: العمود غائب، فلا يُكتب إلا إن طُلب تشغيله
const noReadinessCol = (e: any) => /show_readiness/i.test(String(e?.message || e));
// الرمز في ?t= كرابط الراعي: تقرؤه الصفحة مرة ثم تزيله من العنوان (link-token.js)
const urlOf = (token: string) => `${CONFIG.appUrl}/i?t=${encodeURIComponent(token)}`;

async function flags(participantId: string) {
  const vis: Record<string, boolean> = await visibilityOfParticipant(participantId).catch(() => ({}));
  return { share: vis.par_share !== false, notes: vis.par_share_notes !== false, readiness: vis.par_share_readiness !== false };
}

// ── صاحب الوثيقة ──
export async function list(p: any) {
  const f = await flags(p.id);
  const [s, n] = await Promise.all([
    db.from('capstone_shares').select('*').eq('participant_id', p.id).order('created_at', { ascending: false }).limit(50),
    db.from('capstone_share_notes').select('id, share_id, author_name, author_role, section_key, body, read_at, archived_at, created_at').eq('participant_id', p.id).order('created_at', { ascending: false }).limit(300),
  ]);
  if (s.error && missing(s.error)) return { success: true, ready: false, enabled: false, notes_enabled: false, shares: [], notes: [] };
  const rows = (must(s) as any[]) ?? [];
  const notes = ((n.data || []) as any[]);
  const label = Object.fromEntries(rows.map((r) => [r.id, r.label]));
  return {
    success: true, ready: true, enabled: f.share, notes_enabled: f.notes, readiness_enabled: f.readiness,
    shares: rows.map((r) => ownerView(r, notes)),
    notes: notes.filter((x) => !x.archived_at).map((x) => ({ ...x, share_label: label[x.share_id] || null })),
    archived: notes.filter((x) => x.archived_at).length,
  };
}

async function own(p: any, id: unknown) {
  const row = must(await db.from('capstone_shares').select('*').eq('id', String(id || '')).eq('participant_id', p.id).maybeSingle()) as any;
  if (!row) throw new Fail('الرابط غير موجود', 404);
  return row;
}

export async function create(p: any, b: Body) {
  const f = await flags(p.id);
  if (!f.share) throw new Fail('مشاركة الوثيقة برابط غير متاحة في دفعتك الآن', 403, 'visibility');
  let input: any;
  try { input = cleanShareInput(b); } catch (e: any) { throw new Fail(e.message); }
  if (!f.notes) input.allow_notes = false;
  if (!f.readiness) input.show_readiness = false;
  const now = Date.now();
  const { data: rows } = await db.from('capstone_shares').select('id, expires_at, revoked_at').eq('participant_id', p.id);
  if (((rows || []) as any[]).filter((r) => shareState(r, now) === 'active').length >= MAX_ACTIVE_SHARES) {
    throw new Fail(`لك ${MAX_ACTIVE_SHARES} روابط نشطة، وهذا الحد. ألغِ رابطًا لا تحتاجه ثم أنشئ الجديد`);
  }
  const token = randomToken();
  const base: Record<string, unknown> = {
    participant_id: p.id, token_hash: await hash(token), label: input.label, allow_notes: input.allow_notes, allow_download: input.allow_download,
    show_levels: input.show_levels, expires_at: new Date(now + input.days * DAY).toISOString(),
  };
  const res = await db.from('capstone_shares').insert(input.show_readiness ? { ...base, show_readiness: true } : base).select('*').single();
  if (res.error && noReadinessCol(res.error)) throw new Fail('إظهار الجاهزية في الرابط لم يُفعَّل بعد. أنشئ الرابط دونه', 409, 'not_migrated');
  const row = must(res) as any;
  await audit('participant', p.email, 'capstone.share-create', 'capstone_shares', row.id, null, { label: row.label, days: input.days, allow_notes: row.allow_notes, allow_download: row.allow_download, show_levels: row.show_levels });
  return { success: true, share: ownerView(row), url: urlOf(token) };
}

export async function update(p: any, b: Body) {
  const row = await own(p, b.id);
  if (shareState(row) !== 'active') throw new Fail('الرابط منتهٍ أو ملغى، فلا يُعدَّل. أنشئ رابطًا جديدًا');
  let patch: any;
  try { patch = cleanShareInput(b, { create: false }); } catch (e: any) { throw new Fail(e.message); }
  const f = await flags(p.id);
  if (patch.allow_notes && !f.notes) throw new Fail('ملاحظات القراء غير متاحة في دفعتك الآن', 403, 'visibility');
  if (patch.show_readiness && !f.readiness) throw new Fail('إظهار الجاهزية في الروابط غير متاح في دفعتك الآن', 403, 'visibility');
  if (patch.show_readiness === false && !row.show_readiness) delete patch.show_readiness;
  const res = await db.from('capstone_shares').update(patch).eq('id', row.id).select('*').single();
  if (res.error && noReadinessCol(res.error)) throw new Fail('إظهار الجاهزية في الرابط لم يُفعَّل بعد', 409, 'not_migrated');
  const next = must(res) as any;
  await audit('participant', p.email, 'capstone.share-update', 'capstone_shares', row.id, null, patch);
  return { success: true, share: ownerView(next) };
}

export async function revoke(p: any, b: Body) {
  const row = await own(p, b.id);
  if (!row.revoked_at) {
    must(await db.from('capstone_shares').update({ revoked_at: new Date().toISOString() }).eq('id', row.id));
    await audit('participant', p.email, 'capstone.share-revoke', 'capstone_shares', row.id, null, { label: row.label });
  }
  return { success: true };
}

// قراءة الملاحظة أو أرشفتها أو إعادتها: لصاحبها وحده
export async function noteMark(p: any, b: Body) {
  const id = String(b.id || '');
  const patch: Record<string, string | null> = {};
  if (b.read !== undefined) patch.read_at = b.read ? new Date().toISOString() : null;
  if (b.archived !== undefined) patch.archived_at = b.archived ? new Date().toISOString() : null;
  if (!Object.keys(patch).length) throw new Fail('لا تغيير');
  const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 300) : [id];
  must(await db.from('capstone_share_notes').update(patch).in('id', ids).eq('participant_id', p.id));
  return { success: true };
}

// ── من يفتح الرابط ──
async function fromToken(t: unknown) {
  const token = String(t || '');
  if (token.length < 20) throw new Fail('الرابط غير صالح', 400, 'invalid');
  const { data, error } = await db.from('capstone_shares').select('*, participants(*)').eq('token_hash', await hash(token)).maybeSingle();
  if (error && missing(error)) throw new Fail('الرابط غير صالح', 404, 'invalid');
  const row = must({ data, error }) as any;
  if (!row) throw new Fail('الرابط غير صالح، أو ألغاه قائد المبادرة', 404, 'invalid');
  const st = shareState(row);
  if (st === 'revoked') throw new Fail('ألغى قائد المبادرة هذا الرابط', 410, 'revoked');
  if (st === 'expired') throw new Fail('انتهت مدة هذا الرابط. اطلب من قائد المبادرة رابطًا جديدًا', 410, 'expired');
  const f = await flags(row.participant_id);
  if (!f.share) throw new Fail('المشاركة برابط موقوفة الآن', 410, 'paused');
  return { row, notesOk: f.notes && !!row.allow_notes, readinessOk: f.readiness };
}

export async function get(b: Body) {
  const { row, notesOk, readinessOk } = await fromToken(b.t);
  const p = row.participants;
  const doc = publicDoc(await shareDocFor(p), row, { readiness: readinessOk });
  // عدّ المشاهدات: مرة لكل فتح، وآخر وقت
  db.from('capstone_shares').update({ views: (row.views || 0) + 1, last_viewed_at: new Date().toISOString() }).eq('id', row.id).then(() => {}, () => {});
  return {
    success: true,
    owner: p.full_name, expires_at: row.expires_at, allow_notes: notesOk, allow_download: !!row.allow_download,
    sections: (doc?.sections || []).map((s: any) => ({ key: s.key, title: s.title })),
    doc,
    // تذكرة الملف المتجهي لقارئ الرابط حين يسمح صاحبه بالتحميل، مربوطة ببصمة ما يُعرض له
    pdf: row.allow_download ? await docTicket(`share-${row.id}`, doc) : null,
  };
}

export async function note(b: Body, ctx: any) {
  const { row, notesOk } = await fromToken(b.t);
  if (!notesOk) throw new Fail('قائد المبادرة لم يفتح الملاحظات في هذا الرابط', 403, 'closed');
  const doc = await shareDocFor(row.participants);
  let n: any;
  try { n = cleanNote(b, (doc?.sections || []).map((s: any) => s.key)); } catch (e: any) { throw new Fail(e.message); }
  const ipHash = ctx?.ip ? await hash(`share-note:${ctx.ip}`) : null;
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const [byIp, byShare] = await Promise.all([
    ipHash ? db.from('capstone_share_notes').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since(36e5)) : { count: 0 },
    db.from('capstone_share_notes').select('id', { count: 'exact', head: true }).eq('share_id', row.id).gte('created_at', since(DAY)),
  ]) as any[];
  if ((byIp.count ?? 0) >= NOTE_LIMITS.perIpHour || (byShare.count ?? 0) >= NOTE_LIMITS.perShareDay) throw new Fail('وصلت ملاحظات كثيرة في وقت قصير، حاول بعد قليل', 429, 'rate');
  must(await db.from('capstone_share_notes').insert({ ...n, share_id: row.id, participant_id: row.participant_id, ip_hash: ipHash }));
  await audit('system', null, 'capstone.share-note', 'capstone_shares', row.id, null, { section: n.section_key });
  // تنبيه صاحب الوثيقة بالبريد، مرة كل ساعة على الأكثر لكل رابط
  const now = Date.now();
  if (!row.notified_at || now - new Date(row.notified_at).getTime() > NOTIFY_EVERY_MS) {
    await db.from('capstone_shares').update({ notified_at: new Date(now).toISOString() }).eq('id', row.id);
    const p = row.participants;
    sendMail(p.email, 'ملاحظة جديدة على وثيقة مبادرتك', noteMail(p.full_name, n.author_name, row.label), [], { category: 'journey', purpose: 'capstone-share-note' }).catch((e) => console.error(e));
  }
  return { success: true };
}

function noteMail(owner: string, author: string, label: string) {
  return mailShell(mailTitle`ملاحظة جديدة على وثيقة مبادرتك`,
    mailText(`أهلًا ${bdi(owner)}، كتب ${bdi(author)} ملاحظة على وثيقة مبادرتك من الرابط الذي سمّيته «${bdi(label)}».`)
    + mailText('الملاحظات لك وحدك. تقرؤها في صفحة مبادرتك، في «المشاركة والملاحظات».')
    + mailButton(`${CONFIG.appUrl}/?tab=capstone`, 'اقرأ الملاحظة')
    + mailNote('يصلك هذا التنبيه مرة في الساعة على الأكثر لكل رابط، مهما كثرت الملاحظات.'),
    { family: 'capstone', preheader: `${author} كتب ملاحظة على وثيقة مبادرتك`, footnote: '' });
}
