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
