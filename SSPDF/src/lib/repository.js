import { supabase } from "./supabaseClient";

/**
 * طبقة الوصول للبيانات (Data Repository)
 * تفصل الواجهة عن مصدر البيانات:
 *   - بدون متغيرات بيئة → وضع محلي (repo = null)
 *   - مع Supabase → تحميل + مزامنة تلقائية على schema sspdf
 * أشكال البيانات المعادة مطابقة تماماً لحالة الواجهة (App state).
 */
class SupabaseRepo {
  constructor(sb) {
    this.sb = sb;
    this.projectId = null;
    this.serviceIdByCode = {};
    this.segmentIdByCode = {};
    this.critIdByCode = {};
    this.comboIdByKey = {}; // "S2|C5" → uuid
  }

  /** قائمة المشاريع التي أملك عضوية فعلية فيها (بحسب الجلسة الحالية) */
  async listMyProjects() {
    const { data: { user } } = await this.sb.auth.getUser();
    if (!user) return [];
    const { data, error } = await this.sb.from("project_members")
      .select("role, projects:project_id (id, name, name_en, description, status, created_at, updated_at)")
      .eq("user_id", user.id);
    if (error) throw error;
    return (data || [])
      .filter((r) => r.projects)
      .map((r) => ({ ...r.projects, myRole: r.role }))
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  }

  /** إنشاء مشروع جديد فارغ، وتصبح منشئه مديره تلقائياً */
  async createProject({ name, nameEn, description }) {
    const { data: { user } } = await this.sb.auth.getUser();
    if (!user) throw new Error("لا توجد جلسة دخول");
    const { data: project, error } = await this.sb.from("projects")
      .insert({ name, name_en: nameEn || null, description: description || null, status: "draft" })
      .select().single();
    if (error) throw error;
    const { error: memErr } = await this.sb.from("project_members")
      .insert({ project_id: project.id, user_id: user.id, role: "admin", email: user.email, display_name: user.email });
    if (memErr) throw memErr;
    return project;
  }

  /** تحميل مشروع محدد بمعرّفه */
  async load(projectId) {
    let project;
    if (projectId) {
      const { data, error } = await this.sb.from("projects").select("*").eq("id", projectId).single();
      if (error) throw error;
      project = data;
    } else {
      const { data: projects, error: pErr } = await this.sb
        .from("projects").select("*").order("created_at");
      if (pErr) throw pErr;
      if (!projects?.length) return null;
      project = projects[0];
    }
    this.projectId = project.id;
    this.serviceIdByCode = {}; this.segmentIdByCode = {}; this.critIdByCode = {}; this.comboIdByKey = {};

    const [sv, sg, cr, cb, rk, lg, mb] = await Promise.all([
      this.sb.from("services").select("*").eq("project_id", project.id).order("sort"),
      this.sb.from("segments").select("*").eq("project_id", project.id).order("sort"),
      this.sb.from("criteria").select("*").eq("project_id", project.id).order("sort"),
      this.sb.from("combinations").select("*").eq("project_id", project.id),
      this.sb.from("risks").select("*"),
      this.sb.from("activity_log").select("*").eq("project_id", project.id)
        .order("created_at", { ascending: false }).limit(100),
      this.sb.from("project_members").select("*").eq("project_id", project.id).order("created_at"),
    ]);
    for (const r of [sv, sg, cr, cb, rk, lg, mb]) if (r.error) throw r.error;

    const services = sv.data.map((x) => ({ id: x.code, ar: x.name_ar, en: x.name_en || "" }));
    const segments = sg.data.map((x) => ({ id: x.code, ar: x.name_ar, en: x.name_en || "" }));
    const criteria = cr.data.map((x) => ({ id: x.code, ar: x.name_ar, en: x.name_en || "", g: x.grp || "", w: Number(x.weight) }));

    sv.data.forEach((x) => (this.serviceIdByCode[x.code] = x.id));
    sg.data.forEach((x) => (this.segmentIdByCode[x.code] = x.id));
    cr.data.forEach((x) => (this.critIdByCode[x.code] = x.id));

    const svcCodeById = Object.fromEntries(sv.data.map((x) => [x.id, x.code]));
    const segCodeById = Object.fromEntries(sg.data.map((x) => [x.id, x.code]));
    const critCodeById = Object.fromEntries(cr.data.map((x) => [x.id, x.code]));
    const critOrder = cr.data.map((x) => x.code);

    const comboIds = cb.data.map((x) => x.id);
    const { data: scores, error: sErr } = comboIds.length
      ? await this.sb.from("scores").select("*").in("combination_id", comboIds)
      : { data: [], error: null };
    if (sErr) throw sErr;

    const riskByCombo = Object.fromEntries(rk.data.map((x) => [x.combination_id, x]));
    const evals = {};
    for (const c of cb.data) {
      if (!c.active) continue;
      const key = `${svcCodeById[c.service_id]}|${segCodeById[c.segment_id]}`;
      this.comboIdByKey[key] = c.id;
      evals[key] = {
        scores: critOrder.map(() => 5),
        conf: critOrder.map(() => "M"),
        evidence: {},
        risk: riskByCombo[c.id]?.risk_score ?? 5,
        riskNote: riskByCombo[c.id]?.note ?? "",
      };
    }
    for (const s of scores) {
      const c = cb.data.find((x) => x.id === s.combination_id);
      if (!c || !c.active) continue;
      const key = `${svcCodeById[c.service_id]}|${segCodeById[c.segment_id]}`;
      const idx = critOrder.indexOf(critCodeById[s.criterion_id]);
      if (idx < 0 || !evals[key]) continue;
      evals[key].scores[idx] = s.score;
      evals[key].conf[idx] = s.confidence;
      if (s.evidence) evals[key].evidence[critCodeById[s.criterion_id]] = s.evidence;
    }

    const audit = lg.data.map((x) => ({
      ts: (x.created_at || "").slice(0, 16).replace("T", " "),
      user: x.actor, action: x.action, detail: x.detail || "",
    }));

    const team = mb.data.map((m) => ({
      id: m.id, email: m.email || "", name: m.display_name || m.email || "—",
      role: m.role, userId: m.user_id, linked: !!m.user_id,
    }));

    return { project, services, segments, criteria, evals, audit, team };
  }

  /** إضافة عضو فريق حقيقي — يُكتب مباشرة في قاعدة البيانات */
  async addMember({ email, role, displayName }) {
    if (!this.projectId) return { error: "لا يوجد مشروع محمَّل" };
    const { data, error } = await this.sb.from("project_members")
      .insert({
        project_id: this.projectId,
        email: email.trim().toLowerCase(),
        display_name: (displayName || "").trim() || email.trim(),
        role,
      })
      .select().single();
    if (error) {
      if (error.code === "23505") return { error: "هذا البريد مضاف مسبقاً لهذا المشروع" };
      return { error: error.message };
    }
    return { member: { id: data.id, email: data.email, name: data.display_name, role: data.role, userId: data.user_id, linked: false } };
  }

  /** حذف عضو فريق — مباشرة من قاعدة البيانات */
  async removeMember(memberRowId) {
    const { error } = await this.sb.from("project_members").delete().eq("id", memberRowId);
    if (error) return { error: error.message };
    return { ok: true };
  }

  /** مزامنة شاملة (Debounced من الواجهة): بنية + أوزان + تركيبات + تقييمات + مخاطر */
  async syncAll({ services, segments, criteria, evals }) {
    if (!this.projectId) return;
    const pid = this.projectId;

    // 1) عناصر جديدة في المكتبة
    const newSv = services.filter((s) => !this.serviceIdByCode[s.id]);
    for (const s of newSv) {
      const { data, error } = await this.sb.from("services")
        .insert({ project_id: pid, code: s.id, name_ar: s.ar, name_en: s.en || null, sort: 99 })
        .select().single();
      if (!error && data) this.serviceIdByCode[s.id] = data.id;
    }
    const newSg = segments.filter((s) => !this.segmentIdByCode[s.id]);
    for (const s of newSg) {
      const { data, error } = await this.sb.from("segments")
        .insert({ project_id: pid, code: s.id, name_ar: s.ar, name_en: s.en || null, sort: 99 })
        .select().single();
      if (!error && data) this.segmentIdByCode[s.id] = data.id;
    }

    // 2) المعايير: تحديث الموجود، وإضافة الجديد فعلياً (ضروري للمشاريع الفارغة الجديدة)
    for (const c of criteria) {
      if (this.critIdByCode[c.id]) {
        await this.sb.from("criteria").update({ weight: c.w, name_ar: c.ar, name_en: c.en || null, grp: c.g || null })
          .eq("project_id", pid).eq("code", c.id);
      } else {
        const { data, error } = await this.sb.from("criteria")
          .insert({ project_id: pid, code: c.id, name_ar: c.ar, name_en: c.en || null, grp: c.g || null, weight: c.w, sort: 99 })
          .select().single();
        if (!error && data) this.critIdByCode[c.id] = data.id;
      }
    }
    const currentCritCodes = new Set(criteria.map((c) => c.id));
    for (const code of Object.keys(this.critIdByCode)) {
      if (!currentCritCodes.has(code)) {
        await this.sb.from("criteria").delete().eq("id", this.critIdByCode[code]);
        delete this.critIdByCode[code];
      }
    }

    // 3) التركيبات: تفعيل الجديدة وإلغاء المحذوفة
    const activeKeys = new Set(Object.keys(evals));
    for (const key of activeKeys) {
      if (this.comboIdByKey[key]) continue;
      const [svc, seg] = key.split("|");
      const sid = this.serviceIdByCode[svc], gid = this.segmentIdByCode[seg];
      if (!sid || !gid) continue;
      const { data, error } = await this.sb.from("combinations")
        .upsert(
          { project_id: pid, service_id: sid, segment_id: gid, active: true },
          { onConflict: "project_id,service_id,segment_id" }
        ).select().single();
      if (!error && data) this.comboIdByKey[key] = data.id;
    }
    for (const [key, comboId] of Object.entries(this.comboIdByKey)) {
      if (!activeKeys.has(key)) {
        await this.sb.from("combinations").update({ active: false }).eq("id", comboId);
        delete this.comboIdByKey[key];
      }
    }

    // 4) التقييمات والمخاطر (Upsert دفعة واحدة)
    const scoreRows = [];
    const riskRows = [];
    for (const [key, ev] of Object.entries(evals)) {
      const comboId = this.comboIdByKey[key];
      if (!comboId) continue;
      criteria.forEach((c, i) => {
        const critId = this.critIdByCode[c.id];
        if (!critId) return;
        scoreRows.push({
          combination_id: comboId,
          criterion_id: critId,
          score: ev.scores[i],
          confidence: ev.conf[i],
          evidence: ev.evidence[c.id] || null,
        });
      });
      riskRows.push({ combination_id: comboId, risk_score: ev.risk, note: ev.riskNote || null });
    }
    if (scoreRows.length)
      await this.sb.from("scores").upsert(scoreRows, { onConflict: "combination_id,criterion_id" });
    if (riskRows.length)
      await this.sb.from("risks").upsert(riskRows, { onConflict: "combination_id" });
  }

  /** نسخ بنية مشروع (خدمات، شرائح، معايير فقط — بلا تقييمات) كقالب لمشروع جديد */
  async copyProjectStructure(sourceProjectId, targetProjectId) {
    const [sv, sg, cr] = await Promise.all([
      this.sb.from("services").select("code,name_ar,name_en,sort").eq("project_id", sourceProjectId),
      this.sb.from("segments").select("code,name_ar,name_en,sort").eq("project_id", sourceProjectId),
      this.sb.from("criteria").select("code,name_ar,name_en,grp,weight,sort").eq("project_id", sourceProjectId),
    ]);
    if (sv.data?.length) await this.sb.from("services").insert(sv.data.map((x) => ({ ...x, project_id: targetProjectId })));
    if (sg.data?.length) await this.sb.from("segments").insert(sg.data.map((x) => ({ ...x, project_id: targetProjectId })));
    if (cr.data?.length) await this.sb.from("criteria").insert(cr.data.map((x) => ({ ...x, project_id: targetProjectId })));
  }

  /** إحصاءات خفيفة لكل مشاريعي دفعة واحدة — لشاشة المقارنة */
  async compareProjects(projectIds) {
    if (!projectIds.length) return [];
    const [sv, sg, cr, cb, lg] = await Promise.all([
      this.sb.from("services").select("project_id").in("project_id", projectIds),
      this.sb.from("segments").select("project_id").in("project_id", projectIds),
      this.sb.from("criteria").select("project_id").in("project_id", projectIds),
      this.sb.from("combinations").select("project_id, active").in("project_id", projectIds),
      this.sb.from("activity_log").select("project_id, created_at").in("project_id", projectIds).order("created_at", { ascending: false }),
    ]);
    const count = (arr, pid, filter) => (arr || []).filter((x) => x.project_id === pid && (!filter || filter(x))).length;
    const lastActivity = (pid) => (lg.data || []).find((x) => x.project_id === pid)?.created_at || null;
    return projectIds.map((pid) => ({
      id: pid,
      services: count(sv.data, pid),
      segments: count(sg.data, pid),
      criteria: count(cr.data, pid),
      combos: count(cb.data, pid),
      activeCombos: count(cb.data, pid, (x) => x.active),
      lastActivity: lastActivity(pid),
    }));
  }

  /** سجل التدقيق */
  async addLog(action, detail, actor) {
    if (!this.projectId) return;
    await this.sb.from("activity_log").insert({
      project_id: this.projectId, actor: actor || "مستخدم", action, detail,
    });
  }

  /** ربط أول مدير موثق بالمشروع بعد تسجيل الدخول */
  async claimAdmin(displayName) {
    if (!this.projectId) return;
    return this.sb.rpc("bootstrap_admin", { p_project: this.projectId, p_name: displayName });
  }
}

export const repo = supabase ? new SupabaseRepo(supabase) : null;

/**
 * يحدد دور المستخدم المسجَّل دخوله فعلياً من جدول العضوية،
 * ويتحقق هل يوجد مدير نظام مرتبط بحساب حقيقي من قبل.
 */
export async function getMyRole(sb, projectId) {
  const { data: { user } = {} } = await sb.auth.getUser();
  if (!user) return { user: null, role: null, displayName: null, adminClaimed: false };

  let role = null, displayName = null;
  try {
    const { data } = await sb.from("project_members")
      .select("role, display_name")
      .eq("project_id", projectId).eq("user_id", user.id)
      .maybeSingle();
    if (data) { role = data.role; displayName = data.display_name; }
  } catch (_) {}

  let adminClaimed = false;
  try {
    const { data } = await sb.rpc("project_has_admin", { p_project: projectId });
    adminClaimed = !!data;
  } catch (_) {}

  return { user, role, displayName, adminClaimed };
}
