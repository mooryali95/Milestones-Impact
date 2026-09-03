// ══ Auto-generated from shared/js — edit the source there, not this copy. ══
/* ════════════════════════════════════════════════════════════════════
   ░░  قياس الزيارات  ░░
   ════════════════════════════════════════════════════════════════════
   يُدرَج في كل صفحة:

     <script src="/shared/js/analytics.js" data-site="mi-home" defer></script>

   ══ ما يُرسَل وما لا يُرسَل ══
   لا IP، ولا كوكي، ولا بصمة متصفّح، ولا معرّف يعيش بعد إغلاق التبويب.
   المعرّف الوحيد visit_id عشوائيّ في sessionStorage.

   وأثره أن ما يُعدّ *زيارات* لا *أشخاص*: من يفتح الموقع من الجوال ثم
   الحاسوب زيارتان، ومن يعود غداً زيارةٌ أخرى. لا نظام تحليلات يعدّ
   الأشخاص حقاً، ومن يسمّي الرقم «أشخاصاً» يعِد بما لا يملك — فاللوحة
   تسمّيه «زيارات» وتكتب تحته ما يعنيه.

   ══ لا يُبطئ الصفحة ولا يكسرها ══
   • defer ثم requestIdleCallback: لا يزاحم التصيير
   • sendBeacon حين يتوفّر: يُرسَل في الخلفية ولا يؤخّر التنقّل
   • كل شيء داخل try: سقوطُ القياس لا يُسقط الصفحة
   ════════════════════════════════════════════════════════════════════ */

(function initAnalytics() {
  'use strict';

  var CONFIG = {
    url: 'https://eormhcupwgwpllhrfxxg.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvcm1oY3Vwd2d3cGxsaHJmeHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3OTY2OTksImV4cCI6MjA4NjM3MjY5OX0.xbZtLH9R9mE3ogfNToojrtzQUK799y5rZrj29ggB1f0',
    table: 'page_views',
  };

  // ── احترام رغبة المستخدم في عدم التتبّع ──
  // ليس مطلوباً قانوناً في كل مكان، لكن من يعلن رفضه صراحةً يُحترَم.
  try {
    var dnt = navigator.doNotTrack || window.doNotTrack;
    if (dnt === '1' || dnt === 'yes') return;
  } catch (e) { /* لا شيء */ }

  // ── الموقع: من وسم السكربت، وإلا من اسم النطاق ──
  function siteName() {
    try {
      var el = document.currentScript || document.querySelector('script[data-site]');
      if (el && el.getAttribute('data-site')) return el.getAttribute('data-site');
    } catch (e) { /* لا شيء */ }
    return location.hostname || 'unknown';
  }

  // ── معرّف الزيارة: عشوائيّ، ويموت بإغلاق التبويب ──
  function visitId() {
    try {
      var k = 'mi_visit';
      var v = sessionStorage.getItem(k);
      if (!v) {
        v = (crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem(k, v);
      }
      return v;
    } catch (e) {
      // نافذة خاصة أو تخزينٌ محجوب: زيارةٌ عابرة لا تُربط بشيء
      return 'ephemeral-' + Math.random().toString(36).slice(2, 10);
    }
  }

  function deviceClass() {
    try {
      var w = window.innerWidth || screen.width || 0;
      if (w && w < 640) return 'mobile';
      if (w && w < 1024) return 'tablet';
      return 'desktop';
    } catch (e) { return null; }
  }

  // المُحيل بلا معاملات استعلام: قد تحمل رموزاً أو معرّفات شخصية.
  function cleanReferrer() {
    try {
      if (!document.referrer) return null;
      var u = new URL(document.referrer);
      if (u.hostname === location.hostname) return null;   // تنقّل داخليّ
      return u.origin + u.pathname;
    } catch (e) { return null; }
  }

  function send() {
    try {
      var payload = {
        site: siteName(),
        path: location.pathname || '/',
        title: (document.title || '').slice(0, 200),
        referrer: cleanReferrer(),
        visit_id: visitId(),
        device: deviceClass(),
        lang: navigator.language || null,
      };
      var endpoint = CONFIG.url + '/rest/v1/' + CONFIG.table;
      var headers = {
        'Content-Type': 'application/json',
        'apikey': CONFIG.key,
        'Authorization': 'Bearer ' + CONFIG.key,
        'Prefer': 'return=minimal',
      };

      // fetch مع keepalive: يكمل الإرسال ولو غادر المستخدم الصفحة.
      // (sendBeacon لا يقبل ترويسات مخصّصة، وSupabase يطلب apikey.)
      if (window.fetch) {
        fetch(endpoint, {
          method: 'POST', headers: headers, keepalive: true,
          body: JSON.stringify(payload),
        }).catch(function () { /* القياس يسقط صامتاً ولا يُسقط الصفحة */ });
      }
    } catch (e) { /* لا شيء */ }
  }

  // بعد أن تستقرّ الصفحة، لا أثناء تصييرها.
  function schedule() {
    if (window.requestIdleCallback) requestIdleCallback(send, { timeout: 3000 });
    else setTimeout(send, 800);
  }

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
})();
