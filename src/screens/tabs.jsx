import React from "react";
import { pressable } from "../lib/a11y";
import MILogo from "../MILogo";
import CoverageMatrix from "../components/CoverageMatrix";
import Icon from "../components/Icon";
import { BRAND, TRACKS, PHASES, OPERATIONS } from "../config/constants";
import { fmtShort, fmtBoth, fmtGregorian, gregorianToHijri } from "../lib/dateUtils";
import { analyzeBookings } from "../lib/analysis";
import { printAnalysis } from "../lib/print";

// ════════════════════════════════════════════════════════════════
// TABS — شاشات المستخدم: المصفوفة، الجدول، التحليل، الملخص، النموذج
// ════════════════════════════════════════════════════════════════
// كل تبويب يأخذ حزمة خصائص (p) ويفكّكها في الأعلى، فيبقى جسم الشاشة
// منقولاً حرفياً دون تعديل — على نمط شاشات SSPDF.

export const MatrixTab = (p) => {
  const {
    allDated,
    appContent,
    confirmed,
    confirmedCount,
    datedCount,
    dates,
    handleSubmit,
    highlightedKeys,
    missingProcs,
    procs,
    progressPct,
    reopenRequested,
    requestReopen,
    selectedCell,
    setDateError,
    setHighlightedKeys,
    setSelectedCell,
    setTab,
    setTempDate,
    showToast,
    submitted,
  } = p;

  return (
      <div className="sec sec-pb" style={{animation:"fadeIn 0.4s"}}>

        {/* Context Bar — replaces Banner */}
        <div className="ctx-bar" style={{overflow:"hidden"}}>
          <div className="ctx-stat">
            <span className="ctx-stat-num">{datedCount}</span>
            <span className="ctx-stat-label">/ 16 موعد</span>
          </div>
          <div className="ctx-div"/>
          <div className="ctx-stat">
            <span className="ctx-stat-num">{confirmedCount}</span>
            <span className="ctx-stat-label">مؤكدة</span>
          </div>
          <div className="ctx-div"/>
          <div className="ctx-bar-prog">
            <div className="ctx-bar-track"><div className="ctx-bar-fill" style={{width:`${progressPct}%`}}/></div>
            <span style={{fontSize:".72rem",fontWeight:700,color:"var(--mi-d)",flexShrink:0}}>{progressPct}%</span>
          </div>
          {submitted && <span style={{fontSize:".75rem",color:"var(--ok)",fontWeight:700,marginRight:"auto"}}>🔒 مكتملة</span>}
        </div>

        {/* المصفوفة — Mobile First / Desktop Table */}
        {/* Column headers — desktop only */}
        <div className="mx-col-headers">
          <div className="mx-col-header-empty">
            <div>
              <div className="mx-col-header-label">المحاور</div>
              <div className="mx-col-header-mi">مصفوفة التأثير</div>
            </div>
          </div>
          {PHASES.map(ph => (
            <div key={ph.id} className={`mx-phase-header ${ph.group}`}>
              <div className="mx-phase-num">المرحلة {ph.id}</div>
              <div className="mx-phase-name">{ph.nameAr}</div>
              <div className="mx-phase-group">{ph.groupAr}</div>
            </div>
          ))}
        </div>

        <div className="mx-wrap">
          {TRACKS.map(tr => (
            <div key={tr.id} className="mx-track-section">
              <div className="mx-track-header" style={{background:`${tr.color}`,color:"#fff"}}>
                <span className="mx-track-icon">{tr.icon}</span>
                <span className="mx-track-name">{tr.nameAr}</span>
                <span className="mx-track-desc">{tr.contentAr}</span>
                <span className="mx-track-weight" style={{background:"rgba(0,0,0,0.25)"}}>{tr.weight}%</span>
              </div>
              <div className="mx-cells-grid">
                {PHASES.map(ph => {
                  const op = OPERATIONS[tr.id][ph.id-1], key=`${tr.id}-${ph.id}`, proc=procs.find(p=>p.key===key);
                  const hasD=!!dates[key], isDone=!!confirmed[key], isHL=highlightedKeys.includes(key);
                  // الخلية زر بلوحة المفاتيح وقارئ الشاشة، واسمها العملية وحال موعدها
                  // التاريخ يُنسَّق حين يوجد وحده: «مؤكَّد» بلا تاريخ حال ممكنة (save يخزن confirmed وحده)، وfmtGregorian(undefined) يرمي
                  const status = !hasD ? (isDone ? "مؤكَّد، بلا موعد" : "بلا موعد") : `${isDone ? "مؤكَّد" : "محدد"}، ${fmtGregorian(dates[key])}`;
                  return (
                    <div key={key} data-proc={key}
                      className={`cell ${isDone?"done":""} ${hasD&&!isDone?"dated":""} ${isHL?"highlighted":""}`}
                      aria-label={`${op.nameAr}: ${status}`}
                      {...pressable(() => {
                        if (submitted){showToast("الخطة مقفلة بعد الموافقة النهائية، ولتعديلها اطلب إعادة الفتح من أسفل المصفوفة");return;}
                        setSelectedCell(proc); setTempDate(dates[key]||""); setDateError("");
                        setHighlightedKeys([...(proc.feeds||[]),...(proc.fedBy||[])]);
                      })}
                      onMouseLeave={()=>{ if(!selectedCell) setHighlightedKeys([]); }}>
                      <div className="cell-accent" style={{background:tr.color}}/>
                      <div className="cell-top">
                        <span className="cell-num">#{proc.index+1}</span>
                        {isDone && <span className="cell-check" role="img" aria-label="مؤكَّد">✓</span>}
                      </div>
                      <div className="cell-name">{op.nameAr}</div>
                      <div className="cell-bottom">
                        <span className="cell-dur">{proc.duration||`${op.dur}w`}</span>
                        {hasD && <span className="cell-date">{fmtShort(dates[key])}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Smart Suggestions — BELOW matrix */}
        {!submitted && datedCount === 0 && (
          <div className="smart-below">
            <div className="smart-below-label"><Icon name="insight" size={16} style={{marginLeft:".35rem"}} /> {appContent.welcome_hint||'يبدأ معظم العملاء بـ:'}</div>
            <p style={{fontSize:".78rem",color:"var(--wg)",marginBottom:".5rem"}}>{appContent.welcome_desc||'اختر أول عملية لبدء بناء خطتك الاستراتيجية'}</p>
            <div className="smart-suggest">
              {(appContent.starter_processes||'creation-1,establishment-1').split(',').map(k=>k.trim()).map(k=>{
                const p=procs.find(x=>x.key===k);
                return p ? <span key={k} className="smart-chip" style={{borderColor:p.trackColor+'50',color:p.trackColor,background:p.trackColor+'0A'}}
                  {...pressable(()=>{setSelectedCell(p);setTempDate("");setDateError("");setHighlightedKeys([...(p.feeds||[]),...(p.fedBy||[])]);})}>
                  {p.trackIcon} {p.nameAr}</span> : null;
              })}
            </div>
          </div>
        )}

        {!submitted && datedCount>=1 && datedCount<=2 && (()=>{
          const booked=Object.keys(dates);
          const suggestions=new Set();
          booked.forEach(k=>{const p=procs.find(x=>x.key===k);if(p)(p.feeds||[]).forEach(f=>{if(!dates[f])suggestions.add(f);});});
          const sugList=[...suggestions].slice(0,3).map(k=>procs.find(x=>x.key===k)).filter(Boolean);
          return sugList.length>0 ? (
            <div className="smart-below">
              <div className="smart-below-label"><Icon name="alignment" size={16} style={{marginLeft:".35rem"}} /> {appContent.suggest_label||'بناءً على اختياراتك، قد يهمك:'}</div>
              <div className="smart-suggest">
                {sugList.map(p=><span key={p.key} className="smart-chip" style={{borderColor:p.trackColor+'50',color:p.trackColor,background:p.trackColor+'0A'}}
                  {...pressable(()=>{setSelectedCell(p);setTempDate("");setDateError("");setHighlightedKeys([...(p.feeds||[]),...(p.fedBy||[])]);})}>
                  {p.trackIcon} {p.nameAr}</span>)}
              </div>
            </div>
          ) : null;
        })()}

        {!submitted && datedCount>=3 && datedCount<16 && (()=>{
          const booked=Object.keys(dates);
          const suggestions=new Set();
          booked.forEach(k=>{const p=procs.find(x=>x.key===k);if(p)(p.feeds||[]).forEach(f=>{if(!dates[f])suggestions.add(f);});});
          const sugList=[...suggestions].slice(0,4).map(k=>procs.find(x=>x.key===k)).filter(Boolean);
          return sugList.length>0 ? (
            <div className="smart-below">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:".4rem"}}>
                <div className="smart-below-label" style={{marginBottom:0}}><Icon name="alignment" size={16} style={{marginLeft:".35rem"}} /> {appContent.suggest_deps_label||'اقتراحات بناءً على التبعيات'}</div>
                <span className="smart-counter">{datedCount}/16</span>
              </div>
              <div className="smart-suggest">
                {sugList.map(p=><span key={p.key} className="smart-chip" style={{borderColor:p.trackColor+'50',color:p.trackColor,background:p.trackColor+'0A'}}
                  {...pressable(()=>{setSelectedCell(p);setTempDate("");setDateError("");setHighlightedKeys([...(p.feeds||[]),...(p.fedBy||[])]);})}>
                  {p.trackIcon} {p.nameAr}</span>)}
              </div>
            </div>
          ) : null;
        })()}

        {/* Missing + Submit */}
        {!allDated && datedCount>0 && !submitted && (
          <div className="missing">
            <h4>⚠ متبقي {16-datedCount} عملية بدون موعد</h4>
            <div className="missing-chips">
              {missingProcs.map(p=><span key={p.key} className="missing-chip"
                {...pressable(()=>{setSelectedCell(p);setTempDate("");setDateError("");})}>
                {p.trackIcon} {p.nameAr}</span>)}
            </div>
          </div>
        )}

        {!submitted && (
          <div className={`submit ${allDated?"submit-ready":"submit-wait"}`}>
            {allDated ? <>
              <h3 style={{color:BRAND.dark}}>✓ جاهز للموافقة النهائية</h3>
              <p>{confirmedCount}/16 مؤكدة</p>
              <button className="btn btn-s btn-gold" onClick={handleSubmit}>✓ موافقة نهائية</button>
            </> : <>
              <h3 style={{color:"var(--text-muted)"}}>يجب تحديد جميع المواعيد الـ 16</h3>
              <p style={{color:"var(--wg)"}}>{datedCount}/16 محدد</p>
              {datedCount>0 && <span className="submit-missing-link" {...pressable(()=>{ const m=missingProcs[0]; if(m){setSelectedCell(m);setTempDate("");setDateError("");}})}>
                ابدأ بـ: {missingProcs[0]?.nameAr} ←
              </span>}
            </>}
          </div>
        )}

        {submitted && (
          <div className="submit submit-done">
            <h3 style={{color:"#5B7B3A"}}>🔒 تم قفل الخطة بعد الموافقة النهائية</h3>
            <p style={{marginBottom:".5rem"}}>يمكنك مراجعة النموذج النهائي أو طلب إعادة الفتح</p>
            <div style={{display:"flex",gap:".5rem",justifyContent:"center",flexWrap:"wrap"}}>
              <button className="btn btn-s btn-gold" onClick={()=>setTab("output")}><Icon name="output" size={16} style={{marginLeft:".35rem"}} /> النموذج النهائي</button>
              {!reopenRequested
                ? <button className="btn btn-s btn-outline" onClick={requestReopen}>🔓 طلب إعادة فتح</button>
                : <span style={{color:BRAND.color,fontWeight:600,fontSize:".82rem"}}>⏳ بانتظار موافقة المدير</span>}
            </div>
          </div>
        )}
      </div>
  );
};

export const ScheduleTab = (p) => {
  const {
    confirmed,
    datedCount,
    dates,
    procs,
    setDateError,
    setSelectedCell,
    setTab,
    setTempDate,
    submitted,
  } = p;

  return (
      <div className="sec" style={{animation:"fadeIn 0.4s"}}>
        <div className="sec-head">
          <h2 className="sec-title">الجدول الزمني</h2>
          <span style={{fontSize:".78rem",color:"var(--wg)"}}>{datedCount} موعد</span>
        </div>
        {datedCount===0
          ? <div className="empty"><h3>لا توجد مواعيد بعد</h3><p>حدد المواعيد من <span style={{color:"var(--mi-d)",cursor:"pointer",fontWeight:600}} {...pressable(()=>setTab("matrix"))}>المصفوفة</span></p></div>
          : <div className="tl">
            {procs.filter(p=>dates[p.key]).sort((a,b)=>new Date(dates[a.key])-new Date(dates[b.key])).map((item,i)=>{
              const d=dates[item.key], h=fmtBoth(d), isDone=!!confirmed[item.key];
              return (
                <div key={item.key} className="tl-item" style={{animationDelay:`${i*.04}s`}}>
                  <div className="tl-dot" style={{borderColor:item.trackColor,background:isDone?item.trackColor:"var(--sw)"}}/>
                  <div className="tl-card" style={{borderRightColor:item.trackColor}}>
                    <div style={{display:"flex",alignItems:"center",gap:".4rem",marginBottom:".3rem"}}>
                      <span className="tl-step" style={{background:item.trackColor}}>خطوة {i+1}</span>
                      {isDone && <span className="badge badge-ok">مؤكد ✓</span>}
                      {!submitted && <button className="tl-edit-btn" onClick={()=>{setSelectedCell(item);setTempDate(d);setDateError("");setTab("matrix");setTimeout(()=>setTab("schedule"),50);}}>تعديل</button>}
                    </div>
                    <div className="tl-name">{item.nameAr}</div>
                    <div className="tl-track">{item.trackIcon} {item.trackNameAr} • {item.phaseNameAr}</div>
                    <div className="tl-dates"><span><Icon name="milestone" size={16} style={{marginLeft:".35rem"}} /> {h.gregorian}</span><span>{item.duration||`${item.dur} أيام`}</span></div>
                    <div className="tl-hijri">🌙 {h.hijri}</div>
                  </div>
                </div>
              );
            })}
          </div>}
      </div>
  );
};

export const ReportTab = (p) => {
  const {
    confirmed,
    dates,
    procs,
    user,
  } = p;

  return (
      <div className="sec" style={{animation:"fadeIn 0.4s"}}>
        <div className="sec-head"><h2 className="sec-title">التقرير التحليلي</h2>
          {analyzeBookings(procs,dates,confirmed) && <button className="btn btn-s btn-print" onClick={()=>printAnalysis(user,procs,dates,confirmed)}>طباعة أو حفظ PDF</button>}</div>
        {(()=>{
          const analysis=analyzeBookings(procs,dates,confirmed);
          if(!analysis) return <div className="rpt-card rpt-empty"><h3>تحتاج حجوزات إضافية</h3><p>أكمل <strong>3 حجوزات</strong> على الأقل</p></div>;
          const {pattern,trackCoverage,phaseCoverage,weightBalance,furthestPhase,readinessAr,depGaps,recommendations,timeline,trackDist,totalBooked,isComplete}=analysis;
          return <>
            <div className="rpt-card" style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:".5rem"}}>
              <div><div style={{display:"flex",alignItems:"center",gap:".5rem"}}><MILogo size={18} color={BRAND.color}/><strong style={{fontFamily:"var(--font-ar)",color:BRAND.dark}}>Milestone Impact</strong></div><div style={{fontSize:".75rem",color:"#999",marginTop:".15rem"}}>تقرير مولّد تلقائياً</div></div>
              <div style={{textAlign:"left"}}><div style={{fontSize:".82rem",fontWeight:600}}>{user.name}</div><div style={{fontSize:".7rem",color:"#999"}}>{new Date().toLocaleDateString('ar-SA')} • {totalBooked} حجوزات</div></div>
            </div>
            <div className="rpt-card"><div className="rpt-pattern">
              <div className="rpt-pattern-icon">{pattern.icon}</div>
              <div className="rpt-pattern-name">شكل الخطة: {pattern.nameAr}</div>
              <div className="rpt-pattern-desc">{pattern.desc}</div>
            </div>
            {isComplete && <div style={{textAlign:"center",padding:".6rem",background:"rgba(91,123,58,0.06)",borderRadius:"2px",marginTop:"-.5rem"}}>
              <strong style={{color:"#5B7B3A",fontSize:".88rem"}}><Icon name="outcome" size={16} style={{marginLeft:".35rem"}} /> رحلة تحول كاملة</strong>
            </div>}</div>
            <div className="rpt-card"><h3 className="rpt-section-title">الإحصائيات</h3>
              <div className="rpt-stats">
                <div className="rpt-stat"><div className="rpt-stat-v" style={{color:BRAND.color}}>{totalBooked}</div><div className="rpt-stat-l">محجوزة</div></div>
                <div className="rpt-stat"><div className="rpt-stat-v" style={{color:"#5B7B3A"}}>{trackCoverage.covered}/4</div><div className="rpt-stat-l">مسارات</div></div>
                <div className="rpt-stat"><div className="rpt-stat-v" style={{color:"#8B6914"}}>{furthestPhase}</div><div className="rpt-stat-l">أبعد مرحلة</div></div>
                <div className="rpt-stat"><div className="rpt-stat-v" style={{color:"#6B4E3D"}}>{readinessAr}</div><div className="rpt-stat-l">الجاهزية</div></div>
              </div>
            </div>
            <div className="rpt-card"><h3 className="rpt-section-title">رحلة الحجز</h3>
              {timeline.map((t,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:".6rem",padding:".45rem 0",borderBottom:i<timeline.length-1?"1px solid var(--sa)":"none"}}>
                <div style={{width:"26px",height:"26px",borderRadius:"50%",background:t.trackColor,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".7rem",fontWeight:700,flexShrink:0}}>{t.step}</div>
                <div style={{flex:1}}><div style={{fontWeight:600,fontSize:".84rem"}}>{t.nameAr}</div><div style={{fontSize:".7rem",color:"#999"}}>{t.trackIcon} {t.trackNameAr}</div></div>
                <div style={{textAlign:"left",flexShrink:0}}><div style={{fontSize:".73rem",color:BRAND.dark}}>{fmtShort(t.date)}</div>{t.isConfirmed&&<div style={{fontSize:".62rem",color:"#5B7B3A"}}>✓ مؤكد</div>}</div>
              </div>)}
            </div>
            <div className="rpt-card"><h3 className="rpt-section-title">خريطة التغطية</h3>
              <CoverageMatrix procs={procs} dates={dates} confirmed={confirmed} />
            </div>
            <div className="rpt-card"><h3 className="rpt-section-title">توزيع الاهتمام</h3>
              {trackDist.map(t=><div key={t.id} className="rpt-bar-row">
                <div className="rpt-bar-label" style={{color:t.color}}>{t.icon} {t.nameAr}</div>
                <div className="rpt-bar-track"><div className="rpt-bar-fill" style={{width:`${t.pct}%`,background:t.color}}>{t.pct>15&&<span className="rpt-bar-pct">{t.pct}%</span>}</div></div>
                <div className="rpt-bar-count">{t.count}/4</div>
              </div>)}
            </div>
            {depGaps.length>0 && <div className="rpt-card"><h3 className="rpt-section-title">⚠ فجوات التبعية</h3>
              {depGaps.map((g,i)=><div key={i} className="rpt-gap">حجزت <strong>{g.process}</strong> لكن لم تحجز <strong>{g.missing}</strong> التي تغذيها</div>)}
            </div>}
            {recommendations.length>0 && <div className="rpt-card"><h3 className="rpt-section-title">التوصيات</h3>
              {recommendations.map((r,i)=><div key={i} className="rpt-rec"><span className="rpt-rec-icon">💡</span><span>{r}</span></div>)}
            </div>}
            <div className="rpt-card" style={{textAlign:"center",padding:"1rem"}}><MILogo size={16} color={BRAND.color}/><div style={{fontSize:".7rem",color:"#999",marginTop:".25rem"}}>Milestone Impact — تقرير مولّد تلقائياً</div></div>
          </>;
        })()}
      </div>
  );
};

export const SummaryTab = (p) => {
  const {
    confirmed,
    confirmedCount,
    datedCount,
    dates,
    procs,
    setTab,
    submitted,
    tab,
    user,
  } = p;

  return (
      <div className="sec" style={{animation:"fadeIn 0.4s"}}>
        <div className="sec-head"><h2 className="sec-title">المخرجات</h2></div>
        {submitted && <div className="output-tab-hint" {...pressable(()=>setTab("output"))}><Icon name="output" size={16} style={{marginLeft:".35rem"}} /> اكتملت الخطة. يمكنكم عرض النموذج النهائي وطباعته من هنا</div>}
        <div className="sum-card"><h3 className="sum-title">ملخص الخطة</h3>
          <div className="modal-grid" style={{marginBottom:"1rem"}}>
            <div className="modal-item"><div className="modal-item-label">المشارك</div><div className="modal-item-value">{user.name}</div></div>
            <div className="modal-item"><div className="modal-item-label">مواعيد</div><div className="modal-item-value">{datedCount}/16</div></div>
            <div className="modal-item"><div className="modal-item-label">مؤكدة</div><div className="modal-item-value">{confirmedCount}/16</div></div>
            <div className="modal-item"><div className="modal-item-label">الحالة</div><div className="modal-item-value">{submitted?"✓ مكتمل":"قيد التخطيط"}</div></div>
          </div>
          {TRACKS.map(tr=>{
            const trackProcs=procs.filter(p=>p.trackId===tr.id);
            return <div key={tr.id} className="sum-track" style={{borderRightColor:tr.color}}>
              <div className="sum-track-head" style={{color:tr.color}}>{tr.icon} {tr.nameAr}</div>
              {trackProcs.map(p=>{const d=dates[p.key],c=confirmed[p.key];return(
                <div key={p.key} className="sum-track-item">
                  <span>{p.nameAr}</span>
                  <span>{d?<span style={{color:c?"var(--ok)":"var(--mi-d)",fontWeight:600}}>{c?"✓ ":""}{fmtShort(d)}</span>:"—"}</span>
                </div>);
              })}
            </div>;
          })}
        </div>
      </div>
  );
};

export const OutputTab = (p) => {
  const {
    confirmed,
    dates,
    handlePrint,
    procs,
    user,
  } = p;

  return (
      <div className="sec" style={{animation:"fadeIn 0.4s"}}>
        <div className="output-card">
          <div className="output-header"><h3><Icon name="output" size={16} style={{marginLeft:".35rem"}} /> نموذج مصفوفة التأثير النهائي</h3><button className="btn btn-s btn-print" onClick={handlePrint}>🖨 طباعة</button></div>
          <div className="output-info">
            <div className="output-info-item"><div className="output-info-label">المشارك</div><div className="output-info-value">{user.name}</div></div>
            <div className="output-info-item"><div className="output-info-label">الجوال</div><div className="output-info-value" style={{direction:"ltr"}}>{user.phone}</div></div>
            <div className="output-info-item"><div className="output-info-label">البريد</div><div className="output-info-value" style={{direction:"ltr",fontSize:".78rem"}}>{user.email}</div></div>
          </div>
          <table className="output-table">
            <thead><tr><th>#</th><th>العملية</th><th>المسار</th><th>المرحلة</th><th>الميلادي</th><th>الهجري</th><th>الحالة</th></tr></thead>
            <tbody>{procs.map((p,i)=>{const d=dates[p.key],c=confirmed[p.key];return(
              <tr key={p.key}>
                <td>{i+1}</td><td style={{fontWeight:600}}>{p.nameAr}</td>
                <td style={{color:p.trackColor}}>{p.trackIcon} {p.trackNameAr}</td>
                <td>{p.phaseNameAr}</td>
                <td>{d?fmtGregorian(d):"—"}</td>
                <td style={{color:"#8B6914"}}>{d?gregorianToHijri(d).formatted:"—"}</td>
                <td>{c?<span className="badge badge-ok" role="img" aria-label="مؤكَّد">✓</span>:d?<span className="badge badge-wait">محدد</span>:"—"}</td>
              </tr>);
            })}</tbody>
          </table>
          {dates && Object.keys(dates).length > 0 && <div className="output-stamp"><p>تاريخ الإنشاء: <strong style={{color:BRAND.color}}>{new Date().toLocaleDateString('ar-SA')}</strong></p></div>}
          <div className="copyright">© {new Date().getFullYear()} Milestone Impact. جميع الحقوق محفوظة.</div>
        </div>
      </div>
  );
};
