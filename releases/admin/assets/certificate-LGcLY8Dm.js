const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/browser-QoP34MVb.js","assets/react-XDCjal2T.js"])))=>i.map(i=>d[i]);
import{_ as x}from"./index-RNKVe1id.js";import{C as e,e as o,L as _}from"./doc-aoVdN_Gj.js";import"./react-XDCjal2T.js";const S=_.replace(/<\?xml[^>]*>\s*/,"");function k(i="MI",{cx:a=0,cy:s=0,r=60,rings:t=6,color:n=e.gold,opacity:d=.11}={}){let c=0;for(const l of String(i))c=c*31+l.charCodeAt(0)>>>0;const m=18+c%7,p=[];for(let l=0;l<t;l+=1){const h=r*(.55+.45*(l/Math.max(1,t-1))),g=h*(.1+.02*(c>>l&3)),y=l*Math.PI/m;let v="";for(let f=0;f<=900;f+=1){const u=f/900*Math.PI*2,w=h-g+g*Math.cos(m*u+y)+g*.35*Math.cos((m*2+1)*u);v+=`${f?"L":"M"}${(a+w*Math.cos(u)).toFixed(2)} ${(s+w*Math.sin(u)).toFixed(2)}`}p.push(`<path d="${v}Z" fill="none" stroke="${n}" stroke-width="0.14" opacity="${d}"/>`)}return p.join("")}function F(){const t=(n,d)=>`<g transform="translate(${n} ${d})">
    <rect x="-1.1" y="-1.1" width="2.2" height="2.2" transform="rotate(45)" fill="${e.gold}"/>
    <rect x="-2.1" y="-2.1" width="4.2" height="4.2" transform="rotate(45)" fill="#FFFFFF" fill-opacity="0" stroke="${e.gold}" stroke-width="0.2"/></g>`;return`<svg class="frame" viewBox="0 0 297 210" preserveAspectRatio="none" aria-hidden="true">
    <rect x="9" y="9" width="279" height="192" fill="none" stroke="${e.gold}" stroke-width="0.5"/>
    <rect x="12" y="12" width="273" height="186" fill="none" stroke="${e.graphite}" stroke-width="0.18" opacity=".55"/>
    ${[[9,9],[288,9],[9,201],[288,201]].map(([n,d])=>t(n,d)).join("")}
  </svg>`}function M(i,a=42){const s=[...i];return s.map((r,t)=>{const n=t/s.length*360;return`<text x="60" y="${60-a}" transform="rotate(${n.toFixed(2)} 60 60)" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="6.4" fill="${e.gold}">${r===" "?"":o(r)}</text>`}).join("")}const I=`<svg class="cseal" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">
  <circle cx="60" cy="60" r="56" fill="none" stroke="${e.gold}" stroke-width=".8"/>
  <circle cx="60" cy="60" r="50" fill="none" stroke="${e.gold}" stroke-width=".4" stroke-dasharray="1.2 2.2"/>
  <circle cx="60" cy="60" r="33" fill="none" stroke="${e.gold}" stroke-width=".5"/>
  ${M("MILESTONE IMPACT · CERTIFIED · FROM INTENTION TO IMPACT · ")}
  <rect x="50" y="50" width="20" height="20" transform="rotate(45 60 60)" fill="${e.gold}"/>
</svg>`,N=(i,a)=>i?`<div class="attest"><div class="ink">${i.image?`<img src="${o(i.image)}" alt="">`:""}</div><div class="line"></div><b>${o(i.name)}</b>${i.title?`<span>${o(i.title)}</span>`:""}</div>`:`<div class="attest"><div class="ink"><span class="issuer">Milestone Impact</span></div><div class="line"></div><b>الجهة المصدِرة</b><span>${o(b(a.issued_at))}</span></div>`,b=i=>new Date(i).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{year:"numeric",month:"long",day:"numeric"}),$="نموذج للعرض";function A(i,a,{status:s}={}){const r=!!i.sample,t=r?{...i,serial:"SAMPLE",verify_url:""}:i,n=r?$:s,d=!!t.org?.logo,c=(t.signatories||[]).slice(0,1),m=t.start&&t.end?`${b(t.start)} – ${b(t.end)}`:"",p=t.start&&t.end?`${new Date(t.start).toLocaleDateString("en-GB",{month:"long",year:"numeric"})} – ${new Date(t.end).toLocaleDateString("en-GB",{month:"long",year:"numeric"})}`:"",l=t.kind==="completion_success",h=l?"Certificate of Successful Completion":"Certificate of Participation",g=l?"شهادة إتمام بنجاح":"شهادة مشاركة",y=`MILESTONE IMPACT · ${t.serial} · ${h.toUpperCase()} · `.repeat(14);return`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>${g} · ${o(t.name_ar)} · ${r?$:o(t.serial)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@200;300;400&family=Noto+Sans:wght@200;300;400&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; background: ${e.faint}; }
body { font-family: "Noto Kufi Arabic", "Noto Sans", sans-serif; font-weight: 300; color: ${e.graphite}; }
.toolbar { display: flex; gap: 8px; justify-content: center; padding: 10px; background: ${e.graphite}; position: sticky; top: 0; z-index: 3; }
.toolbar button { font: 400 11px "Noto Kufi Arabic", sans-serif; border: 1px solid ${e.gold}; background: transparent; color: ${e.mist}; padding: 7px 16px; border-radius: 2px; cursor: pointer; }
.toolbar button.pri { background: ${e.gold}; color: ${e.graphite}; }
@media print { .toolbar { display: none; } html, body { background: none; } .page { margin: 0 !important; box-shadow: none !important; } }
.page { position: relative; width: 297mm; height: 210mm; margin: 10mm auto; background: #FFFFFF; overflow: hidden; box-shadow: 0 0 0 1px ${e.line}; }
.frame, .guil { position: absolute; inset: 0; width: 100%; height: 100%; }
.guil { pointer-events: none; }
.lattice { position: absolute; inset: 12mm; opacity: .5;
  background-image: url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><path d='M0 11 11 0 22 11 11 22Z' fill='none' stroke='${e.graphite}' stroke-width='.35' opacity='.07'/></svg>`)}"); }
.content { position: absolute; inset: 18mm 24mm 17mm; display: grid; grid-template-rows: auto 1fr auto; text-align: center; }
.brands { display: flex; align-items: center; justify-content: center; gap: 8mm; direction: ltr; height: 17mm; }
.brands .mi svg { height: 15mm; width: auto; display: block; }
.brands .sep { width: 1px; height: 12mm; background: ${e.gold}; opacity: .6; }
.brands .org { display: grid; justify-items: center; gap: 1mm; }
.brands .org img { max-height: 13mm; max-width: 48mm; object-fit: contain; display: block; }
.brands .org small { font: 300 6.5pt "Noto Kufi Arabic", sans-serif; color: ${e.muted}; direction: rtl; }
.main { align-self: center; }
.kind-en { font: 300 8pt "Noto Sans", sans-serif; letter-spacing: .42em; color: ${e.gold}; text-transform: uppercase; margin: 0 0 1.5mm; }
.kind { font-weight: 200; font-size: 34pt; line-height: 1.15; margin: 0; }
.rule { display: flex; align-items: center; justify-content: center; gap: 3mm; margin: 4mm auto 5mm; width: 120mm; }
.rule i { flex: 1; height: 1px; background: ${e.gold}; opacity: .55; }
.rule b { width: 2.4mm; height: 2.4mm; background: ${e.gold}; transform: rotate(45deg); }
.lead { font-size: 11pt; color: ${e.slate}; margin: 0; }
.name { font-weight: 300; font-size: 30pt; line-height: 1.35; margin: 2mm 0 0; color: ${e.graphite}; }
.name-en { font: 300 11pt "Noto Sans", sans-serif; letter-spacing: .24em; text-transform: uppercase; color: ${e.slate}; margin: 0 0 4mm; direction: ltr; }
.body { font-size: 11pt; color: ${e.slate}; line-height: 1.9; margin: 0 auto; max-width: 200mm; }
.body b { font-weight: 400; color: ${e.graphite}; }
.body-en { font: 300 8.5pt "Noto Sans", sans-serif; color: ${e.muted}; direction: ltr; margin: 1.5mm 0 0; line-height: 1.7; }
/* التذييل بثلاثة أعمدة متناظرة (اتجاه الصفحة RTL): التوثيق يمينًا، الختم في الوسط، التحقق يسارًا */
.foot { display: grid; grid-template-columns: 1fr 34mm 1fr; align-items: end; gap: 10mm; }
.foot > :first-child { justify-self: start; }
.foot > :last-child { justify-self: end; }
.cseal { width: 30mm; height: 30mm; display: block; justify-self: center; }
/* كتلة التوثيق: الموقّع، أو الجهة المصدِرة حين لا موقّع، بالهيئة نفسها */
.attest { width: 58mm; text-align: center; }
.attest .ink { height: 12mm; display: flex; align-items: flex-end; justify-content: center; }
.attest .ink img { max-height: 12mm; max-width: 50mm; }
.attest .issuer { font: 300 13pt "Noto Sans", sans-serif; letter-spacing: .06em; color: ${e.graphite}; direction: ltr; }
.attest .line { height: 0.3mm; background: ${e.graphite}; opacity: .5; margin: 1.2mm 0 1.6mm; }
.attest b { display: block; font-weight: 400; font-size: 9.5pt; color: ${e.graphite}; }
.attest span { display: block; font-size: 7.5pt; color: ${e.muted}; margin-top: .4mm; }
/* التحقق: نص عربي بقيم لاتينية معزولة، والرمز عند الحافة الخارجية */
.verify { display: flex; align-items: center; gap: 3.5mm; }
.verify dl { margin: 0; text-align: right; display: grid; grid-template-columns: auto auto; gap: .6mm 3mm; font-size: 6.8pt; color: ${e.muted}; line-height: 1.45; }
.verify dt { white-space: nowrap; }
.verify dd { margin: 0; color: ${e.graphite}; white-space: nowrap; }
.verify dd.ltr { direction: ltr; text-align: right; unicode-bidi: isolate; font: 400 7.2pt "Noto Sans", sans-serif; letter-spacing: .04em; }
.verify .qr { flex: none; width: 17mm; height: 17mm; padding: 1mm; border: 0.25mm solid ${e.line}; background: #fff; }
.verify .qr svg { width: 100%; height: 100%; display: block; }
.micro { position: absolute; left: 16mm; right: 16mm; bottom: 13.3mm; font: 300 3.2pt/1 "Noto Sans", sans-serif; letter-spacing: .08em; color: ${e.gold}; opacity: .75; white-space: nowrap; overflow: hidden; direction: ltr; }
.rights { position: absolute; left: 0; right: 0; bottom: 4mm; text-align: center; font-size: 6.3pt; color: ${e.muted}; }
.rights bdi, .rights .en { font-family: "Noto Sans", sans-serif; }
.status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.status span { border: 1mm solid ${e.muted}; color: ${e.muted}; font-size: 40pt; padding: 2mm 14mm; transform: rotate(-14deg); opacity: .5; }
</style></head><body>
<div class="toolbar"><button class="pri" data-act="print">طباعة أو حفظ PDF</button>${n?"":'<button data-act="linkedin">أضفها إلى LinkedIn</button>'}<button data-act="close">إغلاق</button></div>
<article class="page">
  <div class="lattice"></div>
  <svg class="guil" viewBox="0 0 297 210" aria-hidden="true">${k(t.serial,{cx:148.5,cy:108,r:68})}${k(t.serial+"b",{cx:148.5,cy:108,r:44,rings:5,color:e.graphite,opacity:.08})}</svg>
  ${F()}
  <div class="content">
    <header class="brands">
      <div class="mi">${S}</div>
      ${d?`<i class="sep"></i><div class="org"><img src="${o(t.org.logo)}" alt="${o(t.org.name)}"><small>بالشراكة مع ${o(t.org.name)}</small></div>`:""}
    </header>
    <section class="main">
      <p class="kind-en">${h}</p>
      <h1 class="kind">${g}</h1>
      <div class="rule"><i></i><b></b><i></i></div>
      <p class="lead">تُمنح هذه الشهادة إلى</p>
      <h2 class="name">${o(t.name_ar)}</h2>
      <p class="name-en">${o(t.name_en)}</p>
      <p class="body">تقديرًا لإتمام متطلبات المشاركة في <b>${o(t.program_ar)}</b>${t.track_ar?` ضمن <b>${o(t.track_ar)}</b>`:""}${t.hours?` بواقع <b>${o(t.hours)} ساعة</b> تدريبية`:""}${m?`<br>خلال الفترة ${o(m)}`:""}.</p>
      <p class="body-en">In recognition of completing the ${o(t.program_en)}${t.track_en?` · ${o(t.track_en)}`:""}${t.hours?` · ${o(t.hours)} training hours`:""}${p?` · ${o(p)}`:""}</p>
    </section>
    <footer class="foot">
      ${N(c[0],t)}
      ${I}
      ${r?`<div class="verify"><dl>
          <dt>رقم الشهادة</dt><dd>${$}، بلا رقم</dd>
          <dt>التحقق</dt><dd>لا رابط تحقق لهذا النموذج</dd>
        </dl></div>`:`<div class="verify">
        <dl>
          <dt>رقم الشهادة</dt><dd class="ltr">${o(t.serial)}</dd>
          <dt>تاريخ الإصدار</dt><dd>${o(b(t.issued_at))}</dd>
          <dt>التحقق</dt><dd class="ltr">${o(t.verify_url.replace(/^https?:\/\//,""))}</dd>
        </dl>
        <div class="qr">${a}</div>
      </div>`}
    </footer>
  </div>
  <div class="micro">${o(y)}</div>
  <div class="rights">جميع الحقوق محفوظة <bdi dir="ltr">© ${new Date(t.issued_at).getFullYear()} Milestone Impact</bdi> · ${r?`${$}، لا يثبت إتمام البرنامج`:"تحقّق من صحة الشهادة بمسح الرمز"}</div>
  ${n?`<div class="status"><span>${o(n)}</span></div>`:""}
</article>
</body></html>`}function L(i){const a=new Date(i.issued_at);return`https://www.linkedin.com/profile/add?${new URLSearchParams({startTask:"CERTIFICATION_NAME",name:i.program_en||"Leaders Program",organizationName:"Milestone Impact",issueYear:String(a.getFullYear()),issueMonth:String(a.getMonth()+1),certUrl:i.verify_url,certId:i.serial})}`}async function E(i){const{default:a}=await x(async()=>{const{default:s}=await import("./browser-QoP34MVb.js").then(r=>r.b);return{default:s}},__vite__mapDeps([0,1]));return a.toString(i,{type:"svg",margin:0,errorCorrectionLevel:"Q",color:{dark:e.graphite,light:"#FFFFFF"}})}async function z(i,a,s={}){if(!i)return!1;const r=A(a,a.sample?"":await E(a.verify_url),s);i.document.open(),i.document.write(r),i.document.close();const t=(n,d)=>i.document.querySelector(`[data-act="${n}"]`)?.addEventListener("click",d);return t("print",()=>i.print()),t("close",()=>i.close()),t("linkedin",()=>i.open(L(a),"_blank","noopener")),!0}export{$ as SAMPLE_STAMP_AR,A as certificateHtml,k as guilloche,L as linkedinUrl,E as qrSvgFor,z as writeCertificate};
