// ════════════════════════════════════════════════════════════════
// نوافذ التأكيد والإدخال بهوية اللوحة بدل confirm و prompt
// ════════════════════════════════════════════════════════════════
// miConfirm(رسالة, {danger, ok}) ← وعد بـ true أو false
// miPrompt(رسالة, قيمة, {copy})  ← وعد بالنص أو null عند الإلغاء
// Esc يلغي، Enter يؤكد، والتركيز يعود لمكانه بعد الإغلاق.
(function () {
  const css = `
  .mid-ov{position:fixed;inset:0;background:rgba(6,30,44,.55);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;animation:midIn .15s ease}
  .mid-box{background:var(--off-white,#fff);color:var(--ink,#123);border-radius:14px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);padding:22px;direction:rtl;font-family:inherit}
  .mid-msg{line-height:1.8;font-size:.95rem;margin:0 0 16px;white-space:pre-line}
  .mid-in{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line,#ccd);border-radius:9px;font:inherit;margin-bottom:16px;direction:auto}
  .mid-in:focus{outline:2px solid var(--gold,#c9a24a);outline-offset:1px}
  .mid-act{display:flex;gap:8px;justify-content:flex-start}
  .mid-btn{padding:9px 18px;border-radius:9px;border:1px solid var(--line,#ccd);background:transparent;font:inherit;cursor:pointer;color:inherit}
  .mid-btn.ok{background:var(--petrol,#0b3c52);color:#fff;border-color:transparent}
  .mid-btn.danger{background:#b3261e;color:#fff;border-color:transparent}
  .mid-btn:focus-visible{outline:2px solid var(--gold,#c9a24a);outline-offset:2px}
  @keyframes midIn{from{opacity:0}to{opacity:1}}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function open(msg, { input = false, value = '', danger = false, ok = 'تأكيد', copy = false } = {}) {
    return new Promise((resolve) => {
      const back = document.activeElement;
      const ov = document.createElement('div');
      ov.className = 'mid-ov';
      const box = document.createElement('div');
      box.className = 'mid-box';
      box.setAttribute('role', input ? 'dialog' : 'alertdialog');
      box.setAttribute('aria-modal', 'true');
      const p = document.createElement('p');
      p.className = 'mid-msg';
      p.id = 'mid-msg';
      p.textContent = msg;
      box.setAttribute('aria-labelledby', 'mid-msg');
      box.appendChild(p);
      let field = null;
      if (input) {
        field = document.createElement('input');
        field.className = 'mid-in';
        field.value = value || '';
        if (copy) field.readOnly = true;
        box.appendChild(field);
      }
      const act = document.createElement('div');
      act.className = 'mid-act';
      const yes = document.createElement('button');
      yes.className = 'mid-btn ' + (danger ? 'danger' : 'ok');
      yes.textContent = copy ? 'تم' : ok;
      act.appendChild(yes);
      let no = null;
      if (!copy) {
        no = document.createElement('button');
        no.className = 'mid-btn';
        no.textContent = 'إلغاء';
        act.appendChild(no);
      }
      box.appendChild(act);
      ov.appendChild(box);
      document.body.appendChild(ov);

      const done = (v) => {
        ov.remove();
        document.removeEventListener('keydown', key, true);
        if (back && back.focus) back.focus();
        resolve(v);
      };
      const accept = () => done(input ? (copy ? null : field.value) : true);
      const cancel = () => done(input ? null : false);
      function key(e) {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        else if (e.key === 'Enter' && e.target !== no) { e.preventDefault(); accept(); }
        else if (e.key === 'Tab') {
          const f = [field, yes, no].filter(Boolean);
          const i = f.indexOf(document.activeElement);
          e.preventDefault();
          f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
        }
      }
      document.addEventListener('keydown', key, true);
      yes.onclick = accept;
      if (no) no.onclick = cancel;
      ov.onclick = (e) => { if (e.target === ov) cancel(); };
      if (field) { field.focus(); field.select(); } else (danger && no ? no : yes).focus();
    });
  }

  window.miConfirm = (msg, o = {}) => open(msg, o);
  window.miPrompt = (msg, value = '', o = {}) => open(msg, { ...o, input: true, value });
})();
