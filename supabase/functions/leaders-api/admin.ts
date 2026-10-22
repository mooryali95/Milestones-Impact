// ════════════════════════════════════════════════════════════════
// إجراءات الإدارة لوحدة القادة
// ════════════════════════════════════════════════════════════════
// الدخول هو نفسه دخول لوحة الإدارة: نفس توكن admin-api، يُتحقق منه في
// جدول public.api_sessions بنفس الهاش (sha256 بلا ملح) الذي تكتبه admin-api.
import { approvedMail, audit, BUCKET, db, Fail, must, publicDb, sendMail, storage } from './core.ts';
import { DEFAULT_MODEL, DIMENSIONS, evaluatePlacement, filterHandbookMd, handbookModulesFor, LEVELS, trackKey } from './logic.js';
import { mePayload } from './participant.ts';

type Body = Record<string, any>;
export type Admin = { email: string; role: 'super_admin' | 'admin' | 'viewer' };

async function sha256hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function adminFromToken(token: unknown): Promise<Admin> {
  if (typeof token !== 'string' || token.length < 32) throw new Fail('جلسة الإدارة منتهية', 401, 'session');
  const { data } = await publicDb.from('api_sessions').select('meta, expires_at')
    .eq('token_hash', await sha256hex(token)).eq('kind', 'admin').limit(1);
  const s = data?.[0];
  if (!s || new Date(s.expires_at).getTime() < Date.now()) throw new Fail('جلسة الإدارة منتهية', 401, 'session');
  return { email: String(s.meta?.email || ''), role: s.meta?.role };
}

const canWrite = (a: Admin) => a.role === 'admin' || a.role === 'super_admin';
function requireWrite(a: Admin) {
  if (!canWrite(a)) throw new Fail('صلاحيتك للعرض فقط', 403, 'forbidden');
}

// ── نظرة عامة ──
export async function overview() {
  const { data } = await db.from('participants').select('status');
  const byStatus: Record<string, number> = {};
  for (const r of data || []) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  const { count: pendingReviews } = await db.from('participant_requirements')
    .select('participant_id', { count: 'exact', head: true }).eq('status', 'submitted');
  const { data: grid } = await db.from('placements').select('dimension, level');
  const matrix: Record<string, Record<string, number>> = {};
  for (const d of DIMENSIONS) matrix[d] = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const p of grid || []) matrix[p.dimension][p.level]++;
  return { success: true, total: (data || []).length, by_status: byStatus, pending_reviews: pendingReviews ?? 0, matrix };
}

// ── المشاركون ──
export async function participants(b: Body) {
  let q = db.from('participants')
    .select('id, full_name, email, phone, job_title, organization_name, status, created_at, last_login_at, placements(dimension, level, approved_at)')
    .order('created_at', { ascending: false }).limit(500);
  if (b.status) q = q.eq('status', String(b.status));
  if (b.search) {
    const s = String(b.search).replace(/[%,()]/g, ' ').trim();
    if (s) q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,organization_name.ilike.%${s}%`);
  }
  return { success: true, participants: must(await q) };
}

export async function participant(b: Body) {
  const p = must(await db.from('participants').select('*').eq('id', String(b.id)).maybeSingle());
  if (!p) throw new Fail('المشارك غير موجود', 404);
  const [results, reqs, views, audits] = await Promise.all([
    db.from('assessments').select('id, status, started_at, submitted_at, instruments(key, kind), assessment_results(*)')
      .eq('participant_id', p.id).order('started_at', { ascending: false }),
    db.from('participant_requirements').select('*, stage_requirements(code, title_ar, stage_key, kind)').eq('participant_id', p.id),
    db.from('handbook_views').select('viewed_at').eq('participant_id', p.id).order('viewed_at', { ascending: false }).limit(1),
    db.from('audit_log').select('*').eq('entity_id', p.id).order('created_at', { ascending: false }).limit(30),
  ]);
  const [state, { data: model }] = await Promise.all([
    mePayload(p, 'admin'),
    db.from('placement_model').select('*').eq('id', 1).maybeSingle(),
  ]);
  // تقييم كل نتيجة بالنموذج الحالي: المؤشر المركّب، والمستوى المقترح وسببه،
  // وهل الحالة حدّية. يُحسب عند العرض فيصلح للنتائج القديمة أيضًا.
  const assessments = (results.data || []).map((a: any) => ({
    ...a,
    assessment_results: (a.assessment_results || []).map((r: any) => ({
      ...r,
      evaluation: evaluatePlacement({ knowledge: r.knowledge_pct, skill: r.skill_pct, behavior: r.behavior_pct }, model || DEFAULT_MODEL),
    })),
  }));
  let cvUrl = null;
  if (p.cv_path) cvUrl = (await storage.from(BUCKET).createSignedUrl(p.cv_path, 600)).data?.signedUrl || null;
  return {
    success: true, participant: p, cv_url: cvUrl, profile: state.profile, journey: state.journey, progress: state.progress,
    assessments, requirements: reqs.data || [], last_view: views.data?.[0]?.viewed_at || null,
    history: audits.data || [],
  };
}

// قائمة المراجعة: كل ما أرسله المشاركون وينتظر قرار المستشار
export async function reviews() {
  const rows = must(await db.from('participant_requirements')
    .select('participant_id, requirement_id, status, evidence_path, note, completed_at, participants(full_name, email), stage_requirements(code, title_ar, stage_key, kind)')
    .eq('status', 'submitted').limit(200)) ?? [];
  const { data: waiting } = await db.from('participants').select('id, full_name, email, organization_name, updated_at')
    .eq('status', 'pending_approval').order('updated_at', { ascending: true }).limit(200);
  return { success: true, submitted: rows, pending_approval: waiting || [] };
}

export async function evidenceUrl(b: Body) {
  const path = String(b.path || '');
  const { data } = await storage.from(BUCKET).createSignedUrl(path, 600);
  if (!data) throw new Fail('الملف غير موجود', 404);
  return { success: true, url: data.signedUrl };
}

// اعتماد المستوى: يعتمد الثلاثة دفعة واحدة، مع إمكان تعديل أي منها
export async function approve(a: Admin, b: Body) {
  requireWrite(a);
  const id = String(b.participant_id);
  const p = must(await db.from('participants').select('*').eq('id', id).maybeSingle());
  if (!p) throw new Fail('المشارك غير موجود', 404);
  const before = must(await db.from('placements').select('*').eq('participant_id', id)) ?? [];
  const levels: Record<string, string> = b.levels || {};
  const now = new Date().toISOString();
  const rows = DIMENSIONS.map((d) => {
    const old = before.find((x: any) => x.dimension === d);
    const level = levels[d] || old?.level;
    if (!LEVELS.includes(level)) throw new Fail('حدّد مستوى كل بُعد');
    const changed = old && old.level !== level;
    return {
      participant_id: id, dimension: d, level, source: changed || !old ? 'admin' : old.source,
      assessment_id: old?.assessment_id || null, decided_by: changed ? a.email : old?.decided_by || null,
      decided_at: changed ? now : old?.decided_at || now, approved_at: now, approved_by: a.email,
      admin_note: b.notes?.[d] ? String(b.notes[d]).slice(0, 500) : old?.admin_note || null,
    };
  });
  must(await db.from('placements').upsert(rows));
  await db.from('participants').update({ status: 'placed' }).eq('id', id);
  await audit('admin', a.email, 'placement.approve', 'participants', id, before, rows);
  sendMail(p.email, 'اعتُمد مستواك في برنامج القادة', approvedMail(p.full_name)).catch((e) => console.error(e));
  return { success: true };
}

export async function setStatus(a: Admin, b: Body) {
  requireWrite(a);
  const allowed = ['registered', 'profiled', 'assessing', 'pending_approval', 'placed', 'enrolled', 'completed', 'withdrawn', 'suspended'];
  if (!allowed.includes(b.status)) throw new Fail('حالة غير صالحة');
  must(await db.from('participants').update({ status: b.status }).eq('id', String(b.participant_id)));
  await audit('admin', a.email, 'participant.status', 'participants', String(b.participant_id), null, { status: b.status });
  return { success: true };
}

// إعادة القياس: يُلغى القياس الحالي ويُفتح جديد، والمستوى المعتمد يبقى حتى يُعتمد غيره
export async function resetAssessment(a: Admin, b: Body) {
  requireWrite(a);
  const id = String(b.participant_id);
  await db.from('assessments').update({ status: 'void' }).eq('participant_id', id).neq('status', 'void');
  await db.from('placements').delete().eq('participant_id', id).is('approved_at', null);
  await db.from('participants').update({ status: 'profiled' }).eq('id', id);
  await audit('admin', a.email, 'assessment.reset', 'participants', id);
  return { success: true };
}

// مراجعة متطلب أرسله المشارك (سجل معالم، خطة تطوير…) أو تسجيل جلسة
export async function reviewRequirement(a: Admin, b: Body) {
  requireWrite(a);
  const status = b.status === 'done' ? 'done' : b.status === 'returned' ? 'returned' : b.status === 'pending' ? 'pending' : null;
  if (!status) throw new Fail('حالة غير صالحة');
  const now = new Date().toISOString();
  must(await db.from('participant_requirements').upsert({
    participant_id: String(b.participant_id), requirement_id: String(b.requirement_id), status,
    note: b.note ? String(b.note).slice(0, 1000) : null, reviewed_by: a.email, reviewed_at: now,
    completed_at: status === 'done' ? now : null,
  }));
  await audit('admin', a.email, 'requirement.review', 'participants', String(b.participant_id), null, { requirement: b.requirement_id, status });
  return { success: true };
}

// ── الإعدادات القابلة للتحرير: كل ما يشكّل المنهجية ──
// قائمة بيضاء بالجداول وحقولها، فلا يكتب أحد في جدول أو عمود غير مقصود.
const ENTITIES: Record<string, { table: string; key: string[]; fields: string[]; sortable?: boolean }> = {
  grid_cells:         { table: 'grid_cells', key: ['dimension', 'level'], fields: ['description_ar', 'path_title_ar'] },
  placement_model:    { table: 'placement_model', key: ['id'],
                        fields: ['w_knowledge', 'w_skill', 'w_behavior', 'min_intermediate', 'min_advanced', 'floor_intermediate', 'floor_advanced', 'borderline'] },
  level_rules:        { table: 'level_rules', key: ['dimension', 'level'], fields: ['min_knowledge', 'min_skill', 'min_behavior'] },
  journey_stages:     { table: 'journey_stages', key: ['key'], sortable: true,
                        fields: ['title_ar', 'duration_label', 'duration_days', 'description_ar', 'activities_ar', 'outcome_ar', 'phase', 'active', 'sort',
                                 'mode', 'mode_note_ar', 'builds_on_ar'] },
  stage_requirements: { table: 'stage_requirements', key: ['id'], sortable: true,
                        fields: ['stage_key', 'dimension', 'level', 'code', 'title_ar', 'help_ar', 'kind', 'required', 'needs_review', 'active', 'sort'] },
  questions:          { table: 'questions', key: ['id'], sortable: true,
                        fields: ['instrument_id', 'dimension', 'code', 'tier', 'text_ar', 'help_ar', 'kind', 'options', 'weight', 'active', 'sort'] },
  handbook_modules:   { table: 'handbook_modules', key: ['id'], sortable: true,
                        fields: ['dimension', 'chapter_key', 'title_ar', 'min_level', 'body_md', 'sort'] },
  tracks:             { table: 'tracks', key: ['key'], sortable: true,
                        fields: ['title_ar', 'summary_ar', 'focus_ar', 'project_ar', 'journey_ar', 'priority_dimension'] },
  instruments:        { table: 'instruments', key: ['id'], fields: ['title_ar', 'intro_ar', 'est_minutes', 'active'] },
  dimensions:         { table: 'dimensions', key: ['key'], fields: ['title_ar', 'title_en'] },
  levels:             { table: 'levels', key: ['key'], fields: ['title_ar', 'title_en'] },
};

// ── المسارات الـ27 ──
// مسار كل مشارك من مستوياته الحالية. "مفعّل" = اعتُمدت مستوياته الثلاثة.
async function placementsByParticipant() {
  const { data } = await db.from('placements').select('participant_id, dimension, level, approved_at');
  const byP: Record<string, { levels: Record<string, string>; approved: number }> = {};
  for (const r of data || []) {
    const x = (byP[r.participant_id] ||= { levels: {}, approved: 0 });
    x.levels[r.dimension] = r.level;
    if (r.approved_at) x.approved++;
  }
  return byP;
}

async function trackStats() {
  const [byP, { data: ps }] = await Promise.all([placementsByParticipant(), db.from('participants').select('id, status')]);
  const status = Object.fromEntries((ps || []).map((p: any) => [p.id, p.status]));
  const out: Record<string, { total: number; active: number; pending: number; completed: number }> = {};
  for (const [id, x] of Object.entries(byP)) {
    const k = trackKey(x.levels);
    if (!k) continue;
    const t = (out[k] ||= { total: 0, active: 0, pending: 0, completed: 0 });
    t.total++;
    if (status[id] === 'completed') t.completed++;
    else if (x.approved === 3) t.active++;
    else t.pending++;
  }
  return out;
}

// تفصيل مسار: هويته، ومشاركوه، وكتيبه كما يراه المشارك بابًا بابًا
export async function track(b: Body) {
  const key = String(b.key || '');
  if (!/^M[1-3]I[1-3]L[1-3]$/.test(key)) throw new Fail('رمز مسار غير صالح');
  const levels = Object.fromEntries(DIMENSIONS.map((d, i) => [d, LEVELS[Number(key[i * 2 + 1]) - 1]]));
  const [t, byP, mods] = await Promise.all([
    db.from('tracks').select('*').eq('key', key).maybeSingle(),
    placementsByParticipant(),
    db.from('handbook_modules').select('*'),
  ]);
  const ids = Object.entries(byP).filter(([, x]) => trackKey(x.levels) === key).map(([id, x]) => ({ id, approved: x.approved === 3 }));
  const { data: ps } = ids.length
    ? await db.from('participants').select('id, full_name, email, organization_name, status').in('id', ids.map((x) => x.id))
    : { data: [] };
  const approved = new Set(ids.filter((x) => x.approved).map((x) => x.id));
  return {
    success: true, track: t.data || { key }, levels,
    participants: (ps || []).map((p: any) => ({ ...p, approved: approved.has(p.id) })),
    handbook: handbookModulesFor(mods.data || [], levels).map((m: any) => ({
      id: m.id, dimension: m.dimension, title: m.title_ar, min_level: m.min_level,
      md: filterHandbookMd(m.body_md, levels[m.dimension]),
    })),
  };
}

export async function catalog() {
  const names = Object.keys(ENTITIES);
  const res = await Promise.all(names.map((n) => {
    const e = ENTITIES[n];
    const q = db.from(e.table).select('*');
    return e.sortable ? q.order('sort') : q;
  }));
  const out: Body = { success: true };
  names.forEach((n, i) => { out[n] = res[i].data || []; });
  // أي أداة لها إجابات مُرسلة؟ تعديل أسئلتها يتطلب إصدارًا جديدًا
  const { data: used } = await db.from('assessments').select('instrument_id').eq('status', 'submitted');
  out.locked_instruments = [...new Set((used || []).map((u: any) => u.instrument_id))];
  out.track_stats = await trackStats();
  return out;
}

async function instrumentLocked(instrumentId: string) {
  const { count } = await db.from('assessments').select('id', { count: 'exact', head: true })
    .eq('instrument_id', instrumentId).eq('status', 'submitted');
  return (count ?? 0) > 0;
}

// تغيير الدرجات أو الخيارات أو الحذف في أداة استُخدمت يُفسد نتائج من سبق.
// تعديل الصياغة والترتيب مسموح، وما عداه يحتاج إصدارًا جديدًا.
const SAFE_QUESTION_FIELDS = new Set(['text_ar', 'help_ar', 'sort']);

export async function save(a: Admin, b: Body) {
  requireWrite(a);
  const e = ENTITIES[b.entity];
  if (!e) throw new Fail('نوع غير معروف');
  const row: Body = {};
  for (const f of e.fields) if (b.row && f in b.row) row[f] = b.row[f];
  const isNew = e.key.some((k) => !b.row?.[k]) && e.key[0] === 'id';

  if (b.entity === 'questions') {
    if (row.options && (!Array.isArray(row.options) || row.options.length < 2
      || row.options.some((o: any) => !o?.label || !Number.isFinite(Number(o.score))))) {
      throw new Fail('كل سؤال يحتاج خيارين على الأقل، لكل منهما نص ودرجة');
    }
    const instrumentId = row.instrument_id || (isNew ? null : (await db.from('questions').select('instrument_id').eq('id', b.row.id).single()).data?.instrument_id);
    if (instrumentId && await instrumentLocked(instrumentId)) {
      const unsafe = isNew || Object.keys(row).some((k) => !SAFE_QUESTION_FIELDS.has(k));
      if (unsafe) throw new Fail('هذه الأداة لها نتائج سابقة. أنشئ إصدارًا جديدًا لتعديل الخيارات أو الدرجات أو إضافة أسئلة', 409, 'locked');
    }
  }

  let saved;
  if (isNew) {
    saved = must(await db.from(e.table).insert(row).select('*').single(), 'تعذّر الحفظ، تأكد من عدم تكرار الرمز');
  } else {
    let q = db.from(e.table).update(row);
    for (const k of e.key) q = q.eq(k, b.row[k]);
    saved = must(await q.select('*').single(), 'تعذّر الحفظ');
  }
  await audit('admin', a.email, `${b.entity}.save`, b.entity, e.key.map((k) => saved[k]).join(':'), null, row);
  return { success: true, row: saved };
}

export async function remove(a: Admin, b: Body) {
  requireWrite(a);
  const e = ENTITIES[b.entity];
  if (!e || e.key[0] !== 'id') throw new Fail('لا يمكن حذف هذا النوع، عطّله بدل حذفه');
  if (b.entity === 'questions') {
    const q = (await db.from('questions').select('instrument_id').eq('id', b.id).single()).data;
    if (q && await instrumentLocked(q.instrument_id)) throw new Fail('لا يُحذف سؤال له إجابات سابقة، عطّله بدل ذلك', 409, 'locked');
  }
  const { error } = await db.from(e.table).delete().eq('id', b.id);
  if (error) throw new Fail('لا يمكن حذفه لارتباطه ببيانات مشاركين، عطّله بدل ذلك', 409);
  await audit('admin', a.email, `${b.entity}.delete`, b.entity, String(b.id));
  return { success: true };
}

export async function reorder(a: Admin, b: Body) {
  requireWrite(a);
  const e = ENTITIES[b.entity];
  if (!e?.sortable || !Array.isArray(b.ids)) throw new Fail('ترتيب غير صالح');
  await Promise.all(b.ids.map((id: string, i: number) => db.from(e.table).update({ sort: i + 1 }).eq(e.key[0], id)));
  await audit('admin', a.email, `${b.entity}.reorder`, b.entity, null, null, b.ids);
  return { success: true };
}

// إصدار جديد من أداة القياس: نسخة كاملة من الأسئلة تصبح هي الفعالة
export async function cloneInstrument(a: Admin, b: Body) {
  requireWrite(a);
  const src = must(await db.from('instruments').select('*').eq('id', String(b.id)).single());
  const base = src.key.replace(/-v\d+$/, '');
  const version = (src.version || 1) + 1;
  const copy = must(await db.from('instruments').insert({
    key: `${base}-v${version}`, title_ar: src.title_ar, kind: src.kind, intro_ar: src.intro_ar,
    est_minutes: src.est_minutes, version, active: false,
  }).select('*').single(), 'يوجد إصدار بهذا الرقم');
  const qs = must(await db.from('questions').select('*').eq('instrument_id', src.id)) ?? [];
  if (qs.length) {
    must(await db.from('questions').insert(qs.map(({ id: _id, instrument_id: _i, ...q }: any) => ({ ...q, instrument_id: copy.id }))));
  }
  await audit('admin', a.email, 'instrument.clone', 'instruments', copy.id, null, { from: src.key });
  return { success: true, instrument: copy };
}

export async function activateInstrument(a: Admin, b: Body) {
  requireWrite(a);
  const inst = must(await db.from('instruments').select('*').eq('id', String(b.id)).single());
  await db.from('instruments').update({ active: false }).eq('kind', inst.kind).neq('id', inst.id);
  await db.from('instruments').update({ active: true }).eq('id', inst.id);
  await audit('admin', a.email, 'instrument.activate', 'instruments', inst.id);
  return { success: true };
}

// إضافة مشارك يدويًا (ترشيح جهة، أو تحويل طلب تواصل)
export async function createParticipant(a: Admin, b: Body) {
  requireWrite(a);
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Fail('البريد غير صحيح');
  const name = String(b.full_name || '').trim();
  if (name.length < 3) throw new Fail('الاسم مطلوب');
  const row = must(await db.from('participants').insert({
    email, full_name: name.slice(0, 120), organization_name: b.organization_name || null, job_title: b.job_title || null,
    source: b.contact_request_id ? 'contact' : 'admin', contact_request_id: b.contact_request_id ? String(b.contact_request_id) : null,
  }).select('*').single(), 'هذا البريد مسجل من قبل');
  await audit('admin', a.email, 'participant.create', 'participants', row.id, null, row);
  return { success: true, participant: row };
}
