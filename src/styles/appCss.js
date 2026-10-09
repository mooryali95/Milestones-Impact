// ════════════════════════════════════════════════════════════════
// GLOBAL CSS — injected via <style> in App
// ════════════════════════════════════════════════════════════════
// رموز الهوية ليست هنا: تُستورد عالمياً في src/index.js من
// styles/tokens.css المُولَّد من shared/css — فتصل لكل الشاشات
// بما فيها الصفحة الرئيسية، وبنسخة واحدة لا ثلاث.

export const FONT_URL = "https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@200;300;400;500;600;700&family=Noto+Sans:wght@200;300;400;500;600;700&display=swap";

export const CSS = `

@import url('${FONT_URL}');

/* ════════════════════════════════════════════════════
   MILESTONE IMPACT — Mobile First Design System
   Base: 390px → 768px → 1200px
════════════════════════════════════════════════════ */



/* ── هيكل الانتظار ── */
.skl-line {
  display: block;
  background: var(--ink-faint);
  border-radius: var(--radius);
  opacity: 0.55;
  animation: sklPulse 1.6s ease-in-out infinite;
}
@keyframes sklPulse {
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 0.7; }
}

/* ── خريطة التغطية ── */
.cov-wrap { overflow-x: auto; }
.cov-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.cov-caption { caption-side: bottom; text-align: right; padding-top: 0.6rem; font-size: 0.68rem; color: var(--wg); line-height: 1.6; }
.cov-corner { width: 34%; }
.cov-phase { padding: 0 0 0.55rem; font-weight: 500; color: var(--wg); text-align: center; vertical-align: bottom; }
.cov-phase-num { display: block; font-size: 0.62rem; opacity: 0.65; }
.cov-phase-name { display: block; font-size: 0.66rem; }
.cov-track { text-align: right; padding: 0.42rem 0 0.42rem 0.6rem; font-weight: 400; border-top: 1px solid var(--border); }
.cov-track-name { display: block; font-weight: 700; font-size: 0.8rem; }
.cov-track-meta { display: block; font-size: 0.64rem; color: var(--wg); margin-top: 0.1rem; }
.cov-cell { text-align: center; padding: 0.42rem 0.2rem; border-top: 1px solid var(--border); }

/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
html { overflow-x: hidden; -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
body, #root {
  font-family: var(--font-ar); direction: rtl;
  background: #F5EFE4; color: #1C1A17;
  min-height: 100vh; min-height: 100dvh;
  overflow-x: hidden; overscroll-behavior-y: none;
}
button, input, select, textarea { font-family: inherit; }
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

/* ── Design Tokens ── */
:root {
  /* Brand — موحّد مع البراند الأم (بترولي Petrol) */
  --mi: #14495E; --mi-d: #0A2A3D; --mi-l: #2A6478; --mi-dd: #061E2C;
  /* ألوان المسارات تُعرَّف في config/constants.js وحدها. كانت مكرّرة هنا
     بلا استعمال — ونسخة ثانية من لوحة هي بالضبط ما يجعلها تتباعد. */
  /* Gold — موحّد مع البراند الأم */
  --gold: #C8A45C; --gold-d: #A8862E;
  /* Neutral */
  --bg: #F5EFE4; --bg-card: #FDFAF6; --bg-deep: #EDE5D8;
  --border: #E0D5C4; --border-strong: #C8BFAE;
  --text: #1C1A17; --text-secondary: #6B6055; --text-muted: #9E948A;
  /* Status */
  --ok: #4A7A3A; --warn: #8B6914; --err: #A83422;
  /* Spacing */
  --r-sm: 2px; --r-md: 2px; --r-lg: 2px; --r-xl: 2px;  /* الهوية: نصف قطر 2px */
  /* Shadows */
  --sh-sm: 0 1px 4px rgba(0,0,0,0.06); --sh-md: 0 4px 16px rgba(0,0,0,0.08); --sh-lg: 0 12px 40px rgba(0,0,0,0.12);
}

/* ── App Shell ── */
.app { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }

/* ════════════════════════════════════════
   TOP NAV — Compact Mobile Bar
════════════════════════════════════════ */
.nav {
  position: sticky; top: 0; z-index: 100;
  background: var(--mi-dd); color: #fff;
  height: 52px; padding: 0 1rem;
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  
  
}
.nav-brand { display: flex; align-items: center; gap: 0.45rem; flex-shrink: 0; min-width: 0; }
.nav-logo { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.nav-user { font-size: 0.8rem; font-weight: 700; color: rgba(255,255,255,0.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px; }
.nav-center { flex: 1; display: flex; justify-content: center; }
.nav-right { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
.nav-prog { display: flex; align-items: center; gap: 0.4rem; }
.nav-prog-bar { width: 48px; height: 3px; background: rgba(255,255,255,0.2); border-radius: 2px; overflow: hidden; }
.nav-prog-fill { height: 100%; background: var(--gold); border-radius: 2px; transition: width 0.5s ease; }
.nav-prog-pct { font-size: 0.68rem; color: rgba(255,255,255,0.75); font-weight: 700; min-width: 26px; }
/* Desktop tabs in nav */
.tabs { display: flex; gap: 1px; background: rgba(0,0,0,0.25); border-radius: 2px; padding: 2px; }
.tab { padding: 0.3rem 0.75rem; border: none; border-radius: 2px; font-family: var(--font-ar); font-size: 0.77rem; font-weight: 500; color: rgba(255,255,255,0.5); background: transparent; cursor: pointer; transition: all 0.18s; white-space: nowrap; }
.tab.on { background: rgba(255,255,255,0.18); color: #fff; font-weight: 700; }
/* Logout */
.btn-logout { padding: 0.3rem 0.65rem; border: 1px solid rgba(255,255,255,0.22); border-radius: 2px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); font-family: var(--font-ar); font-size: 0.72rem; cursor: pointer; transition: background 0.2s; }
.btn-logout:active { background: rgba(255,255,255,0.15); }
/* Nav Admin */
.nav-admin { background: #12161e; }

/* ════════════════════════════════════════
   BOTTOM TAB BAR — Mobile Only
════════════════════════════════════════ */
.bottom-bar {
  display: none; position: fixed; bottom: 0; left: 0; right: 0;
  background: var(--bg-card); border-top: 1px solid var(--border);
  z-index: 150; padding: 0; padding-bottom: env(safe-area-inset-bottom);
  
}
.bottom-bar-inner { display: flex; align-items: stretch; }
.bb-btn { flex: 1; background: none; border: none; cursor: pointer; padding: 0.55rem 0.25rem 0.45rem; display: flex; flex-direction: column; align-items: center; gap: 0.18rem; color: var(--text-muted); transition: color 0.18s; min-width: 0; }
.bb-btn.on { color: var(--mi-d); }
.bb-icon { display: flex; align-items: center; justify-content: center; height: 20px; line-height: 1; }
.bb-label { font-size: 0.6rem; font-weight: 600; letter-spacing: 0.2px; white-space: nowrap; }
.bb-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--mi-d); position: absolute; top: 6px; opacity: 0; transition: opacity 0.2s; }
.bb-btn.on .bb-dot { opacity: 1; }

/* ════════════════════════════════════════
   SECTION WRAPPER
════════════════════════════════════════ */
.sec { padding: 0.9rem 0.9rem 1rem; max-width: 900px; margin: 0 auto; width: 100%; }
.sec-pb { padding-bottom: calc(5.5rem + env(safe-area-inset-bottom)); }
.sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.85rem; gap: 0.5rem; flex-wrap: wrap; }
.sec-title { font-family: var(--font-ar); font-size: 1.2rem; color: var(--mi-d); font-weight: 700; }

/* ════════════════════════════════════════
   AUTH SCREENS — Split Layout
════════════════════════════════════════ */
/* كانت -webkit-fill-available هنا، وكروم يحسبها stretch فتنهار الشاشة إلى
   ارتفاع محتواها. dvh يتبع شريط العنوان المتحرّك في الجوال كما أُريد بها. */
.auth-screen { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
.auth-left { display: none; }
.auth-right { flex: 1; background: var(--bg-card); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 1.5rem; }
.auth-form-wrap { width: 100%; max-width: 360px; }
.auth-logo { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.8rem; justify-content: center; }
.auth-logo-text { font-family: var(--font-ar); font-size: 1rem; color: var(--mi-d); }
.auth-title { font-family: var(--font-ar); font-size: 1.7rem; color: var(--text); margin-bottom: 0.25rem; }
.auth-sub { font-size: 0.83rem; color: var(--text-secondary); margin-bottom: 1.8rem; line-height: 1.6; }
.auth-back { background: none; border: none; color: var(--text-muted); font-family: var(--font-ar); font-size: 0.8rem; cursor: pointer; margin-top: 1.2rem; display: block; width: 100%; text-align: center; padding: 0.5rem; transition: color 0.2s; }
.auth-back:active { color: var(--mi-d); }

/* ════════════════════════════════════════
   FORM ELEMENTS
════════════════════════════════════════ */
.fg { margin-bottom: 0.9rem; }
.fg label { display: block; font-size: 0.77rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.3rem; letter-spacing: 0.2px; }
.fg input { width: 100%; padding: 0.78rem 1rem; border: 1.5px solid var(--border); border-radius: var(--r-md); font-size: 1rem; color: var(--text); background: var(--bg); transition: border-color 0.2s; }
.fg input:focus { border-color: var(--mi);  background: var(--bg-card); }
.fg-err input { border-color: var(--err); }
.fg-msg { font-size: 0.72rem; color: var(--err); margin-top: 0.22rem; }
.fg-err input:focus { border-color: var(--err);  }

/* ════════════════════════════════════════
   BUTTONS
════════════════════════════════════════ */
.btn { width: 100%; padding: 0.88rem 1rem; border: none; border-radius: var(--r-md); font-family: var(--font-ar); font-size: 0.95rem; font-weight: 700; color: #fff; background: var(--mi-d); cursor: pointer; transition: all 0.2s;  letter-spacing: 0.3px; position: relative; overflow: hidden; }
.btn:active { transform: scale(0.98);  }
.btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-s { width: auto; padding: 0.48rem 1rem; font-size: 0.82rem; border-radius: var(--r-sm); }
.btn-gold { background: var(--gold-d);  }
.btn-gold:active {  }
.btn-outline { background: none; border: 1.5px solid var(--border-strong); color: var(--text-secondary);  }
.btn-outline:active { background: var(--bg-deep); }
.btn-danger { background: #8B2A1A;  }
.btn-dark { background: #1a1a2e; }

/* ════════════════════════════════════════
   CONTEXT BAR (Progress Strip)
════════════════════════════════════════ */
.ctx-bar { display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.9rem; background: var(--bg-card); border-radius: var(--r-md); border: 1px solid var(--border); margin-bottom: 0.9rem; }
.ctx-stat { display: flex; align-items: baseline; gap: 0.2rem; }
.ctx-stat-num { font-weight: 800; font-size: 1.05rem; color: var(--mi-d); line-height: 1; }
.ctx-stat-label { font-size: 0.68rem; color: var(--text-muted); }
.ctx-div { width: 1px; height: 18px; background: var(--border); flex-shrink: 0; }
.ctx-bar-prog { flex: 1; display: flex; align-items: center; gap: 0.45rem; }
.ctx-bar-track { flex: 1; height: 5px; background: var(--border); border-radius: 2px; overflow: hidden; }
.ctx-bar-fill { height: 100%; background: var(--mi-d); border-radius: 2px; transition: width 0.5s ease; }
.ctx-pct { font-size: 0.7rem; font-weight: 800; color: var(--mi-d); flex-shrink: 0; }

/* ════════════════════════════════════════
   MATRIX — Mobile First
════════════════════════════════════════ */
.mx-wrap { border-radius: var(--r-lg); overflow: hidden; border: 1px solid var(--border); background: var(--bg-card); }
.mx-col-headers { display: none; }
.mx-track-header { display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--border); }
.mx-track-icon { font-size: 1.1rem; }
.mx-track-name { font-family: var(--font-ar); font-size: 1rem; font-weight: 700; }
.mx-track-weight { font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 2px; color: #fff; margin-right: auto; }
.mx-track-desc { font-size: 0.65rem; color: rgba(255,255,255,0.6); }
.mx-cells-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); }

/* ── Cell ── */
.cell {
  background: var(--bg-card); padding: 0.7rem 0.75rem 0.65rem;
  cursor: pointer; transition: background 0.15s; min-height: 88px;
  display: flex; flex-direction: column; justify-content: space-between;
  position: relative; overflow: hidden;
}
.cell:active { background: var(--bg-deep); }
.cell.done { background: rgba(74,122,58,0.04); }
.cell.dated { background: rgba(139,105,20,0.03); }
.cell.highlighted { background: rgba(20, 73, 94,0.07); }
.cell-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 0 0 2px 2px; }
.cell-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.3rem; margin-bottom: 0.4rem; }
.cell-num { font-size: 0.58rem; font-weight: 700; color: var(--text-muted); background: var(--bg-deep); border-radius: 2px; padding: 0.1rem 0.3rem; flex-shrink: 0; }
.cell-check { width: 16px; height: 16px; border-radius: 50%; background: var(--ok); display: flex; align-items: center; justify-content: center; font-size: 0.58rem; color: #fff; flex-shrink: 0; }
.cell-name { font-size: 0.79rem; font-weight: 700; color: var(--text); line-height: 1.3; flex: 1; }
.cell-bottom { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
.cell-dur { font-size: 0.6rem; padding: 0.1rem 0.3rem; border-radius: 2px; background: var(--bg-deep); color: var(--text-muted); font-weight: 600; }
.cell-date { font-size: 0.62rem; color: var(--mi-d); font-weight: 700; }
/* Track sections */
.mx-track-section { border-bottom: 1px solid var(--border); }
.mx-track-section:last-child { border-bottom: none; }

/* Smart suggestions */
.smart-box { background: rgba(20, 73, 94,0.05); border: 1px solid rgba(20, 73, 94,0.18); border-radius: var(--r-md); padding: 0.8rem; margin-top: 0.75rem; }
.smart-label { font-size: 0.72rem; font-weight: 700; color: var(--mi-d); margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.3rem; }
.smart-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.smart-chip { font-size: 0.74rem; padding: 0.32rem 0.65rem; border-radius: 2px; border: 1.5px solid; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.smart-chip:active { opacity: 0.7; transform: scale(0.97); }

/* Missing */
.missing-box { background: rgba(168,52,34,0.04); border: 1px solid rgba(168,52,34,0.15); border-radius: var(--r-md); padding: 0.8rem; margin-top: 0.75rem; }
.missing-title { font-size: 0.78rem; font-weight: 700; color: var(--err); margin-bottom: 0.45rem; }
.missing-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.missing-chip { font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 2px; background: rgba(168,52,34,0.07); color: var(--err); cursor: pointer; font-weight: 600; border: 1px solid rgba(168,52,34,0.15); }

/* Submit */
.submit-box { border-radius: var(--r-md); padding: 1.1rem; text-align: center; margin-top: 0.75rem; }
.submit-wait { background: var(--bg-card); border: 2px dashed var(--border); }
.submit-ready { background: rgba(20, 73, 94,0.05); border: 2px solid var(--mi); }
.submit-done { background: rgba(74,122,58,0.05); border: 2px solid var(--ok); }
.submit-box h3 { font-family: var(--font-ar); font-size: 1.05rem; margin-bottom: 0.3rem; }
.submit-box p { font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.65rem; }
.submit-missing-link { font-size: 0.75rem; color: var(--mi-d); font-weight: 700; cursor: pointer; display: inline-block; margin-top: 0.3rem; text-decoration: underline; text-underline-offset: 2px; }

/* ════════════════════════════════════════
   MODAL
════════════════════════════════════════ */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4);   display: flex; align-items: flex-end; justify-content: center; z-index: 1000; padding: 0; animation: fadeIn 0.2s; overscroll-behavior: contain; }
.modal { background: var(--bg-card); border-radius: 2px 22px 0 0; padding: 1.3rem; width: 100%; max-height: 92vh; overflow-y: auto; -webkit-overflow-scrolling: touch; animation: slideUp 0.3s cubic-bezier(0.22,1,0.36,1); position: relative; touch-action: pan-y; }
.modal-pull { width: 36px; height: 4px; background: var(--border); border-radius: 2px; margin: 0 auto 1rem; }
.modal-x { position: absolute; top: 1rem; left: 1.1rem; width: 30px; height: 30px; border-radius: 50%; background: var(--bg-deep); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; color: var(--text-secondary); transition: background 0.18s; }
.modal-x:active { background: var(--border-strong); }
.modal-badge { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.22rem 0.6rem; border-radius: 2px; color: #fff; font-size: 0.68rem; font-weight: 700; margin-bottom: 0.7rem; letter-spacing: 0.3px; }
.modal h2 { font-family: var(--font-ar); font-size: 1.45rem; margin-bottom: 0.35rem; color: var(--text); line-height: 1.2; }
.modal-desc { font-size: 0.84rem; color: var(--text-secondary); line-height: 1.75; margin-bottom: 0.9rem; }
.modal-divider { height: 1px; background: var(--border); margin: 0.85rem 0; }
.modal-section { margin-bottom: 0.85rem; }
.modal-section-title { font-size: 0.73rem; font-weight: 700; color: var(--mi-d); margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.28rem; letter-spacing: 0.2px; }
.modal-insight-box { background: rgba(20, 73, 94,0.07); border-right: 3px solid var(--mi); border-radius: 2px; padding: 0.7rem 0.9rem; font-size: 0.85rem; font-weight: 600; color: var(--mi-d); line-height: 1.65; }
.modal-why { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.75; }
.modal-outputs { display: flex; flex-direction: column; gap: 0.28rem; }
.modal-output-item { display: flex; align-items: center; gap: 0.38rem; font-size: 0.81rem; color: var(--text); padding: 0.32rem 0.6rem; background: rgba(20, 73, 94,0.04); border-radius: 2px; }
.modal-output-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem; margin-bottom: 0.9rem; }
.modal-item { background: var(--bg-deep); padding: 0.5rem 0.7rem; border-radius: 2px; }
.modal-item-label { font-size: 0.63rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.2px; }
.modal-item-value { font-weight: 700; font-size: 0.85rem; margin-top: 0.08rem; }
.modal-related { display: flex; flex-wrap: wrap; gap: 0.28rem; }
.modal-related-chip { font-size: 0.7rem; padding: 0.22rem 0.5rem; border-radius: 2px; cursor: pointer; transition: all 0.15s; border: 1.5px solid; font-weight: 600; }
.modal-related-chip:active { opacity: 0.7; }
.modal-related-label { font-size: 0.63rem; color: var(--text-muted); margin-bottom: 0.2rem; font-weight: 600; }
.date-section { background: var(--bg-deep); border-radius: 2px; padding: 0.85rem; margin-bottom: 0.9rem; }
.date-section h4 { font-size: 0.8rem; color: var(--mi-d); margin-bottom: 0.5rem; font-weight: 700; }
.date-row { display: flex; gap: 0.5rem; align-items: center; }
.date-row input { flex: 1; padding: 0.6rem 0.75rem; border: 1.5px solid var(--border); border-radius: 2px; font-family: var(--font-ar); direction: ltr; font-size: 0.9rem; background: var(--bg-card); color: var(--text); transition: border-color 0.2s; }
.date-row input:focus { border-color: var(--mi); }
.hijri-badge { font-size: 0.78rem; color: var(--gold-d); font-weight: 700; padding: 0.32rem 0.65rem; background: rgba(196,162,78,0.1); border-radius: 2px; margin-top: 0.38rem; display: inline-block; }
.modal-actions { display: flex; gap: 0.5rem; }
.modal-actions .btn { flex: 1; }

/* ════════════════════════════════════════
   TIMELINE
════════════════════════════════════════ */
.tl { position: relative; padding-right: 1.5rem; }
.tl::before { content:''; position:absolute; right:5px; top:0; bottom:0; width:2px; background:var(--mi-d); border-radius: 2px; }
.tl-item { position:relative; padding:0 1.3rem 0.9rem 0; animation:slideR 0.3s ease both; }
.tl-dot { position:absolute; right:-1.5rem; top:0.2rem; width:12px; height:12px; border-radius:50%; border:2px solid; background:var(--bg-card); }
.tl-card { background:var(--bg-card); border-radius: 2px; padding:0.8rem 0.9rem;  border-right:3px solid; }
.tl-step { font-size:0.6rem; font-weight:700; color:#fff; padding:0.1rem 0.38rem; border-radius: 2px; display:inline-block; margin-bottom:0.28rem; }
.tl-name { font-weight:700; font-size:0.86rem; margin-bottom:0.1rem; }
.tl-track { font-size:0.7rem; color:var(--text-muted); margin-bottom:0.22rem; }
.tl-dates { font-size:0.72rem; color:var(--mi-d); display:flex; gap:0.5rem; flex-wrap:wrap; }
.tl-hijri { font-size:0.67rem; color:var(--gold-d); margin-top:0.1rem; font-weight:600; }
/* min-height 24px — الحدّ الأدنى لهدف اللمس في WCAG 2.2 (2.5.8، مستوى AA).
   كان الارتفاع الفعلي 19px فيسقط دونه. */
.tl-edit-btn { background:none; border:1px solid var(--border); border-radius: 2px; padding:0.18rem 0.42rem; min-height:24px; font-size:0.63rem; color:var(--text-muted); cursor:pointer; font-family:var(--font-ar); transition:all 0.15s; margin-right:0.3rem; }
.tl-edit-btn:active { border-color:var(--mi); color:var(--mi-d); }

/* ════════════════════════════════════════
   REPORT
════════════════════════════════════════ */
.rpt-card { background:var(--bg-card); border-radius:var(--r-md); padding:1.1rem;  margin-bottom:0.75rem; border:1px solid var(--border); }
.rpt-pattern { text-align:center; padding:1.2rem; background:rgba(20, 73, 94,0.04); border-radius:var(--r-md); margin-bottom:0.9rem; border:1px solid rgba(20, 73, 94,0.12); }
.rpt-pattern-icon { font-size:2rem; margin-bottom:0.25rem; }
.rpt-pattern-name { font-family:var(--font-ar); font-size:1.35rem; color:var(--mi-d); margin-bottom:0.35rem; }
.rpt-pattern-desc { font-size:0.8rem; color:var(--text-secondary); line-height:1.7; }
.rpt-stats { display:grid; grid-template-columns:repeat(2,1fr); gap:0.5rem; margin-bottom:0.9rem; }
.rpt-stat { background:var(--bg-deep); border-radius: 2px; padding:0.8rem 0.6rem; text-align:center; }
.rpt-stat-v { font-size:1.35rem; font-weight:800; margin-bottom:0.08rem; }
.rpt-stat-l { font-size:0.68rem; color:var(--text-muted); }
.rpt-section-title { font-family:var(--font-ar); font-size:1rem; color:var(--mi-d); margin-bottom:0.6rem; padding-bottom:0.38rem; border-bottom:1.5px solid var(--border); }
.rpt-bar-row { display:flex; align-items:center; gap:0.5rem; margin-bottom:0.45rem; }
.rpt-bar-label { width:72px; font-size:0.73rem; font-weight:600; flex-shrink:0; }
.rpt-bar-track { flex:1; height:18px; background:var(--bg-deep); border-radius: 2px; overflow:hidden; }
.rpt-bar-fill { height:100%; border-radius: 2px; display:flex; align-items:center; justify-content:flex-end; padding-left:0.3rem; transition:width 0.8s ease; }
.rpt-bar-pct { font-size:0.6rem; font-weight:700; color:#fff; }
.rpt-bar-count { font-size:0.7rem; color:var(--text-muted); width:28px; text-align:center; flex-shrink:0; }
.rpt-gap { background:rgba(168,52,34,0.04); border:1px solid rgba(168,52,34,0.12); border-radius: 2px; padding:0.6rem 0.8rem; margin-bottom:0.42rem; font-size:0.78rem; line-height:1.6; }
.rpt-rec { display:flex; align-items:flex-start; gap:0.45rem; padding:0.55rem 0.7rem; background:rgba(74,122,58,0.04); border-radius: 2px; margin-bottom:0.38rem; font-size:0.8rem; line-height:1.65; }
.rpt-rec-icon { color:var(--ok); font-size:0.9rem; flex-shrink:0; margin-top:0.1rem; }
.rpt-empty { text-align:center; padding:2.5rem 1rem; }
.rpt-empty h3 { font-family:var(--font-ar); color:var(--mi-d); font-size:1.1rem; margin-bottom:0.4rem; }
.rpt-empty p { color:var(--text-secondary); font-size:0.84rem; line-height:1.65; }

/* ════════════════════════════════════════
   SUMMARY + OUTPUT
════════════════════════════════════════ */
.sum-card { background:var(--bg-card); border-radius:var(--r-md); padding:1rem;  margin-bottom:0.75rem; border:1px solid var(--border); }
.sum-title { font-family:var(--font-ar); font-size:1rem; color:var(--mi-d); margin-bottom:0.65rem; padding-bottom:0.45rem; border-bottom:1.5px solid var(--border); }
.sum-track { padding:0.65rem 0.75rem; background:var(--bg-deep); border-radius: 2px; border-right:3px solid; margin-bottom:0.5rem; }
.sum-track-head { font-weight:700; margin-bottom:0.28rem; font-size:0.88rem; }
.sum-track-item { display:flex; justify-content:space-between; padding:0.18rem 0; font-size:0.76rem; border-bottom:1px solid rgba(0,0,0,0.03); }
.output-tab-hint { text-align:center; padding:0.55rem; background:rgba(74,122,58,0.06); border-radius: 2px; font-size:0.78rem; color:var(--ok); margin-bottom:0.75rem; cursor:pointer; border:1px solid rgba(74,122,58,0.15); }
.output-card { background:var(--bg-card); border-radius:var(--r-lg); padding:1.2rem;  margin-bottom:0.9rem; border:2px solid var(--mi); }
.output-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.9rem; flex-wrap:wrap; gap:0.5rem; }
.output-header h3 { font-family:var(--font-ar); font-size:1.1rem; color:var(--mi-d); }
.output-info { display:grid; grid-template-columns:repeat(3,1fr); gap:0.45rem; margin-bottom:0.85rem; padding:0.7rem; background:rgba(20, 73, 94,0.04); border-radius: 2px; }
.output-info-item { text-align:center; }
.output-info-label { font-size:0.62rem; color:var(--text-muted); font-weight:600; }
.output-info-value { font-weight:700; font-size:0.82rem; margin-top:0.05rem; word-break:break-all; }
.output-table { width:100%; border-collapse:collapse; font-size:0.76rem; }
.output-table th { background:#1a1a2e; color:#fff; padding:0.55rem 0.6rem; font-size:0.72rem; text-align:right; white-space:nowrap; }
.output-table td { padding:0.45rem 0.6rem; border-bottom:1px solid var(--border); }
.output-table tr:nth-child(even) td { background:rgba(20, 73, 94,0.02); }
.output-stamp { text-align:center; margin-top:0.9rem; padding-top:0.75rem; border-top:2px dashed var(--border); }
.output-stamp p { font-size:0.76rem; color:var(--text-muted); margin-bottom:0.18rem; }
.copyright { font-size:0.68rem; color:var(--text-muted); margin-top:0.4rem; }

/* ════════════════════════════════════════
   ADMIN PANEL
════════════════════════════════════════ */
.stat-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:0.5rem; margin-bottom:0.9rem; }
.stat { background:var(--bg-card); border-radius:var(--r-md); padding:0.9rem 0.75rem;  text-align:center; border-top:3px solid; border-bottom:1px solid var(--border); }
.stat-v { font-size:1.6rem; font-weight:800; margin-bottom:0.08rem; }
.stat-l { font-size:0.7rem; color:var(--text-muted); }
/* Reg Cards */
.reg-list { display:flex; flex-direction:column; gap:0.5rem; }
.reg-card { background:var(--bg-card); border-radius:var(--r-md); padding:0.85rem 0.95rem;  border:1.5px solid var(--border); cursor:pointer; display:flex; align-items:center; gap:0.65rem; transition:border-color 0.15s; }
.reg-card:active { background:var(--bg-deep); border-color:var(--mi); }
.reg-card.has-alert { border-color:rgba(168,52,34,0.35); }
.reg-card-avatar { width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--font-ar); font-size:1rem; font-weight:700; color:#fff; flex-shrink:0; }
.reg-card-info { flex:1; min-width:0; }
.reg-card-name { font-weight:700; font-size:0.87rem; color:var(--text); margin-bottom:0.12rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.reg-card-meta { font-size:0.69rem; color:var(--text-muted); display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center; }
.reg-card-right { display:flex; flex-direction:column; align-items:flex-end; gap:0.25rem; flex-shrink:0; }
.reg-prog-mini { width:52px; height:4px; background:var(--border); border-radius: 2px; overflow:hidden; }
.reg-prog-fill { height:100%; border-radius: 2px; transition:width 0.4s; }
.reg-prog-pct { font-size:0.62rem; color:var(--text-muted); font-weight:700; }
/* Reg Modal */
.reg-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45);   z-index:1200; display:flex; align-items:flex-end; justify-content:center; animation:fadeIn 0.2s; }
.reg-modal { background:var(--bg-card); width:100%; max-height:93vh; display:flex; flex-direction:column; overflow:hidden; animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1); border-radius: 2px 22px 0 0; }
.reg-modal-header { background:#12161e; color:#fff; padding:0.85rem 1rem; display:flex; align-items:center; gap:0.6rem; flex-shrink:0; border-radius: 2px 22px 0 0; }
.reg-modal-close { background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.18); color:#fff; border-radius: 2px; padding:0.28rem 0.6rem; cursor:pointer; font-family:var(--font-ar); font-size:0.74rem; flex-shrink:0; }
.reg-modal-info { flex:1; min-width:0; }
.reg-modal-name { font-family:var(--font-ar); font-size:0.95rem; font-weight:700; }
.reg-modal-phone { font-size:0.65rem; opacity:0.55; direction:ltr; }
.reg-modal-tabs { display:flex; background:rgba(0,0,0,0.25); border-radius: 2px; padding:2px; flex-shrink:0; }
.reg-modal-tab { padding:0.28rem 0.6rem; border:none; border-radius: 2px; font-family:var(--font-ar); font-size:0.71rem; color:rgba(255,255,255,0.5); background:transparent; cursor:pointer; transition:all 0.18s; white-space:nowrap; }
.reg-modal-tab.on { background:rgba(255,255,255,0.18); color:#fff; font-weight:700; }
.reg-modal-body { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:1rem; }
/* Admin content editor */
.adm-card { background:var(--bg-card); border-radius:var(--r-md); padding:0.9rem; margin-bottom:0.6rem; border:1px solid var(--border); }
.adm-card-head { display:flex; justify-content:space-between; align-items:center; cursor:pointer; }
.adm-card-head h4 { font-size:0.85rem; color:var(--mi-d); }
.adm-field { margin-bottom:0.55rem; }
.adm-field label { display:block; font-size:0.68rem; font-weight:600; color:var(--text-muted); margin-bottom:0.18rem; }
.adm-field textarea { width:100%; padding:0.5rem 0.6rem; border:1.5px solid var(--border); border-radius: 2px; font-family:var(--font-ar); font-size:0.82rem; direction:rtl; resize:vertical; background:var(--bg); }
.adm-note { font-size:0.75rem; color:var(--text-secondary); padding:0.4rem 0.6rem; background:rgba(139,105,20,0.05); border-radius: 2px; margin-bottom:0.4rem; }
/* Demo person cards in admin */
.demo-person-grid { display:grid; grid-template-columns:1fr; gap:0.65rem; }
.demo-person-card { background:var(--bg-deep); border-radius: 2px; padding:0.9rem; border:1px solid var(--border); }
.demo-person-header { display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem; }
.demo-person-num { width:26px; height:26px; border-radius:50%; background:#8B6914; color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.68rem; font-weight:700; flex-shrink:0; }
.demo-person-name { font-weight:700; font-size:0.86rem; color:var(--text); }
.demo-person-role { font-size:0.69rem; color:var(--text-muted); margin-top:0.04rem; }
.demo-bar-row { display:flex; align-items:center; gap:0.42rem; margin-bottom:0.28rem; }
.demo-bar-label { font-size:0.62rem; color:var(--text-muted); width:38px; flex-shrink:0; text-align:right; }
.demo-bar-track { flex:1; height:8px; background:var(--border); border-radius: 2px; overflow:hidden; }
.demo-bar-fill { height:100%; border-radius: 2px; transition:width 0.6s ease; }
.demo-bar-val { font-size:0.62rem; font-weight:700; width:22px; text-align:left; flex-shrink:0; }
.demo-person-chips { display:flex; flex-wrap:wrap; gap:0.25rem; margin-top:0.6rem; padding-top:0.5rem; border-top:1px solid var(--border); }
.demo-person-chip { font-size:0.62rem; padding:0.15rem 0.42rem; border-radius: 2px; font-weight:700; }
.demo-section-head { font-size:0.68rem; font-weight:700; color:var(--text-muted); margin-bottom:0.45rem; letter-spacing:0.5px; text-transform:uppercase; }

/* ════════════════════════════════════════
   DEMO FORM — Full Screen Mobile
════════════════════════════════════════ */
.demo-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5);   display:flex; align-items:flex-end; z-index:1500; animation:fadeIn 0.2s; }
.demo-screen { background:var(--bg-card); width:100%; height:95vh; display:flex; flex-direction:column; overflow:hidden; border-radius: 2px 22px 0 0; animation:slideUp 0.35s cubic-bezier(0.22,1,0.36,1); }
.demo-header { background:#12161e; color:#fff; padding:0.85rem 1rem; display:flex; align-items:center; gap:0.65rem; flex-shrink:0; border-radius: 2px 22px 0 0; }
.demo-header-back { background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.18); color:#fff; border-radius: 2px; padding:0.28rem 0.65rem; cursor:pointer; font-family:var(--font-ar); font-size:0.74rem; flex-shrink:0; }
.demo-header-info { flex:1; min-width:0; }
.demo-header-title { font-family:var(--font-ar); font-size:0.93rem; font-weight:700; }
.demo-header-sub { font-size:0.62rem; opacity:0.55; }
.demo-header-badge { background:var(--gold-d); padding:0.2rem 0.55rem; border-radius: 2px; font-size:0.67rem; font-weight:700; white-space:nowrap; flex-shrink:0; }
.demo-body { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:0.85rem; }
.demo-intro { background:rgba(139,105,20,0.06); border-radius: 2px; padding:0.8rem 0.9rem; margin-bottom:0.85rem; border-right:3px solid var(--gold-d); }
.demo-intro-title { font-weight:700; color:var(--gold-d); margin-bottom:0.22rem; font-size:0.83rem; display:flex; align-items:center; gap:0.32rem; }
.demo-intro-text { font-size:0.76rem; color:var(--text-secondary); line-height:1.65; }
.demo-card { background:var(--bg-card); border-radius: 2px; margin-bottom:0.75rem; border:1px solid var(--border); overflow:hidden; }
.demo-card-header { display:flex; align-items:center; gap:0.5rem; padding:0.72rem 0.9rem; border-bottom:1px solid var(--border); background:var(--bg-deep); }
.demo-card-num { width:26px; height:26px; border-radius:50%; background:#8B6914; color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:700; flex-shrink:0; }
.demo-card-name { font-weight:700; font-size:0.85rem; color:var(--text); flex:1; }
.demo-card-remove { background:none; border:1px solid rgba(168,52,34,0.2); color:var(--err); cursor:pointer; font-size:0.7rem; padding:0.2rem 0.48rem; border-radius: 2px; flex-shrink:0; }
.demo-card-body { padding:0.8rem; }
.demo-field-group { display:flex; flex-direction:column; gap:0.5rem; margin-bottom:0.65rem; }
.demo-field-row { display:grid; grid-template-columns:1fr 1fr; gap:0.45rem; margin-bottom:0.5rem; }
.demo-field { display:flex; flex-direction:column; gap:0.18rem; }
.demo-field label { font-size:0.67rem; font-weight:600; color:var(--text-muted); letter-spacing:0.2px; }
.demo-field input, .demo-field select { border:1.5px solid var(--border); border-radius: 2px; padding:0.58rem 0.72rem; font-family:var(--font-ar); font-size:0.88rem; background:var(--bg); color:var(--text); transition:border-color 0.2s; -webkit-appearance:none; }
.demo-field input:focus, .demo-field select:focus { border-color:var(--gold-d); background:var(--bg-card); }
.demo-sec-title { font-size:0.68rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.7px; padding:0.48rem 0 0.38rem; border-top:1px solid var(--border); margin-top:0.2rem; display:flex; align-items:center; gap:0.28rem; }
.demo-stepper-grid { display:flex; flex-direction:column; gap:0.5rem; margin-bottom:0.55rem; }
.demo-stepper-row { display:flex; align-items:center; gap:0.55rem; }
.demo-stepper-label { font-size:0.74rem; font-weight:600; color:var(--text); width:58px; flex-shrink:0; }
.demo-stepper { display:flex; align-items:center; gap:0.38rem; flex:1; }
.demo-stepper-btn { width:32px; height:32px; border-radius:50%; border:1.5px solid var(--border); background:var(--bg-card); color:var(--text); font-size:1rem; cursor:pointer; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0; line-height:1; transition:all 0.12s; }
.demo-stepper-btn:active { background:var(--border); transform:scale(0.92); }
.demo-stepper-track { flex:1; height:5px; background:var(--bg-deep); border-radius: 2px; overflow:hidden; }
.demo-stepper-fill { height:100%; border-radius: 2px; transition:width 0.2s; }
.demo-stepper-val { font-size:0.8rem; font-weight:800; color:var(--text); width:28px; text-align:center; flex-shrink:0; }
.demo-targets { display:grid; grid-template-columns:1fr 1fr; gap:0.38rem; margin-top:0.38rem; }
.demo-target-chip { display:flex; align-items:center; justify-content:center; gap:0.28rem; padding:0.52rem 0.5rem; border-radius: 2px; border:1.5px solid var(--border); font-size:0.78rem; cursor:pointer; transition:all 0.15s; user-select:none; font-family:var(--font-ar); font-weight:500; background:var(--bg-card); }
.demo-target-chip.active { border-color:var(--gold-d); background:rgba(139,105,20,0.08); color:var(--gold-d); font-weight:700; }
.demo-target-chip:active { transform:scale(0.97); }
.demo-add-btn { background:none; border:1.5px dashed var(--border-strong); border-radius: 2px; padding:0.55rem; color:var(--text-muted); cursor:pointer; font-family:var(--font-ar); font-size:0.82rem; width:100%; text-align:center; margin-bottom:0.85rem; transition:all 0.15s; }
.demo-add-btn:active { border-color:var(--gold-d); color:var(--gold-d); }
.demo-footer { background:var(--bg-card); border-top:1px solid var(--border); padding:0.72rem 0.9rem; display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-shrink:0; padding-bottom:calc(0.72rem + env(safe-area-inset-bottom)); }
.demo-score-pill { display:inline-block; padding:0.12rem 0.38rem; border-radius: 2px; font-weight:700; font-size:0.7rem; }

/* ════════════════════════════════════════
   MISC
════════════════════════════════════════ */
.badge { display:inline-block; padding:0.14rem 0.42rem; border-radius: 2px; font-size:0.67rem; font-weight:700; }
.badge-ok { background:rgba(74,122,58,0.1); color:var(--ok); }
.badge-wait { background:rgba(139,105,20,0.1); color:var(--gold-d); }
.empty { text-align:center; padding:2.5rem 1rem; }
.empty h3 { font-family:var(--font-ar); font-size:1.1rem; color:var(--text); margin-bottom:0.3rem; }
.empty p { color:var(--text-secondary); font-size:0.83rem; line-height:1.65; }
.toast { position:fixed; bottom:5.5rem; left:50%; transform:translateX(-50%); background:#1C1A17; color:#fff; padding:0.65rem 1.2rem; border-radius: 2px; font-size:0.82rem; z-index:2000; animation:slideUp 0.3s ease, fadeOut 0.3s ease 2.5s forwards;  max-width:88vw; text-align:center; white-space:nowrap; }
.confirm-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45);   display:flex; align-items:center; justify-content:center; z-index:3000; padding:1.5rem; animation:fadeIn 0.2s; }
.confirm-box { background:var(--bg-card); border-radius:var(--r-xl); padding:1.8rem; max-width:360px; width:100%;  animation:slideUp 0.3s; text-align:center; }
.confirm-box h3 { font-family:var(--font-ar); font-size:1.2rem; color:var(--text); margin-bottom:0.55rem; }
.confirm-box p { color:var(--text-secondary); font-size:0.85rem; line-height:1.65; margin-bottom:1.1rem; white-space:pre-line; }
.confirm-btns { display:flex; gap:0.55rem; }
.confirm-btns .btn { flex:1; padding:0.72rem; font-size:0.88rem; }
.app-footer { text-align:center; padding:1rem; border-top:1px solid var(--border); margin-top:auto; }
.app-footer p { font-size:0.7rem; color:var(--text-muted); }

/* ════════════════════════════════════════
   ANIMATIONS
════════════════════════════════════════ */
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
@keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
@keyframes slideR { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
@keyframes fadeOut { to{opacity:0;transform:translateX(-50%) translateY(8px)} }



/* ════════════════════════════════════════
   RESPONSIVE — Desktop 1024px+
════════════════════════════════════════ */
@media(min-width:1024px) {
  .nav { height:54px; }
  .nav-user { max-width:140px; }
  .reg-modal { max-width:900px; }
  .sec { padding:1.5rem 2rem 2rem; }
}

/* ════════════════════════════════════════════════════
   RESPONSIVE SYSTEM — True Adaptive Design
   Mobile:  < 768px   → Touch-first, bottom bar
   Tablet:  768–1023px → Hybrid
   Laptop:  1024–1439px → Full desktop
   Desktop: 1440px+    → Centered max-width
════════════════════════════════════════════════════ */

/* ── Landing Page (max-width 700px) ── */
@media(max-width:700px){
  .lp-tracks{grid-template-columns:1fr 1fr;}
  .lp-steps{grid-template-columns:1fr;}
}

/* ════════════════════════
   MOBILE — max 767px
════════════════════════ */
@media(max-width:767px){
  .bottom-bar { display:block; }
  .bottom-bar-inner { display:flex; }
  .nav-center { display:none!important; }
  .nav-user { max-width:85px; }
  .sec { padding:0.85rem 0.85rem 0; }
  .sec-pb { padding-bottom:calc(5.5rem + env(safe-area-inset-bottom)); }
  .mx-cells-grid { grid-template-columns:repeat(2,1fr); }
  .cell { min-height:86px; padding:0.65rem 0.7rem; }
  .cell-name { font-size:0.77rem; }
  .stat-grid { grid-template-columns:repeat(2,1fr); gap:0.5rem; }
  .rpt-stats { grid-template-columns:repeat(2,1fr); }
  .output-info { grid-template-columns:1fr; }
  .demo-person-grid { grid-template-columns:1fr; }
  .reg-modal-overlay { align-items:flex-end; padding:0; }
  .reg-modal { border-radius: 2px 22px 0 0; max-height:93vh; }
  .overlay { align-items:flex-end; padding:0; }
  .modal { border-radius: 2px 22px 0 0; max-height:92vh; padding:1.2rem; }
  .demo-overlay { align-items:flex-end; }
  .demo-screen { border-radius: 2px 22px 0 0; height:95vh; }
  .auth-left { display:none; }
  .ctx-bar { gap:0.4rem; padding:0.58rem 0.8rem; }
  .ctx-stat-num { font-size:0.95rem; }
}

/* ════════════════════════
   TABLET — 768px–1023px
════════════════════════ */
@media(min-width:768px) and (max-width:1023px){
  .bottom-bar { display:none!important; }
  .nav-center { display:flex; }
  .nav-user { max-width:110px; }
  .nav { height:52px; }
  .auth-screen { flex-direction:row; }
  .auth-left { display:flex; flex-direction:column; align-items:center; justify-content:center; width:38%; max-width:340px; background:#1a2535; padding:2rem; position:relative; overflow:hidden; }
  .auth-left::before { content:''; position:absolute; inset:0; background-image:linear-gradient(rgba(169,122,46,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(169,122,46,0.07) 1px,transparent 1px); background-size:44px 44px; }
  .auth-left-content { position:relative; z-index:1; text-align:center; }
  .auth-left-quote { font-family:var(--font-ar); font-size:1rem; color:rgba(255,255,255,0.78); line-height:1.85; margin:1.2rem 0; }
  .auth-left-quote span { color:#C8A45C; }
  .auth-left-attr { font-size:0.62rem; letter-spacing:2.5px; color:rgba(255,255,255,0.28); text-transform:uppercase; }
  .auth-left-tracks { display:flex; gap:0.38rem; justify-content:center; margin-top:1.5rem; flex-wrap:wrap; }
  .auth-left-track { padding:0.22rem 0.55rem; border-radius: 2px; font-size:0.62rem; font-weight:600; }
  .sec { padding:1.1rem 1.3rem 1.3rem; max-width:960px; margin:0 auto; width:100%; }
  .mx-cells-grid { grid-template-columns:repeat(4,1fr); }
  .cell { min-height:100px; }
  .stat-grid { grid-template-columns:repeat(4,1fr); gap:0.65rem; }
  .rpt-stats { grid-template-columns:repeat(4,1fr); }
  .output-info { grid-template-columns:repeat(3,1fr); }
  .demo-person-grid { grid-template-columns:repeat(2,1fr); }
  .overlay { align-items:center; padding:1.5rem; }
  .modal { border-radius: 2px; max-height:88vh; max-width:560px; padding:1.8rem; }
  .modal-pull { display:none; }
  .reg-modal-overlay { align-items:center; padding:1rem; }
  .reg-modal { border-radius: 2px; max-width:700px; }
  .demo-overlay { align-items:center; padding:1rem; }
  .demo-screen { border-radius: 2px; height:auto; max-height:90vh; max-width:660px; }
  .demo-header { border-radius: 2px 20px 0 0; }
}

/* ════════════════════════════════════════════════════
   LAPTOP — 1024px–1439px
   Full Desktop Experience
════════════════════════════════════════════════════ */
@media(min-width:1024px){

  /* ── Reset Mobile overrides ── */
  .bottom-bar { display:none!important; }
  .modal-pull { display:none; }

  /* ── Body & App ── */
  body { font-size:15px; }

  /* ── Nav — Refined Desktop Bar ── */
  .nav {
    height: 60px;
    padding: 0 2.5rem;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .nav-logo { width:34px; height:34px; }
  .nav-brand { gap: 0.6rem; }
  .nav-user { max-width:180px; font-size:0.88rem; font-weight:700; }
  .nav-prog-bar { width:80px; height:4px; }
  .nav-prog-pct { font-size:0.78rem; min-width:34px; font-weight:700; }
  .tabs { gap:2px; padding:3px; }
  .tab { padding:0.4rem 1.2rem; font-size:0.85rem; border-radius: 2px; }
  .tab.on {  }
  .btn-logout { padding:0.4rem 1rem; font-size:0.8rem; border-radius: 2px; }

  /* ── Page Layout ── */
  .sec {
    padding: 1.8rem 2.5rem 2rem;
    max-width: 1280px;
    margin: 0 auto;
    width: 100%;
  }
  .sec-title { font-size:1.4rem; }
  .sec-head { margin-bottom:1.2rem; }

  /* ── Auth Screen ── */
  .auth-screen { flex-direction:row; }
  .auth-left {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    width:44%; max-width:480px;
    background:#1a2535;
    padding:3.5rem; position:relative; overflow:hidden;
  }
  .auth-left::before {
    content:''; position:absolute; inset:0;
    background-image:linear-gradient(rgba(169,122,46,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(169,122,46,0.07) 1px,transparent 1px);
    background-size:48px 48px;
  }
  .auth-left-content { position:relative; z-index:1; text-align:center; max-width:320px; }
  .auth-left-quote { font-family:var(--font-ar); font-size:1.25rem; color:rgba(255,255,255,0.85); line-height:1.95; margin:2rem 0; }
  .auth-left-quote span { color:#C8A45C; }
  .auth-left-attr { font-size:0.65rem; letter-spacing:3px; color:rgba(255,255,255,0.3); text-transform:uppercase; }
  .auth-left-tracks { display:flex; gap:0.45rem; justify-content:center; margin-top:2rem; flex-wrap:wrap; }
  .auth-left-track { padding:0.28rem 0.7rem; border-radius: 2px; font-size:0.65rem; font-weight:600; letter-spacing:0.8px; }
  .auth-right { padding:3rem; }
  .auth-form-wrap { max-width:380px; }
  .auth-title { font-size:2rem; }
  .auth-sub { font-size:0.88rem; margin-bottom:2rem; }
  .fg label { font-size:0.8rem; }
  .fg input { padding:0.85rem 1.1rem; font-size:1rem; border-radius:var(--r-md); }
  .btn { padding:0.95rem; font-size:0.98rem; border-radius:var(--r-md); }

  /* ── Context Bar ── */
  .ctx-bar {
    padding:0.85rem 1.4rem;
    border-radius:var(--r-md);
    gap:1rem;
    margin-bottom:1.2rem;
  }
  .ctx-stat-num { font-size:1.2rem; }
  .ctx-stat-label { font-size:0.74rem; }
  .ctx-bar-track { height:6px; }
  .ctx-pct { font-size:0.78rem; }

  /* ════════════════════════════════════════
     MATRIX — Desktop Table Layout
     5-column grid: [track header] + [4 cells]
     Each track-section uses display:contents
     to place header & cells directly in parent grid
  ════════════════════════════════════════ */

  /* Column headers row */
  .mx-col-headers {
    display: grid;
    grid-template-columns: 200px repeat(4, 1fr);
    background: var(--bg-card);
    border-bottom: 2px solid var(--border);
    position: sticky;
    top: 60px;
    z-index: 10;
  }
  .mx-col-header-empty {
    background: var(--mi-dd);
    padding: 0.65rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .mx-col-header-label {
    font-size: 0.62rem;
    font-weight: 700;
    color: rgba(255,255,255,0.5);
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }
  .mx-col-header-mi {
    font-family: var(--font-ar);
    font-size: 0.88rem;
    color: rgba(255,255,255,0.9);
    font-weight: 700;
  }
  .mx-phase-header {
    padding: 0.65rem 0.75rem;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: var(--bg-card);
  }
  .mx-phase-num {
    font-size: 0.62rem;
    font-weight: 700;
    color: var(--text-muted);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-bottom: 0.12rem;
  }
  .mx-phase-name {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text);
  }
  .mx-phase-group {
    font-size: 0.62rem;
    color: var(--text-muted);
    margin-top: 0.1rem;
  }
  /* حدّان يفصلان الهوية الحالية عن الجديدة. كانا يستعيران لونَي مسارين —
     فيقرآن انتماءً لمسار لا لمجموعة مرحلة. والذهبي هنا خطٌّ لا لوحة
     مملوءة، وهو استعماله الذي تجيزه الهوية. */
  .mx-phase-header.current { border-bottom: 2px solid var(--petrol-mid); }
  .mx-phase-header.new { border-bottom: 2px solid var(--gold-deep); }

  /* Main wrap becomes 5-col grid */
  .mx-wrap {
    display: grid;
    grid-template-columns: 200px repeat(4, 1fr);
    border-radius: 0 0 var(--r-lg) var(--r-lg);
    overflow: visible;
    border: 1px solid var(--border);
    border-top: none;
    background: var(--border);
    gap: 1px;
  }

  /* Each track section = display:contents to flow into parent grid */
  .mx-track-section {
    display: contents;
  }

  /* Track header — occupies column 1 */
  .mx-track-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    padding: 1rem 1.1rem;
    gap: 0.2rem;
    border-bottom: none;
    min-height: 130px;
    position: relative;
  }
  .mx-track-icon { font-size: 1.4rem; margin-bottom: 0.25rem; }
  .mx-track-name { font-size: 1rem; font-weight: 700; line-height: 1.2; }
  .mx-track-weight {
    font-size: 0.68rem; font-weight: 700; padding: 0.16rem 0.5rem;
    border-radius: 2px; color: #fff; background: rgba(0,0,0,0.28) !important;
    margin-right: 0; margin-top: 0.2rem; letter-spacing: 0.3px;
  }
  .mx-track-desc { font-size: 0.65rem; opacity: 0.7; margin-top: 0.1rem; line-height: 1.4; }

  /* Cells grid — removed, cells flow directly */
  .mx-cells-grid {
    display: contents;
  }

  /* Cell — occupies one column in row */
  .cell {
    background: var(--bg-card);
    min-height: 130px;
    padding: 0.9rem 1rem;
    border-radius: 0;
    border: none;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: background 0.15s;
    position: relative;
  }
  .cell:hover {
    background: rgba(20, 73, 94,0.07);
    
    z-index: 2;
  }
  .cell.done { background: rgba(74,122,58,0.04); }
  .cell.done:hover { background: rgba(74,122,58,0.08); }
  .cell.dated { background: rgba(139,105,20,0.03); }
  .cell.highlighted {
    background: rgba(20, 73, 94,0.1);
    
    z-index: 2;
  }
  .cell-accent { height: 3px; width: 100%; top: 0; left: 0; right: 0; }
  .cell-num { font-size: 0.65rem; font-weight: 700; color: var(--text-muted); background: var(--bg-deep); border-radius: 2px; padding: 0.12rem 0.35rem; }
  .cell-name { font-size: 0.88rem; line-height: 1.45; font-weight: 700; color: var(--text); }
  .cell-dur { font-size: 0.68rem; padding: 0.12rem 0.35rem; }
  .cell-date { font-size: 0.72rem; font-weight: 700; }

  /* ── Smart Box ── */
  .smart-box { padding:1.1rem 1.4rem; margin-top:1rem; }
  .smart-label { font-size:0.76rem; }

  /* ── Submit Box ── */
  .submit-box { padding:1.6rem 2rem; margin-top:1rem; }
  .submit-box h3 { font-size:1.2rem; }
  .submit-box p { font-size:0.88rem; }

  /* ── Timeline ── */
  .tl { padding-right:2.2rem; }
  .tl-card { padding:1.1rem 1.3rem; }
  .tl-name { font-size:0.94rem; }
  .tl-dates { font-size:0.76rem; }

  /* ── Modal ── */
  .overlay { align-items:center; padding:2.5rem; }
  .modal {
    border-radius:var(--r-xl);
    max-height:84vh;
    max-width:620px;
    padding:2.2rem;
    
  }
  .modal h2 { font-size:1.7rem; }
  .modal-desc { font-size:0.88rem; }
  .modal-insight-box { font-size:0.88rem; padding:0.85rem 1.1rem; }
  .modal-section-title { font-size:0.76rem; }
  .date-section { padding:1rem; }
  .date-row input { padding:0.65rem 0.85rem; font-size:0.95rem; }
  .hijri-badge { font-size:0.82rem; }
  .modal-grid { gap:0.55rem; }
  .modal-item { padding:0.6rem 0.85rem; }
  .modal-item-label { font-size:0.67rem; }
  .modal-item-value { font-size:0.9rem; }

  /* ── Report ── */
  .rpt-stats { grid-template-columns:repeat(4,1fr); gap:0.75rem; }
  .rpt-stat { padding:1rem 0.75rem; }
  .rpt-stat-v { font-size:1.5rem; }
  .rpt-card { padding:1.3rem; }
  .rpt-pattern { padding:1.5rem; }
  .rpt-pattern-name { font-size:1.5rem; }
  .rpt-pattern-desc { font-size:0.85rem; }
  .rpt-bar-label { font-size:0.76rem; width:80px; }
  .rpt-bar-fill { height:20px; }
  .rpt-section-title { font-size:1.1rem; }

  /* ── Output ── */
  .output-info { grid-template-columns:repeat(3,1fr); gap:0.6rem; }
  .output-table th { padding:0.65rem 0.75rem; font-size:0.78rem; }
  .output-table td { padding:0.55rem 0.75rem; font-size:0.82rem; }

  /* ── Admin Panel — Sidebar Layout ── */
  .admin-layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 1.5rem;
    align-items: start;
    min-height: calc(100vh - 60px);
  }
  .admin-sidebar {
    background: var(--bg-card);
    border-radius: var(--r-lg);
    border: 1px solid var(--border);
    overflow: hidden;
    position: sticky;
    top: 80px;
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }
  .admin-sidebar-header {
    padding: 1rem 1.2rem;
    border-bottom: 1px solid var(--border);
    font-family: var(--font-ar);
    font-size: 1.05rem;
    color: var(--mi-d);
    font-weight: 700;
  }
  .admin-main { min-width: 0; }

  /* Admin Stats ── */
  .stat-grid { grid-template-columns:repeat(4,1fr); gap:0.9rem; }
  .stat { padding:1.2rem 1rem; }
  .stat-v { font-size:1.9rem; }
  .stat-l { font-size:0.74rem; }

  /* Reg Cards ── */
  .reg-card { padding:1rem 1.2rem; gap:0.85rem; }
  .reg-card-name { font-size:0.94rem; }
  .reg-card-meta { font-size:0.73rem; }
  .reg-card-avatar { width:42px; height:42px; font-size:1.1rem; }

  /* Reg Modal ── */
  .reg-modal-overlay { align-items:center; padding:2rem; }
  .reg-modal {
    border-radius:var(--r-xl);
    max-width:900px;
    max-height:88vh;
  }
  .reg-modal-header { padding:1rem 1.3rem; border-radius:var(--r-xl) var(--r-xl) 0 0; }
  .reg-modal-name { font-size:1.05rem; }
  .reg-modal-tab { padding:0.32rem 0.75rem; font-size:0.76rem; }
  .reg-modal-body { padding:1.3rem; }

  /* Demo Admin Cards ── */
  .demo-person-grid { grid-template-columns:repeat(2,1fr); gap:0.85rem; }
  .demo-person-card { padding:1.1rem; }
  .demo-person-name { font-size:0.92rem; }

  /* Demo Form Modal ── */
  .demo-overlay { align-items:center; padding:2rem; }
  .demo-screen {
    border-radius:var(--r-xl);
    height:auto;
    max-height:88vh;
    max-width:740px;
    
  }
  .demo-header { border-radius:var(--r-xl) var(--r-xl) 0 0; padding:1rem 1.3rem; }
  .demo-header-title { font-size:1rem; }
  .demo-body { padding:1.3rem; }
  .demo-intro { padding:1rem 1.2rem; }
  .demo-card { border-radius: 2px; }
  .demo-card-body { padding:1rem; }
  .demo-field-row { gap:0.6rem; }
  .demo-field input, .demo-field select { padding:0.65rem 0.85rem; font-size:0.92rem; }
  .demo-stepper-btn { width:36px; height:36px; font-size:1.1rem; }
  .demo-stepper-val { font-size:0.88rem; width:32px; }
  .demo-targets { gap:0.5rem; }
  .demo-target-chip { padding:0.6rem 0.6rem; font-size:0.82rem; }
  .demo-footer { padding:0.9rem 1.3rem; }
}

/* ════════════════════════════════════════════════════
   LARGE DESKTOP — 1440px+
════════════════════════════════════════════════════ */
@media(min-width:1440px){
  .nav { padding:0 3.5rem; }
  .sec { max-width:1440px; padding:2rem 3.5rem 2.5rem; }
  .mx-wrap { grid-template-columns: 220px repeat(4, 1fr); }
  .mx-col-headers { grid-template-columns: 220px repeat(4, 1fr); }
  .cell { min-height:140px; padding:1.1rem; }
  .cell-name { font-size:0.92rem; }
  .mx-track-header { min-height:140px; padding:1.2rem; }
  .mx-track-name { font-size:1.05rem; }
  .modal { max-width:660px; }
  .reg-modal { max-width:1000px; }
  .demo-screen { max-width:780px; }
  .stat-v { font-size:2.1rem; }
  .stat { padding:1.4rem 1.2rem; }
  .rpt-stat-v { font-size:1.7rem; }
  .admin-layout { grid-template-columns:300px 1fr; gap:2rem; }
}
`;
