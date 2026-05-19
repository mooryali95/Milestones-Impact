import React from "react";
import MILogo from "./MILogo";

const TRACKS_LP = [
  {id:"creation",name:"الخلق",icon:"◈",color:"#8B6914",weight:19,desc:"استدعاء الإرث وتفكيك البنية البشرية"},
  {id:"innovation",name:"الإبداع",icon:"◉",color:"#5B7B3A",weight:21,desc:"إعادة تعريف القيمة وإطار الإدراك"},
  {id:"establishment",name:"الإنشاء",icon:"◆",color:"#2E6B8A",weight:47,desc:"تكوين الكيان ومنظومة الإنتاج"},
  {id:"making",name:"الجعل",icon:"◇",color:"#6B4E3D",weight:13,desc:"الاندماج وإغلاق حلقة الأثر"},
];

export default function Landing({ onRegister, onResume, onAdmin, OPERATIONS }) {
  return (
    <><style>{`
/* LANDING PAGE — Luxury Editorial */
.lp{font-family:'Tajawal',sans-serif;direction:rtl;background:#0D0D0F;color:#E8E2D9;overflow-x:hidden;}
.lp *,.lp *::before,.lp *::after{box-sizing:border-box;margin:0;padding:0;}
.lp-hero{min-height:100vh;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem 2rem;overflow:hidden;}
.lp-hero-bg{position:absolute;inset:0;z-index:0;background:radial-gradient(ellipse 80% 60% at 50% 0%,#1C2B3A 0%,#0D0D0F 70%);}
.lp-hero-grid{position:absolute;inset:0;z-index:1;opacity:.06;background-image:linear-gradient(rgba(139,105,20,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(139,105,20,.8) 1px,transparent 1px);background-size:60px 60px;}
.lp-hero-glow{position:absolute;width:600px;height:600px;border-radius:50%;background:radial-gradient(circle,rgba(107,157,173,.08) 0%,transparent 70%);top:50%;left:50%;transform:translate(-50%,-55%);z-index:1;pointer-events:none;}
.lp-hero-content{position:relative;z-index:2;text-align:center;max-width:780px;}
.lp-eyebrow{font-size:.68rem;letter-spacing:4px;text-transform:uppercase;color:#8B6914;margin-bottom:2rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:.8rem;}
.lp-eyebrow::before,.lp-eyebrow::after{content:'';display:block;width:40px;height:1px;background:#8B6914;opacity:.6;}
.lp-hero-logo{margin-bottom:1.8rem;animation:lp-float 6s ease-in-out infinite;}
@keyframes lp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.lp-hero-title{font-family:'Amiri',serif;font-size:clamp(2.8rem,7vw,5rem);font-weight:700;line-height:1.1;margin-bottom:.6rem;background:linear-gradient(135deg,#E8E2D9 0%,#C4A24E 50%,#8B6914 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.lp-hero-en{font-family:'Tajawal',sans-serif;font-weight:200;font-size:clamp(1rem,2.5vw,1.5rem);letter-spacing:6px;color:rgba(107,157,173,.7);margin-bottom:1.4rem;}
.lp-hero-sub{font-size:clamp(.9rem,2vw,1.1rem);color:rgba(232,226,217,.55);line-height:1.8;max-width:520px;margin:0 auto 2.8rem;font-weight:300;}
.lp-hero-line{width:1px;height:50px;background:linear-gradient(to bottom,#8B6914,transparent);margin:0 auto 2.8rem;}
.lp-hero-actions{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;}
.lp-btn-primary{padding:.85rem 2.2rem;border-radius:3px;border:1px solid #8B6914;background:linear-gradient(135deg,#8B6914,#C4A24E);color:#0D0D0F;font-family:'Tajawal',sans-serif;font-size:.9rem;font-weight:700;cursor:pointer;letter-spacing:1px;transition:all .3s;position:relative;overflow:hidden;}
.lp-btn-primary::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,transparent,rgba(255,255,255,.15),transparent);transform:translateX(-100%);transition:transform .5s;}
.lp-btn-primary:hover::after{transform:translateX(100%);}
.lp-btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(139,105,20,.4);}
.lp-btn-ghost{padding:.85rem 2.2rem;border-radius:3px;border:1px solid rgba(107,157,173,.35);background:transparent;color:#6B9DAD;font-family:'Tajawal',sans-serif;font-size:.9rem;font-weight:500;cursor:pointer;letter-spacing:1px;transition:all .3s;}
.lp-btn-ghost:hover{border-color:#6B9DAD;background:rgba(107,157,173,.08);transform:translateY(-2px);}
.lp-btn-admin{display:block;margin:1.5rem auto 0;background:none;border:none;color:rgba(232,226,217,.2);font-family:'Tajawal',sans-serif;font-size:.72rem;cursor:pointer;letter-spacing:2px;transition:color .3s;}
.lp-btn-admin:hover{color:rgba(232,226,217,.45);}
.lp-scroll-hint{position:absolute;bottom:2rem;left:50%;transform:translateX(-50%);z-index:2;display:flex;flex-direction:column;align-items:center;gap:.5rem;color:rgba(232,226,217,.2);font-size:.65rem;letter-spacing:2px;animation:lp-bounce 2s ease-in-out infinite;}
@keyframes lp-bounce{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(6px)}}
.lp-scroll-line{width:1px;height:30px;background:linear-gradient(to bottom,rgba(139,105,20,.5),transparent);}
.lp-divider{display:flex;align-items:center;gap:1.5rem;padding:0 2rem;max-width:900px;margin:0 auto;}
.lp-divider-line{flex:1;height:1px;background:linear-gradient(to right,transparent,rgba(139,105,20,.3),transparent);}
.lp-divider-gem{color:#8B6914;font-size:.8rem;}
.lp-section{padding:6rem 2rem;max-width:1100px;margin:0 auto;}
.lp-section-label{font-size:.62rem;letter-spacing:4px;text-transform:uppercase;color:#8B6914;margin-bottom:.8rem;font-weight:600;}
.lp-section-title{font-family:'Amiri',serif;font-size:clamp(1.8rem,4vw,2.8rem);font-weight:700;line-height:1.2;margin-bottom:1rem;color:#E8E2D9;}
.lp-section-body{font-size:1rem;color:rgba(232,226,217,.5);line-height:1.9;max-width:620px;font-weight:300;}
.lp-manifesto{background:#0A0A0C;padding:6rem 2rem;}
.lp-manifesto-inner{max-width:760px;margin:0 auto;text-align:center;}
.lp-manifesto-quote{font-family:'Amiri',serif;font-size:clamp(1.2rem,3vw,1.9rem);color:#E8E2D9;line-height:1.9;margin-bottom:2rem;position:relative;padding:0 1rem;}
.lp-manifesto-quote::before{content:'"';position:absolute;right:-10px;top:-20px;font-size:5rem;color:#8B691420;font-family:'Amiri',serif;line-height:1;}
.lp-manifesto-attr{font-size:.72rem;letter-spacing:3px;color:#8B6914;text-transform:uppercase;}
.lp-tracks{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(139,105,20,.1);border:1px solid rgba(139,105,20,.1);border-radius:4px;overflow:hidden;}
@media(max-width:700px){.lp-tracks{grid-template-columns:1fr 1fr;}}
.lp-track{padding:2rem 1.5rem;background:#0D0D0F;position:relative;overflow:hidden;transition:background .3s;}
.lp-track::before{content:'';position:absolute;top:0;right:0;width:3px;height:100%;}
.lp-track-creation::before{background:#8B6914;}
.lp-track-innovation::before{background:#5B7B3A;}
.lp-track-establishment::before{background:#2E6B8A;}
.lp-track-making::before{background:#6B4E3D;}
.lp-track:hover{background:#111115;}
.lp-track-icon{font-size:1.4rem;margin-bottom:.8rem;}
.lp-track-name{font-family:'Amiri',serif;font-size:1.2rem;font-weight:700;margin-bottom:.3rem;}
.lp-track-weight{font-size:2rem;font-weight:200;opacity:.12;position:absolute;top:1rem;left:1.5rem;font-family:'Tajawal',sans-serif;}
.lp-track-desc{font-size:.75rem;color:rgba(232,226,217,.4);line-height:1.6;margin-bottom:.8rem;}
.lp-track-ops{display:flex;flex-direction:column;gap:.3rem;margin-top:.8rem;padding-top:.8rem;border-top:1px solid rgba(255,255,255,.05);}
.lp-track-op{font-size:.68rem;color:rgba(232,226,217,.3);padding:.2rem 0;display:flex;align-items:center;gap:.4rem;}
.lp-track-op::before{content:'';width:4px;height:4px;border-radius:50%;flex-shrink:0;}
.lp-track-creation .lp-track-op::before{background:#8B6914;}
.lp-track-innovation .lp-track-op::before{background:#5B7B3A;}
.lp-track-establishment .lp-track-op::before{background:#2E6B8A;}
.lp-track-making .lp-track-op::before{background:#6B4E3D;}
.lp-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:2rem;}
@media(max-width:700px){.lp-steps{grid-template-columns:1fr;}}
.lp-step{text-align:center;padding:2rem;}
.lp-step-num{width:56px;height:56px;border-radius:50%;border:1px solid rgba(139,105,20,.4);display:flex;align-items:center;justify-content:center;margin:0 auto 1.2rem;font-family:'Amiri',serif;font-size:1.4rem;color:#8B6914;position:relative;}
.lp-step-num::before{content:'';position:absolute;inset:-4px;border-radius:50%;border:1px solid rgba(139,105,20,.15);}
.lp-step-title{font-family:'Amiri',serif;font-size:1.1rem;margin-bottom:.5rem;color:#E8E2D9;}
.lp-step-desc{font-size:.78rem;color:rgba(232,226,217,.4);line-height:1.7;}
.lp-cta-final{padding:8rem 2rem;text-align:center;background:radial-gradient(ellipse 80% 50% at 50% 100%,#1C2B3A 0%,#0D0D0F 70%);position:relative;overflow:hidden;}
.lp-cta-final::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(139,105,20,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(139,105,20,.04) 1px,transparent 1px);background-size:40px 40px;}
.lp-cta-final-inner{position:relative;z-index:1;}
.lp-cta-final-title{font-family:'Amiri',serif;font-size:clamp(2rem,5vw,3.5rem);margin-bottom:.8rem;background:linear-gradient(135deg,#E8E2D9,#C4A24E);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.lp-cta-final-sub{color:rgba(232,226,217,.4);font-size:.9rem;margin-bottom:2.5rem;letter-spacing:1px;}
.lp-footer{padding:2rem;border-top:1px solid rgba(139,105,20,.1);text-align:center;background:#0D0D0F;}
.lp-footer-text{font-size:.68rem;color:rgba(232,226,217,.18);letter-spacing:2px;line-height:2;}
@keyframes lp-fade-up{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.lp-a1{animation:lp-fade-up .9s ease both;}
.lp-a2{animation:lp-fade-up .9s .15s ease both;}
.lp-a3{animation:lp-fade-up .9s .3s ease both;}
.lp-a4{animation:lp-fade-up .9s .45s ease both;}
.lp-a5{animation:lp-fade-up .9s .6s ease both;}
    `}</style>
    <div className="lp">

      {/* ══ HERO ══ */}
      <section className="lp-hero">
        <div className="lp-hero-bg"/>
        <div className="lp-hero-grid"/>
        <div className="lp-hero-glow"/>
        <div className="lp-hero-content">
          <div className="lp-eyebrow lp-a1">مصفوفة التأثير</div>
          <div className="lp-hero-logo lp-a2"><MILogo size={72} color="#C4A24E"/></div>
          <h1 className="lp-hero-title lp-a3">هندسة القيمة</h1>
          <div className="lp-hero-en lp-a3">MILESTONE IMPACT</div>
          <p className="lp-hero-sub lp-a4">نموذج تحولي من ستة عشر عملية استراتيجية —<br/>يشتغل على القيمة الكامنة داخل الإنسان، ويحوّلها إلى أثر قابل للقياس</p>
          <div className="lp-hero-line lp-a4"/>
          <div className="lp-hero-actions lp-a5">
            <button className="lp-btn-primary" onClick={onRegister}>ابدأ رحلتك</button>
            <button className="lp-btn-ghost" onClick={onResume}>استئناف الجلسة</button>
          </div>
          <button className="lp-btn-admin" onClick={onAdmin}>⌘ دخول المدير</button>
        </div>
        <div className="lp-scroll-hint"><span>اكتشف</span><div className="lp-scroll-line"/></div>
      </section>

      {/* ══ MANIFESTO ══ */}
      <div className="lp-manifesto">
        <div className="lp-manifesto-inner">
          <div className="lp-section-label" style={{marginBottom:"1.5rem"}}>الفلسفة</div>
          <div className="lp-manifesto-quote">
            لا يشتغل هذا النموذج على الفرد بوصفه موضوع تطوير،<br/>
            ولا على السوق بوصفه مجال ربح —<br/>
            بل على <span style={{color:"#C4A24E"}}>القيمة الكامنة داخل الإنسان</span>،<br/>
            وكيف تتحرك عبر الشبكات التي يصنعها
          </div>
          <div className="lp-manifesto-attr">Milestone Impact • الإطار الحاكم</div>
        </div>
      </div>

      {/* ══ TRACKS ══ */}
      <div style={{background:"#0A0A0C",padding:"6rem 0"}}>
        <div className="lp-section" style={{paddingTop:0,paddingBottom:"3rem"}}>
          <div className="lp-section-label">المنظومة</div>
          <h2 className="lp-section-title">أربعة مسارات تحريك</h2>
          <p className="lp-section-body" style={{marginBottom:"3rem"}}>المسارات ليست مراحل متتالية — بل حالات تشغيل تعمل في آنٍ واحد، تتشابك وتتبادل التأثير</p>
        </div>
        <div style={{maxWidth:"1100px",margin:"0 auto",padding:"0 2rem 2rem"}}>
          <div className="lp-tracks">
            {[
              {id:"creation",name:"الخلق",icon:"◈",color:"#8B6914",weight:19,desc:"استدعاء الإرث وتفكيك البنية البشرية",ops:OPERATIONS.creation.map(o=>o.nameAr)},
              {id:"innovation",name:"الإبداع",icon:"◉",color:"#5B7B3A",weight:21,desc:"إعادة تعريف القيمة وإطار الإدراك",ops:OPERATIONS.innovation.map(o=>o.nameAr)},
              {id:"establishment",name:"الإنشاء",icon:"◆",color:"#2E6B8A",weight:47,desc:"تكوين الكيان ومنظومة الإنتاج",ops:OPERATIONS.establishment.map(o=>o.nameAr)},
              {id:"making",name:"الجعل",icon:"◇",color:"#6B4E3D",weight:13,desc:"الاندماج وإغلاق حلقة الأثر",ops:OPERATIONS.making.map(o=>o.nameAr)},
            ].map(t=>(
              <div key={t.id} className={`lp-track lp-track-${t.id}`}>
                <div className="lp-track-weight">{t.weight}%</div>
                <div className="lp-track-icon" style={{color:t.color}}>{t.icon}</div>
                <div className="lp-track-name" style={{color:t.color}}>{t.name}</div>
                <div className="lp-track-desc">{t.desc}</div>
                <div className="lp-track-ops">{t.ops.map((op,i)=><div key={i} className="lp-track-op">{op}</div>)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ DIVIDER ══ */}
      <div style={{padding:"3rem 0",background:"#0A0A0C"}}>
        <div className="lp-divider"><div className="lp-divider-line"/><div className="lp-divider-gem">◈</div><div className="lp-divider-line"/></div>
      </div>

      {/* ══ HOW IT WORKS ══ */}
      <div style={{background:"#0D0D0F",padding:"6rem 2rem"}}>
        <div style={{maxWidth:"1100px",margin:"0 auto"}}>
          <div className="lp-section-label">المسار</div>
          <h2 className="lp-section-title" style={{marginBottom:"3rem"}}>ثلاث لحظات تحول</h2>
          <div className="lp-steps">
            {[
              {n:"١",title:"التسجيل والتوثيق",desc:"سجّل بياناتك وادخل إلى مصفوفة العمليات الست عشرة — كل عملية تُبنى على ما سبقها"},
              {n:"٢",title:"التحليل والتخطيط",desc:"حدد مواعيد كل عملية، وابنِ خريطتك الزمنية مع تحليل ديموغرافي للشبكة البشرية حولك"},
              {n:"٣",title:"الأثر والتحول",desc:"أكمل خطتك التحولية وتسلّم تقريرك الكامل — الأثر مقيس، والقيمة محوّلة"},
            ].map((s,i)=>(
              <div key={i} className="lp-step">
                <div className="lp-step-num">{s.n}</div>
                <div className="lp-step-title">{s.title}</div>
                <div className="lp-step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ CTA FINAL ══ */}
      <div className="lp-cta-final">
        <div className="lp-cta-final-inner">
          <div className="lp-section-label" style={{marginBottom:"1.2rem"}}>ابدأ الآن</div>
          <div className="lp-cta-final-title">القيمة الكامنة تنتظر</div>
          <div className="lp-cta-final-sub">ست عشرة عملية • مسار واحد • أثر لا يُنسى</div>
          <div style={{display:"flex",gap:"1rem",justifyContent:"center",flexWrap:"wrap"}}>
            <button className="lp-btn-primary" onClick={onRegister}>ابدأ رحلتك ←</button>
            <button className="lp-btn-ghost" onClick={onResume}>استئناف الجلسة</button>
          </div>
        </div>
      </div>

      {/* ══ FOOTER ══ */}
      <div className="lp-footer">
        <div className="lp-footer-text">
          MILESTONE IMPACT © {new Date().getFullYear()}<br/>
          جميع الحقوق محفوظة • لا يُسمح بإعادة النشر أو التوزيع
        </div>
      </div>

    </div></>

  );
}
