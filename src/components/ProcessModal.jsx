import React, { useRef } from "react";
import { pressable, useDialog } from "../lib/a11y";
import Skeleton from "./Skeleton";
import Icon from "./Icon";
import { gregorianToHijri } from "../lib/dateUtils";

// ════════════════════════════════════════════════════════════════
// PROCESS MODAL — تفاصيل العملية وتحديد موعدها
// ════════════════════════════════════════════════════════════════

const ProcessModal = (p) => {
  const {
    detailsState,
    appContent,
    confirmed,
    dateError,
    dates,
    deleteDate,
    openDemoScreen,
    procs,
    saveDate,
    selectedCell,
    setDateError,
    setHighlightedKeys,
    setSelectedCell,
    setTempDate,
    submitted,
    tempDate,
    toggleConfirm,
  } = p;

  const box = useRef(null);
  // التركيز على النافذة نفسها فيُقرأ اسم العملية أولًا، ويعود إليها إن عُرضت عملية أخرى فيها،
  // وإن زالت الشريحة التي فتحتها يعود عند الإغلاق إلى خلية العملية نفسها في المصفوفة
  const procKey = selectedCell.key;
  useDialog(box, () => { setSelectedCell(null); setHighlightedKeys([]); },
    { self: true, key: procKey, fallback: () => document.querySelector(`.cell[data-proc="${procKey}"]`) });
  return (
      (
        <div className="overlay" onClick={()=>{setSelectedCell(null);setHighlightedKeys([]);}}>
          <div ref={box} className="modal" role="dialog" aria-modal="true" aria-label={selectedCell.nameAr} tabIndex={-1} onClick={e=>e.stopPropagation()}>
            <div className="modal-pull"/>
            <button className="modal-x" aria-label="إغلاق تفاصيل العملية" onClick={()=>{setSelectedCell(null);setHighlightedKeys([]);}}>✕</button>
            <span className="modal-badge" style={{background:selectedCell.trackColor}}>{selectedCell.trackIcon} {selectedCell.trackNameAr} • {selectedCell.phaseNameAr}</span>
            <h2>{selectedCell.nameAr}</h2>
            {detailsState === 'loading' && !selectedCell.insight && (
              <div className="modal-section">
                <Skeleton lines={2} height={11} />
                <Skeleton lines={3} height={10} style={{ marginTop: "1rem" }} />
              </div>
            )}
            {detailsState === 'error' && !selectedCell.insight && (
              <p className="modal-desc" style={{ opacity: 0.75 }}>
                تعذّر تحميل التفاصيل الموسّعة. بقية بيانات العملية أدناه صحيحة.
              </p>
            )}
            {selectedCell.insight && <div className="modal-section"><div className="modal-insight-box"><Icon name="insight" size={16} style={{marginLeft:".35rem"}} /> {selectedCell.insight}</div></div>}
            {selectedCell.fullDesc && <p className="modal-desc">{selectedCell.fullDesc}</p>}
            {selectedCell.whyItMatters && <div className="modal-section">
              <div className="modal-section-title"><Icon name="value" size={16} style={{marginLeft:".35rem"}} /> لماذا يهم</div>
              <div className="modal-why">{selectedCell.whyItMatters}</div>
            </div>}
            {selectedCell.outputs?.length>0 && <div className="modal-section">
              <div className="modal-section-title"><Icon name="output" size={16} style={{marginLeft:".35rem"}} /> المخرجات المتوقعة</div>
              <div className="modal-outputs">{selectedCell.outputs.map((o,i)=><div key={i} className="modal-output-item"><div className="modal-output-dot" style={{background:selectedCell.trackColor}}/>{o}</div>)}</div>
            </div>}
            <div className="modal-grid">
              <div className="modal-item"><div className="modal-item-label">المدة</div><div className="modal-item-value">{selectedCell.duration||`${selectedCell.dur} أيام`}</div></div>
              <div className="modal-item"><div className="modal-item-label">الوزن</div><div className="modal-item-value">{selectedCell.trackWeight}%</div></div>
              <div className="modal-item"><div className="modal-item-label">الترتيب</div><div className="modal-item-value">#{selectedCell.index+1}</div></div>
              <div className="modal-item"><div className="modal-item-label">المنطقة</div><div className="modal-item-value">{selectedCell.groupAr}</div></div>
            </div>
            {(selectedCell.fedBy?.length>0||selectedCell.feeds?.length>0) && <div className="modal-section">
              <div className="modal-section-title"><Icon name="alignment" size={16} style={{marginLeft:".35rem"}} /> شبكة الترابط</div>
              {selectedCell.fedBy?.length>0 && <><div className="modal-related-label">← تُغذّى من:</div>
                <div className="modal-related">{selectedCell.fedBy.map(k=>{const p=procs.find(x=>x.key===k);return p?<span key={k} className="modal-related-chip" style={{borderColor:p.trackColor+'60',color:p.trackColor,background:p.trackColor+'08'}} {...pressable(()=>{setSelectedCell(p);setTempDate(dates[p.key]||"");setDateError("");setHighlightedKeys([...(p.feeds||[]),...(p.fedBy||[])]);})}>{p.trackIcon} {p.nameAr}</span>:null;})}</div></>}
              {selectedCell.feeds?.length>0 && <><div className="modal-related-label" style={{marginTop:".5rem"}}>→ تُغذّي:</div>
                <div className="modal-related">{selectedCell.feeds.map(k=>{const p=procs.find(x=>x.key===k);return p?<span key={k} className="modal-related-chip" style={{borderColor:p.trackColor+'60',color:p.trackColor,background:p.trackColor+'08'}} {...pressable(()=>{setSelectedCell(p);setTempDate(dates[p.key]||"");setDateError("");setHighlightedKeys([...(p.feeds||[]),...(p.fedBy||[])]);})}>{p.trackIcon} {p.nameAr}</span>:null;})}</div></>}
            </div>}
            <div className="modal-divider"/>
            {selectedCell && (selectedCell.nameAr==="تحليل ديموغرافي"||selectedCell.key==="creation-1") && (
              <div style={{margin:"0.8rem 0"}}>
                <div style={{fontSize:".68rem",color:"var(--wg)",fontWeight:600,letterSpacing:".5px",marginBottom:".5rem",textTransform:"uppercase"}}>أداة مرتبطة بهذه العملية</div>
                <button onClick={openDemoScreen} style={{width:"100%",display:"flex",alignItems:"center",gap:".75rem",padding:".85rem 1rem",border:"none",borderRadius:"2px",background:"#8B6914",color:"#fff",cursor:"pointer",transition:"all .25s",fontFamily:"var(--font-ar)"}}
                  onMouseEnter={e=>{e.currentTarget.style.opacity="0.9";}}
                  onMouseLeave={e=>{e.currentTarget.style.opacity="";}}>
                  <span style={{fontSize:"1.3rem",flexShrink:0}}>🗺️</span>
                  <span style={{flex:1,textAlign:"right"}}>
                    <span style={{display:"block",fontWeight:700,fontSize:".88rem",marginBottom:".1rem"}}>{appContent.demo_cta_title||'ابدأ تحليلك الديموغرافي'}</span>
                    <span style={{display:"block",fontSize:".72rem",opacity:.85}}>{appContent.demo_cta_desc||'رسّم شبكتك البشرية'}</span>
                  </span>
                  <span aria-hidden="true" style={{fontSize:"1rem",flexShrink:0,opacity:.8}}>←</span>
                </button>
              </div>
            )}
            <div className="date-section">
              <h4><Icon name="milestone" size={16} style={{marginLeft:".35rem"}} /> تحديد تاريخ البدء</h4>
              <div className="date-row">
                <button className="btn btn-s btn-gold" onClick={()=>saveDate(selectedCell.key,tempDate)} disabled={!tempDate}>حفظ</button>
                <input type="date" aria-label="تاريخ تنفيذ العملية" value={tempDate} min={new Date().toISOString().split("T")[0]}
                  onChange={e=>{setTempDate(e.target.value);setDateError("");}}
                  style={{flex:1,minWidth:"140px",padding:".55rem .75rem",border:"1.5px solid var(--sa)",borderRadius:"2px",fontFamily:"var(--font-ar)",direction:"ltr",fontSize:".9rem",background:"var(--sw)"}}/>
              </div>
              {dateError && <p style={{fontSize:".72rem",color:"var(--rd)",marginTop:".25rem"}}>{dateError}</p>}
              {dates[selectedCell.key] && <div className="hijri-badge">🌙 {gregorianToHijri(dates[selectedCell.key]).formatted}</div>}
              {dates[selectedCell.key] && !submitted && <div style={{marginTop:".5rem"}}>
                <button style={{background:"none",border:"none",color:"var(--rd)",fontFamily:"var(--font-ar)",fontSize:".75rem",cursor:"pointer"}}
                  onClick={()=>deleteDate(selectedCell.key)}>
                  ✕ حذف التاريخ
                </button>
              </div>}
            </div>
            <div className="modal-actions">
              <button className={`btn ${confirmed[selectedCell.key]?"btn-danger":""}`} onClick={()=>toggleConfirm(selectedCell.key)} disabled={!dates[selectedCell.key]}>
                {confirmed[selectedCell.key]?"إلغاء التأكيد ✕":"تأكيد الموعد ✓"}
              </button>
              <button className="btn btn-outline" onClick={()=>{setSelectedCell(null);setHighlightedKeys([]);}}>إغلاق</button>
            </div>
            {!dates[selectedCell.key] && <p style={{fontSize:".72rem",color:"#A0522D",marginTop:".4rem",textAlign:"center"}}>حدد التاريخ أولاً</p>}
          </div>
        </div>
      )
  );
};

export default ProcessModal;
