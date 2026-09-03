import React from "react";
import Icon from "../components/Icon";
import MILogo from "../MILogo";
import Footer from "../components/Footer";
import { BRAND, TRACKS } from "../config/constants";
import { fmtShort, fmtBoth, fmtGregorian, gregorianToHijri } from "../lib/dateUtils";
import { analyzeBookings } from "../lib/analysis";
import { CSS } from "../styles/appCss";

// ════════════════════════════════════════════════════════════════
// ADMIN PANEL — لوحة المستشار: السجلات والمحتوى والتقارير
// ════════════════════════════════════════════════════════════════
// تأخذ حزمة خصائص واحدة (p) على نمط شاشات SSPDF، وتُفكَّك في الأعلى
// حتى يبقى جسم الشاشة كما هو دون أي تعديل.

const AdminPanel = (p) => {
  const {
    DEMO_KEY,
    adminReportReg,
    adminTab,
    adminUnlock,
    allRegs,
    appContent,
    confirmed,
    dates,
    expandedContent,
    loadRegs,
    loading,
    logout,
    procs,
    reopenRequested,
    selectedReg,
    selectedRegTab,
    setAdminReportReg,
    setAdminTab,
    setExpandedContent,
    setSelectedReg,
    setSelectedRegTab,
    showToast,
    submitted,
    tab,
  } = p;

  return (
    <><style>{CSS}</style><div className="app">

      {/* ── Nav ── */}
      <nav className="nav nav-admin">
        <div className="nav-brand">
          <div className="nav-logo"><MILogo size={15} color="#14495E"/></div>
          <div>
            <div style={{fontSize:"0.82rem",color:"#fff",fontWeight:700}}>لوحة الإدارة</div>
            <div style={{fontSize:"0.62rem",color:"rgba(255,255,255,0.4)"}}>Milestone Impact</div>
          </div>
        </div>
        <div className="nav-center">
          <div className="tabs">
            {[["regs","المسجلين"],["reports","التقارير"],["content","المحتوى"],["stats","إحصائيات"]].map(([k,v])=>(
              <button key={k} className={`tab ${adminTab===k?"on":""}`} onClick={()=>setAdminTab(k)}>{v}</button>
            ))}
          </div>
        </div>
        <div className="nav-right">
          <button className="btn-logout" onClick={logout}>خروج</button>
        </div>
      </nav>

      {/* ── Bottom Bar (mobile) ── */}
      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          {[["regs","👥","المسجلين"],["reports","📊","التقارير"],["content","✏","المحتوى"],["stats","📈","إحصائيات"]].map(([k,icon,label])=>(
            <button key={k} className={`bb-btn ${adminTab===k?"on":""}`} onClick={()=>setAdminTab(k)}>
              <span className="bb-icon">{icon}</span>
              <span className="bb-label">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sec" style={{animation:"fadeIn 0.4s"}}>

        {/* ── Stats ── */}
        <div className="stat-grid">
          <div className="stat" style={{borderTopColor:BRAND.color}}><div className="stat-v" style={{color:BRAND.color}}>{allRegs.length}</div><div className="stat-l">إجمالي المسجلين</div></div>
          <div className="stat" style={{borderTopColor:"#5B7B3A"}}><div className="stat-v" style={{color:"#5B7B3A"}}>{allRegs.filter(r=>r.submitted).length}</div><div className="stat-l">خطط مكتملة</div></div>
          <div className="stat" style={{borderTopColor:"var(--gold-deep)"}}><div className="stat-v" style={{color:"var(--gold-deep)"}}>{allRegs.filter(r=>!r.submitted).length}</div><div className="stat-l">قيد التخطيط</div></div>
          <div className="stat" style={{borderTopColor:"#C0392B"}}><div className="stat-v" style={{color:"#C0392B"}}>{allRegs.filter(r=>r.reopenRequested).length}</div><div className="stat-l">طلبات فتح</div></div>
        </div>

        {/* ══ TAB: المسجلون ══ */}
        {adminTab === "regs" && <>
          <div className="admin-layout">
            {/* Sidebar — قائمة المسجلين */}
            <div className="admin-sidebar">
              <div className="admin-sidebar-header">
                سجل المشاركين
                <button className="btn btn-s btn-outline" style={{float:"left",marginTop:"-2px"}} onClick={loadRegs} aria-label="تحديث قائمة المسجّلين">↻</button>
              </div>
              {loading ? <div style={{padding:"1.5rem",textAlign:"center",color:"var(--text-muted)",fontSize:"0.85rem"}}>جارٍ التحميل...</div>
              : allRegs.length === 0 ? <div style={{padding:"1.5rem",textAlign:"center",color:"var(--text-muted)",fontSize:"0.85rem"}}>لا يوجد مسجلين</div>
              : <div style={{padding:"0.5rem"}}>
                {allRegs.map((r,i) => {
                  const datesCount = r.dates ? Object.keys(r.dates).length : 0;
                  const pct = Math.round((datesCount/16)*100);
                  const initials = r.name ? r.name.split(" ").slice(0,2).map(w=>w[0]).join("") : "?";
                  // من TRACKS لا نسخة محلية — لون الأفاتار دورةٌ على المسارات.
                  const avatarColor = TRACKS[i % TRACKS.length].color;
                  const isSelected = selectedReg?.id === r.id;
                  return (
                    <div key={r.id}
                      style={{
                        display:"flex",alignItems:"center",gap:"0.6rem",
                        padding:"0.65rem 0.75rem",borderRadius:"2px",cursor:"pointer",
                        background:isSelected?"rgba(20, 73, 94,0.1)":"transparent",
                        border:isSelected?"1px solid var(--mi)":"1px solid transparent",
                        marginBottom:"0.25rem",transition:"all 0.15s"
                      }}
                      onClick={()=>{ setSelectedReg(r); setSelectedRegTab("schedule"); }}>
                      <div style={{width:"32px",height:"32px",borderRadius:"50%",background:avatarColor,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.75rem",fontWeight:700,flexShrink:0}}>{initials}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"0.82rem",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                        <div style={{fontSize:"0.65rem",color:"var(--text-muted)",display:"flex",gap:"0.3rem",alignItems:"center",marginTop:"0.1rem"}}>
                          <div style={{flex:1,height:"3px",background:"var(--border)",borderRadius:"2px",overflow:"hidden"}}>
                            <div style={{height:"100%",background:avatarColor,borderRadius:"2px",width:`${pct}%`}}/>
                          </div>
                          <span>{datesCount}/16</span>
                          {r.submitted && <span style={{color:"var(--ok)"}} role="img" aria-label="مُقدَّم">✓</span>}
                          {r.reopenRequested && <span style={{color:"var(--err)"}} role="img" aria-label="طلب إعادة فتح">🔓</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>}
            </div>

            {/* Main — تفاصيل المسجّل */}
            <div className="admin-main">
              {!selectedReg
                ? <div style={{background:"var(--bg-card)",borderRadius:"var(--r-lg)",border:"1px solid var(--border)",padding:"3rem",textAlign:"center"}}>
                    <div style={{fontSize:"2.5rem",marginBottom:"0.75rem",opacity:0.4}}>👤</div>
                    <div style={{fontSize:"1rem",color:"var(--text-muted)",fontFamily:"var(--font-ar)"}}>اختر مشاركاً من القائمة</div>
                  </div>
                : <div style={{background:"var(--bg-card)",borderRadius:"var(--r-lg)",border:"1px solid var(--border)",overflow:"hidden"}}>
                    {/* Header */}
                    <div style={{background:"#12161e",color:"#fff",padding:"1rem 1.3rem",display:"flex",alignItems:"center",gap:"0.75rem"}}>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:"var(--font-ar)",fontSize:"1.1rem",fontWeight:700}}>{selectedReg.name}</div>
                        <div style={{fontSize:"0.7rem",opacity:0.55,direction:"ltr"}}>{selectedReg.phone} | {selectedReg.email}</div>
                      </div>
                      <div style={{display:"flex",background:"rgba(0,0,0,0.25)",borderRadius:"2px",padding:"2px",gap:"1px"}}>
                        {[["schedule","📅 المواعيد"],["demo","🗺️ التحليل"],["history","📈 التقدم"]].map(([k,v])=>(
                          <button key={k} className={`reg-modal-tab ${selectedRegTab===k?"on":""}`} onClick={()=>setSelectedRegTab(k)}>{v}</button>
                        ))}
                      </div>
                      <button className="reg-modal-close" aria-label="إغلاق بيانات المسجّل" onClick={()=>setSelectedReg(null)}>✕</button>
                    </div>
                    {/* Body */}
                    <div style={{padding:"1.3rem",maxHeight:"calc(100vh - 280px)",overflowY:"auto"}}>
                      {selectedRegTab === "schedule" && <>{(() => {
                        const r = selectedReg;
                        return <>
                          <div style={{overflowX:"auto"}}>
                            <table className="output-table" style={{minWidth:"540px"}}>
                              <thead><tr><th>#</th><th>العملية</th><th>المسار</th><th>الميلادي</th><th>الهجري</th><th>الحالة</th></tr></thead>
                              <tbody>{procs.map((p,j)=>{
                                const d=r.dates?.[p.key], c=r.confirmed?.[p.key];
                                return <tr key={p.key}><td>{j+1}</td><td style={{fontWeight:600}}>{p.nameAr}</td><td style={{color:p.trackColor,whiteSpace:"nowrap"}}>{p.trackIcon} {p.trackNameAr}</td><td>{d?fmtGregorian(d):"—"}</td><td style={{color:"var(--text-secondary)"}}>{d?gregorianToHijri(d).formatted:"—"}</td><td>{c?<span className="badge badge-ok" role="img" aria-label="مؤكَّد">✓</span>:d?<span className="badge badge-wait">محدد</span>:"—"}</td></tr>;
                              })}</tbody>
                            </table>
                          </div>
                          {r.submittedAt && <div className="output-stamp" style={{marginTop:"0.8rem"}}><p>تم التقديم: <strong style={{color:BRAND.color}}>{fmtBoth(r.submittedAt).both}</strong></p></div>}
                          {r.submitted && <div style={{marginTop:"0.8rem",textAlign:"center"}}><button className="btn btn-s btn-danger" style={{width:"auto"}} onClick={()=>{ adminUnlock(r.id); setSelectedReg(null); }}>🔓 فتح التعديل</button></div>}
                        </>;
                      })()}</>}
                      {selectedRegTab === "demo" && <>{(!selectedReg[DEMO_KEY]||selectedReg[DEMO_KEY].filter(x=>x.name?.trim()).length===0)
                        ? <div className="empty"><h3>🗺️</h3><p>{appContent.demo_empty_state||'لم يُكمل العميل التحليل الديموغرافي بعد'}</p></div>
                        : <><div className="demo-section-head">{selectedReg[DEMO_KEY].filter(x=>x.name?.trim()).length} شخص في الشبكة</div>
                          <div className="demo-person-grid">
                            {selectedReg[DEMO_KEY].filter(x=>x.name?.trim()).map((person,pi)=>{
                              const scoreColor=(v)=>v>=70?"#27ae60":v>=40?"#2E6B8A":"#aaa";
                              const targets=["knowledge","social","financial","economic"].filter(k=>person.target?.[k]);
                              const targetLabels={knowledge:"معرفي",social:"مجتمعي",financial:"مالي",economic:"اقتصادي"};
                              return <div key={pi} className="demo-person-card">
                                <div className="demo-person-header"><div className="demo-person-num">{pi+1}</div><div><div className="demo-person-name">{person.name}</div><div className="demo-person-role">{[person.position,person.entity,person.relation].filter(Boolean).join(" • ")||"—"}</div></div>{person.location&&<div style={{marginRight:"auto",fontSize:"0.65rem",color:"var(--text-muted)"}}>📍{person.location}</div>}</div>
                                <div className="demo-section-head" style={{marginBottom:"0.4rem"}}>قوة الشخص</div>
                                {[["knowledge","معرفي"],["social","مجتمعي"],["financial","مالي"],["economic","اقتصادي"],["sovereign","سيادي"]].map(([k,label])=>{const val=person.strength?.[k]||0;return <div key={k} className="demo-bar-row"><div className="demo-bar-label">{label}</div><div className="demo-bar-track"><div className="demo-bar-fill" style={{width:`${val}%`,background:scoreColor(val)}}/></div><div className="demo-bar-val" style={{color:scoreColor(val)}}>{val}</div></div>;})}
                                {targets.length>0&&<div className="demo-person-chips">{targets.map(k=><span key={k} className="demo-person-chip" style={{background:"rgba(169,122,46,0.08)",color:"var(--petrol-deep)",border:"1px solid rgba(169,122,46,0.30)"}}>{targetLabels[k]}</span>)}</div>}
                              </div>;
                            })}
                          </div></>
                      }</>}
                      {selectedRegTab === "history" && (() => {
                        const r = selectedReg;
                        const regDates = r.dates || {};
                        const bookedProcs = procs.filter(p=>regDates[p.key]).sort((a,b)=>new Date(regDates[a.key])-new Date(regDates[b.key]));
                        const totalDays = bookedProcs.length>=2 ? Math.round((new Date(regDates[bookedProcs[bookedProcs.length-1].key])-new Date(regDates[bookedProcs[0].key]))/(1000*60*60*24)) : 0;
                        const confCount = Object.keys(r.confirmed||{}).length;
                        // من TRACKS لا نسخة محلية بأسماء وألوان مكرّرة.
                        const trackDist=TRACKS.map(t=>({id:t.id,name:t.nameAr,color:t.color,count:bookedProcs.filter(p=>p.trackId===t.id).length}));
                        return <div>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'0.5rem',marginBottom:'1rem'}}>
                            {[{v:bookedProcs.length,l:'مواعيد',c:'var(--mi-d)'},{v:confCount,l:'مؤكدة',c:'var(--ok)'},{v:totalDays+'d',l:'مدة التخطيط',c:'var(--gold-d)'}].map((s,i)=>(
                              <div key={i} style={{background:'var(--bg-deep)',borderRadius:'12px',padding:'0.75rem 0.5rem',textAlign:'center'}}>
                                <div style={{fontSize:'1.35rem',fontWeight:800,color:s.c}}>{s.v}</div>
                                <div style={{fontSize:'0.63rem',color:'var(--text-muted)'}}>{s.l}</div>
                              </div>
                            ))}
                          </div>
                          <div className="demo-section-head" style={{marginBottom:'0.55rem'}}>توزيع المسارات</div>
                          {trackDist.map(t=><div key={t.id} style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.38rem'}}>
                            <div style={{fontSize:'0.7rem',fontWeight:700,color:t.color,width:'50px',flexShrink:0}}>{t.name}</div>
                            <div style={{flex:1,height:'9px',background:'var(--border)',borderRadius:'5px',overflow:'hidden'}}><div style={{height:'100%',background:t.color,borderRadius:'5px',width:`${(t.count/4)*100}%`}}/></div>
                            <div style={{fontSize:'0.68rem',color:'var(--text-muted)',width:'26px',textAlign:'center'}}>{t.count}/4</div>
                          </div>)}
                          <div className="demo-section-head" style={{margin:'0.75rem 0 0.55rem'}}>مسار التخطيط ({bookedProcs.length} خطوة)</div>
                          {bookedProcs.length===0 ? <div className="empty"><p>لم يحدد أي مواعيد</p></div>
                          : <div style={{position:'relative',paddingRight:'1.2rem'}}>
                              <div style={{position:'absolute',right:'5px',top:0,bottom:0,width:'2px',background:'var(--mi-d)',borderRadius:'2px'}}/>
                              {bookedProcs.map((p,i)=>{const d=regDates[p.key],isConf=!!(r.confirmed||{})[p.key];return <div key={p.key} style={{position:'relative',paddingRight:'1rem',paddingBottom:'0.6rem'}}>
                                <div style={{position:'absolute',right:'-1.2rem',top:'0.2rem',width:'12px',height:'12px',borderRadius:'50%',border:`2px solid ${p.trackColor}`,background:isConf?p.trackColor:'var(--bg-card)'}}/>
                                <div style={{background:'var(--bg-card)',borderRadius:'10px',padding:'0.55rem 0.7rem',border:`1px solid var(--border)`,borderRight:`3px solid ${p.trackColor}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                                  <div><span style={{fontSize:'0.57rem',fontWeight:700,color:'#fff',background:p.trackColor,padding:'0.07rem 0.33rem',borderRadius:'4px',marginLeft:'0.28rem'}}>#{i+1}</span><span style={{fontSize:'0.8rem',fontWeight:700}}>{p.nameAr}</span></div>
                                  <div style={{textAlign:'left',flexShrink:0}}><div style={{fontSize:'0.68rem',color:'var(--mi-d)',fontWeight:700}}>{fmtShort(d)}</div>{isConf&&<div style={{fontSize:'0.58rem',color:'var(--ok)'}}>✓</div>}</div>
                                </div>
                              </div>;})}
                            </div>}
                          <div style={{textAlign:'center',fontSize:'0.7rem',color:'var(--text-muted)',marginTop:'0.75rem',padding:'0.55rem',background:'var(--bg-deep)',borderRadius:'8px'}}>
                            📅 التسجيل: <strong>{r.registeredAt?fmtBoth(r.registeredAt).hijri:'—'}</strong>{r.submittedAt&&<> • ✅ التقديم: <strong>{fmtBoth(r.submittedAt).hijri}</strong></>}
                          </div>
                        </div>;
                      })()}
                    </div>
                  </div>
              }
            </div>
          </div>
        </>}


        {/* ══ TAB: التقارير ══ */}
        {adminTab === "reports" && <>
          <div className="sec-head"><h2 className="sec-title">تقارير العملاء</h2></div>
          {allRegs.length === 0 && <div className="empty"><h3>لا يوجد مسجلين</h3></div>}
          {allRegs.map(reg => {
            const regAnalysis = analyzeBookings(procs, reg.dates || {}, reg.confirmed || {});
            const bookedCount = Object.keys(reg.dates || {}).length;
            const isOpen = adminReportReg === reg.id;
            return <div key={reg.id} className="adm-consultant">
              <div className="adm-edit-header" onClick={() => setAdminReportReg(isOpen ? null : reg.id)}>
                <h4>{reg.name} — {bookedCount} حجوزات {regAnalysis ? `• نمط ${regAnalysis.pattern.nameAr}` : "• أقل من 3"}</h4>
                <span>{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && <>
                {!regAnalysis ? <p style={{color:"#999",fontSize:"0.82rem"}}>أقل من 3 حجوزات</p> : <>
                  <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap",marginBottom:"0.6rem"}}>
                    <div className="rpt-stat" style={{flex:1}}><div className="rpt-stat-v" style={{color:BRAND.color,fontSize:"1.1rem"}}>{regAnalysis.pattern.icon} {regAnalysis.pattern.nameAr}</div><div className="rpt-stat-l">النمط</div></div>
                    <div className="rpt-stat" style={{flex:1}}><div className="rpt-stat-v" style={{color:"#5B7B3A"}}>{regAnalysis.trackCoverage.covered}/4</div><div className="rpt-stat-l">مسارات</div></div>
                    <div className="rpt-stat" style={{flex:1}}><div className="rpt-stat-v" style={{color:"#6B4E3D"}}>{regAnalysis.readinessAr}</div><div className="rpt-stat-l">الجاهزية</div></div>
                  </div>
                  <div className="adm-note">⏱ <strong>الزمن بين الحجوزات:</strong> {(()=>{ const dateVals = Object.values(reg.dates||{}).sort(); if(dateVals.length<2) return "حجز واحد فقط"; const diffDays = Math.round((new Date(dateVals[dateVals.length-1])-new Date(dateVals[0]))/(1000*60*60*24)); return diffDays===0?"حجز كل المواعيد دفعة واحدة":diffDays<=7?`${diffDays} يوم — قرار سريع`:`${diffDays} يوم — استكشاف متأنٍ`; })()}</div>
                  <div className="adm-note">💬 <strong>نقاط نقاش:</strong> {regAnalysis.patternId==="sequential"?"يميل للتعمق — ناقش التوسع":regAnalysis.patternId==="breadthFirst"?"يميل للاستكشاف — ناقش التعمق":regAnalysis.patternId==="foundationFocused"?"يركز على التأسيس — ناقش الانتقال":"نمط تكاملي — ناقش الأولويات"}</div>
                  {regAnalysis.depGaps.length>0 && <div className="adm-note" style={{background:"rgba(192,57,43,0.04)"}}>⚠ <strong>تبعيات مفقودة:</strong> {regAnalysis.depGaps.map(g=>`${g.process} ← ${g.missing}`).join(" | ")}</div>}
                  {regAnalysis.recommendations.length>0 && regAnalysis.recommendations.map((rec,i)=><div key={i} className="rpt-rec"><span className="rpt-rec-icon">💡</span><span>{rec}</span></div>)}
                </>}
              </>}
            </div>;
          })}
        </>}

        {/* ══ TAB: المحتوى ══ */}
        {adminTab === "content" && <>
          <div className="sec-head"><h2 className="sec-title">إدارة المحتوى</h2></div>
          <div className="adm-consultant"><h4>🔒 المحتوى يُدار من قاعدة البيانات مباشرة عبر Supabase</h4><p className="adm-note" style={{marginTop:"0.5rem"}}>جميع النصوص محفوظة في جداول <strong>app_content</strong> و<strong>process_details</strong>. لا يمكن تعديلها من هنا لحماية الملكية الفكرية.</p></div>
          {procs.map((proc) => {
            const isOpen = expandedContent === proc.key;
            return <div key={proc.key} className="adm-edit-card">
              <div className="adm-edit-header" onClick={() => setExpandedContent(isOpen ? null : proc.key)}>
                <h4 style={{color:proc.trackColor}}>{proc.trackIcon} {proc.nameAr}</h4>
                <span>{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && <>
                {["insight","why_it_matters","description"].map(field => (
                  <div key={field} className="adm-field">
                    <label htmlFor={`adm-${proc.key}-${field}`}>{{insight:"البصيرة المنهجية",why_it_matters:"لماذا يهم",description:"الوصف التفصيلي"}[field]}</label>
                    <textarea id={`adm-${proc.key}-${field}`} defaultValue={field==="insight"?proc.insight:field==="why_it_matters"?proc.whyItMatters:proc.fullDesc} rows={2}
                      onBlur={async(e)=>{ try{ const {supabase} = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm"); } catch(err){} showToast("التعديل يتم عبر Supabase مباشرة"); }} readOnly />
                  </div>
                ))}
              </>}
            </div>;
          })}
        </>}

        {/* ══ TAB: الإحصائيات ══ */}
        {adminTab === "stats" && <>
          <div className="sec-head"><h2 className="sec-title">إحصائيات</h2></div>
          <div className="adm-consultant">
            <h4><Icon name="report" size={16} style={{marginLeft:".35rem"}} /> توزيع المسارات</h4>
            {TRACKS.map(tr => {
              const count = allRegs.reduce((acc,r) => acc + Object.keys(r.dates||{}).filter(k=>k.startsWith(tr.id)).length, 0);
              const max = 16 * (allRegs.length || 1);
              return <div key={tr.id} className="rpt-bar-row" style={{marginTop:"0.5rem"}}>
                <div className="rpt-bar-label" style={{color:tr.color,fontWeight:700}}>{tr.nameAr}</div>
                <div className="rpt-bar-track"><div className="rpt-bar-fill" style={{width:`${(count/max)*100}%`,background:tr.color}}/></div>
                <div className="rpt-bar-count">{count}</div>
              </div>;
            })}
          </div>
        </>}

      </div>

      <Footer />
    </div></>
  );
};

export default AdminPanel;
