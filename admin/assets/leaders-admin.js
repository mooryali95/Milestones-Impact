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
  // رمز المسار من الأطر الثلاثة: M1I1L2 = مبتدئ، مبتدئ، متوسط (27 مسارًا)
  const trackOf = (levels) => {
    const n = DIMS.map((d) => LVLS.indexOf(levels[d]) + 1);
    return n.every((x) => x > 0) ? `M${n[0]}I${n[1]}L${n[2]}` : null;
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '');
  const toast = (m) => (typeof showToast === 'function' ? showToast(m) : alert(m));
  const opts = (map, cur, empty) => (empty != null ? `<option value="">${esc(empty)}</option>` : '')
    + Object.entries(map).map(([v, l]) => `<option value="${esc(v)}"${String(cur ?? '') === v ? ' selected' : ''}>${esc(l)}</option>`).join('');

  // عرض محتوى الكتيب كما يقرؤه المشارك: عناوين وبنود وغامق واقتباس
  function mdHtml(text) {
    const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const out = [];
    let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of String(text || '').split('\n')) {
      const line = raw.trim();
      let m;
      if (!line) { close(); continue; }
      if ((m = line.match(/^(#{2,4})\s+(.*)$/))) { close(); out.push(`<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`); continue; }
      if ((m = line.match(/^[-•]\s+(.*)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
      if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
      if ((m = line.match(/^>\s?(.*)$/))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
      close(); out.push(`<p>${inline(line)}</p>`);
    }
    close();
    return out.join('');
  }

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

  const S = { tab: 'overview', catalog: null, list: [], search: '', status: '', person: null, instrument: null, qDim: 'milestone', track: null, onlyUsed: false, org: '', orgView: null, orgList: null, of: { status: '', track: '', q: '' }, picked: new Set() };
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
    ['overview', 'نظرة عامة'], ['orgs', 'الجهات'], ['participants', 'المشاركون'], ['journey', 'الرحلة والمتطلبات'],
    ['assessment', 'أسئلة القياس'], ['levels', 'المستويات والقواعد'], ['tracks', 'المسارات الـ27'], ['handbook', 'الكتيب'],
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
      else if (S.tab === 'orgs') body.innerHTML = S.orgView ? await viewOrg(S.orgView, refetch) : await viewOrgs();
      else {
        if (!S.catalog || refetch) {
          const c = await L('admin.catalog');
          if (!c.success) { body.innerHTML = `<div class="la-err">${esc(c.message)}</div>`; return; }
          S.catalog = c;
        }
        body.innerHTML = S.tab === 'tracks' && S.track ? await viewTrack(S.track)
          : { journey: viewJourney, assessment: viewAssessment, levels: viewLevels, tracks: viewTracks, handbook: viewHandbook }[S.tab]();
      }
    } catch (e) {
      console.error(e);
      body.innerHTML = '<div class="la-err">حدث خطأ في العرض</div>';
    }
  }

  // ══ الجهات ══
  const APP_URL = 'https://leaders.sunkvalue.com';
  const inviteUrl = (o, c) => `${APP_URL}/j/${encodeURIComponent(o.invite_code || '')}${c ? `/${encodeURIComponent(c)}` : ''}`;
  const VIA = { link: 'رابط الجهة', domain: 'موقع الجهة', admin: 'نقل يدوي', none: 'غير محدد' };
  const domainsOf = (o) => (Array.isArray(o?.domains) ? o.domains : []);
  const orgColor = (o) => o?.color || '#A97A2E';
  async function orgList(force) {
    if (!S.orgList || force) { const r = await L('admin.orgs'); S.orgList = r.success ? r : { orgs: [], unassigned: {} }; }
    return S.orgList;
  }
  const orgSelect = (id, cur, all = 'كل الجهات') => `<select class="filter-select" id="${id}">
      <option value="">${all}</option>${(S.orgList?.orgs || []).map((o) => `<option value="${o.id}"${cur === o.id ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}
      <option value="none"${cur === 'none' ? ' selected' : ''}>بدون جهة</option></select>`;
  const FUNNEL = [['registered', 'سجّل'], ['profiled', 'أكمل الملف'], ['assessed', 'أنهى القياس'], ['approved', 'اعتُمد مساره'], ['completed', 'أنهى البرنامج']];
  function funnelHtml(f, big) {
    const top = Math.max(1, f.registered || 0);
    return `<div class="la-funnel${big ? ' big' : ''}">${FUNNEL.map(([k, l]) => `
      <div class="la-fn"><span class="la-fn-l">${l}</span><span class="la-fn-bar"><i style="width:${((f[k] || 0) / top * 100).toFixed(1)}%"></i></span><b>${f[k] || 0}</b></div>`).join('')}</div>`;
  }
  const seatsHtml = (n, seats) => seats ? `<div class="la-seats"><div class="la-row between"><span>المقاعد</span><b>${n} <small>/ ${seats}</small></b></div>
      <span class="la-fn-bar"><i style="width:${Math.min(100, n / seats * 100).toFixed(1)}%"></i></span></div>`
    : `<div class="la-seats"><div class="la-row between"><span>المشاركون</span><b>${n}</b></div></div>`;
  const ORG_FIELDS = [
    ['name', 'اسم الجهة'], ['short_name', 'اسم مختصر (اختياري)'], ['seats', 'عدد المقاعد المتعاقد عليها', 'number'],
    ['color', 'لون الجهة (مثل #12414E)'], ['invite_code', 'رمز رابط الدعوة (يُولَّد تلقائيًا إن تُرك فارغًا)'],
    ['domains', 'مواقع الجهة: من يصل منها يُنسب لها تلقائيًا (مثل mi.manzoma.sa، افصل بفاصلة)'],
    ['sector', 'القطاع'], ['contact_name', 'منسق الجهة'], ['contact_email', 'بريد المنسق'], ['contact_phone', 'جوال المنسق'],
    ['status', 'الحالة', 'select', { map: { active: 'نشطة', inactive: 'موقوفة (يتعطل رابطها)' } }], ['notes', 'ملاحظات', 'textarea', { rows: 3 }],
  ];

  async function viewOrgs() {
    const d = await orgList(true);
    const w = canWrite();
    const list = d.orgs || [];
    const un = d.unassigned || {};
    const total = list.reduce((a, o) => a + o.stats.total, 0) + (un.total || 0);
    const seats = list.reduce((a, o) => a + (o.seats || 0), 0);
    const filled = list.reduce((a, o) => a + (o.seats ? o.stats.total : 0), 0);
    return `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">الجهات</div><div class="stat-value">${list.length}</div><div class="stat-sub">${list.filter((o) => o.status !== 'inactive').length} نشطة</div></div>
        <div class="stat-card"><div class="stat-label">المشاركون</div><div class="stat-value">${total}</div><div class="stat-sub">من كل الجهات</div></div>
        <div class="stat-card"><div class="stat-label">المقاعد المشغولة</div><div class="stat-value s-replied">${filled}<small> / ${seats || '·'}</small></div><div class="stat-sub">من المتعاقد عليه</div></div>
        <div class="stat-card"><div class="stat-label">بدون جهة</div><div class="stat-value s-new">${un.total || 0}</div><div class="stat-sub">اربطهم بجهاتهم</div></div>
      </div>
      <div class="la-row between la-tracks-bar">
        <p class="la-muted">يُنسب المشارك لجهته تلقائيًا إن جاء برابطها أو من موقعها، ويبقى الانتساب محفوظًا 30 يومًا حتى يسجّل. افتح أي جهة لترى مشاركيها ومصادرهم وتصدّر تقريرها.</p>
        ${w ? '<button class="btn-sm primary" data-act="add-org">+ جهة جديدة</button>' : ''}
      </div>
      <div class="la-orgs">${list.map((o) => `
        <article class="la-org${o.status === 'inactive' ? ' off' : ''}" style="--org:${orgColor(o)}">
          <header data-act="open-org" data-id="${o.id}">
            <span class="la-org-mark">${esc((o.short_name || o.name).slice(0, 2))}</span>
            <div><b>${esc(o.name)}</b><small>${esc(o.sector || '')}${o.status === 'inactive' ? ' · موقوفة' : ''}</small></div>
          </header>
          ${domainsOf(o).length ? `<div class="la-domains">${domainsOf(o).map((d) => `<span dir="ltr">${esc(d)}</span>`).join('')}</div>` : ''}
          ${seatsHtml(o.stats.total, o.seats)}
          ${funnelHtml(o.stats)}
          <div class="la-org-foot">
            ${o.stats.pending_approval ? `<span class="la-chip warn">${o.stats.pending_approval} بانتظار اعتمادك</span>` : '<span class="la-chip ok">لا شيء ينتظرك</span>'}
            <span class="la-muted">${o.stats.active_week} نشط هذا الأسبوع</span>
          </div>
          <div class="la-row la-org-acts">
            <button class="btn-sm primary" data-act="open-org" data-id="${o.id}">لوحة الجهة</button>
            <button class="btn-sm ghost" data-act="copy-invite" data-url="${esc(inviteUrl(o))}">نسخ رابط الدعوة</button>
            ${w ? `<button class="la-link" data-act="edit-org" data-id="${o.id}">تحرير</button>` : ''}
          </div>
        </article>`).join('')}
        <article class="la-org none" style="--org:#8A9AA0">
          <header data-act="open-org" data-id="none"><span class="la-org-mark">؟</span><div><b>بدون جهة</b><small>سجّلوا دون رابط جهة</small></div></header>
          ${seatsHtml(un.total || 0, null)}
          ${(un.typed || []).length ? `<div class="la-typed"><small class="la-muted">ما كتبوه في خانة الجهة، اربطه بنقرة:</small>
            ${(un.typed || []).map((t) => `<div class="la-row between"><span>${esc(t.name)} <small class="la-muted">${t.n}</small></span>
              ${w && list.length ? `<span class="la-row"><select data-typed-org="${esc(t.name)}">${list.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select><button class="la-link" data-act="link-typed" data-name="${esc(t.name)}">ربط</button></span>` : ''}</div>`).join('')}</div>` : '<p class="la-muted">كل المشاركين مربوطون بجهاتهم.</p>'}
          <div class="la-row la-org-acts"><button class="btn-sm ghost" data-act="open-org" data-id="none">عرض القائمة</button></div>
        </article>
      </div>`;
  }

  async function viewOrg(id, refetch) {
    if (refetch || !S.orgData || S.orgData.org.id !== id) {
      const [r] = await Promise.all([L('admin.org', { id }), orgList()]);
      if (!r.success) return `<div class="la-err">${esc(r.message)}</div>`;
      S.orgData = r;
    }
    const { org: o, participants: all, funnel: f, by_track: bt } = S.orgData;
    const w = canWrite();
    const F = S.of;
    const rows = all.filter((p) => (!F.status || p.status === F.status) && (!F.track || p.track === F.track)
      && (!F.q || `${p.full_name} ${p.email} ${p.job_title || ''}`.toLowerCase().includes(F.q.toLowerCase())));
    const tracks = Object.entries(bt).sort((a, b) => b[1] - a[1]);
    const isNone = o.id === 'none';
    return `
      <button class="la-link" data-act="orgs-back">→ كل الجهات</button>
      <section class="la-org-hero" style="--org:${orgColor(o)}">
        <div class="la-row between">
          <div class="la-row"><span class="la-org-mark lg">${esc((o.short_name || o.name).slice(0, 2))}</span>
            <div><h2>${esc(o.name)}</h2><small>${esc([o.sector, o.contact_name, o.contact_email].filter(Boolean).join(' · '))}</small></div></div>
          <div class="la-row">
            ${isNone ? '' : `<button class="btn-sm ghost" data-act="copy-invite" data-url="${esc(inviteUrl(o))}">نسخ رابط الدعوة</button>`}
            <button class="btn-sm ghost" data-act="org-csv">تصدير Excel</button>
            <button class="btn-sm ghost" data-act="org-print">تقرير للطباعة</button>
            ${w && !isNone ? `<button class="btn-sm ghost" data-act="edit-org" data-id="${o.id}">تحرير</button>` : ''}
          </div>
        </div>
        ${isNone ? '' : `<div class="la-linkbar">
          <code class="la-invite" dir="ltr">${esc(inviteUrl(o))}</code>
          ${domainsOf(o).length ? `<span class="la-domains">${domainsOf(o).map((d) => `<span dir="ltr">${esc(d)}</span>`).join('')}</span>`
            : `<small>لا مواقع مرتبطة${w ? '؛ أضف موقع الجهة من "تحرير" ليُنسب زوارها تلقائيًا' : ''}</small>`}
          <span class="la-row la-campaign"><input id="ofCampaign" dir="ltr" placeholder="اسم الحملة: whatsapp, email…" maxlength="40">
            <button class="btn-sm ghost" data-act="copy-campaign">نسخ رابط الحملة</button></span>
        </div>`}
        <div class="la-org-hero-grid">
          <div>${seatsHtml(all.length, o.seats)}<div class="la-org-kpis">
            <span><b>${f.pending_approval}</b>بانتظار الاعتماد</span><span><b>${f.approved}</b>اعتُمد مسارهم</span><span><b>${f.completed}</b>أنهوا</span><span><b>${f.withdrawn}</b>منسحب أو موقوف</span></div></div>
          <div>${funnelHtml(f, true)}</div>
        </div>
      </section>

      ${sourcesHtml(S.orgData, all.length)}

      <section class="la-card">
        <h3>توزيع المشاركين على المسارات</h3>
        ${tracks.length ? `<div class="la-pills">${tracks.map(([k, n]) => `<button class="la-pill${F.track === k ? ' on' : ''}" data-act="org-track" data-key="${k}" title="${esc(all.find((p) => p.track === k)?.track_title || '')}"><code>${k}</code> ${esc(all.find((p) => p.track === k)?.track_title || '')} <b>${n}</b></button>`).join('')}</div>`
          : '<p class="la-muted">لم يُسكَّن أحد من هذه الجهة بعد.</p>'}
      </section>

      <section class="la-card">
        <div class="toolbar">
          <div class="search-wrap"><input class="search-input" id="ofQ" placeholder="بحث بالاسم أو البريد أو المسمى…" value="${esc(F.q)}"></div>
          <select class="filter-select" id="ofStatus">${opts(STATUS, F.status, 'كل الحالات')}</select>
          <select class="filter-select" id="ofTrack"><option value="">كل المسارات</option>${tracks.map(([k]) => `<option value="${k}"${F.track === k ? ' selected' : ''}>${k}</option>`).join('')}</select>
          <span class="la-muted">${rows.length} من ${all.length}</span>
        </div>
        ${w ? `<div class="la-bulk"${S.picked.size ? '' : ' hidden'}><span><b>${S.picked.size}</b> محدد</span>${orgSelect('ofMove', '', 'نقل إلى جهة…')}<button class="btn-sm primary" data-act="org-move">نقل</button></div>` : ''}
        <div class="table-wrap"><table class="data-table">
          <thead><tr>${w ? '<th><input type="checkbox" data-pick-all></th>' : ''}<th>الاسم</th><th>المسمى</th><th>المسار</th><th>الحالة</th><th>آخر دخول</th><th>التسجيل</th></tr></thead>
          <tbody>${rows.length ? rows.map((p) => `<tr>
            ${w ? `<td><input type="checkbox" data-pick="${p.id}"${S.picked.has(p.id) ? ' checked' : ''}></td>` : ''}
            <td><button class="la-link" data-act="open" data-id="${p.id}"><b>${esc(p.full_name)}</b></button><br><small class="la-muted" dir="ltr">${esc(p.email)}</small></td>
            <td>${esc(p.job_title || '')}</td>
            <td>${p.track ? `<code class="la-code">${p.track}</code> ${p.approved ? '' : '<small class="la-muted">مبدئي</small>'}` : '<span class="la-muted">·</span>'}</td>
            <td><span class="la-chip ${p.status === 'pending_approval' ? 'warn' : p.status === 'completed' ? 'ok' : ''}">${STATUS[p.status] || p.status}</span></td>
            <td>${date(p.last_login_at)}</td><td>${date(p.created_at)}${p.org_via ? `<br><small class="la-muted">${VIA[p.org_via]}${p.campaign ? ` · <span dir="ltr">${esc(p.campaign)}</span>` : ''}</small>` : ''}</td>
          </tr>`).join('') : `<tr><td colspan="7" class="la-empty">لا نتائج</td></tr>`}</tbody>
        </table></div>
      </section>`;
  }

  // من أين جاء مشاركو الجهة: طريقة الانتساب، والحملات، والمواقع المُحيلة
  function sourcesHtml(d, total) {
    const bars = (obj, label = (k) => k, ltr) => {
      const list = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (!list.length) return '<p class="la-muted">لا بيانات بعد.</p>';
      return `<div class="la-funnel">${list.map(([k, n]) => `<div class="la-fn"><span class="la-fn-l"${ltr ? ' dir="ltr"' : ''}>${esc(label(k))}</span>
        <span class="la-fn-bar"><i style="width:${(n / Math.max(1, total) * 100).toFixed(1)}%"></i></span><b>${n}</b></div>`).join('')}</div>`;
    };
    return `<section class="la-card"><h3>مصادر الانضمام</h3><div class="la-sources">
      <div><h4>طريقة الانتساب</h4>${bars(d.by_via, (k) => VIA[k] || k)}</div>
      <div><h4>الحملات</h4>${bars(d.by_campaign, (k) => k, true)}</div>
      <div><h4>المواقع المُحيلة</h4>${bars(d.by_site, (k) => k, true)}</div></div></section>`;
  }

  function orgCsv() {
    const { org: o, participants } = S.orgData;
    const head = ['الاسم', 'البريد', 'الجوال', 'المسمى', 'الحالة', 'المسار', 'اسم المسار', 'معتمد', 'آخر دخول', 'التسجيل', 'طريقة الانتساب', 'الحملة', 'الموقع المُحيل'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(q).join(','), ...participants.map((p) => [p.full_name, p.email, p.phone, p.job_title, STATUS[p.status] || p.status,
      p.track, p.track_title, p.approved ? 'نعم' : 'لا', date(p.last_login_at), date(p.created_at), VIA[p.org_via || 'none'], p.campaign, p.referrer_host].map(q).join(','))];
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `مشاركو ${o.name} ${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function orgPrint() {
    const { org: o, participants: ps, funnel: f, by_track: bt } = S.orgData;
    const win = window.open('', '_blank');
    if (!win) return toast('اسمح بالنوافذ المنبثقة لطباعة التقرير');
    const c = orgColor(o);
    win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير ${esc(o.name)}</title>
      <style>body{font-family:"Noto Kufi Arabic",system-ui,sans-serif;color:#0B272F;margin:32px;}
      .hd{border-bottom:3px solid ${c};padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:end}
      h1{margin:0;font-size:22px} small{color:#4A6A72} .k{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:16px 0}
      .k div{border:1px solid #ddd;border-radius:8px;padding:10px} .k b{display:block;font-size:22px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px} th,td{border-bottom:1px solid #e5e5e5;padding:6px;text-align:right}
      th{background:#f4f1ea} h2{font-size:15px;margin-top:22px;border-inline-start:3px solid ${c};padding-inline-start:8px}</style></head><body>
      <div class="hd"><div><small>Milestone Impact · برنامج القادة</small><h1>تقرير ${esc(o.name)}</h1></div><small>${date(new Date())}</small></div>
      <div class="k">${FUNNEL.map(([k, l]) => `<div><small>${l}</small><b>${f[k] || 0}</b></div>`).join('')}</div>
      ${o.seats ? `<p>المقاعد المشغولة: <b>${ps.length}</b> من <b>${o.seats}</b></p>` : ''}
      <h2>التوزيع على المسارات</h2><table><tr><th>المسار</th><th>العدد</th></tr>${Object.entries(bt).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<tr><td>${esc(ps.find((p) => p.track === k)?.track_title || k)}</td><td>${n}</td></tr>`).join('')}</table>
      <h2>المشاركون</h2><table><tr><th>الاسم</th><th>المسمى</th><th>المسار</th><th>الحالة</th></tr>
      ${ps.map((p) => `<tr><td>${esc(p.full_name)}</td><td>${esc(p.job_title || '')}</td><td>${esc(p.track_title || '')}</td><td>${STATUS[p.status] || p.status}</td></tr>`).join('')}</table>
      <script>onload=()=>print()<\/script></body></html>`);
    win.document.close();
  }

  // ══ نظرة عامة ══
  async function viewOverview() {
    const [o, r] = await Promise.all([L('admin.overview', { org: S.org }), L('admin.reviews'), orgList()]);
    if (!o.success) return `<div class="la-err">${esc(o.message)}</div>`;
    const st = (k) => o.by_status[k] || 0;
    const max = Math.max(1, ...DIMS.flatMap((d) => LVLS.map((l) => o.matrix[d][l])));
    return `
      <div class="la-row between la-ov-bar"><span class="la-muted">${S.org ? 'تعرض الأرقام لجهة واحدة' : 'كل الجهات'}</span>${orgSelect('ovOrg', S.org)}</div>
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
      ${o.funnel ? `<div class="la-grid2">
        <section class="la-card"><h3>قمع الرحلة</h3>${funnelHtml(o.funnel, true)}</section>
        <section class="la-card"><div class="la-row between"><h3>أكثر المسارات مشاركين</h3><span class="la-muted">${o.tracks_used} من 27 مسارًا مشغولة</span></div>
          ${(o.top_tracks || []).length ? `<ul class="la-queue">${o.top_tracks.map((t) => `<li><button class="la-link" data-act="open-track" data-key="${t.key}"><code class="la-code">${t.key}</code> ${esc(t.title || '')}</button><b>${t.n}</b></li>`).join('')}</ul>` : '<p class="la-muted">لا مسارات بعد.</p>'}
        </section></div>` : ''}
      <section class="la-card">
        <h3>الحالات</h3>
        <div class="la-pills">${Object.entries(STATUS).map(([k, l]) => `<button class="la-pill" data-act="filter-status" data-status="${k}">${l} <b>${st(k)}</b></button>`).join('')}</div>
      </section>`;
  }

  // ══ المشاركون ══
  async function viewList(refetch) {
    if (refetch || !S.list.length) {
      const [r] = await Promise.all([L('admin.participants', { search: S.search, status: S.status, org: S.org }), orgList()]);
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
        ${orgSelect('laOrg', S.org)}
        <button class="refresh-btn" data-act="search">بحث</button>
        ${canWrite() ? '<button class="refresh-btn" data-act="add-person">+ مشارك</button>' : ''}
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>الاسم</th><th>الجهة</th>${DIMS.map((d) => `<th>${DIM_EN[d]}</th>`).join('')}<th>المسار</th><th>الحالة</th><th>التسجيل</th></tr></thead>
        <tbody>${S.list.length ? S.list.map((p) => `
          <tr data-act="open" data-id="${p.id}">
            <td><b>${esc(p.full_name)}</b><br><small class="la-muted" dir="ltr">${esc(p.email)}</small></td>
            <td>${(() => { const og = (S.orgList?.orgs || []).find((x) => x.id === p.organization_id); return og ? `<span class="la-orgtag" style="--org:${orgColor(og)}">${esc(og.short_name || og.name)}</span>` : esc(p.organization_name || ''); })()}<br><small class="la-muted">${esc(p.job_title || '')}</small></td>
            ${DIMS.map((d) => `<td>${lv(p, d)}</td>`).join('')}
            <td>${(() => { const k = trackOf(Object.fromEntries((p.placements || []).map((x) => [x.dimension, x.level]))); return k ? `<code class="la-code">${k}</code>` : '<span class="la-muted">·</span>'; })()}</td>
            <td><span class="la-chip ${p.status === 'pending_approval' ? 'warn' : ''}">${STATUS[p.status] || p.status}</span></td>
            <td>${date(p.created_at)}</td>
          </tr>`).join('') : '<tr><td colspan="8" class="la-empty">لا مشاركين بعد</td></tr>'}
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
          ${prof?.track ? `<div class="la-track-now"><code class="la-code">${esc(prof.track.key)}</code><b>${esc(prof.track.title || 'مسار بلا عنوان')}</b>
            <p class="la-muted">${esc(prof.track.summary || '')}</p><small class="la-muted">يتحدث المسار تلقائيًا إن غيّرت مستوى أي إطار ثم اعتمدت.</small></div>` : ''}
          <table class="la-table"><thead><tr><th>البُعد</th><th>معرفة</th><th>مواقف</th><th>ممارسة</th><th>المؤشر</th><th>المستوى</th><th>ملاحظة للمشارك</th></tr></thead><tbody>
          ${DIMS.map((d) => {
            const x = prof?.dimensions.find((y) => y.dimension === d);
            const rr = res(d);
            const ev = rr?.evaluation;
            // قبل الاعتماد يُقترح مستوى المعيار الحالي؛ بعده يبقى ما اعتمدته
            const pick = !x?.approved && ev ? ev.level : x?.level;
            return `<tr><td><b>${DIM_EN[d]}</b><br><small>${DIM[d]}</small></td>
              <td>${pct(rr?.knowledge_pct)}</td><td>${pct(rr?.skill_pct)}</td><td>${pct(rr?.behavior_pct)}</td>
              <td>${ev?.composite != null ? `<b>${ev.composite}</b>${ev.borderline ? '<br><span class="la-chip warn">حدّية</span>' : ''}` : '·'}</td>
              <td>${w ? `<select data-lvl="${d}">${opts(LVL, pick, '...')}</select>` : LVL[x?.level] || ''}
                ${ev ? `<br><small class="la-muted">المعيار: ${LVL[ev.level]}</small>` : ''}
                ${ev?.reason ? `<br><small class="la-why">${esc(ev.reason)}</small>` : ''}</td>
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
      if (res?.success) { dlg.close(); toast('تم الحفظ'); S.orgList = null; render(true); } else { err.hidden = false; err.textContent = res?.message || 'تعذّر الحفظ'; }
    });
    dlg.showModal();
  }
  const optRow = (o) => `<div class="la-opt"><input data-l value="${esc(o.label)}" placeholder="نص الخيار"><input data-s type="number" step="any" value="${esc(o.score)}" title="الدرجة"><button type="button" class="la-link" data-del-opt>✕</button></div>`;

  const saveRow = (entity, base) => (row) => L('admin.save', { entity, row: { ...base, ...row } });
  const delRow = (entity, id) => () => L('admin.delete', { entity, id });
  const moveBtns = (entity, id) => (canWrite()
    ? `<button class="la-mv" data-act="move" data-entity="${entity}" data-id="${id}" data-dir="-1" title="أعلى">▲</button><button class="la-mv" data-act="move" data-entity="${entity}" data-id="${id}" data-dir="1" title="أسفل">▼</button>` : '');

  // ══ الرحلة ══
  const MODE = { in_person: 'حضوري', online: 'عن بعد', hybrid: 'مدمج', self: 'ذاتي عبر المنصة' };
  const STAGE_FIELDS = [
    ['title_ar', 'اسم المرحلة'], ['phase', 'المحور', 'select', { map: PHASE }],
    ['duration_label', 'المدة كما تظهر للمشارك'], ['duration_days', 'المدة بالأيام', 'number'],
    ['mode', 'طريقة التنفيذ', 'select', { map: MODE }], ['mode_note_ar', 'تفصيل الطريقة (مثال: حضوري في الرياض أو مباشر عن بعد)'],
    ['description_ar', 'الوصف', 'textarea', { rows: 3 }], ['builds_on_ar', 'تنطلق من (مخرج المرحلة السابقة)'],
    ['activities_ar', 'ماذا يتم (كل سطر بند)', 'textarea', { rows: 5 }],
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
              <div><b>${s.sort}. ${esc(s.title_ar)}</b> <small class="la-muted">${esc(s.duration_label)}${s.mode ? ` · ${MODE[s.mode]}` : ''}${s.active ? '' : ' · مخفية'}</small></div>
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
      ${S.catalog.placement_model?.length ? modelCard() : ''}
      <section class="la-card"${S.catalog.placement_model?.length ? ' hidden' : ''}>
        <div class="la-note">لتفعيل معيار التسكين المركّب شغّل الترحيل server/leaders-008-placement-model.sql. حتى ذلك الحين تعمل القواعد التالية.</div>
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

  // ══ المسارات الـ27 ══
  // كل مسار تركيبة من مستويات الأطر الثلاثة. الكتيب والرحلة يُركَّبان من
  // الوحدات التسع تلقائيًا، وهنا تُحرَّر هوية المسار التي يقرؤها المشارك.
  const TRACK_FIELDS = [
    ['title_ar', 'اسم المسار'], ['summary_ar', 'لمن صُمّم المسار', 'textarea', { rows: 3 }],
    ['focus_ar', 'أولويات التطوير (كل سطر بند)', 'textarea', { rows: 4 }],
    ['project_ar', 'المشروع التطبيقي', 'textarea', { rows: 2 }],
    ['journey_ar', 'كيف تتوجه الرحلة: التدريب والكوتشينغ والأقران (كل سطر بند)', 'textarea', { rows: 4 }],
    ['priority_dimension', 'محور التركيز الأول', 'select', { map: DIM }],
  ];
  const trackLevels = (key) => Object.fromEntries(DIMS.map((d, i) => [d, LVLS[Number(key[i * 2 + 1]) - 1]]));
  const lvlChips = (key) => { const lv = trackLevels(key); return DIMS.map((d) => `<span class="la-lvl ${lv[d]}">${DIM_EN[d][0]} ${LVL[lv[d]]}</span>`).join(''); };

  function viewTracks() {
    const tracks = S.catalog.tracks || [];
    const st = S.catalog.track_stats || {};
    if (!tracks.length) return '<div class="la-note">جدول المسارات غير موجود بعد. شغّل الترحيل server/leaders-007-tracks.sql في Supabase.</div>';
    const sum = (f) => Object.values(st).reduce((a, x) => a + (x[f] || 0), 0);
    const used = tracks.filter((t) => st[t.key]?.total).length;
    const max = Math.max(1, ...Object.values(st).map((x) => x.total));
    const card = (t) => {
      const x = st[t.key] || { total: 0, active: 0, pending: 0, completed: 0 };
      if (S.onlyUsed && !x.total) return '';
      const pc = (n) => `${(n / Math.max(1, x.total) * 100).toFixed(0)}%`;
      return `
        <article class="la-track${x.total ? '' : ' empty'}" data-act="open-track" data-key="${t.key}" style="--fill:${(x.total / max).toFixed(2)}">
          <div class="la-row between"><code class="la-code">${t.key}</code><span class="la-track-n"><b>${x.total}</b> مشارك</span></div>
          <b class="la-track-title">${esc(t.title_ar)}</b>
          <div class="la-row">${lvlChips(t.key)}</div>
          <div class="la-track-bar" title="مفعّل ${x.active} · بانتظار الاعتماد ${x.pending} · أنهى ${x.completed}">
            <span class="act" style="width:${pc(x.active)}"></span><span class="pen" style="width:${pc(x.pending)}"></span><span class="done" style="width:${pc(x.completed)}"></span>
          </div>
          <div class="la-track-meta"><span><i class="act"></i>مفعّل ${x.active}</span><span><i class="pen"></i>بانتظار ${x.pending}</span><span><i class="done"></i>أنهى ${x.completed}</span></div>
        </article>`;
    };
    return `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">مسارات بها مشاركون</div><div class="stat-value">${used}<small> / 27</small></div><div class="stat-sub">من كل التركيبات الممكنة</div></div>
        <div class="stat-card"><div class="stat-label">مشاركون مسكّنون</div><div class="stat-value">${sum('total')}</div><div class="stat-sub">لهم مسار محدد</div></div>
        <div class="stat-card"><div class="stat-label">مفعّلون</div><div class="stat-value s-replied">${sum('active')}</div><div class="stat-sub">اعتُمد مسارهم وبدأوا</div></div>
        <div class="stat-card"><div class="stat-label">بانتظار الاعتماد</div><div class="stat-value s-new">${sum('pending')}</div><div class="stat-sub">مسار مبدئي ينتظرك</div></div>
      </div>
      <div class="la-row between la-tracks-bar">
        <p class="la-muted">كل مسار = تركيبة مستويات الأطر الثلاثة، وله كتيب ورحلة تُركَّب تلقائيًا. افتح أي مسار لترى مشاركيه وكتيبه كاملًا وتعدّل هويته أو أي باب فيه.</p>
        <button class="la-pill${S.onlyUsed ? ' on' : ''}" data-act="only-used">${S.onlyUsed ? 'عرض الكل' : 'المسارات المشغولة فقط'}</button>
      </div>
      ${LVLS.map((ml) => `
        <h3 class="la-phase">${DIM_EN.milestone} · ${LVL[ml]} <small class="la-muted">${tracks.filter((t) => t.milestone_level === ml).reduce((a, t) => a + (st[t.key]?.total || 0), 0)} مشارك</small></h3>
        <div class="la-tracks">${tracks.filter((t) => t.milestone_level === ml).sort((a, b) => a.sort - b.sort).map(card).join('')}</div>`).join('')}`;
  }

  async function viewTrack(key) {
    const r = await L('admin.track', { key });
    if (!r.success) return `<div class="la-err">${esc(r.message)}</div>`;
    const t = r.track;
    const w = canWrite();
    const lines = (x) => String(x || '').split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim()).filter(Boolean);
    const ps = r.participants;
    const groups = DIMS.map((d) => ({ d, items: r.handbook.filter((c) => c.dimension === d) }));
    return `
      <button class="la-link" data-act="tracks-back">→ كل المسارات</button>
      <section class="la-track-hero">
        <div class="la-row between">
          <div class="la-row"><code class="la-code">${esc(t.key)}</code>${lvlChips(t.key)}</div>
          ${w && t.title_ar ? `<button class="btn-sm ghost" data-act="edit-track" data-key="${t.key}">تحرير هوية المسار</button>` : ''}
        </div>
        <h2>${esc(t.title_ar || 'مسار بلا هوية بعد')}</h2>
        ${t.summary_ar ? `<p>${esc(t.summary_ar)}</p>` : ''}
        <div class="la-track-cols">
          <div><h4>أولويات التطوير</h4><ol>${lines(t.focus_ar).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
          <div><h4>المشروع التطبيقي</h4><p>${esc((t.project_ar || '').replace(/^مشروعك التطبيقي:\s*/, ''))}</p></div>
          <div><h4>توجيه الرحلة</h4><ul>${lines(t.journey_ar).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </div>
      </section>

      <section class="la-card">
        <div class="la-row between"><h3>المشاركون في هذا المسار</h3><span class="la-muted">${ps.length} مشارك · ${ps.filter((p) => p.approved).length} مفعّل</span></div>
        ${ps.length ? `<table class="la-table"><thead><tr><th>الاسم</th><th>الجهة</th><th>الحالة</th><th>المسار</th></tr></thead><tbody>
          ${ps.map((p) => `<tr data-act="open" data-id="${p.id}" class="la-click"><td><b>${esc(p.full_name)}</b><br><small class="la-muted" dir="ltr">${esc(p.email)}</small></td>
            <td>${esc(p.organization_name || '')}</td><td>${STATUS[p.status] || p.status}</td>
            <td>${p.approved ? '<span class="la-chip ok">مفعّل</span>' : '<span class="la-chip warn">مبدئي</span>'}</td></tr>`).join('')}
        </tbody></table>` : '<p class="la-muted">لا مشاركين في هذا المسار بعد.</p>'}
      </section>

      <section class="la-card">
        <div class="la-row between"><h3>كتيب المسار كما يقرؤه المشارك</h3><span class="la-muted">${r.handbook.length} بابًا</span></div>
        <p class="la-muted">الكتيب مركّب من أبواب الأطر الثلاثة بمستوى هذا المسار في كل إطار، والفقرات الخاصة بمستويات أخرى محذوفة. تعديل أي باب يسري على كل المسارات التي تشترك فيه.</p>
        ${r.handbook.length ? `<div class="la-hb">
          <nav class="la-hb-toc">${groups.map((g) => g.items.length ? `<div><b>${DIM_EN[g.d]} · ${LVL[r.levels[g.d]]}</b>${g.items.map((c) => `<button class="la-link" data-act="hb-jump" data-id="${c.id}">${esc(c.title)}</button>`).join('')}</div>` : '').join('')}</nav>
          <div class="la-hb-body">${r.handbook.map((c) => `
            <article class="la-hb-ch" id="hb-${c.id}">
              <div class="la-row between"><small class="la-muted">${DIM_EN[c.dimension]} · ${DIM[c.dimension]}</small>${w ? `<button class="btn-sm ghost" data-act="edit-mod" data-id="${c.id}">تعديل الباب</button>` : ''}</div>
              <h3>${esc(c.title)}</h3>
              <div class="la-md">${c.md ? mdHtml(c.md) : '<p class="la-muted">هذا الباب بلا محتوى بعد.</p>'}</div>
            </article>`).join('')}</div>
        </div>` : '<p class="la-muted">لا أبواب بمحتوى لهذا المسار بعد.</p>'}
      </section>`;
  }

  // ══ معيار التسكين المركّب ══
  // نسخة العرض من evaluatePlacement في logic.js، للحاسبة فقط؛ الاحتساب الرسمي على الخادم.
  const MODEL_DEFAULT = { w_knowledge: 30, w_skill: 45, w_behavior: 25, min_intermediate: 55, min_advanced: 80, floor_intermediate: 25, floor_advanced: 50, borderline: 5 };
  function evaluate(p, m) {
    const w = { knowledge: +m.w_knowledge, skill: +m.w_skill, behavior: +m.w_behavior };
    const tiers = ['knowledge', 'skill', 'behavior'].filter((t) => p[t] != null && w[t] > 0);
    const ws = tiers.reduce((a, t) => a + w[t], 0);
    if (!ws) return null;
    const c = Math.round(tiers.reduce((a, t) => a + w[t] * p[t], 0) / ws * 10) / 10;
    const low = Math.min(...tiers.map((t) => p[t]));
    const level = c >= +m.min_advanced && low >= +m.floor_advanced ? 'advanced' : c >= +m.min_intermediate && low >= +m.floor_intermediate ? 'intermediate' : 'beginner';
    return { composite: c, level, low };
  }
  function modelCard() {
    const m = { ...MODEL_DEFAULT, ...S.catalog.placement_model[0] };
    const w = canWrite();
    const f = (k, label, hint) => `<label class="la-mf"><span>${label}</span><input type="number" min="0" max="100" step="1" data-model="${k}" value="${Number(m[k])}" ${w ? '' : 'disabled'}><small>${hint}</small></label>`;
    return `
      <section class="la-card la-model">
        <h3>معيار التسكين</h3>
        <p class="la-muted">لكل إطار مؤشر مركّب من 100 = متوسط موزون لجوانبه الثلاثة. يُمنح المستوى بالمؤشر، بشرط ألا يقل أي جانب عن حد أدنى، فلا تُخفي قوة جانب فجوة في آخر. والحالة الحدّية تظهر لك لتحسمها بحكمك. يسري التعديل على القياسات القادمة، ويظهر مقترحه فورًا في صفحة كل مشارك.</p>
        <div class="la-model-grid">
          <div><h4>1. أوزان الجوانب</h4>
            ${f('w_skill', 'المواقف', 'الأصدق تنبؤًا بالأداء')}
            ${f('w_knowledge', 'المعرفة', 'الفهم والمفاهيم')}
            ${f('w_behavior', 'الممارسة', 'تقدير ذاتي يميل للتضخم')}</div>
          <div><h4>2. حدود المستويات</h4>
            ${f('min_intermediate', 'المؤشر للمتوسط ≥', 'من 100')}
            ${f('min_advanced', 'المؤشر للاحترافي ≥', 'من 100')}
            ${f('borderline', 'هامش الحالة الحدّية', 'نقاط تحت الحد')}</div>
          <div><h4>3. الحد الأدنى لأي جانب</h4>
            ${f('floor_intermediate', 'للمتوسط ≥', 'نسبة الجانب الأضعف')}
            ${f('floor_advanced', 'للاحترافي ≥', 'نسبة الجانب الأضعف')}</div>
        </div>
        ${w ? '<button class="btn-sm primary" data-act="save-model">حفظ المعيار</button>' : ''}
        <div class="la-calc">
          <h4>جرّب المعيار</h4>
          <div class="la-row">
            <label>معرفة % <input type="number" min="0" max="100" id="cK" value="75"></label>
            <label>مواقف % <input type="number" min="0" max="100" id="cS" value="25"></label>
            <label>ممارسة % <input type="number" min="0" max="100" id="cB" value="69"></label>
            <button class="btn-sm ghost" data-act="calc">احسب</button>
          </div>
          <div id="cOut" class="la-muted">أدخل نسبًا واضغط احسب. القيم الافتراضية مثال من مشارك حقيقي.</div>
        </div>
      </section>`;
  }
  function calcPlacement() {
    const el = root();
    const m = { ...MODEL_DEFAULT };
    el.querySelectorAll('[data-model]').forEach((i) => { m[i.dataset.model] = Number(i.value); });
    const r = evaluate({ knowledge: +el.querySelector('#cK').value, skill: +el.querySelector('#cS').value, behavior: +el.querySelector('#cB').value }, m);
    el.querySelector('#cOut').innerHTML = r ? `المؤشر المركّب <b>${r.composite}</b> · أضعف جانب ${r.low}% · المستوى: <span class="la-lvl ${r.level}">${LVL[r.level]}</span>` : 'أدخل نسبًا صحيحة';
  }

  // ══ الكتيب ══
  function viewHandbook() {
    const w = canWrite();
    const mods = S.catalog.handbook_modules;
    return `
      <section class="la-card la-hb-pick">
        <h3>معاينة كتيب مسار</h3>
        <p class="la-muted">لكل مسار من الـ27 كتيب خاص يُركَّب تلقائيًا من الأبواب أدناه. اختر مسارًا لتقرأ كتيبه كاملًا كما يراه المشارك.</p>
        <div class="la-row"><select id="laHbTrack">${(S.catalog.tracks || []).map((t) => `<option value="${t.key}">${t.key} · ${esc(t.title_ar)}</option>`).join('')}</select>
        <button class="btn-sm primary" data-act="open-track-sel">فتح الكتيب</button></div>
      </section>
      <p class="la-muted">كتيب كل مشارك = الأبواب التي مستواها الأدنى ≤ مستواه في ذلك البُعد. يُعرض للقراءة فقط داخل المنصة بعلامة مائية باسم المشارك.</p>
      <p class="la-muted">داخل المحتوى: <code>## عنوان</code> و<code>### عنوان فرعي</code> و<code>- بند</code> و<code>**غامق**</code> و<code>&gt; خلاصة</code>. لتخصيص فقرة لمستوى: <code>:::min=intermediate</code> (من متوسط فأعلى) أو <code>:::only=beginner</code> (للتأسيسي فقط) ثم السطور ثم <code>:::</code>. المستويات: beginner تأسيسي، intermediate متوسط، advanced احترافي.</p>
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

    if (a === 'tab') { S.tab = t.dataset.tab; S.person = null; S.track = null; S.orgView = null; S.orgData = null; return render(); }
    if (a === 'open-track') { S.tab = 'tracks'; S.track = t.dataset.key; S.person = null; return render(!S.catalog); }
    if (a === 'open-track-sel') { S.tab = 'tracks'; S.track = el.querySelector('#laHbTrack').value; await render(); setTimeout(() => el.querySelector('.la-hb')?.scrollIntoView({ behavior: 'smooth' }), 50); return; }
    if (a === 'tracks-back') { S.track = null; return render(); }
    if (a === 'only-used') { S.onlyUsed = !S.onlyUsed; return render(); }
    if (a === 'hb-jump') { document.getElementById(`hb-${t.dataset.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (a === 'calc') return calcPlacement();
    if (a === 'save-model') {
      const row = { id: 1 };
      el.querySelectorAll('[data-model]').forEach((i) => { row[i.dataset.model] = Number(i.value); });
      if (row.min_advanced <= row.min_intermediate) return toast('حد الاحترافي يجب أن يكون أعلى من حد المتوسط');
      const r = await L('admin.save', { entity: 'placement_model', row });
      toast(r.success ? 'حُفظ معيار التسكين. يسري على القياسات القادمة ويظهر مقترحه لكل مشارك' : r.message);
      return r.success && render(true);
    }
    if (a === 'open') { S.tab = 'participants'; S.person = t.dataset.id; return render(); }
    if (a === 'back') { S.person = null; return render(); }
    if (a === 'filter-status') { S.tab = 'participants'; S.status = t.dataset.status; S.person = null; return render(true); }
    if (a === 'search') { S.search = el.querySelector('#laSearch').value.trim(); S.status = el.querySelector('#laStatus').value; S.org = el.querySelector('#laOrg')?.value || ''; return render(true); }
    if (a === 'open-org') { S.tab = 'orgs'; S.orgView = t.dataset.id; S.of = { status: '', track: '', q: '' }; S.picked = new Set(); return render(true); }
    if (a === 'orgs-back') { S.orgView = null; S.orgData = null; return render(); }
    if (a === 'org-track') { S.of.track = S.of.track === t.dataset.key ? '' : t.dataset.key; return render(); }
    if (a === 'org-csv') return orgCsv();
    if (a === 'org-print') return orgPrint();
    if (a === 'copy-invite') {
      try { await navigator.clipboard.writeText(t.dataset.url); toast('نُسخ رابط الدعوة'); } catch { prompt('انسخ رابط الدعوة:', t.dataset.url); }
      return;
    }
    if (a === 'copy-campaign') {
      const c = String(el.querySelector('#ofCampaign')?.value || '').trim().toLowerCase();
      if (!/^[a-z0-9_-]{1,40}$/.test(c)) return toast('اسم الحملة: أحرف إنجليزية صغيرة وأرقام و _ أو -');
      const url = inviteUrl(S.orgData.org, c);
      try { await navigator.clipboard.writeText(url); toast('نُسخ رابط الحملة'); } catch { prompt('انسخ رابط الحملة:', url); }
      return;
    }
    if (a === 'add-org') return openForm('جهة جديدة', ORG_FIELDS, { status: 'active' }, saveRow('organizations', {}));
    if (a === 'edit-org') {
      const o = (await orgList()).orgs.find((x) => x.id === t.dataset.id);
      return openForm(`جهة: ${o.name}`, ORG_FIELDS, o, saveRow('organizations', { id: o.id }), delRow('organizations', o.id));
    }
    if (a === 'link-typed') {
      const sel = el.querySelector(`[data-typed-org="${CSS.escape(t.dataset.name)}"]`);
      const r = await L('admin.assign-org', { typed_name: t.dataset.name, organization_id: sel.value });
      toast(r.success ? `رُبط ${r.moved} مشارك` : r.message); return r.success && render(true);
    }
    if (a === 'org-move') {
      const target = el.querySelector('#ofMove').value;
      if (!target) return toast('اختر الجهة');
      const r = await L('admin.assign-org', { participant_ids: [...S.picked], organization_id: target === 'none' ? null : target });
      toast(r.success ? `نُقل ${r.moved} مشارك` : r.message);
      if (r.success) { S.picked = new Set(); S.orgList = null; } return r.success && render(true);
    }
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
    if (a === 'edit-track') {
      const tr = (S.catalog || await L('admin.catalog')).tracks.find((x) => x.key === t.dataset.key);
      return openForm(`مسار ${tr.key}`, TRACK_FIELDS, tr, saveRow('tracks', { key: tr.key }));
    }
    if (a === 'edit-mod') {
      const m = (S.catalog || await L('admin.catalog')).handbook_modules.find((x) => x.id === t.dataset.id);
      return openForm(`باب: ${m.title_ar}`, MOD_FIELDS, m, saveRow('handbook_modules', { id: m.id }), delRow('handbook_modules', m.id));
    }
    if (a === 'add-mod') {
      const n = c.handbook_modules.filter((x) => x.dimension === t.dataset.dim).length;
      return openForm('باب جديد', MOD_FIELDS, { min_level: 'beginner' }, saveRow('handbook_modules', { dimension: t.dataset.dim, sort: n + 1 }));
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'laInst') { S.instrument = e.target.value; render(); }
    if (e.target.id === 'ovOrg') { S.org = e.target.value; render(); }
    if (e.target.id === 'ofStatus') { S.of.status = e.target.value; render(); }
    if (e.target.id === 'ofTrack') { S.of.track = e.target.value; render(); }
    if (e.target.matches?.('[data-pick]')) { e.target.checked ? S.picked.add(e.target.dataset.pick) : S.picked.delete(e.target.dataset.pick); render(); }
    if (e.target.matches?.('[data-pick-all]')) {
      const ids = [...root().querySelectorAll('[data-pick]')].map((i) => i.dataset.pick);
      ids.forEach((id) => (e.target.checked ? S.picked.add(id) : S.picked.delete(id))); render();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'laSearch') { S.search = e.target.value.trim(); render(true); }
    if (e.key === 'Enter' && e.target.id === 'ofQ') { S.of.q = e.target.value.trim(); render(); }
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
