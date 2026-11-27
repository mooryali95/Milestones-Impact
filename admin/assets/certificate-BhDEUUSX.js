const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/browser-DxlvdD3y.js","assets/react-Ber_YKC-.js","assets/index-B8JiQcwG.js","assets/index-BpFVAEK1.css","assets/pdf-CFl8rtx3.js","assets/doc-DiFY8V3G.js","assets/logo-CMHG9x4U.js"])))=>i.map(i=>d[i]);
import{_ as v}from"./index-B8JiQcwG.js";import{f as n,C as i,L as M}from"./doc-DiFY8V3G.js";import{refreshLogos as A,orgLogoHtml as T,primeLogos as N}from"./logo-CMHG9x4U.js";import"./react-Ber_YKC-.js";const C=M.replace(/<\?xml[^>]*>\s*/,"");function _(e="MI",{cx:o=0,cy:r=0,r:s=60,rings:l=6,color:t=i.gold,opacity:a=.11}={}){let d=0;for(const c of String(e))d=d*31+c.charCodeAt(0)>>>0;const m=18+d%7,p=[];for(let c=0;c<l;c+=1){const f=s*(.55+.45*(c/Math.max(1,l-1))),g=f*(.1+.02*(d>>c&3)),u=c*Math.PI/m;let b="";for(let h=0;h<=900;h+=1){const $=h/900*Math.PI*2,k=f-g+g*Math.cos(m*$+u)+g*.35*Math.cos((m*2+1)*$);b+=`${h?"L":"M"}${(o+k*Math.cos($)).toFixed(2)} ${(r+k*Math.sin($)).toFixed(2)}`}p.push(`<path d="${b}Z" fill="none" stroke="${t}" stroke-width="0.14" opacity="${a}"/>`)}return p.join("")}function L(){const l=(t,a)=>`<g transform="translate(${t} ${a})">
    <rect x="-1.1" y="-1.1" width="2.2" height="2.2" transform="rotate(45)" fill="${i.gold}"/>
    <rect x="-2.1" y="-2.1" width="4.2" height="4.2" transform="rotate(45)" fill="#FFFFFF" fill-opacity="0" stroke="${i.gold}" stroke-width="0.2"/></g>`;return`<svg class="frame" viewBox="0 0 297 210" preserveAspectRatio="none" aria-hidden="true">
    <rect x="9" y="9" width="279" height="192" fill="none" stroke="${i.gold}" stroke-width="0.5"/>
    <rect x="12" y="12" width="273" height="186" fill="none" stroke="${i.graphite}" stroke-width="0.18" opacity=".55"/>
    ${[[9,9],[288,9],[9,201],[288,201]].map(([t,a])=>l(t,a)).join("")}
  </svg>`}function z(e,o=43){const r=[...e];return r.map((s,l)=>{const t=l/r.length*360;return`<text x="60" y="${60-o}" transform="rotate(${t.toFixed(2)} 60 60)" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="6.2" font-weight="500" fill="${i.gold}">${s===" "?"":n(s)}</text>`}).join("")}const R=e=>`<svg class="cseal" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">
  <circle cx="60" cy="60" r="56" fill="none" stroke="${i.gold}" stroke-width=".8"/>
  <circle cx="60" cy="60" r="50" fill="none" stroke="${i.gold}" stroke-width=".4" stroke-dasharray="1.2 2.2"/>
  <circle cx="60" cy="60" r="33" fill="none" stroke="${i.gold}" stroke-width=".5"/>
  ${z(e?"MILESTONE IMPACT · CERTIFIED · FROM INTENTION TO IMPACT · ":"MILESTONE IMPACT · FROM INTENTION TO IMPACT · ")}
  ${e?'<rect x="56" y="38" width="8" height="8" transform="rotate(45 60 42)" fill="'+i.gold+'"/>':'<rect x="52" y="52" width="16" height="16" transform="rotate(45 60 60)" fill="'+i.gold+'"/>'}
  ${e?`<text x="60" y="64" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, sans-serif" font-size="8" font-weight="500" fill="${i.gold}">شهادة معتمدة</text>
  <text x="60" y="77" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="5.2" font-weight="500" letter-spacing=".9" fill="${i.gold}">CERTIFIED</text>`:""}
</svg>`,W="منصة Milestone Impact",O=e=>e?`<div class="attest"><div class="ink">${e.image?`<img src="${n(e.image)}" alt="">`:""}</div><div class="line"></div><b>${n(e.name)}</b>${e.title?`<span>${n(e.title)}</span>`:""}</div>`:'<div class="attest"><div class="ink"></div><div class="line"></div><b dir="rtl">منصة <bdi dir="ltr">Milestone Impact</bdi></b><span>الجهة المصدِرة</span></div>',E=Object.freeze({name:40,title:28,body:12,verify:7.5,serial:8,rights:7,signer:10,signerTitle:8});function S(e){const o=[...String(e||"")].length;return o<=26?E.name:o<=34?34:o<=44?30:o<=56?26:24}const w=e=>new Date(e).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn",{year:"numeric",month:"long",day:"numeric"}),y="نموذج للعرض";function x(e,o,r={}){const s=r.status,l=!!e.sample,t=l?{...e,serial:"SAMPLE",verify_url:""}:e,a=l?y:s,d=!!t.org?.logo,m=(t.signatories||[]).slice(0,1),p=t.start&&t.end?`${w(t.start)} – ${w(t.end)}`:"",c=t.start&&t.end?`${new Date(t.start).toLocaleDateString("en-GB",{month:"long",year:"numeric"})} – ${new Date(t.end).toLocaleDateString("en-GB",{month:"long",year:"numeric"})}`:"",f=t.kind==="completion_success",g=f?"Certificate of Successful Completion":"Certificate of Participation",u=f?"شهادة إتمام بنجاح":"شهادة مشاركة",b=t.org?.name||"",h=[t.cohort_ar?`الدفعة: ${n(t.cohort_ar)}`:"",b&&!d?`الجهة: ${n(b)}`:""].filter(Boolean),$=`MILESTONE IMPACT · ${t.serial} · ${g.toUpperCase()} · `.repeat(14);return A(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="color-scheme" content="light">
${r.base?`<base href="${n(r.base)}">`:""}
<title>${u} · ${n(t.name_ar)} · ${l?y:n(t.serial)}</title>
<link rel="stylesheet" href="/fonts/fonts.css">
<style>
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; background: ${i.faint}; }
body { font-family: "Noto Kufi Arabic", "Noto Sans", sans-serif; font-weight: 400; color: ${i.graphite}; }
.toolbar { display: flex; gap: 8px; justify-content: center; padding: 10px; background: ${i.graphite}; position: sticky; top: 0; z-index: 3; }
.toolbar button { font: 500 11px "Noto Kufi Arabic", sans-serif; border: 1px solid ${i.gold}; background: transparent; color: ${i.mist}; padding: 7px 16px; border-radius: 2px; cursor: pointer; }
.toolbar button.pri { background: ${i.gold}; color: ${i.graphite}; }
@media print { .toolbar { display: none; } html, body { background: none; } .page { margin: 0 !important; box-shadow: none !important; } }
.page { position: relative; width: 297mm; height: 210mm; margin: 10mm auto; background: #FFFFFF; overflow: hidden; box-shadow: 0 0 0 1px ${i.line}; }
.frame, .guil { position: absolute; inset: 0; width: 100%; height: 100%; }
.guil { pointer-events: none; }
.lattice { position: absolute; inset: 12mm; opacity: .5;
  background-image: url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><path d='M0 11 11 0 22 11 11 22Z' fill='none' stroke='${i.graphite}' stroke-width='.35' opacity='.07'/></svg>`)}"); }
.content { position: absolute; inset: 18mm 24mm 23mm; display: grid; grid-template-rows: auto 1fr auto; text-align: center; }
.brands { display: flex; align-items: center; justify-content: center; gap: 8mm; direction: ltr; height: 22mm; }
.brands .mi svg { height: 15mm; width: auto; display: block; }
.brands .sep { width: 0.3mm; height: 15mm; background: ${i.gold}; opacity: .8; }
.brands .org { display: grid; justify-items: center; gap: 1mm; }
.brands .org img { height: 15mm; width: auto; max-width: 48mm; object-fit: contain; display: block; }
.brands .org.t img { max-width: 18mm; }
.brands .org.w img { max-width: 64mm; }
.brands .org.light img { background: ${i.graphite}; padding: 2mm 3mm; box-sizing: content-box; }
.brands .org small { font: 400 9pt "Noto Kufi Arabic", sans-serif; color: ${i.muted}; direction: rtl; }
.main { align-self: center; }
.kind-en { font: 400 8pt "Noto Sans", sans-serif; letter-spacing: .28em; color: ${i.gold}; text-transform: uppercase; margin: 0 0 1.5mm; }
.kind { font-weight: 400; font-size: 28pt; line-height: 1.2; margin: 0; }
.rule { display: flex; align-items: center; justify-content: center; gap: 3mm; margin: 3mm auto 4mm; width: 120mm; }
.rule i { flex: 1; height: 1px; background: ${i.gold}; opacity: .55; }
.rule b { width: 2.4mm; height: 2.4mm; background: ${i.gold}; transform: rotate(45deg); }
.lead { font-size: 12pt; color: ${i.slate}; margin: 0; }
.name { font-weight: 500; font-size: 40pt; line-height: 1.3; margin: 1mm auto 0; max-width: 249mm; text-wrap: balance; color: ${i.graphite}; }
.name-en { font: 400 11pt "Noto Sans", sans-serif; letter-spacing: .24em; text-transform: uppercase; color: ${i.slate}; margin: 0 0 4mm; direction: ltr; }
.body { font-size: 12pt; font-weight: 400; color: ${i.slate}; line-height: 1.8; margin: 0 auto; max-width: 200mm; }
.body b { font-weight: 500; color: ${i.graphite}; }
.facts { font-size: 10pt; color: ${i.slate}; margin: 1.5mm 0 0; }
.body-en { font: 400 8.5pt "Noto Sans", sans-serif; color: ${i.muted}; direction: ltr; margin: 1.5mm 0 0; line-height: 1.7; }
/* التذييل بثلاثة أعمدة متناظرة (اتجاه الصفحة RTL): التوثيق يمينًا، الختم في الوسط، التحقق يسارًا */
.foot { display: grid; grid-template-columns: 1fr 34mm 1fr; align-items: end; gap: 10mm; }
.foot > :first-child { justify-self: start; }
.foot > :last-child { justify-self: end; }
.cseal { width: 30mm; height: 30mm; display: block; justify-self: center; }
/* كتلة التوثيق: الموقّع، أو الجهة المصدِرة حين لا موقّع، بالهيئة نفسها */
.attest { width: 58mm; text-align: center; }
.attest .ink { height: 12mm; display: flex; align-items: flex-end; justify-content: center; }
.attest .ink img { max-height: 12mm; max-width: 50mm; }
.attest .line { height: 0.3mm; background: ${i.graphite}; opacity: .5; margin: 1.2mm 0 1.6mm; }
.attest b { display: block; font-weight: 500; font-size: 10pt; color: ${i.graphite}; }
.attest span { display: block; font-size: 8pt; color: ${i.muted}; margin-top: .4mm; }
/* التحقق: نص عربي بقيم لاتينية معزولة، والرمز عند الحافة الخارجية */
.verify { display: flex; align-items: center; gap: 3.5mm; }
.verify dl { margin: 0; text-align: right; display: grid; grid-template-columns: auto auto; gap: .6mm 3mm; font-size: 7.5pt; color: ${i.muted}; line-height: 1.45; }
.verify dt { white-space: nowrap; }
.verify dd { margin: 0; color: ${i.graphite}; white-space: nowrap; }
.verify dd.ltr { direction: ltr; text-align: right; unicode-bidi: isolate; font: 400 8pt "Noto Sans", sans-serif; letter-spacing: .04em; }
.verify .qr { flex: none; width: 19mm; height: 19mm; padding: 1mm; border: 0.25mm solid ${i.line}; background: #fff; }
.verify .qr svg { width: 100%; height: 100%; display: block; }
.micro { position: absolute; left: 16mm; right: 16mm; bottom: 13.3mm; font: 400 3.2pt/1 "Noto Sans", sans-serif; letter-spacing: .08em; color: ${i.gold}; opacity: .75; white-space: nowrap; overflow: hidden; direction: ltr; }
.rights { position: absolute; left: 0; right: 0; bottom: 4mm; text-align: center; font-size: 7pt; color: ${i.muted}; }
.rights bdi, .rights .en { font-family: "Noto Sans", sans-serif; }
.status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.status span { border: 1mm solid ${i.muted}; color: ${i.muted}; font-size: 40pt; padding: 2mm 14mm; transform: rotate(-14deg); opacity: .5; }
</style></head><body>
${r.print?"":`<div class="toolbar"><button class="pri" data-act="pdf">تحميل PDF</button><button data-act="print">طباعة</button>${a?"":'<button data-act="linkedin">أضفها إلى LinkedIn</button>'}<button data-act="close">إغلاق</button></div>`}
<article class="page">
  <div class="lattice"></div>
  <svg class="guil" viewBox="0 0 297 210" aria-hidden="true">${_(t.serial,{cx:148.5,cy:108,r:68})}${_(t.serial+"b",{cx:148.5,cy:108,r:44,rings:5,color:i.graphite,opacity:.08})}</svg>
  ${L()}
  <div class="content">
    <header class="brands">
      <div class="mi">${C}</div>
      ${d?`<i class="sep"></i>${T(t.org.logo,{escape:n,alt:t.org.name,after:`<small>بالشراكة مع ${n(t.org.name)}</small>`})}`:""}
    </header>
    <section class="main">
      <p class="kind-en">${g}</p>
      <h1 class="kind">${u}</h1>
      <div class="rule"><i></i><b></b><i></i></div>
      <p class="lead">تُمنح هذه الشهادة إلى</p>
      <h2 class="name"${S(t.name_ar)<E.name?` style="font-size: ${S(t.name_ar)}pt"`:""}>${n(t.name_ar)}</h2>
      <p class="name-en">${n(t.name_en)}</p>
      <p class="body">تقديرًا لإتمام متطلبات المشاركة في <b>${n(t.program_ar)}</b>${t.track_ar?` ضمن <b>${n(t.track_ar)}</b>`:""}${t.hours?` بواقع <b>${n(t.hours)} ساعة</b> تدريبية`:""}${p?`<br>خلال الفترة ${n(p)}`:""}.</p>
      ${h.length?`<p class="facts">${h.join(" · ")}</p>`:""}
      <p class="body-en">In recognition of completing the ${n(t.program_en)}${t.track_en?` · ${n(t.track_en)}`:""}${t.hours?` · ${n(t.hours)} training hours`:""}${c?` · ${n(c)}`:""}</p>
    </section>
    <footer class="foot">
      ${O(m[0])}
      ${R(!a)}
      ${l?`<div class="verify"><dl>
          <dt>رقم الشهادة</dt><dd>${y}، بلا رقم</dd>
          <dt>التحقق</dt><dd>لا رابط تحقق لهذا النموذج</dd>
        </dl></div>`:`<div class="verify">
        <dl>
          <dt>رقم الشهادة</dt><dd class="ltr">${n(t.serial)}</dd>
          <dt>تاريخ الإصدار</dt><dd>${n(w(t.issued_at))}</dd>
          <dt>التحقق</dt><dd class="ltr">${n(t.verify_url.replace(/^https?:\/\//,""))}</dd>
        </dl>
        <div class="qr">${o}</div>
      </div>`}
    </footer>
  </div>
  <div class="micro">${n($)}</div>
  <div class="rights">جميع الحقوق محفوظة <bdi dir="ltr">© ${new Date(t.issued_at).getFullYear()} Milestone Impact</bdi> · ${l?`${y}، لا يثبت إتمام البرنامج`:"تحقّق من صحة الشهادة بمسح الرمز"}</div>
  ${a?`<div class="status"><span>${n(a)}</span></div>`:""}
</article>
</body></html>`)}function P(e){const o=new Date(e.issued_at);return`https://www.linkedin.com/profile/add?${new URLSearchParams({startTask:"CERTIFICATION_NAME",name:e.program_en||"Leaders Program",organizationName:"Milestone Impact",issueYear:String(o.getFullYear()),issueMonth:String(o.getMonth()+1),certUrl:e.verify_url,certId:e.serial})}`}async function j(e){const{default:o}=await v(async()=>{const{default:r}=await import("./browser-DxlvdD3y.js").then(s=>s.b);return{default:r}},__vite__mapDeps([0,1]));return o.toString(e,{type:"svg",margin:0,errorCorrectionLevel:"Q",color:{dark:i.graphite,light:"#FFFFFF"}})}const F=async e=>{try{await e.document.fonts?.ready}catch{}},I=e=>`${e.kind==="completion_success"?"شهادة إتمام":"شهادة مشاركة"} ${e.name_ar||""} ${e.sample?y:e.serial||""}`.trim();async function D(e,o,r,s={}){const{pdfServer:l}=await v(async()=>{const{pdfServer:a}=await import("./index-B8JiQcwG.js").then(d=>d.ep);return{pdfServer:a}},__vite__mapDeps([2,1,3])),t=await l(s.pdf);if(t)try{const{embedAssets:a,fetchAsset:d,saveBlob:m}=await v(async()=>{const{embedAssets:f,fetchAsset:g,saveBlob:u}=await import("./pdf-CFl8rtx3.js");return{embedAssets:f,fetchAsset:g,saveBlob:u}},__vite__mapDeps([4,2,1,3,5,6])),p=await a(x(o,r,{...s,print:!0,base:`${location.origin}/`}),d),c=await fetch(`${t.url}/pdf`,{method:"POST",headers:{"content-type":"application/json"},cache:"no-store",body:JSON.stringify({ticket:t.ticket,html:p,name:I(o)})});if(!c.ok||!/pdf/.test(c.headers.get("content-type")||""))throw new Error(`pdf-render ${c.status}`);return m(await c.blob(),{title:I(o)}),"server"}catch(a){console.warn("server pdf unavailable, printing instead:",a?.message||a)}return await F(e),e.print(),"print"}async function G(e,o,r={}){if(!e)return!1;const s=o.sample?"":await j(o.verify_url);o.org?.logo&&await N(x(o,s,r));const l=x(o,s,r);e.document.open(),e.document.write(l),e.document.close();const t=(d,m)=>e.document.querySelector(`[data-act="${d}"]`)?.addEventListener("click",m);t("print",async()=>{await F(e),e.print()});const a=e.document.querySelector('[data-act="pdf"]');return a?.addEventListener("click",async()=>{if(a.disabled)return;a.disabled=!0;const d=a.textContent;a.textContent="يُولَّد الملف…";try{a.textContent=await D(e,o,s,r)==="server"?"حُفظ الملف":d}catch{a.textContent="تعذّر التحميل، استعمل «طباعة»"}setTimeout(()=>{a.textContent=d,a.disabled=!1},2500)}),t("close",()=>e.close()),t("linkedin",()=>e.open(P(o),"_blank","noopener")),!0}export{E as CERT_TYPE,W as ISSUER_AR,y as SAMPLE_STAMP_AR,x as certificateHtml,D as downloadCertificate,_ as guilloche,P as linkedinUrl,S as nameSize,j as qrSvgFor,G as writeCertificate};
