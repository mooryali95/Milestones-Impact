/* ════════════════════════════════════════════════════════════════════
   ░░  GOVERNANCE — أعضاء المجالس  ░░
   ════════════════════════════════════════════════════════════════════
   لإضافة عضو: أضف كائنًا داخل قائمة المجلس المناسب.
     name   : الاسم كما يُعرض
     title  : المنصب داخل المجلس (رئيس المجلس، عضو، ...)
     org    : الجهة أو الصفة المهنية (اختياري)
     photo  : مسار الصورة، ارفعها في home/assets/governance/
              (مربعة، 600×600 على الأقل، JPG أو WebP)
   مثال:
     { name: 'د. الاسم الكامل', title: 'رئيس المجلس',
       org: 'جامعة الملك سعود', photo: '/assets/governance/name.webp' }

   المقاعد التي لم تُشغل بعد تظهر كمقاعد شاغرة بعدد data-seats في الصفحة.
   ════════════════════════════════════════════════════════════════════ */

const GOVERNANCE_MEMBERS = {
  trustees:    [],
  founding:    [],
  executive:   [],
  operational: [],
};

(function renderGovernance() {
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // الحرف الأول من أول كلمتين ذات معنى، يُستخدم حين لا توجد صورة
  const initials = (name) => String(name || '')
    .replace(/^(د\.|أ\.|م\.|أ\.د\.)\s*/, '')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w.charAt(0)).join(' ');

  const memberCard = (m) => `
    <figure class="gov-member">
      <div class="gov-member__photo">
        ${m.photo
          ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy" decoding="async" width="160" height="160" />`
          : `<span class="gov-member__initials" aria-hidden="true">${esc(initials(m.name))}</span>`}
      </div>
      <figcaption>
        <span class="gov-member__name">${esc(m.name)}</span>
        ${m.title ? `<span class="gov-member__title">${esc(m.title)}</span>` : ''}
        ${m.org ? `<span class="gov-member__org">${esc(m.org)}</span>` : ''}
      </figcaption>
    </figure>`;

  const seatCard = () => `
    <div class="gov-member gov-member--vacant" aria-hidden="true">
      <div class="gov-member__photo"><span class="gov-member__seat"></span></div>
      <span class="gov-member__name">يُعلَن قريبًا</span>
    </div>`;

  document.querySelectorAll('.gov-members[data-council]').forEach((box) => {
    const list = GOVERNANCE_MEMBERS[box.dataset.council] || [];
    const seats = Math.max(parseInt(box.dataset.seats, 10) || 0, list.length);
    const vacant = seats - list.length;
    box.innerHTML = `
      <h4 class="gov-members__label">الأعضاء${list.length ? ` <span dir="ltr">(${list.length})</span>` : ''}</h4>
      <div class="gov-members__grid">
        ${list.map(memberCard).join('')}
        ${Array.from({ length: vacant }, seatCard).join('')}
      </div>`;
  });
})();

/* ════════════════════════════════════════════════════════════════════
   ░░  HUB — المنظومة القيادية  ░░
   ════════════════════════════════════════════════════════════════════
   يقرأ من GOVERNANCE_MEMBERS أعلاه، فلا تُكتب الأسماء مرتين:
     مجلس الخبراء  ← أعضاء مجلس الأمناء ثم المجلس التأسيسي
     قادة المسارات ← المجلس التنفيذي (يمينًا) والمجلس التشغيلي (يسارًا)
   فريق مكتب إدارة المشاريع الاستراتيجية SPMO يُضاف في HUB_SPMO_TEAM
   بالصيغة نفسها: { name, title, photo }.
   ════════════════════════════════════════════════════════════════════ */

const HUB_SPMO_TEAM = [];

(function renderHub() {
  const hub = document.getElementById('hub');
  if (!hub) return;

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const initials = (name) => String(name || '')
    .replace(/^(د\.|أ\.|م\.|أ\.د\.)\s*/, '')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w.charAt(0)).join(' ');

  const silhouette = '<svg class="hub-silhouette" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="36" r="19" fill="currentColor"/><path d="M12 100c2-24 18-38 38-38s36 14 38 38z" fill="currentColor"/></svg>';

  const photoOrPlaceholder = (m) => (m && m.photo)
    ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy" decoding="async" />`
    : (m && m.name ? `<span class="hub-initials" aria-hidden="true">${esc(initials(m.name))}</span>` : '') + silhouette;

  const caption = (m, fallbackRole) => `
    <figcaption>
      <span class="hub-portrait__name">${m ? esc(m.name) : 'يُعلَن قريبًا'}</span>
      <span class="hub-portrait__role">${esc((m && m.title) || fallbackRole)}</span>
    </figcaption>`;

  const fill = (key, list, render) => {
    const box = hub.querySelector(`[data-hub="${key}"]`);
    if (!box) return;
    const seats = Math.max(parseInt(box.dataset.seats, 10) || 0, 0);
    box.innerHTML = Array.from({ length: seats }, (_, i) => render(list[i], i)).join('');
  };

  const M = typeof GOVERNANCE_MEMBERS === 'object' ? GOVERNANCE_MEMBERS : {};
  const experts = [...(M.trustees || []), ...(M.founding || [])];

  fill('experts', experts, (m, i) => `
    <figure class="hub-portrait${i === 2 ? ' hub-portrait--lead' : ''}">
      <span class="hub-portrait__marker" aria-hidden="true"></span>
      <div class="hub-portrait__img">${photoOrPlaceholder(m)}</div>
      ${caption(m, 'عضو مجلس الخبراء')}
    </figure>`);

  const lead = (fallbackRole) => (m) => `
    <figure class="hub-lead">
      <div class="hub-lead__img">${photoOrPlaceholder(m)}</div>
      <span class="hub-lead__seat" aria-hidden="true"></span>
      <figcaption>
        <span class="hub-lead__name">${m ? esc(m.name) : 'يُعلَن قريبًا'}</span>
        <span class="hub-lead__role">${esc((m && m.title) || fallbackRole)}</span>
      </figcaption>
    </figure>`;

  fill('leads-start', M.executive || [], lead('قائد مسار'));
  fill('leads-end', M.operational || [], lead('قائد مسار'));

  fill('spmo', HUB_SPMO_TEAM, (m) => `
    <span class="hub-mini" title="${m ? esc(m.name) : ''}">${m && m.photo ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy" />` : ''}</span>`);
})();
