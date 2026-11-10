// ════════════════════════════════════════════════════════════════
// البرامج (القوالب) ونسخها، والدفعات
// ════════════════════════════════════════════════════════════════
// البرنامج: المراحل والمتطلبات وإعداد كل نشاط، يُبنى مرة ويُحفظ بنسخ.
// الدفعة: جهة + برنامج + نسخة مثبتة (أو آخر تعديل) + تواريخ + طريقة التنفيذ.
// رحلة المشارك تُبنى من دفعته، فكل ما يقرأ متطلبًا للمشارك يمر من هنا.
import { audit, db, Fail, must } from './core.ts';
import { cleanSupervision, cleanRubricScores, autoGroups, cleanGroupSettings, cleanTeamIds, cleanStageModes, contentLevels, cleanDelivery, cleanMilestone, cleanSchedule, distributeSchedule, cohortDefinition, pickCohort, programDiff, programSnapshot, renderJourney, restorePlan } from './logic.js';
import { READY_MIN } from './capstone.js';
import type { Actor, Admin } from './admin.ts';
import { cleanProfile } from './certificates.ts';

type Body = Record<string, any>;

// كل الأعمدة لا قائمة صريحة: عمود مضاف في ترحيل لم يُطبَّق بعد (مثل supervision) كان يُفشل القراءة كلها (42703)
// فيفقد كل مشارك دفعته وتختفي الدفعات من اللوحة حتى يُطبَّق الترحيل. الأعمدة الغائبة تُقرأ undefined وتُعامل كافتراضي.
const COHORT_COLS = '*';
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/.test(String(v || ''));

let defaultId: string | null = null;
export async function defaultProgramId() {
  if (defaultId) return defaultId;
  const { data } = await db.from('programs').select('id').eq('is_default', true).maybeSingle();
  if (!data) throw new Fail('لا يوجد برنامج افتراضي', 500);
  defaultId = data.id;
  return defaultId as string;
}

async function liveRows(programId: string) {
  const [st, rq] = await Promise.all([
    db.from('journey_stages').select('*').eq('program_id', programId).order('sort'),
    db.from('stage_requirements').select('*').eq('program_id', programId).order('sort'),
  ]);
  return { stages: must(st) ?? [], requirements: must(rq) ?? [] };
}

// ── للمشارك ──
// strict: خطأ القراءة يرمي بدل أن يُقرأ «بلا دفعة» (ختم الإصدار D02 لا يسقط بصمت)
export async function cohortOf(p: { id?: string | null; organization_id?: string | null }, { strict = false } = {}) {
  const [enr, cohorts] = await Promise.all([
    p.id ? db.from('enrollments').select('cohort_id, status, created_at').eq('participant_id', p.id) : Promise.resolve({ data: [] as any[], error: null }),
    db.from('cohorts').select(COHORT_COLS),
  ]);
  if (strict) { must(enr); must(cohorts); }
  return pickCohort({ enrollments: enr.data || [], cohorts: cohorts.data || [], organizationId: (p.organization_id || null) as any });
}

// إصدار محتوى دفعة المشارك (D02): رقمه، وأبواب الكتيب فيه لحساب بند القراءة على إصدار الدفعة.
// null لدفعة لم يُقطع إصدارها وحدها، فيُحسب كل شيء على المحتوى الحي؛ وخطأ القراءة يرمي
export async function releaseOf(p: { id?: string | null; organization_id?: string | null }) {
  const { cohort } = await cohortOf(p, { strict: true });
  const id = (cohort as any)?.content_release || null;
  if (!id) return null;
  const data = must(await db.from('content_releases').select('id, manifest').eq('id', id).maybeSingle());
  const items = (data as any)?.manifest?.areas?.handbook_modules?.items;
  return { id, modules: items ? Object.values(items).map((x: any) => x.id).filter(Boolean) as string[] : null };
}

// تعريف رحلة المشارك: المراحل والمتطلبات كما تسري عليه بعد تخصيص دفعته
export async function journeyDefinition(p: { id?: string | null; organization_id?: string | null }) {
  const { cohort, via } = await cohortOf(p);
  const programId = cohort?.program_id || await defaultProgramId();
  let version: any = null;
  if (cohort?.program_version_id) {
    version = (await db.from('program_versions').select('id, number, label, data').eq('id', cohort.program_version_id).maybeSingle()).data;
  }
  const live = version ? null : await liveRows(programId);
  const def = cohortDefinition({ live, version, cohort });
  // بنود أخفتها الدفعة: تختفي من رحلة أعضائها فورًا، ولا يُحذف ما أُنجز منها
  const hidden = new Set(((cohort as any)?.hidden_requirements || []) as string[]);
  if (hidden.size) def.requirements = def.requirements.filter((r: any) => !hidden.has(r.code));
  if (version) {
    // توفر الموجّه للاتصال الفوري حالة تشغيلية لا جزء من النسخة؛ تُقرأ من البرنامج الحالي
    const ids = def.requirements.filter((r: any) => r.kind === 'coaching').map((r: any) => r.id);
    if (ids.length) {
      const { data } = await db.from('stage_requirements').select('id, config').in('id', ids);
      const until = new Map((data || []).map((r: any) => [r.id, r.config?.instant_until || null]));
      def.requirements = def.requirements.map((r: any) => until.get(r.id) ? { ...r, config: { ...r.config, instant_until: until.get(r.id) } } : r);
    }
  }
  // نصوص المراحل تُملأ رموزها من إعدادات المتطلبات، فلا يُكتب رقم في وصف
  const inst = (await db.from('instruments').select('est_minutes').eq('kind', 'baseline').eq('active', true).limit(1).maybeSingle()).data;
  const rendered = renderJourney(def, { readyMin: READY_MIN, assessmentMinutes: inst?.est_minutes || null });
  return {
    ...rendered, via, program_id: programId,
    cohort: cohort ? { id: cohort.id, name: cohort.name, is_default: !!cohort.is_default, starts_on: cohort.starts_on, ends_on: cohort.ends_on, schedule: cohort.schedule || {},
      level_mode: cohort.level_mode || 'mixed', content_level: cohort.content_level || null, stage_modes: cohort.stage_modes || {}, project_mode: cohort.project_mode || 'individual' } : null,
    milestones: ((await db.from('program_milestones').select('*').eq('program_id', programId).eq('active', true).order('sort')).data || []),
    version: version ? { id: version.id, number: version.number, label: version.label } : null,
  };
}

// متطلب من رحلة المشارك نفسها، بإعداد دفعته
export async function requirementFor(p: any, id: unknown, kind?: string) {
  const def = await journeyDefinition(p);
  const r = def.requirements.find((x: any) => x.id === String(id || ''));
  if (!r || (kind && r.kind !== kind)) throw new Fail('النشاط غير موجود', 404);
  return { r, def };
}

// معرف متطلب برمزه في برنامج المشارك (E-MGR، E-CASE...)
export async function requirementIdByCode(p: any, code: string) {
  const def = await journeyDefinition(p);
  return def.requirements.find((x: any) => x.code === code)?.id || null;
}

// ── للإدارة ──
export async function list() {
  const [programs, versions, cohorts, enr, orgs, reqs] = await Promise.all([
    db.from('programs').select('*').order('created_at'),
    db.from('program_versions').select('id, program_id, number, label, created_by, created_at').order('number', { ascending: false }),
    db.from('cohorts').select(COHORT_COLS).order('created_at', { ascending: false }),
    db.from('enrollments').select('cohort_id, status'),
    db.from('organizations').select('id, name, short_name, delivery_default, invite_code, status').order('name'),
    db.from('stage_requirements').select('program_id, kind, active'),
  ]);
  // فريق خبراء كل دفعة؛ الجدول قد لا يكون مطبّقًا بعد فيُعد الفريق فارغًا
  const teamRows = await db.from('cohort_experts').select('cohort_id, expert_id');
  const teams: Record<string, string[]> = {};
  for (const t of teamRows.data || []) (teams[t.cohort_id] ||= []).push(t.expert_id);
  const count = (rows: any[], f: (r: any) => boolean) => rows.filter(f).length;
  const enrolled: Record<string, number> = {};
  for (const e of enr.data || []) if (e.status !== 'withdrawn') enrolled[e.cohort_id] = (enrolled[e.cohort_id] || 0) + 1;
  return {
    success: true,
    programs: (programs.data || []).map((pr: any) => ({
      ...pr,
      requirements: count(reqs.data || [], (r) => r.program_id === pr.id && r.active !== false),
      versions: (versions.data || []).filter((v: any) => v.program_id === pr.id),
    })),
    cohorts: (cohorts.data || []).map((c: any) => ({ ...c, enrolled: enrolled[c.id] || 0, team_expert_ids: teams[c.id] || [], team_ready: !teamRows.error })),
    organizations: orgs.data || [],
    // هل فريق خبراء الدفعة جاهز (الدالة منشورة والجدول مطبّق)؟ اللوحة لا تعرض حقله قبل ذلك حتى لا يُحفظ فريق يُتجاهل
    team_ready: !teamRows.error,
  };
}

export async function program(b: Body) {
  const id = isUuid(b.id) ? String(b.id) : await defaultProgramId();
  const pr = must(await db.from('programs').select('*').eq('id', id).maybeSingle());
  if (!pr) throw new Fail('البرنامج غير موجود', 404);
  const live = await liveRows(id);
  const { data: last } = await db.from('program_versions').select('id, number, label, data').eq('program_id', id).order('number', { ascending: false }).limit(1);
  const latest = last?.[0] || null;
  return {
    success: true, program: pr, ...live,
    latest: latest ? { id: latest.id, number: latest.number, label: latest.label } : null,
    // ما تغيّر في المسودة منذ آخر نسخة محفوظة
    unsaved: latest ? programDiff(latest.data, programSnapshot(live.stages, live.requirements)) : null,
  };
}

// برنامج جديد: نسخة من برنامج قائم (الافتراضي إن لم يُحدَّد) أو من نسخة محفوظة منه
export async function programSave(a: Admin, b: Body) {
  const name = String(b.name || '').trim().slice(0, 120);
  const description_ar = b.description_ar == null ? undefined : String(b.description_ar).trim().slice(0, 2000) || null;
  if (isUuid(b.id)) {
    const patch: Body = { updated_at: new Date().toISOString() };
    if (name) patch.name = name;
    if (description_ar !== undefined) patch.description_ar = description_ar;
    // شهادة البرنامج: ما يختلف عن الإعداد العام فقط
    if (b.cert && typeof b.cert === 'object') patch.cert = cleanProfile(b.cert, true);
    const row = must(await db.from('programs').update(patch).eq('id', b.id).select('*').single());
    await audit('admin', a.email, 'program.save', 'programs', row.id, null, { ...patch, ...(patch.cert?.signatory ? { cert: { ...patch.cert, signatory: patch.cert.signatory.name } } : {}) });
    return { success: true, program: row };
  }
  if (!name) throw new Fail('اسم البرنامج مطلوب');
  let source: { stages: any[]; requirements: any[] };
  if (isUuid(b.from_version)) {
    const v = must(await db.from('program_versions').select('data').eq('id', b.from_version).maybeSingle());
    if (!v) throw new Fail('النسخة غير موجودة', 404);
    source = v.data;
  } else {
    source = await liveRows(isUuid(b.from) ? String(b.from) : await defaultProgramId());
  }
  const base = isUuid(b.from) ? (await db.from('programs').select('cert').eq('id', b.from).maybeSingle()).data : null;
  const pr = must(await db.from('programs').insert({ name, description_ar: description_ar ?? null, cert: base?.cert || {}, created_by: a.email }).select('*').single());
  const strip = ({ program_id: _p, created_at: _c, updated_at: _u, ...r }: any) => r;
  if (source.stages.length) must(await db.from('journey_stages').insert(source.stages.map((s) => ({ ...strip(s), program_id: pr.id }))));
  if (source.requirements.length) {
    must(await db.from('stage_requirements').insert(source.requirements.map((r) => {
      const { id: _id, ...rest } = strip(r);
      return { ...rest, program_id: pr.id };
    })));
  }
  await audit('admin', a.email, 'program.create', 'programs', pr.id, null, { from: b.from || null, from_version: b.from_version || null });
  return { success: true, program: pr };
}

export async function programArchive(a: Admin, b: Body) {
  const pr = must(await db.from('programs').select('*').eq('id', String(b.id || '')).maybeSingle());
  if (!pr) throw new Fail('البرنامج غير موجود', 404);
  const archive = b.archive !== false;
  if (archive && pr.is_default) throw new Fail('البرنامج الافتراضي لا يُؤرشف');
  if (archive) {
    const { count } = await db.from('cohorts').select('id', { count: 'exact', head: true }).eq('program_id', pr.id).neq('status', 'closed');
    if (count) throw new Fail(`للبرنامج ${count} دفعة غير مغلقة؛ أغلقها أو انقلها أولًا`, 409);
  }
  must(await db.from('programs').update({ archived_at: archive ? new Date().toISOString() : null }).eq('id', pr.id));
  await audit('admin', a.email, archive ? 'program.archive' : 'program.unarchive', 'programs', pr.id);
  return { success: true };
}

async function snapshotVersion(a: Admin, programId: string, label: string): Promise<any> {
  const live = await liveRows(programId);
  const { data: last } = await db.from('program_versions').select('number').eq('program_id', programId).order('number', { ascending: false }).limit(1);
  const number = (last?.[0]?.number || 0) + 1;
  return must(await db.from('program_versions').insert({
    program_id: programId, number, label: label.slice(0, 160) || `النسخة ${number}`,
    data: programSnapshot(live.stages, live.requirements), created_by: a.email,
  }).select('id, number, label, created_at').single());
}

// حفظ نسخة: لقطة ثابتة من البرنامج كما هو الآن
export async function programPublish(a: Admin, b: Body) {
  const id = String(b.id || '');
  if (!isUuid(id)) throw new Fail('اختر البرنامج');
  const v = await snapshotVersion(a, id, String(b.label || '').trim());
  await audit('admin', a.email, 'program.version', 'program_versions', v.id, null, { number: v.number, label: v.label });
  return { success: true, version: v };
}

// استرجاع نسخة إلى البرنامج. يُحفظ الوضع الحالي نسخةً أولًا فلا يضيع شيء،
// وما ليس في النسخة المسترجعة يُعطَّل ولا يُحذف.
export async function programRestore(a: Admin, b: Body) {
  const v = must(await db.from('program_versions').select('*').eq('id', String(b.version_id || '')).maybeSingle());
  if (!v) throw new Fail('النسخة غير موجودة', 404);
  const backup = await snapshotVersion(a, v.program_id, `قبل استرجاع النسخة ${v.number}`);
  const live = await liveRows(v.program_id);
  const plan = restorePlan(v.data, live);
  if (plan.stages.length) must(await db.from('journey_stages').upsert(plan.stages.map((s: any) => ({ ...s, program_id: v.program_id })), { onConflict: 'program_id,key' }));
  if (plan.disableStages.length) must(await db.from('journey_stages').update({ active: false }).eq('program_id', v.program_id).in('key', plan.disableStages));
  if (plan.requirements.length) must(await db.from('stage_requirements').upsert(plan.requirements.map((r: any) => ({ ...r, program_id: v.program_id }))));
  if (plan.disableRequirements.length) must(await db.from('stage_requirements').update({ active: false }).in('id', plan.disableRequirements));
  await audit('admin', a.email, 'program.restore', 'program_versions', v.id, null, { number: v.number, backup: backup.number });
  return { success: true, restored: v.number, backup };
}

// الفرق بين نسخة والبرنامج الحالي
export async function programCompare(b: Body) {
  const v = must(await db.from('program_versions').select('program_id, number, label, data').eq('id', String(b.version_id || '')).maybeSingle());
  if (!v) throw new Fail('النسخة غير موجودة', 404);
  const live = await liveRows(v.program_id);
  return { success: true, version: { number: v.number, label: v.label }, diff: programDiff(v.data, programSnapshot(live.stages, live.requirements)) };
}

// ── الدفعات ──
const STATUSES = ['planned', 'open', 'running', 'closed'];
const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

export async function cohortSave(a: Admin, b: Body) {
  const prev = isUuid(b.id) ? must(await db.from('cohorts').select('*').eq('id', b.id).maybeSingle()) : null;
  if (isUuid(b.id) && !prev) throw new Fail('الدفعة غير موجودة', 404);
  const row: Body = {};
  if ('name' in b) row.name = String(b.name || '').trim().slice(0, 160);
  if (!prev && !row.name) throw new Fail('اسم الدفعة مطلوب');
  if ('organization_id' in b) {
    if (prev?.is_default && b.organization_id) throw new Fail('الدفعة المفتوحة لا ترتبط بجهة');
    row.organization_id = isUuid(b.organization_id) ? b.organization_id : null;
    row.track = row.organization_id ? 'institutional' : 'individual';
  }
  if ('hidden_requirements' in b) {
    row.hidden_requirements = (Array.isArray(b.hidden_requirements) ? b.hidden_requirements : []).map((x: any) => String(x).trim()).filter((x: string) => /^[A-Z0-9-]{2,30}$/i.test(x)).slice(0, 100);
  }
  // المستشار الأساسي: خبير معتمد، أو لا أحد
  if ('advisor_expert_id' in b) {
    if (b.advisor_expert_id && !isUuid(b.advisor_expert_id)) throw new Fail('مستشار غير صالح');
    if (b.advisor_expert_id) {
      const { data: e } = await db.from('experts').select('status').eq('id', b.advisor_expert_id).maybeSingle();
      if (!e || !['active', 'paused'].includes(e.status)) throw new Fail('اختر خبيرًا معتمدًا مستشارًا للدفعة');
    }
    row.advisor_expert_id = b.advisor_expert_id || null;
  }
  // نمط الإشراف في طلبات الأقران (المرحلة 8): الأقران ويؤكّد الخبير، أو الخبير وحده، أو معًا
  if ('supervision' in b) row.supervision = cleanSupervision(b.supervision);
  if ('program_id' in b || !prev) {
    const pid = isUuid(b.program_id) ? String(b.program_id) : await defaultProgramId();
    const pr = must(await db.from('programs').select('id, archived_at').eq('id', pid).maybeSingle());
    if (!pr || pr.archived_at) throw new Fail('اختر برنامجًا فعالًا');
    row.program_id = pid;
  }
  const programId = row.program_id || prev?.program_id;
  // النسخة: معرف نسخة، أو 'latest' لأحدث نسخة محفوظة، أو فارغ لاتباع آخر تعديل
  if ('program_version_id' in b) {
    if (b.program_version_id === 'latest') {
      const { data } = await db.from('program_versions').select('id').eq('program_id', programId).order('number', { ascending: false }).limit(1);
      if (!data?.[0]) throw new Fail('لا توجد نسخة محفوظة لهذا البرنامج بعد؛ احفظ نسخة أولًا');
      row.program_version_id = data[0].id;
    } else if (isUuid(b.program_version_id)) {
      const { data } = await db.from('program_versions').select('id').eq('id', b.program_version_id).eq('program_id', programId).maybeSingle();
      if (!data) throw new Fail('النسخة لا تخص هذا البرنامج');
      row.program_version_id = data.id;
    } else row.program_version_id = null;
  } else if (row.program_id && prev && row.program_id !== prev.program_id) row.program_version_id = null;
  if ('starts_on' in b) row.starts_on = day(b.starts_on);
  if ('ends_on' in b) row.ends_on = day(b.ends_on);
  const s = row.starts_on ?? prev?.starts_on, e = row.ends_on ?? prev?.ends_on;
  if (s && e && e < s) throw new Fail('تاريخ النهاية قبل البداية');
  if ('capacity' in b) row.capacity = b.capacity === '' || b.capacity == null ? null : Math.max(0, Math.min(30000, Math.round(Number(b.capacity)) || 0));
  if ('status' in b) {
    if (!STATUSES.includes(b.status)) throw new Fail('حالة غير معروفة');
    if (prev?.is_default && b.status === 'closed') throw new Fail('الدفعة المفتوحة لا تُغلق؛ هي ملاذ من ليس له دفعة');
    row.status = b.status;
  }
  if ('notes_ar' in b) row.notes_ar = String(b.notes_ar || '').trim().slice(0, 2000) || null;
  if ('delivery' in b) {
    const vid = 'program_version_id' in row ? row.program_version_id : prev?.program_version_id;
    const reqs = vid
      ? ((await db.from('program_versions').select('data').eq('id', vid).single()).data?.data?.requirements || [])
      : (await liveRows(programId)).requirements;
    try { row.delivery = cleanDelivery(b.delivery, reqs); }
    catch (err) { throw new Fail((err as Error).message); }
  }
  // جدول المراحل: يحفظه الأدمن كما وضعه، أو يوزعه النظام على مدة الدفعة ثم يعدّله
  if ('schedule' in b || b.distribute === true) {
    const vid = 'program_version_id' in row ? row.program_version_id : prev?.program_version_id;
    const stages = vid
      ? ((await db.from('program_versions').select('data').eq('id', vid).single()).data?.data?.stages || [])
      : (await liveRows(programId)).stages;
    if (b.distribute === true) {
      const s0 = row.starts_on ?? prev?.starts_on, e0 = row.ends_on ?? prev?.ends_on;
      if (!s0 || !e0) throw new Fail('حدد تاريخي بداية الدفعة ونهايتها أولًا ليتوزع الجدول عليها');
      row.schedule = distributeSchedule(stages, s0, e0);
    } else {
      try { row.schedule = cleanSchedule(b.schedule, stages.map((x: any) => x.key)); }
      catch (err) { throw new Fail((err as Error).message); }
    }
  }
  // نمط المجموعة: تجانس المستوى ونمط المشروع، ونمط العمل لكل مرحلة
  try { Object.assign(row, cleanGroupSettings(b)); }
  catch (err) { throw new Fail((err as Error).message); }
  if ((row.level_mode ?? prev?.level_mode) === 'uniform' && !(row.content_level !== undefined ? row.content_level : prev?.content_level)) {
    throw new Fail('اختر مستوى المحتوى للدفعة المتجانسة');
  }
  if ('stage_modes' in b) {
    const vid = 'program_version_id' in row ? row.program_version_id : prev?.program_version_id;
    const stages = vid
      ? ((await db.from('program_versions').select('data').eq('id', vid).single()).data?.data?.stages || [])
      : (await liveRows(programId)).stages;
    row.stage_modes = cleanStageModes(b.stage_modes, stages.map((x: any) => x.key));
  }
  // فريق خبراء الدفعة: خبراء معتمدون يُعرضون على مشاركيها أولًا. المستشار الأساسي يبقى في advisor_expert_id وحده
  let team: string[] | null = null;
  if ('team_expert_ids' in b) {
    try { team = cleanTeamIds(b.team_expert_ids, isUuid); }
    catch (err) { throw new Fail((err as Error).message); }
    if (team.length) {
      const ok = must(await db.from('experts').select('id').in('id', team).in('status', ['active', 'paused'])) as any[];
      if ((ok || []).length !== team.length) throw new Fail('في فريق الدفعة خبير غير معتمد. اختر من الخبراء المعتمدين');
    }
  }
  row.updated_at = new Date().toISOString();
  const saved: any = prev
    ? must(await db.from('cohorts').update(row).eq('id', prev.id).select(COHORT_COLS).single())
    : must(await db.from('cohorts').insert(row).select(COHORT_COLS).single(), 'تعذّر إنشاء الدفعة');
  if (team) {
    // استبدال كامل: القائمة المرسلة هي الفريق. قبل تطبيق الترحيل يُرفض بسبب واضح ولا يضيع حفظ الدفعة نفسها
    const del = await db.from('cohort_experts').delete().eq('cohort_id', saved.id);
    if (del.error && team.length) throw new Fail('حُفظت الدفعة، وفريق الخبراء ينتظر تحديث قاعدة البيانات', 503, 'team_not_ready');
    if (!del.error && team.length) must(await db.from('cohort_experts').insert(team.map((expert_id) => ({ cohort_id: saved.id, expert_id, added_by: a.email }))), 'تعذّر حفظ فريق الخبراء');
  }
  await audit('admin', a.email, prev ? 'cohort.save' : 'cohort.create', 'cohorts', saved.id, null, team ? { ...row, team_expert_ids: team } : row);
  return { success: true, cohort: { ...saved, team_expert_ids: team ?? undefined } };
}

// ترقية دفعة إلى أحدث نسخة من برنامجها، مع ما سيتغير على مشاركيها
export async function cohortUpgrade(a: Admin, b: Body) {
  const c = must(await db.from('cohorts').select('*').eq('id', String(b.id || '')).maybeSingle());
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  const { data: last } = await db.from('program_versions').select('id, number, label, data').eq('program_id', c.program_id).order('number', { ascending: false }).limit(1);
  const to = last?.[0];
  if (!to) throw new Fail('لا توجد نسخة محفوظة لهذا البرنامج');
  if (to.id === c.program_version_id) return { success: true, unchanged: true };
  let from;
  if (c.program_version_id) from = (await db.from('program_versions').select('data').eq('id', c.program_version_id).single()).data?.data;
  else { const live = await liveRows(c.program_id); from = programSnapshot(live.stages, live.requirements); }
  const diff = programDiff(from, to.data);
  if (b.confirm !== true) return { success: true, preview: true, to: { number: to.number, label: to.label }, diff };
  must(await db.from('cohorts').update({ program_version_id: to.id, updated_at: new Date().toISOString() }).eq('id', c.id));
  await audit('admin', a.email, 'cohort.upgrade', 'cohorts', c.id, null, { to: to.number });
  return { success: true, to: { number: to.number, label: to.label }, diff };
}

// تسجيل مشاركين في دفعة. تسجيلاتهم السابقة تُعلَّم منسحبة، وتقدمهم يبقى
// لأن معرفات المتطلبات ثابتة داخل البرنامج.
export async function cohortEnroll(a: Admin, b: Body) {
  const c = must(await db.from('cohorts').select('id, name').eq('id', String(b.cohort_id || '')).maybeSingle());
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  const ids = [...new Set((Array.isArray(b.participant_ids) ? b.participant_ids : []).filter(isUuid))].slice(0, 500) as string[];
  if (!ids.length) throw new Fail('اختر مشاركًا واحدًا على الأقل');
  const now = new Date().toISOString();
  must(await db.from('enrollments').update({ status: 'withdrawn', updated_at: now }).in('participant_id', ids).neq('cohort_id', c.id).neq('status', 'withdrawn'));
  must(await db.from('enrollments').upsert(ids.map((participant_id) => ({ participant_id, cohort_id: c.id, status: 'active', updated_at: now })), { onConflict: 'participant_id,cohort_id' }));
  await audit('admin', a.email, 'cohort.enroll', 'cohorts', c.id, null, { participants: ids.length });
  return { success: true, enrolled: ids.length };
}

// ── المعالم ──
export async function milestones(b: Body) {
  const pid = isUuid(b.program_id) ? String(b.program_id) : await defaultProgramId();
  const { data } = await db.from('program_milestones').select('*').eq('program_id', pid).order('sort');
  return { success: true, program_id: pid, milestones: data || [] };
}

export async function milestoneSave(a: Admin, b: Body) {
  const pid = isUuid(b.program_id) ? String(b.program_id) : await defaultProgramId();
  const { stages } = await liveRows(pid);
  let row: any;
  try { row = cleanMilestone(b.row || {}, stages.map((s: any) => s.key)); }
  catch (err) { throw new Fail((err as Error).message); }
  row.updated_at = new Date().toISOString();
  let saved;
  if (isUuid(b.row?.id)) {
    saved = must(await db.from('program_milestones').update(row).eq('id', b.row.id).eq('program_id', pid).select('*').single(), 'المعلم غير موجود');
  } else {
    const { data: last } = await db.from('program_milestones').select('sort').eq('program_id', pid).order('sort', { ascending: false }).limit(1);
    saved = must(await db.from('program_milestones').insert({ ...row, program_id: pid, sort: (last?.[0]?.sort || 0) + 1 }).select('*').single());
  }
  await audit('admin', a.email, 'milestone.save', 'program_milestones', saved.id, null, row);
  return { success: true, row: saved };
}

// حذف معلم له سجلات مشاركين يمحوها؛ يُعطَّل بدلًا من ذلك
export async function milestoneDelete(a: Admin, b: Body) {
  const id = String(b.id || '');
  const { count } = await db.from('participant_milestones').select('milestone_id', { count: 'exact', head: true }).eq('milestone_id', id);
  if (count) {
    must(await db.from('program_milestones').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id));
    await audit('admin', a.email, 'milestone.disable', 'program_milestones', id);
    return { success: true, disabled: true };
  }
  must(await db.from('program_milestones').delete().eq('id', id));
  await audit('admin', a.email, 'milestone.delete', 'program_milestones', id);
  return { success: true };
}

// لمشارك بعينه: اعتماد إنجاز المعلم أو إلغاؤه، أو تمديد موعده له وحده
export async function participantMilestone(a: Actor, b: Body) {
  const pid = String(b.participant_id || ''), mid = String(b.milestone_id || '');
  if (!isUuid(pid) || !isUuid(mid)) throw new Fail('بيانات ناقصة');
  const prev = (await db.from('participant_milestones').select('*').eq('participant_id', pid).eq('milestone_id', mid).maybeSingle()).data;
  const rec: Body = { participant_id: pid, milestone_id: mid, by_email: a.email, updated_at: new Date().toISOString(), note: b.note ? String(b.note).slice(0, 1000) : prev?.note || null };
  if ('done' in b) rec.done_at = b.done ? new Date().toISOString() : null;
  if ('scores' in b) rec.scores = cleanRubricScores(b.scores);
  if ('due_override' in b) rec.due_override = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due_override || '')) ? b.due_override : null;
  must(await db.from('participant_milestones').upsert({ ...(prev || {}), ...rec }));
  await audit(a.actor || 'admin', a.email, 'milestone.participant', 'participants', pid, null, { milestone: mid, done: b.done ?? null, due_override: rec.due_override ?? null, scores: rec.scores ?? null, note: rec.note });
  return { success: true };
}

// ── نمط المجموعة ──
// مستويات المحتوى للمشارك: مستواه من القياس، أو مستوى دفعته الموحد إن كانت متجانسة
export async function contentLevelsFor(p: any, levels: Record<string, string>) {
  const { cohort } = await cohortOf(p);
  return contentLevels(levels, cohort) as Record<string, string>;
}

// مشاركو الدفعة فعلًا: من سُجّل فيها، ومن تتبعها تلقائيًا بجهته (ما لم يُسجَّل في غيرها)
export async function cohortMembers(c: any) {
  const [enr, cohorts] = await Promise.all([
    db.from('enrollments').select('participant_id, cohort_id, status, created_at'),
    db.from('cohorts').select(COHORT_COLS),
  ]);
  let ids = new Set((enr.data || []).filter((e: any) => e.cohort_id === c.id && e.status !== 'withdrawn').map((e: any) => e.participant_id));
  const extra = c.organization_id ? ((await db.from('participants').select('id').eq('organization_id', c.organization_id)).data || []).map((r: any) => r.id) : [];
  const all = [...new Set([...ids, ...extra])] as string[];
  if (!all.length) return [];
  // حساب العرض ليس عضوًا في أي دفعة: لا يظهر في القاعة ولا المجموعات ولا الحضور
  const { data: ps } = await db.from('participants').select('id, full_name, email, organization_id, organization_name, job_title, status').in('id', all).eq('is_demo', false);
  const byP = new Map<string, any[]>();
  for (const e of enr.data || []) { if (!byP.has(e.participant_id)) byP.set(e.participant_id, []); byP.get(e.participant_id)!.push(e); }
  const mine = (ps || []).filter((p: any) => pickCohort({ enrollments: byP.get(p.id) || [], cohorts: cohorts.data || [], organizationId: p.organization_id }).cohort?.id === c.id);
  const { data: pl } = await db.from('placements').select('participant_id, dimension, level').in('participant_id', mine.map((p: any) => p.id));
  return mine.map((p: any) => ({
    id: p.id, name: p.full_name, email: p.email, status: p.status, title: p.job_title || null, org: p.organization_name || null,
    levels: Object.fromEntries((pl || []).filter((x: any) => x.participant_id === p.id).map((x: any) => [x.dimension, x.level])),
  }));
}

export async function cohortGroups(b: Body) {
  const c = must(await db.from('cohorts').select(COHORT_COLS).eq('id', String(b.cohort_id || '')).maybeSingle());
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  const [members, groups, links, live] = await Promise.all([
    cohortMembers(c),
    db.from('cohort_groups').select('*').eq('cohort_id', c.id).order('sort'),
    db.from('cohort_group_members').select('participant_id, group_id').eq('cohort_id', c.id),
    c.program_version_id
      ? db.from('program_versions').select('data').eq('id', c.program_version_id).single().then((r: any) => r.data?.data?.stages || [])
      : liveRows(c.program_id).then((r) => r.stages),
  ]);
  const gOf = new Map((links.data || []).map((l: any) => [l.participant_id, l.group_id]));
  // خبير المجموعة: جاهز حين يكون عموده مطبّقًا. الخبراء المعتمدون، وفريق الدفعة منهم أولًا في القائمة
  const [probe, experts, team] = await Promise.all([
    db.from('cohort_groups').select('advisor_expert_id').limit(1),
    db.from('experts').select('id, full_name, status').in('status', ['active', 'paused']).order('full_name'),
    db.from('cohort_experts').select('expert_id').eq('cohort_id', c.id),
  ]);
  const inTeam = new Set([c.advisor_expert_id, ...((team.data || []).map((t: any) => t.expert_id))].filter(Boolean));
  const list = (experts.data || []).map((e: any) => ({ id: e.id, full_name: e.full_name, team: inTeam.has(e.id) }));
  return {
    success: true, cohort: c,
    group_advisor_ready: !probe.error,
    experts: [...list.filter((e: any) => e.team), ...list.filter((e: any) => !e.team)],
    stages: (live as any[]).filter((s) => s.active !== false).sort((a, b) => a.sort - b.sort).map((s) => ({ key: s.key, title_ar: s.title_ar })),
    groups: groups.data || [],
    members: members.map((m: any) => ({ ...m, group_id: gOf.get(m.id) || null })),
  };
}

export async function cohortGroupSave(a: Admin, b: Body) {
  const c = must(await db.from('cohorts').select('id').eq('id', String(b.cohort_id || '')).maybeSingle());
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  if (b.delete && isUuid(b.id)) {
    must(await db.from('cohort_groups').delete().eq('id', b.id).eq('cohort_id', c.id));
    await audit('admin', a.email, 'group.delete', 'cohorts', c.id, null, { group: b.id });
    return { success: true };
  }
  // خبير المجموعة: خبير معتمد، أو لا أحد فيعود أعضاؤها لمستشار الدفعة. يُحفظ وحده بلا تغيير الاسم
  if (isUuid(b.id) && 'advisor_expert_id' in b && !('name' in b)) {
    const adv = b.advisor_expert_id || null;
    if (adv && !isUuid(adv)) throw new Fail('خبير غير صالح');
    if (adv) {
      const { data: e } = await db.from('experts').select('status').eq('id', adv).maybeSingle();
      if (!e || !['active', 'paused'].includes(e.status)) throw new Fail('اختر خبيرًا معتمدًا لهذه المجموعة');
    }
    const up = await db.from('cohort_groups').update({ advisor_expert_id: adv }).eq('id', b.id).eq('cohort_id', c.id).select('*').maybeSingle();
    if (up.error) throw new Fail('خبير المجموعة ينتظر تحديث قاعدة البيانات', 503, 'group_advisor_not_ready');
    if (!up.data) throw new Fail('المجموعة غير موجودة', 404);
    await audit('admin', a.email, 'group.advisor', 'cohorts', c.id, null, { group: b.id, advisor_expert_id: adv });
    return { success: true, group: up.data };
  }
  const name = String(b.name || '').trim().slice(0, 80);
  if (!name) throw new Fail('اسم المجموعة مطلوب');
  const row = isUuid(b.id)
    ? must(await db.from('cohort_groups').update({ name }).eq('id', b.id).eq('cohort_id', c.id).select('*').single())
    : must(await db.from('cohort_groups').insert({ cohort_id: c.id, name, sort: ((await db.from('cohort_groups').select('id', { count: 'exact', head: true }).eq('cohort_id', c.id)).count || 0) + 1 }).select('*').single());
  await audit('admin', a.email, 'group.save', 'cohorts', c.id, null, { group: row.id, name });
  return { success: true, group: row };
}

// نقل مشارك إلى مجموعة، أو إخراجه منها (group_id فارغ)
export async function cohortGroupAssign(a: Admin, b: Body) {
  const cid = String(b.cohort_id || ''), pid = String(b.participant_id || '');
  if (!isUuid(cid) || !isUuid(pid)) throw new Fail('بيانات ناقصة');
  if (isUuid(b.group_id)) {
    const g = must(await db.from('cohort_groups').select('id').eq('id', b.group_id).eq('cohort_id', cid).maybeSingle());
    if (!g) throw new Fail('المجموعة لا تخص هذه الدفعة');
    must(await db.from('cohort_group_members').upsert({ cohort_id: cid, participant_id: pid, group_id: g.id }));
  } else {
    must(await db.from('cohort_group_members').delete().eq('cohort_id', cid).eq('participant_id', pid));
  }
  await audit('admin', a.email, 'group.assign', 'participants', pid, null, { cohort: cid, group: b.group_id || null });
  return { success: true };
}

// توزيع آلي: يستبدل مجموعات الدفعة بعدد جديد، متقاربة المستوى أو متنوعة
export async function cohortGroupsAuto(a: Admin, b: Body) {
  const c = must(await db.from('cohorts').select(COHORT_COLS).eq('id', String(b.cohort_id || '')).maybeSingle());
  if (!c) throw new Fail('الدفعة غير موجودة', 404);
  const n = Math.round(Number(b.count));
  if (!(n >= 1 && n <= 50)) throw new Fail('عدد المجموعات من 1 إلى 50');
  const members = await cohortMembers(c);
  if (!members.length) throw new Fail('لا مشاركين في هذه الدفعة بعد');
  const split = autoGroups(members, n, b.by === 'level' ? 'level' : 'mixed');
  must(await db.from('cohort_groups').delete().eq('cohort_id', c.id));
  const groups = must(await db.from('cohort_groups').insert(split.map((_ids, i) => ({ cohort_id: c.id, name: `المجموعة ${i + 1}`, sort: i + 1 }))).select('id, sort')) as any[];
  const bySort = new Map(groups.map((g) => [g.sort, g.id]));
  const rows = split.flatMap((ids, i) => ids.map((pid: string) => ({ cohort_id: c.id, participant_id: pid, group_id: bySort.get(i + 1) })));
  if (rows.length) must(await db.from('cohort_group_members').insert(rows));
  await audit('admin', a.email, 'group.auto', 'cohorts', c.id, null, { count: n, by: b.by === 'level' ? 'level' : 'mixed', members: rows.length });
  return { success: true, groups: n, members: rows.length };
}

// مجموعة المشارك في دفعته الحالية واسمها وعدد أعضائها
export async function groupOf(participantId: string, cohortId: string | null) {
  if (!cohortId) return null;
  const { data: link } = await db.from('cohort_group_members').select('group_id, cohort_groups(name)').eq('cohort_id', cohortId).eq('participant_id', participantId).maybeSingle();
  if (!link) return null;
  const { count } = await db.from('cohort_group_members').select('participant_id', { count: 'exact', head: true }).eq('group_id', link.group_id);
  return { id: link.group_id, name: (link as any).cohort_groups?.name || '', members: count || 1 };
}

// دفعة جارية في البرنامج: بدأت ولم تنتهِ (يُقفل أثناءها ما يُقاس به)
export async function runningCohort(programId: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  let q = db.from('cohorts').select('name, starts_on, ends_on').lte('starts_on', today).or(`ends_on.is.null,ends_on.gte.${today}`).limit(1);
  if (programId) q = q.eq('program_id', programId);
  const { data } = await q;
  return data?.[0]?.name || null;
}
