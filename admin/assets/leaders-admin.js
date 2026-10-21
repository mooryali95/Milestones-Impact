// ══════════════════════════════════════════════════════
// وحدة "تطبيق القادة" في لوحة الإدارة الموحّدة
// ══════════════════════════════════════════════════════
// تعمل داخل نفس جلسة اللوحة: توكن admin-api (authToken) يُرسل إلى
// دالة leaders-api التي تتحقق منه في api_sessions. لا وصول مباشر للجداول.
// السياقات منفصلة تمامًا: طلبات التواصل · تطبيق القادة · مصفوفة التأثير (تطبيقها).
(() => {
  const API = `${SUPA_URL}/functions/v1/leaders-api`;

  const DIM = { milestone: 'إدارة المشروعات', impact: 'تحويل المشروع إلى أثر', leadership: 'تمكين القائد' };
  const DIM_EN = { milestone: 'Milestone', impact: 'Impact', leadership: 'Leadership' };
  const LVL = { beginner: 'تأسيسي', intermediate: 'متوسط', advanced: 'احترافي' };
  const TIER = { knowledge: 'معرفة', skill: 'مواقف', behavior: 'ممارسة' };
  const PHASE = { admission: 'القبول', qualification: 'التأهيل', impact: 'الأثر' };
  const KIND = { check: 'تأكيد إنجاز', upload: 'رفع ملف', form: 'نموذج', meeting: 'جلسة يسجلها المستشار', reading: 'قراءة', auto: 'تلقائي' };
  const STATUS = {
    registered: 'مسجّل', profiled: 'أكمل الملف', assessing: 'يجيب على القياس', pending_approval: 'بانتظار الاعتماد',
    placed: 'معتمد المستوى', enrolled: 'في البرنامج', completed: 'أنهى البرنامج', withdrawn: 'منسحب', suspended: 'موقوف',
  };
  const REQ = { pending: 'لم يُنجز', submitted: 'بانتظار المراجعة', done: 'منجز', returned: 'أُعيد' };
  const DIMS = Object.keys(DIM);
  const LVLS = Object.keys(LVL);

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '');
  const toast = (m) => (typeof showToast === 'function' ? showToast(m) : alert(m));
  const opts = (map, cur, empty) => (empty != null ? `<option value="">${esc(empty)}</option>` : '')
    + Object.entries(map).map(([v, l]) => `<option value="${esc(v)}"${String(cur ?? '') === v ? ' selected' : ''}>${esc(l)}</option>`).join('');

  const role = () => { try { const s = Session.load(); return s?.user?.role_id || s?.user?.role || 'viewer'; } catch { return 'viewer'; } };
  const canWrite = () => role() !== 'viewer';

  async function L(action, body = {}) {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
        body: JSON.stringify({ action, token: authToken, ...body }),
      });
      const d = await r.json();
      if (!d.success && d.code === 'session') toast('انتهت الجلسة، سجّل الدخول من جديد');
      return d;
    } catch { return { success: false, message: 'تعذّر الاتصال بالخادم' }; }
  }

  const S = { tab: 'overview', catalog: null, list: [], search: '', status: '', person: null, instrument: null, qDim: 'milestone' };
  const root = () => document.getElementById('ctx-leaders');

  // ══ السياق ══
  function setCtx(ctx) {
    const isLeaders = ctx === 'leaders';
    document.getElementById('ctx-contacts').hidden = isLeaders;
    root().hidden = !isLeaders;
    document.querySelectorAll('.ctx-tab[data-ctx]').forEach((b) => b.classList.toggle('active', b.dataset.ctx === ctx));
    document.getElementById('screen-dashboard').dataset.ctx = ctx;
    try { sessionStorage.setItem('mi_admin_ctx', ctx); } catch { /* */ }
    if (isLeaders) render(true);
  }
  window.LeadersAdmin = { setCtx };

  // ══ الهيكل ══
  const TABS = [
    ['overview', 'نظرة عامة'], ['participants', 'المشاركون'], ['journey', 'الرحلة والمتطلبات'],
    ['assessment', 'أسئلة القياس'], ['levels', 'المستويات والقواعد'], ['handbook', 'الكتيب'],
  ];

  function shell(inner) {
    return `
      <div class="page-header">
        <div class="page-header-left">
          <div class="page-eyebrow">Leaders Program</div>
          <div class="page-title">تطبيق القادة</div>
          <div class="page-title-ar">leaders.sunkvalue.com · المشاركون ومنهجية البرنامج</div>
        </div>
        ${canWrite() ? '' : '<span class="la-chip">عرض فقط</span>'}
      </div>
      <nav class="la-tabs">${TABS.map(([k, l]) => `<button data-act="tab" data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
      <div class="la-body">${inner}</div>`;
  }

  const loading = () => '<div class="la-load"><div class="spinner"></div></div>';

  async function render(refetch) {
    const el = root();
    if (!el) return;
    el.innerHTML = shell(loading());
    const body = el.querySelector('.la-body');
    try {
      if (S.tab === 'overview') body.innerHTML = await viewOverview();
      else if (S.tab === 'participants') body.innerHTML = S.person ? await viewPerson(S.person) : await viewList(refetch);
      else {
        if (!S.catalog || refetch) {
          const c = await L('admin.catalog');
          if (!c.success) { body.innerHTML = `<div class="la-err">${esc(c.message)}</div>`; return; }
          S.catalog = c;
        }
        body.innerHTML = { journey: viewJourney, assessment: viewAssessment, levels: viewLevels, handbook: viewHandbook }[S.tab]();
      }
    } catch (e) {
      console.error(e);
      body.innerHTML = '<div class="la-err">حدث خطأ في العرض</div>';
    }
  }

  // ══ نظرة عامة ══
  async function viewOverview() {
    const [o, r] = await Promise.all([L('admin.overview'), L('admin.reviews')]);
    if (!o.success) return `<div class="la-err">${esc(o.message)}</div>`;
    const st = (k) => o.by_status[k] || 0;
    const max = Math.max(1, ...DIMS.flatMap((d) => LVLS.map((l) => o.matrix[d][l])));
    return `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">المشاركون</div><div class="stat-value">${o.total}</div><div class="stat-sub">كل الحالات</div></div>
        <div class="stat-card"><div class="stat-label">بانتظار الاعتماد</div><div class="stat-value s-new">${st('pending_approval')}</div><div class="stat-sub">أنهوا القياس</div></div>
        <div class="stat-card"><div class="stat-label">متطلبات للمراجعة</div><div class="stat-value s-replied">${o.pending_reviews}</div><div class="stat-sub">أرسلها المشاركون</div></div>
        <div class="stat-card"><div class="stat-label">في البرنامج</div><div class="stat-value">${st('placed') + st('enrolled')}</div><div class="stat-sub">معتمدون</div></div>
      </div>
      <div class="la-grid2">
        <section class="la-card">
          <h3>توزيع المستويات (3×3)</h3>
          <table class="la-matrix"><thead><tr><th></th>${DIMS.map((d) => `<th>${DIM_EN[d]}<small>${DIM[d]}</small></th>`).join('')}</tr></thead>
          <tbody>${[...LVLS].reverse().map((l) => `<tr><th>${LVL[l]}</th>${DIMS.map((d) => {
            const n = o.matrix[d][l];
            return `<td style="--a:${(n / max).toFixed(2)}"><b>${n}</b></td>`;
          }).join('')}</tr>`).join('')}</tbody></table>
          <p class="la-muted">كل خلية = عدد المشاركين في هذا المستوى من هذا البُعد. المستوى مستقل في كل بُعد.</p>
        </section>
        <section class="la-card">
          <h3>ينتظر قرارك</h3>
          ${(r.pending_approval || []).length + (r.submitted || []).length === 0 ? '<p class="la-muted">لا شيء بانتظارك الآن.</p>' : ''}
          <ul class="la-queue">
            ${(r.pending_approval || []).map((p) => `<li><button class="la-link" data-act="open" data-id="${p.id}">${esc(p.full_name)}</button><span class="la-chip warn">اعتماد المستوى</span><small>${esc(p.organization_name || '')}</small></li>`).join('')}
            ${(r.submitted || []).map((x) => `<li><button class="la-link" data-act="open" data-id="${x.participant_id}">${esc(x.participants?.full_name)}</button><span class="la-chip">${esc(x.stage_requirements?.title_ar)}</span><small>${date(x.completed_at)}</small></li>`).join('')}
          </ul>
        </section>
      </div>
      <section class="la-card">
        <h3>الحالات</h3>
        <div class="la-pills">${Object.entries(STATUS).map(([k, l]) => `<button class="la-pill" data-act="filter-status" data-status="${k}">${l} <b>${st(k)}</b></button>`).join('')}</div>
      </section>`;
  }

  // ══ المشاركون ══
  async function viewList(refetch) {
    if (refetch || !S.list.length) {
      const r = await L('admin.participants', { search: S.search, status: S.status });
      if (!r.success) return `<div class="la-err">${esc(r.message)}</div>`;
      S.list = r.participants;
    }
    const lv = (p, d) => {
      const x = (p.placements || []).find((y) => y.dimension === d);
      return x ? `<span class="la-lvl ${x.level}${x.approved_at ? '' : ' tentative'}" title="${x.approved_at ? 'معتمد' : 'مبدئي'}">${LVL[x.level]}</span>` : '<span class="la-muted">·</span>';
    };
    return `
      <div class="toolbar">
        <div class="search-wrap"><input class="search-input" id="laSearch" placeholder="بحث بالاسم أو البريد أو الجهة…" value="${esc(S.search)}"></div>
        <select class="filter-select" id="laStatus">${opts(STATUS, S.status, 'كل الحالات')}</select>
        <button class="refresh-btn" data-act="search">بحث</button>
        ${canWrite() ? '<button class="refresh-btn" data-act="add-person">+ مشارك</button>' : ''}
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>الاسم</th><th>الجهة</th>${DIMS.map((d) => `<th>${DIM_EN[d]}</th>`).join('')}<th>الحالة</th><th>التسجيل</th></tr></thead>
        <tbody>${S.list.length ? S.list.map((p) => `
          <tr data-act="open" data-id="${p.id}">
            <td><b>${esc(p.full_name)}</b><br><small class="la-muted" dir="ltr">${esc(p.email)}</small></td>
            <td>${esc(p.organization_name || '')}<br><small class="la-muted">${esc(p.job_title || '')}</small></td>
            ${DIMS.map((d) => `<td>${lv(p, d)}</td>`).join('')}
            <td><span class="la-chip ${p.status === 'pending_approval' ? 'warn' : ''}">${STATUS[p.status] || p.status}</span></td>
            <td>${date(p.created_at)}</td>
          </tr>`).join('') : '<tr><td colspan="7" class="la-empty">لا مشاركين بعد</td></tr>'}
        </tbody></table></div>`;
  }

  async function viewPerson(id) {
    const r = await L('admin.participant', { id });
    if (!r.success) return `<div class="la-err">${esc(r.message)}</div>`;
    const p = r.participant;
    const prof = r.profile;
    const latest = (r.assessments || []).find((a) => a.status === 'submitted');
    const res = (d) => latest?.assessment_results?.find((x) => x.dimension === d);
    const pct = (v) => (v == null ? '·' : `${Math.round(v)}%`);
    const w = canWrite();
    return `
      <button class="la-link" data-act="back">→ كل المشاركين</button>
      <div class="la-person">
        <section class="la-card">
          <div class="la-row between"><h3>${esc(p.full_name)}</h3><span class="la-chip">${STATUS[p.status] || p.status}</span></div>
          <dl class="la-dl">
            <dt>البريد</dt><dd dir="ltr">${esc(p.email)}</dd>
            <dt>الجوال</dt><dd dir="ltr">${esc(p.phone || '')}</dd>
            <dt>المسمى</dt><dd>${esc(p.job_title || '')}</dd>
            <dt>الجهة</dt><dd>${esc(p.organization_name || '')}</dd>
            <dt>القطاع</dt><dd>${esc(p.sector || '')}</dd>
            <dt>الخبرة</dt><dd>${p.years_experience ?? ''} سنة</dd>
            <dt>LinkedIn</dt><dd>${p.linkedin_url ? `<a href="${esc(p.linkedin_url)}" target="_blank" rel="noopener noreferrer">فتح</a>` : ''}</dd>
            <dt>السيرة</dt><dd>${r.cv_url ? `<a href="${esc(r.cv_url)}" target="_blank" rel="noopener noreferrer">تنزيل (رابط مؤقت)</a>` : 'لم تُرفع'}</dd>
            <dt>آخر دخول</dt><dd>${date(p.last_login_at)}</dd>
          </dl>
          ${p.bio ? `<p class="la-bio">${esc(p.bio)}</p>` : ''}
          ${w ? `<div class="la-row">
            <select id="laSetStatus">${opts(STATUS, p.status)}</select>
            <button class="btn-sm ghost" data-act="set-status" data-id="${p.id}">تغيير الحالة</button>
            <button class="btn-sm ghost" data-act="reset" data-id="${p.id}">إعادة القياس</button>
          </div>` : ''}
        </section>

        <section class="la-card">
          <div class="la-row between"><h3>المستوى في الأبعاد الثلاثة</h3>${prof ? (prof.approved ? '<span class="la-chip ok">معتمد</span>' : '<span class="la-chip warn">مبدئي، بانتظارك</span>') : ''}</div>
          ${!prof && !latest ? '<p class="la-muted">لم يُكمل القياس بعد. يمكنك تحديد مستواه يدويًا واعتماده.</p>' : ''}
          <table class="la-table"><thead><tr><th>البُعد</th><th>معرفة</th><th>مواقف</th><th>ممارسة</th><th>المستوى</th><th>ملاحظة للمشارك</th></tr></thead><tbody>
          ${DIMS.map((d) => {
            const x = prof?.dimensions.find((y) => y.dimension === d);
            const rr = res(d);
            return `<tr><td><b>${DIM_EN[d]}</b><br><small>${DIM[d]}</small></td>
              <td>${pct(rr?.knowledge_pct)}</td><td>${pct(rr?.skill_pct)}</td><td>${pct(rr?.behavior_pct)}</td>
              <td>${w ? `<select data-lvl="${d}">${opts(LVL, x?.level, '...')}</select>` : LVL[x?.level] || ''}${rr && x && rr.level !== x.level ? `<br><small class="la-muted">القياس: ${LVL[rr.level]}</small>` : ''}</td>
              <td>${w ? `<input data-note="${d}" value="${esc(x?.note || '')}" placeholder="اختياري">` : esc(x?.note || '')}</td></tr>`;
          }).join('')}
          </tbody></table>
          ${w ? `<button class="btn-sm primary" data-act="approve" data-id="${p.id}">${prof?.approved ? 'تحديث الاعتماد' : 'اعتماد المسار وفتح البرنامج'}</button>
          <p class="la-muted">الاعتماد يفتح مراحل التأهيل والكتيب للمشارك ويرسل له بريدًا.</p>` : ''}
        </section>
      </div>

      <section class="la-card">
        <div class="la-row between"><h3>الرحلة</h3><span class="la-muted">${r.progress}% · ${r.journey.filter((s) => s.status === 'done').length}/${r.journey.length} مراحل</span></div>
        <div class="la-journey">${r.journey.map((s) => `
          <div class="la-stage ${s.status}">
            <div class="la-row between"><b>${esc(s.title_ar)}</b><span class="la-chip ${s.status === 'done' ? 'ok' : s.status === 'active' ? 'warn' : ''}">${{ done: 'مكتملة', active: 'الحالية', locked: 'مقفلة' }[s.status]}</span></div>
            <ul>${s.items.map((it) => `<li class="${it.status}">
              <span>${it.status === 'done' ? '✓' : it.status === 'submitted' ? '●' : '○'} ${esc(it.title_ar)} <small class="la-muted">${REQ[it.status]}</small></span>
              <span class="la-row">
                ${it.evidence_path ? `<button class="la-link" data-act="evidence" data-path="${esc(it.evidence_path)}">الملف</button>` : ''}
                ${w && !it.auto && s.status !== 'locked' ? `
                  ${it.status !== 'done' ? `<button class="btn-sm primary" data-act="review" data-id="${p.id}" data-req="${it.id}" data-status="done">اعتماد</button>` : ''}
                  ${it.status === 'submitted' ? `<button class="btn-sm ghost" data-act="review" data-id="${p.id}" data-req="${it.id}" data-status="returned">إعادة مع ملاحظة</button>` : ''}
                  ${it.status === 'done' ? `<button class="btn-sm ghost" data-act="review" data-id="${p.id}" data-req="${it.id}" data-status="pending">إلغاء</button>` : ''}` : ''}
              </span></li>`).join('') || '<li class="la-muted">لا متطلبات</li>'}</ul>
          </div>`).join('')}</div>
      </section>

      <section class="la-card"><h3>السجل</h3><ul class="la-log">${(r.history || []).map((h) => `<li><small>${date(h.created_at)}</small> ${esc(h.action)} <small class="la-muted">${esc(h.actor || '')}</small></li>`).join('') || '<li class="la-muted">لا شيء</li>'}</ul></section>`;
  }

  // ══ محرر عام ══
  // fields: [name, label, type, extra]  type: text|textarea|number|select|check|options
  function openForm(title, fields, values, onSave, onDelete) {
    let dlg = document.getElementById('laDialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'laDialog';
      dlg.className = 'la-dialog';
      document.body.appendChild(dlg);
    }
    const v = values || {};
    const field = ([name, label, type, extra]) => {
      const val = v[name];
      if (type === 'textarea') return `<label><span>${label}</span><textarea name="${name}" rows="${extra?.rows || 4}">${esc(val)}</textarea></label>`;
      if (type === 'number') return `<label><span>${label}</span><input type="number" name="${name}" value="${esc(val)}" step="any"></label>`;
      if (type === 'select') return `<label><span>${label}</span><select name="${name}">${opts(extra.map, val, extra.empty)}</select></label>`;
      if (type === 'check') return `<label class="la-check"><input type="checkbox" name="${name}"${val ? ' checked' : ''}> <span>${label}</span></label>`;
      if (type === 'options') {
        const list = Array.isArray(val) && val.length ? val : [{ label: '', score: 0 }, { label: '', score: 0 }];
        return `<div class="la-opts"><span>${label}</span><div data-opts>${list.map(optRow).join('')}</div>
          <button type="button" class="la-link" data-add-opt>+ خيار</button></div>`;
      }
      return `<label><span>${label}</span><input name="${name}" value="${esc(val)}"></label>`;
    };
    dlg.innerHTML = `<form method="dialog" class="la-form">
      <h3>${esc(title)}</h3>
      ${fields.map(field).join('')}
      <div class="la-err" hidden></div>
      <div class="la-row">
        <button class="btn-sm primary" value="save">حفظ</button>
        <button class="btn-sm ghost" value="cancel" formnovalidate>إلغاء</button>
        ${onDelete ? '<span style="flex:1"></span><button class="btn-sm danger" value="delete" formnovalidate>حذف</button>' : ''}
      </div></form>`;
    const form = dlg.querySelector('form');
    form.addEventListener('click', (e) => {
      if (e.target.matches('[data-add-opt]')) form.querySelector('[data-opts]').insertAdjacentHTML('beforeend', optRow({ label: '', score: 0 }));
      if (e.target.matches('[data-del-opt]')) e.target.closest('.la-opt').remove();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter?.value;
      if (btn === 'cancel') return dlg.close();
      const err = form.querySelector('.la-err');
      let res;
      if (btn === 'delete') {
        if (!confirm('حذف نهائي؟')) return;
        res = await onDelete();
      } else {
        const out = {};
        for (const [name, , type] of fields) {
          if (type === 'check') out[name] = form.elements[name].checked;
          else if (type === 'number') out[name] = form.elements[name].value === '' ? null : Number(form.elements[name].value);
          else if (type === 'options') {
            out[name] = [...form.querySelectorAll('.la-opt')].map((r) => ({
              label: r.querySelector('[data-l]').value.trim(), score: Number(r.querySelector('[data-s]').value || 0),
            })).filter((o) => o.label);
          } else out[name] = form.elements[name].value.trim() || null;
        }
        res = await onSave(out);
      }
      if (res?.success) { dlg.close(); toast('تم الحفظ'); render(true); } else { err.hidden = false; err.textContent = res?.message || 'تعذّر الحفظ'; }
    });
    dlg.showModal();
  }
  const optRow = (o) => `<div class="la-opt"><input data-l value="${esc(o.label)}" placeholder="نص الخيار"><input data-s type="number" step="any" value="${esc(o.score)}" title="الدرجة"><button type="button" class="la-link" data-del-opt>✕</button></div>`;

  const saveRow = (entity, base) => (row) => L('admin.save', { entity, row: { ...base, ...row } });
  const delRow = (entity, id) => () => L('admin.delete', { entity, id });
  const moveBtns = (entity, id) => (canWrite()
    ? `<button class="la-mv" data-act="move" data-entity="${entity}" data-id="${id}" data-dir="-1" title="أعلى">▲</button><button class="la-mv" data-act="move" data-entity="${entity}" data-id="${id}" data-dir="1" title="أسفل">▼</button>` : '');

  // ══ الرحلة ══
  const STAGE_FIELDS = [
    ['title_ar', 'اسم المرحلة'], ['phase', 'المحور', 'select', { map: PHASE }],
    ['duration_label', 'المدة كما تظهر للمشارك'], ['duration_days', 'المدة بالأيام', 'number'],
    ['description_ar', 'الوصف', 'textarea', { rows: 3 }], ['activities_ar', 'ماذا يتم', 'textarea', { rows: 3 }],
    ['outcome_ar', 'ما يخرج به المشارك', 'textarea', { rows: 3 }], ['active', 'ظاهرة للمشاركين', 'check'],
  ];
  function viewJourney() {
    const w = canWrite();
    const stages = [...S.catalog.journey_stages].sort((a, b) => a.sort - b.sort);
    const reqs = S.catalog.stage_requirements;
    return `
      <p class="la-muted">ما تحرره هنا يظهر للمشارك مباشرة في رحلته. الترتيب بالأسهم، والمتطلب يمكن تخصيصه لبُعد ومستوى.</p>
      ${Object.entries(PHASE).map(([ph, phl]) => `
        <h3 class="la-phase">${phl}</h3>
        ${stages.filter((s) => s.phase === ph).map((s) => `
          <section class="la-card la-stage-ed${s.active ? '' : ' off'}">
            <div class="la-row between">
              <div><b>${s.sort}. ${esc(s.title_ar)}</b> <small class="la-muted">${esc(s.duration_label)}${s.active ? '' : ' · مخفية'}</small></div>
              <div class="la-row">${moveBtns('journey_stages', s.key)}${w ? `<button class="btn-sm ghost" data-act="edit-stage" data-key="${s.key}">تحرير</button>` : ''}</div>
            </div>
            ${s.description_ar ? `<p class="la-muted">${esc(s.description_ar)}</p>` : ''}
            <ul class="la-reqs">${reqs.filter((r) => r.stage_key === s.key).sort((a, b) => a.sort - b.sort).map((r) => `
              <li class="${r.active ? '' : 'off'}">
                <span><code>${esc(r.code)}</code> ${esc(r.title_ar)}
                  <small class="la-chip">${KIND[r.kind]}</small>
                  ${r.dimension ? `<small class="la-chip">${DIM_EN[r.dimension]}${r.level ? ` · ${LVL[r.level]}` : ''}</small>` : ''}
                  ${r.required ? '' : '<small class="la-chip">اختياري</small>'}
                  ${r.needs_review ? '<small class="la-chip warn">مراجعة</small>' : ''}
                </span>
                <span class="la-row">${moveBtns('stage_requirements', r.id)}${w ? `<button class="la-link" data-act="edit-req" data-id="${r.id}">تحرير</button>` : ''}</span>
              </li>`).join('')}</ul>
            ${w ? `<button class="la-link" data-act="add-req" data-stage="${s.key}">+ متطلب</button>` : ''}
          </section>`).join('')}`).join('')}`;
  }

  function reqFields() {
    return [
      ['code', 'الرمز (فريد، مثل T-ATTEND)'], ['title_ar', 'نص المتطلب'], ['help_ar', 'توضيح للمشارك', 'textarea', { rows: 2 }],
      ['stage_key', 'المرحلة', 'select', { map: Object.fromEntries(S.catalog.journey_stages.map((s) => [s.key, s.title_ar])) }],
      ['kind', 'النوع', 'select', { map: KIND }],
      ['dimension', 'خاص ببُعد', 'select', { map: DIM, empty: 'للجميع' }],
      ['level', 'وبمستوى', 'select', { map: LVL, empty: 'كل المستويات' }],
      ['required', 'إلزامي لإكمال المرحلة', 'check'], ['needs_review', 'يعتمده المستشار بعد الإنجاز', 'check'], ['active', 'مفعّل', 'check'],
    ];
  }

  // ══ القياس ══
  function viewAssessment() {
    const w = canWrite();
    const insts = [...S.catalog.instruments].sort((a, b) => (a.kind + b.version).localeCompare(b.kind + a.version));
    if (!S.instrument || !insts.some((i) => i.id === S.instrument)) S.instrument = (insts.find((i) => i.active && i.kind === 'baseline') || insts[0])?.id;
    const inst = insts.find((i) => i.id === S.instrument);
    if (!inst) return '<p class="la-muted">لا أدوات قياس.</p>';
    const locked = S.catalog.locked_instruments.includes(inst.id);
    const qs = S.catalog.questions.filter((q) => q.instrument_id === inst.id && q.dimension === S.qDim).sort((a, b) => a.sort - b.sort);
    const count = (d) => S.catalog.questions.filter((q) => q.instrument_id === inst.id && q.dimension === d && q.active).length;
    return `
      <div class="la-row">
        <select id="laInst">${insts.map((i) => `<option value="${i.id}"${i.id === inst.id ? ' selected' : ''}>${esc(i.title_ar)} · ${esc(i.key)}${i.active ? ' (فعّال)' : ''}</option>`).join('')}</select>
        ${w ? `<button class="btn-sm ghost" data-act="edit-inst" data-id="${inst.id}">المقدمة والمدة</button>
        <button class="btn-sm ghost" data-act="clone-inst" data-id="${inst.id}">إصدار جديد</button>
        ${inst.active ? '' : `<button class="btn-sm primary" data-act="activate-inst" data-id="${inst.id}">تفعيل هذا الإصدار</button>`}` : ''}
      </div>
      ${locked ? '<div class="la-note">لهذا الإصدار نتائج سابقة، فيُسمح بتعديل الصياغة والترتيب فقط. لتغيير الخيارات أو الدرجات أو إضافة أسئلة أنشئ إصدارًا جديدًا ثم فعّله؛ النتائج القديمة تبقى سليمة.</div>' : ''}
      <nav class="la-subtabs">${DIMS.map((d) => `<button data-act="qdim" data-dim="${d}" class="${S.qDim === d ? 'on' : ''}">${DIM_EN[d]} <small>${count(d)}</small></button>`).join('')}</nav>
      ${Object.entries(TIER).map(([t, tl]) => `
        <h4 class="la-phase">${tl}</h4>
        <ol class="la-qs">${qs.filter((q) => q.tier === t).map((q) => `
          <li class="${q.active ? '' : 'off'}">
            <div class="la-row between"><span><code>${esc(q.code)}</code> ${esc(q.text_ar)}</span><span class="la-row">${moveBtns('questions', q.id)}${w ? `<button class="la-link" data-act="edit-q" data-id="${q.id}">تحرير</button>` : ''}</span></div>
            <div class="la-qopts">${(q.options || []).map((o) => `<span class="${Number(o.score) > 0 ? 'good' : ''}">${esc(o.label)} <b>${o.score}</b></span>`).join('')}</div>
          </li>`).join('')}</ol>`).join('')}
      ${w && !locked ? `<button class="btn-sm primary" data-act="add-q">+ سؤال في ${DIM_EN[S.qDim]}</button>` : ''}`;
  }

  const Q_FIELDS = [
    ['code', 'الرمز (مثل M-K5)'], ['tier', 'المستوى المقيس', 'select', { map: TIER }],
    ['kind', 'نوع الإجابة', 'select', { map: { choice: 'اختيار من متعدد', likert: 'مقياس تكرار' } }],
    ['text_ar', 'نص السؤال', 'textarea', { rows: 3 }], ['help_ar', 'تلميح يظهر تحته', 'textarea', { rows: 2 }],
    ['options', 'الخيارات والدرجات (الأعلى = الأفضل)', 'options'], ['weight', 'الوزن', 'number'], ['active', 'مفعّل', 'check'],
  ];
  const Q_SAFE = Q_FIELDS.filter(([n]) => ['text_ar', 'help_ar'].includes(n));

  // ══ المستويات ══
  function viewLevels() {
    const w = canWrite();
    const cell = (d, l) => S.catalog.grid_cells.find((c) => c.dimension === d && c.level === l) || {};
    const rule = (d, l) => S.catalog.level_rules.find((r) => r.dimension === d && r.level === l) || {};
    return `
      <section class="la-card">
        <h3>خلايا المصفوفة: ما يقرؤه المشارك عن مستواه ومساره</h3>
        <div class="la-cells">
          <div></div>${DIMS.map((d) => `<div class="la-ch">${DIM_EN[d]}<small>${DIM[d]}</small></div>`).join('')}
          ${LVLS.map((l) => `<div class="la-ch">${LVL[l]}</div>${DIMS.map((d) => {
            const c = cell(d, l);
            return `<div class="la-cell" ${w ? `data-act="edit-cell" data-d="${d}" data-l="${l}"` : ''}><b>${esc(c.path_title_ar || 'بلا عنوان مسار')}</b><p>${esc(c.description_ar || '')}</p></div>`;
          }).join('')}`).join('')}
        </div>
      </section>
      <section class="la-card">
        <h3>قواعد تحديد المستوى</h3>
        <p class="la-muted">يُمنح المشارك أعلى مستوى تتحقق كل شروطه في البُعد. النسب من 0 إلى 100 لكل نوع من الأسئلة.</p>
        <table class="la-table"><thead><tr><th>البُعد</th><th>المستوى</th><th>معرفة ≥</th><th>مواقف ≥</th><th>ممارسة ≥</th><th></th></tr></thead><tbody>
        ${DIMS.flatMap((d) => LVLS.map((l) => {
          const r = rule(d, l);
          return `<tr><td>${DIM_EN[d]}</td><td>${LVL[l]}</td>
            ${['min_knowledge', 'min_skill', 'min_behavior'].map((k) => `<td>${w ? `<input type="number" min="0" max="100" data-rule="${d}|${l}|${k}" value="${r[k] ?? 0}">` : r[k]}</td>`).join('')}
            <td>${w ? `<button class="la-link" data-act="save-rule" data-d="${d}" data-l="${l}">حفظ</button>` : ''}</td></tr>`;
        })).join('')}
        </tbody></table>
      </section>`;
  }

  // ══ الكتيب ══
  function viewHandbook() {
    const w = canWrite();
    const mods = S.catalog.handbook_modules;
    return `
      <p class="la-muted">كتيب كل مشارك = الأبواب التي مستواها الأدنى ≤ مستواه في ذلك البُعد. يُعرض للقراءة فقط داخل المنصة بعلامة مائية باسم المشارك.</p>
      ${DIMS.map((d) => `
        <h3 class="la-phase">${DIM_EN[d]} · ${DIM[d]}</h3>
        <ul class="la-reqs">${mods.filter((m) => m.dimension === d).sort((a, b) => a.sort - b.sort).map((m) => `
          <li><span>${esc(m.title_ar)} <small class="la-chip">من ${LVL[m.min_level]}</small> <small class="la-muted">${(m.body_md || '').length ? `${(m.body_md || '').length} حرف` : 'بلا محتوى بعد'}</small></span>
          <span class="la-row">${moveBtns('handbook_modules', m.id)}${w ? `<button class="la-link" data-act="edit-mod" data-id="${m.id}">تحرير</button>` : ''}</span></li>`).join('')}</ul>
        ${w ? `<button class="la-link" data-act="add-mod" data-dim="${d}">+ باب</button>` : ''}`).join('')}`;
  }
  const MOD_FIELDS = [
    ['title_ar', 'عنوان الباب'], ['chapter_key', 'مفتاح الباب (فريد داخل البُعد)'],
    ['min_level', 'يظهر ابتداءً من مستوى', 'select', { map: LVL }], ['body_md', 'المحتوى (Markdown)', 'textarea', { rows: 14 }],
  ];

  // ══ الأحداث ══
  async function move(entity, id, dir) {
    const key = entity === 'journey_stages' ? 'key' : 'id';
    let list = [...S.catalog[entity]];
    if (entity === 'stage_requirements') { const r = list.find((x) => x.id === id); list = list.filter((x) => x.stage_key === r.stage_key); }
    if (entity === 'questions') { const q = list.find((x) => x.id === id); list = list.filter((x) => x.instrument_id === q.instrument_id); }
    if (entity === 'handbook_modules') { const m = list.find((x) => x.id === id); list = list.filter((x) => x.dimension === m.dimension); }
    list.sort((a, b) => a.sort - b.sort);
    const i = list.findIndex((x) => x[key] === id);
    const j = i + Number(dir);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const r = await L('admin.reorder', { entity, ids: list.map((x) => x[key]) });
    if (!r.success) return toast(r.message);
    render(true);
  }

  document.addEventListener('click', async (e) => {
    const ctxBtn = e.target.closest('.ctx-tab[data-ctx]');
    if (ctxBtn) { setCtx(ctxBtn.dataset.ctx); return; }
    const el = root();
    if (!el || el.hidden || !el.contains(e.target)) return;
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const a = t.dataset.act;
    const c = S.catalog;

    if (a === 'tab') { S.tab = t.dataset.tab; S.person = null; return render(); }
    if (a === 'open') { S.tab = 'participants'; S.person = t.dataset.id; return render(); }
    if (a === 'back') { S.person = null; return render(); }
    if (a === 'filter-status') { S.tab = 'participants'; S.status = t.dataset.status; S.person = null; return render(true); }
    if (a === 'search') { S.search = el.querySelector('#laSearch').value.trim(); S.status = el.querySelector('#laStatus').value; return render(true); }
    if (a === 'qdim') { S.qDim = t.dataset.dim; return render(); }
    if (a === 'move') return move(t.dataset.entity, t.dataset.id, t.dataset.dir);

    if (a === 'evidence') {
      const r = await L('admin.evidence-url', { path: t.dataset.path });
      if (r.success) window.open(r.url, '_blank', 'noopener'); else toast(r.message);
      return;
    }
    if (a === 'approve') {
      const levels = {}, notes = {};
      el.querySelectorAll('[data-lvl]').forEach((s) => { levels[s.dataset.lvl] = s.value; });
      el.querySelectorAll('[data-note]').forEach((s) => { notes[s.dataset.note] = s.value; });
      if (Object.values(levels).some((v) => !v)) return toast('حدّد مستوى كل بُعد');
      if (!confirm('اعتماد المسار وإبلاغ المشارك بالبريد؟')) return;
      const r = await L('admin.approve', { participant_id: t.dataset.id, levels, notes });
      toast(r.success ? 'اعتُمد المسار وأُبلغ المشارك' : r.message);
      return r.success && render();
    }
    if (a === 'set-status') {
      const r = await L('admin.status', { participant_id: t.dataset.id, status: el.querySelector('#laSetStatus').value });
      toast(r.success ? 'تم التحديث' : r.message);
      return r.success && render();
    }
    if (a === 'reset') {
      if (!confirm('يُلغى القياس الحالي ويعيده المشارك من البداية. المستوى المعتمد يبقى حتى تعتمد غيره. متابعة؟')) return;
      const r = await L('admin.reset-assessment', { participant_id: t.dataset.id });
      toast(r.success ? 'أُعيد فتح القياس' : r.message);
      return r.success && render();
    }
    if (a === 'review') {
      let note = null;
      if (t.dataset.status === 'returned') { note = prompt('ملاحظة للمشارك: ما المطلوب تعديله؟'); if (note === null) return; }
      const r = await L('admin.review', { participant_id: t.dataset.id, requirement_id: t.dataset.req, status: t.dataset.status, note });
      toast(r.success ? 'تم' : r.message);
      return r.success && render();
    }
    if (a === 'add-person') {
      return openForm('إضافة مشارك', [['full_name', 'الاسم'], ['email', 'البريد'], ['organization_name', 'الجهة'], ['job_title', 'المسمى']], {},
        (row) => L('admin.create-participant', row));
    }

    if (a === 'edit-stage') {
      const s = c.journey_stages.find((x) => x.key === t.dataset.key);
      return openForm(`مرحلة: ${s.title_ar}`, STAGE_FIELDS, s, saveRow('journey_stages', { key: s.key }));
    }
    if (a === 'edit-req') {
      const r = c.stage_requirements.find((x) => x.id === t.dataset.id);
      return openForm('تحرير متطلب', reqFields(), r, saveRow('stage_requirements', { id: r.id }), delRow('stage_requirements', r.id));
    }
    if (a === 'add-req') {
      const n = c.stage_requirements.filter((x) => x.stage_key === t.dataset.stage).length;
      return openForm('متطلب جديد', reqFields(), { stage_key: t.dataset.stage, kind: 'check', required: true, active: true },
        saveRow('stage_requirements', { sort: n + 1 }));
    }
    if (a === 'edit-q') {
      const q = c.questions.find((x) => x.id === t.dataset.id);
      const locked = c.locked_instruments.includes(q.instrument_id);
      return openForm(`سؤال ${q.code}`, locked ? Q_SAFE : Q_FIELDS, q, saveRow('questions', { id: q.id }), locked ? null : delRow('questions', q.id));
    }
    if (a === 'add-q') {
      const n = c.questions.filter((x) => x.instrument_id === S.instrument).length;
      return openForm(`سؤال جديد في ${DIM_EN[S.qDim]}`, Q_FIELDS, { tier: 'knowledge', kind: 'choice', weight: 1, active: true },
        saveRow('questions', { instrument_id: S.instrument, dimension: S.qDim, sort: n + 1 }));
    }
    if (a === 'edit-inst') {
      const i = c.instruments.find((x) => x.id === t.dataset.id);
      return openForm('أداة القياس', [['title_ar', 'العنوان'], ['intro_ar', 'المقدمة للمشارك', 'textarea', { rows: 4 }], ['est_minutes', 'المدة التقديرية بالدقائق', 'number']],
        i, saveRow('instruments', { id: i.id }));
    }
    if (a === 'clone-inst') {
      if (!confirm('إنشاء إصدار جديد غير مفعّل بنسخة من كل الأسئلة؟')) return;
      const r = await L('admin.clone-instrument', { id: t.dataset.id });
      if (!r.success) return toast(r.message);
      S.instrument = r.instrument.id; toast('أُنشئ الإصدار. عدّله ثم فعّله'); return render(true);
    }
    if (a === 'activate-inst') {
      if (!confirm('تفعيل هذا الإصدار للمشاركين الجدد؟ من بدأ القياس يكمل على إصداره.')) return;
      const r = await L('admin.activate-instrument', { id: t.dataset.id });
      toast(r.success ? 'فُعّل' : r.message); return r.success && render(true);
    }
    if (a === 'edit-cell') {
      const { d, l } = t.dataset;
      const cell = c.grid_cells.find((x) => x.dimension === d && x.level === l) || {};
      return openForm(`${DIM_EN[d]} · ${LVL[l]}`, [['path_title_ar', 'عنوان المسار'], ['description_ar', 'الوصف للمشارك', 'textarea', { rows: 5 }]],
        cell, saveRow('grid_cells', { dimension: d, level: l }));
    }
    if (a === 'save-rule') {
      const { d, l } = t.dataset;
      const row = { dimension: d, level: l };
      el.querySelectorAll(`[data-rule^="${d}|${l}|"]`).forEach((i) => { row[i.dataset.rule.split('|')[2]] = Number(i.value); });
      const r = await L('admin.save', { entity: 'level_rules', row });
      toast(r.success ? 'حُفظت القاعدة' : r.message); return r.success && render(true);
    }
    if (a === 'edit-mod') {
      const m = c.handbook_modules.find((x) => x.id === t.dataset.id);
      return openForm(`باب: ${m.title_ar}`, MOD_FIELDS, m, saveRow('handbook_modules', { id: m.id }), delRow('handbook_modules', m.id));
    }
    if (a === 'add-mod') {
      const n = c.handbook_modules.filter((x) => x.dimension === t.dataset.dim).length;
      return openForm('باب جديد', MOD_FIELDS, { min_level: 'beginner' }, saveRow('handbook_modules', { dimension: t.dataset.dim, sort: n + 1 }));
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'laInst') { S.instrument = e.target.value; render(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'laSearch') { S.search = e.target.value.trim(); render(true); }
  });

  // السياق المحفوظ عند تحديث الصفحة
  document.addEventListener('DOMContentLoaded', () => {
    let ctx = 'contacts';
    try { ctx = location.hash === '#leaders' ? 'leaders' : sessionStorage.getItem('mi_admin_ctx') || 'contacts'; } catch { /* */ }
    const wait = setInterval(() => {
      if (typeof authToken !== 'undefined' && authToken) { clearInterval(wait); setCtx(ctx); }
    }, 300);
  });
})();
