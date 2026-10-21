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
    // آخر قيمة وصلت الخادم لكل صف، فلا يُعاد إرسال ما لم يتغيّر
    this.synced = {};       // "services|S2" → JSON
    this._pending = null;   // آخر حالة تنتظر المزامنة
    this._running = null;   // المزامنة الجارية
  }

  /** يُعيد true إن تغيّرت قيمة الصف منذ آخر مزامنة، ويحفظ الجديدة */
  _changed(key, value) {
    const json = JSON.stringify(value);
    if (this.synced[key] === json) return false;
    this.synced[key] = json;
    return true;
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
      .map((r) => ({ proj: Array.isArray(r.projects) ? r.projects[0] : r.projects, role: r.role }))
      .filter((r) => r.proj)
      .map((r) => ({ ...r.proj, myRole: r.role || "viewer" }))
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  }

  /** إنشاء مشروع جديد فارغ، وتصبح منشئه مديره تلقائياً — عملية ذرّية واحدة داخل قاعدة البيانات */
  async createProject({ name, nameEn, description }) {
    const { data, error } = await this.sb.rpc("create_project_with_admin", {
      p_name: name, p_name_en: nameEn || null, p_description: description || null,
    });
    if (error) throw error;
    return data;
  }

  /** تعديل بيانات مشروع قائم (الاسم، الاسم الإنجليزي، الوصف) */
  async updateProject(projectId, { name, nameEn, description }) {
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (nameEn !== undefined) patch.name_en = nameEn || null;
    if (description !== undefined) patch.description = description || null;
    const { data, error } = await this.sb.from("projects").update(patch).eq("id", projectId).select().single();
    if (error) throw error;
    return data;
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

    const [sv, sg, cr, cb, lg, mb] = await Promise.all([
      this.sb.from("services").select("*").eq("project_id", project.id).order("sort"),
      this.sb.from("segments").select("*").eq("project_id", project.id).order("sort"),
      this.sb.from("criteria").select("*").eq("project_id", project.id).order("sort"),
      this.sb.from("combinations").select("*").eq("project_id", project.id),
      this.sb.from("activity_log").select("*").eq("project_id", project.id)
        .order("created_at", { ascending: false }).limit(100),
      this.sb.from("project_members").select("*").eq("project_id", project.id).order("created_at"),
    ]);
    for (const r of [sv, sg, cr, cb, lg, mb]) if (r.error) throw r.error;

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
    // المخاطر مقصورة على تركيبات هذا المشروع، لا الجدول كله
    const empty = { data: [], error: null };
    const [{ data: scores, error: sErr }, rk] = comboIds.length
      ? await Promise.all([
          this.sb.from("scores").select("*").in("combination_id", comboIds),
          this.sb.from("risks").select("*").in("combination_id", comboIds),
        ])
      : [empty, empty];
    if (sErr) throw sErr;
    if (rk.error) throw rk.error;

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

    // ما حُمّل هو ما على الخادم: المزامنة الأولى لا تعيد إرساله
    this.synced = {};
    services.forEach((x) => this._changed(`services|${x.id}`, [x.ar, x.en || null]));
    segments.forEach((x) => this._changed(`segments|${x.id}`, [x.ar, x.en || null]));
    criteria.forEach((x) => this._changed(`criteria|${x.id}`, [x.w, x.ar, x.en || null, x.g || null]));
    // التقييمات الموجودة فعلاً فقط؛ الافتراضية التي لا صف لها تُرسل في أول مزامنة كما كانت
    const comboKeyById = Object.fromEntries(Object.entries(this.comboIdByKey).map(([k, id]) => [id, k]));
    for (const sc of scores) {
      const key = comboKeyById[sc.combination_id], code = critCodeById[sc.criterion_id];
      if (key && code) this._changed(`scores|${key}|${code}`, [sc.score, sc.confidence, sc.evidence || null]);
    }
    for (const r of rk.data) {
      const key = comboKeyById[r.combination_id];
      if (key) this._changed(`risks|${key}`, [r.risk_score, r.note || null]);
    }

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

  /**
   * مزامنة شاملة (Debounced من الواجهة): بنية + أوزان + تركيبات + تقييمات + مخاطر.
   * مزامنة واحدة فقط في كل لحظة: ما يصل أثناء الجارية ينتظرها، ويبقى منه الأحدث.
   * بدون ذلك تتداخل مزامنتان إن طالت الأولى أكثر من مهلة التأجيل، فتُدرج الصفوف مرتين.
   */
  syncAll(state) {
    this._pending = state;
    if (!this._running) {
      this._running = (async () => {
        while (this._pending) {
          const next = this._pending;
          this._pending = null;
          await this._syncOnce(next);
        }
      })().finally(() => { this._running = null; });
    }
    return this._running;
  }

  async _syncOnce({ services, segments, criteria, evals }) {
    if (!this.projectId) return;
    const pid = this.projectId;

    // 1) الخدمات: تحديث الموجود، إضافة الجديد، حذف المُزال من الواجهة
    for (const s of services) {
      if (this.serviceIdByCode[s.id]) {
        if (!this._changed(`services|${s.id}`, [s.ar, s.en || null])) continue;
        const { error } = await this.sb.from("services").update({ name_ar: s.ar, name_en: s.en || null })
          .eq("project_id", pid).eq("code", s.id);
        if (error) delete this.synced[`services|${s.id}`]; // يُعاد في المزامنة التالية
      } else {
        const { data, error } = await this.sb.from("services")
          .insert({ project_id: pid, code: s.id, name_ar: s.ar, name_en: s.en || null, sort: 99 })
          .select().single();
        if (!error && data) this.serviceIdByCode[s.id] = data.id;
      }
    }
    const currentSvcCodes = new Set(services.map((s) => s.id));
    for (const code of Object.keys(this.serviceIdByCode)) {
      if (!currentSvcCodes.has(code)) {
        await this.sb.from("services").delete().eq("id", this.serviceIdByCode[code]);
        delete this.serviceIdByCode[code];
        delete this.synced[`services|${code}`];
      }
    }

    // 2) الشرائح: نفس المنطق
    for (const s of segments) {
      if (this.segmentIdByCode[s.id]) {
        if (!this._changed(`segments|${s.id}`, [s.ar, s.en || null])) continue;
        const { error } = await this.sb.from("segments").update({ name_ar: s.ar, name_en: s.en || null })
          .eq("project_id", pid).eq("code", s.id);
        if (error) delete this.synced[`segments|${s.id}`]; // يُعاد في المزامنة التالية
      } else {
        const { data, error } = await this.sb.from("segments")
          .insert({ project_id: pid, code: s.id, name_ar: s.ar, name_en: s.en || null, sort: 99 })
          .select().single();
        if (!error && data) this.segmentIdByCode[s.id] = data.id;
      }
    }
    const currentSegCodes = new Set(segments.map((s) => s.id));
    for (const code of Object.keys(this.segmentIdByCode)) {
      if (!currentSegCodes.has(code)) {
        await this.sb.from("segments").delete().eq("id", this.segmentIdByCode[code]);
        delete this.segmentIdByCode[code];
        delete this.synced[`segments|${code}`];
      }
    }

    // 2) المعايير: تحديث الموجود، وإضافة الجديد فعلياً (ضروري للمشاريع الفارغة الجديدة)
    for (const c of criteria) {
      if (this.critIdByCode[c.id]) {
        if (!this._changed(`criteria|${c.id}`, [c.w, c.ar, c.en || null, c.g || null])) continue;
        const { error } = await this.sb.from("criteria").update({ weight: c.w, name_ar: c.ar, name_en: c.en || null, grp: c.g || null })
          .eq("project_id", pid).eq("code", c.id);
        if (error) delete this.synced[`criteria|${c.id}`]; // يُعاد في المزامنة التالية
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
        delete this.synced[`criteria|${code}`];
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
        // إن عادت التركيبة لاحقاً تُرسل تقييماتها كاملة
        for (const k of Object.keys(this.synced))
          if (k.startsWith(`scores|${key}|`) || k === `risks|${key}`) delete this.synced[k];
      }
    }

    // 4) التقييمات والمخاطر (Upsert دفعة واحدة)
    const scoreRows = [], scoreKeys = [];
    const riskRows = [], riskKeys = [];
    for (const [key, ev] of Object.entries(evals)) {
      const comboId = this.comboIdByKey[key];
      if (!comboId) continue;
      criteria.forEach((c, i) => {
        const critId = this.critIdByCode[c.id];
        if (!critId) return;
        if (!this._changed(`scores|${key}|${c.id}`, [ev.scores[i], ev.conf[i], ev.evidence[c.id] || null])) return;
        scoreKeys.push(`scores|${key}|${c.id}`);
        scoreRows.push({
          combination_id: comboId,
          criterion_id: critId,
          score: ev.scores[i],
          confidence: ev.conf[i],
          evidence: ev.evidence[c.id] || null,
        });
      });
      if (!this._changed(`risks|${key}`, [ev.risk, ev.riskNote || null])) continue;
      riskKeys.push(`risks|${key}`);
      riskRows.push({ combination_id: comboId, risk_score: ev.risk, note: ev.riskNote || null });
    }
    // عند الفشل تُنسى القيم المرسلة، فتُعاد في المزامنة التالية
    if (scoreRows.length) {
      const { error } = await this.sb.from("scores").upsert(scoreRows, { onConflict: "combination_id,criterion_id" });
      if (error) scoreKeys.forEach((k) => delete this.synced[k]);
    }
    if (riskRows.length) {
      const { error } = await this.sb.from("risks").upsert(riskRows, { onConflict: "combination_id" });
      if (error) riskKeys.forEach((k) => delete this.synced[k]);
    }
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
