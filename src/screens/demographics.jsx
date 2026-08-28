import React from "react";
import Skeleton from "../components/Skeleton";
import Icon from "../components/Icon";

// ════════════════════════════════════════════════════════════════
// DEMOGRAPHICS — شاشة التحليل الديموغرافي
// ════════════════════════════════════════════════════════════════

const DemographicsScreen = (p) => {
  const {
    demoLoading,
    addDemoRow,
    appContent,
    demoRows,
    demoSaving,
    removeDemoRow,
    saveDemoData,
    screen,
    setDemoScreen,
    updateDemoRow,
  } = p;

  return (
      (
        <div className="demo-overlay" onClick={() => setDemoScreen(false)}>
        <div className="demo-screen" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="demo-header">
            <button className="demo-header-back" onClick={() => setDemoScreen(false)}>← رجوع</button>
            <div className="demo-header-info">
              <div className="demo-header-title">◈ {appContent.demo_screen_title || 'التحليل الديموغرافي'}</div>
              <div className="demo-header-sub">{appContent.demo_screen_sub || 'تفكيك البنية البشرية'}</div>
            </div>
            <div className="demo-header-badge">{demoRows.filter(r => r.name.trim()).length} شخص</div>
          </div>

          {/* Body */}
          <div className="demo-body">

            {/* Intro */}
            <div className="demo-intro">
              <div className="demo-intro-title"><Icon name="alignment" size={16} style={{marginLeft:".35rem"}} /> {appContent.demo_intro_title || 'ما هذا النموذج؟'}</div>
              <div className="demo-intro-text">{appContent.demo_intro_text || 'هذه خريطة شبكتك البشرية.'}</div>
            </div>

            {/* Person Cards */}
            {demoLoading && demoRows.length === 0 && (
              <div className="demo-card" style={{ padding: "1.25rem" }}>
                <Skeleton lines={1} height={14} width="42%" />
                <Skeleton lines={4} height={11} style={{ marginTop: "1.1rem" }} />
              </div>
            )}
            {demoRows.map((row, idx) => (
              <div key={row.id} className="demo-card">

                {/* Card Header */}
                <div className="demo-card-header">
                  <div className="demo-card-num">{idx + 1}</div>
                  <div className="demo-card-name">{row.name || `الشخص ${idx + 1}`}</div>
                  <button className="demo-card-remove" onClick={() => removeDemoRow(row.id)}>✕ حذف</button>
                </div>

                <div className="demo-card-body">

                  {/* ── الاسم (full width) ── */}
                  <div className="demo-field-group">
                    <div className="demo-field">
                      <label htmlFor={`demo-${row.id}-name`}>الاسم الكامل *</label>
                      <input id={`demo-${row.id}-name`} placeholder="اسم الشخص" value={row.name}
                        onChange={e => updateDemoRow(row.id, 'name', e.target.value)} />
                    </div>
                  </div>

                  {/* ── صفان ── */}
                  <div className="demo-field-row" style={{marginBottom:"0.55rem"}}>
                    <div className="demo-field">
                      <label htmlFor={`demo-${row.id}-entity`}>الجهة / المؤسسة</label>
                      <input id={`demo-${row.id}-entity`} placeholder="الشركة أو الجهة" value={row.entity}
                        onChange={e => updateDemoRow(row.id, 'entity', e.target.value)} />
                    </div>
                    <div className="demo-field">
                      <label htmlFor={`demo-${row.id}-position`}>المنصب</label>
                      <input id={`demo-${row.id}-position`} placeholder="الدور" value={row.position}
                        onChange={e => updateDemoRow(row.id, 'position', e.target.value)} />
                    </div>
                  </div>

                  <div className="demo-field-row" style={{marginBottom:"0.55rem"}}>
                    <div className="demo-field">
                      <label htmlFor={`demo-${row.id}-relation`}>طبيعة العلاقة</label>
                      <select id={`demo-${row.id}-relation`} value={row.relation} onChange={e => updateDemoRow(row.id, 'relation', e.target.value)}>
                        <option value="">اختر</option>
                        <option>أقارب</option><option>زملاء</option><option>أصدقاء</option>
                        <option>عملاء</option><option>شركاء</option><option>معارف</option><option>أخرى</option>
                      </select>
                    </div>
                    <div className="demo-field">
                      <label htmlFor={`demo-${row.id}-location`}>الموقع الجغرافي</label>
                      <input id={`demo-${row.id}-location`} placeholder="المدينة" value={row.location}
                        onChange={e => updateDemoRow(row.id, 'location', e.target.value)} />
                    </div>
                  </div>

                  <div className="demo-field-group">
                    <div className="demo-field">
                      <label htmlFor={`demo-${row.id}-sharedEvent`}>الحدث المشترك</label>
                      <input id={`demo-${row.id}-sharedEvent`} placeholder="مثال: زميل عمل، حضرنا نفس البرنامج..." value={row.sharedEvent}
                        onChange={e => updateDemoRow(row.id, 'sharedEvent', e.target.value)} />
                    </div>
                  </div>

                  {/* ── قوة الشخص — Steppers ── */}
                  <div className="demo-sec-title"><Icon name="value" size={16} style={{marginLeft:".35rem"}} /> قوة الشخص (0–100)</div>
                  <div className="demo-stepper-grid">
                    {[['knowledge','🧠 معرفي','#2E6B8A'],['social','🤝 مجتمعي','#5B7B3A'],['financial','💰 مالي','#8B6914'],['economic','📈 اقتصادي','#6B4E3D'],['sovereign','👑 سيادي','#6B2D8A']].map(([k,label,color]) => {
                      const val = row.strength?.[k] || 0;
                      return (
                        <div key={k} className="demo-stepper-row">
                          <div className="demo-stepper-label">{label}</div>
                          <div className="demo-stepper">
                            <button className="demo-stepper-btn"
                              onClick={() => updateDemoRow(row.id, ['strength',k], Math.max(0, val-10))}>−</button>
                            <div className="demo-stepper-track">
                              <div className="demo-stepper-fill" style={{width:`${val}%`,background:color}}/>
                            </div>
                            <button className="demo-stepper-btn"
                              onClick={() => updateDemoRow(row.id, ['strength',k], Math.min(100, val+10))}>+</button>
                            <div className="demo-stepper-val" style={{color: val>0 ? color : 'var(--wg)'}}>{val}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── نوع علاقتي به — Steppers ── */}
                  <div className="demo-sec-title">🤝 نوع علاقتي به (0–100)</div>
                  <div className="demo-stepper-grid">
                    {[['knowledge','🧠 معرفي','#2E6B8A'],['social','🤝 مجتمعي','#5B7B3A'],['financial','💰 مالي','#8B6914'],['economic','📈 اقتصادي','#6B4E3D']].map(([k,label,color]) => {
                      const val = row.myRelation?.[k] || 0;
                      return (
                        <div key={k} className="demo-stepper-row">
                          <div className="demo-stepper-label">{label}</div>
                          <div className="demo-stepper">
                            <button className="demo-stepper-btn"
                              onClick={() => updateDemoRow(row.id, ['myRelation',k], Math.max(0, val-10))}>−</button>
                            <div className="demo-stepper-track">
                              <div className="demo-stepper-fill" style={{width:`${val}%`,background:color}}/>
                            </div>
                            <button className="demo-stepper-btn"
                              onClick={() => updateDemoRow(row.id, ['myRelation',k], Math.min(100, val+10))}>+</button>
                            <div className="demo-stepper-val" style={{color: val>0 ? color : 'var(--wg)'}}>{val}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── المستهدف — Chips 2×2 ── */}
                  <div className="demo-sec-title"><Icon name="impact" size={16} style={{marginLeft:".35rem"}} /> ما أستهدف تفعيله معه</div>
                  <div className="demo-targets">
                    {[['knowledge','🧠 معرفي'],['social','🤝 مجتمعي'],['financial','💰 مالي'],['economic','📈 اقتصادي']].map(([k,label]) => (
                      <div key={k}
                        className={`demo-target-chip ${row.target?.[k] ? 'active' : ''}`}
                        onClick={() => updateDemoRow(row.id, ['target',k], !row.target?.[k])}>
                        {label}
                      </div>
                    ))}
                  </div>

                </div>
              </div>
            ))}

            {/* Add Person */}
            <button className="demo-add-btn" style={{width:"100%",textAlign:"center",marginBottom:"1rem"}} onClick={addDemoRow}>
              + {appContent.demo_add_btn || 'إضافة شخص'}
            </button>

          </div>

          {/* Footer */}
          <div className="demo-footer">
            <span style={{fontSize:"0.76rem",color:"var(--wg)"}}>
              {demoRows.filter(r => r.name.trim()).length} / {demoRows.length} مكتمل
            </span>
            <button className="btn btn-gold btn-s" onClick={saveDemoData} disabled={demoSaving} style={{minWidth:"120px"}}>
              {demoSaving ? "جارٍ الحفظ..." : `💾 ${appContent.demo_save_btn || 'حفظ التحليل'}`}
            </button>
          </div>

        </div>
        </div>
      )
  );
};

export default DemographicsScreen;
