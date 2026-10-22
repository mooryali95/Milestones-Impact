import React from "react";
import { TRACKS, PHASES } from "../config/constants";

// ════════════════════════════════════════════════════════════════
// COVERAGE MATRIX — خريطة التغطية
// ════════════════════════════════════════════════════════════════
// تعرض الستّ عشرة عملية دفعةً واحدة: أربعة مسارات × أربع مراحل.
// تجيب بنظرة واحدة عمّا لا يجيب عنه شريط النسب: أين تتركّز
// الحجوزات، وأي مسار أو مرحلة تُرك خالياً.
//
// مبنية بمعيّنات الهوية لا بمكتبة رسوم: البيانات ستّ عشرة خلية،
// والمعيّن هو رمز «نقطة القرار» في الهوية — فالشكل نفسه يحمل المعنى.
//
// جدول حقيقي لا شبكة div: رؤوس الصفوف والأعمدة تجعل قارئ الشاشة
// قادراً على التنقّل بين الخلايا ومعرفة موقع كل واحدة.

const STATE = {
  confirmed: { fill: 1,    label: "مؤكَّد" },
  dated:     { fill: 0.34, label: "محدَّد" },
  empty:     { fill: 0,    label: "غير محجوز" },
};

const Diamond = ({ color, state }) => {
  const { fill } = STATE[state];
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        transform: "rotate(45deg)",
        background: fill ? color : "transparent",
        opacity: fill || 1,
        border: `1px solid ${color}`,
        // الحالة الفارغة: حدّ شعري باهت بدل ملء
        borderColor: state === "empty" ? "var(--ink-faint)" : color,
      }}
    />
  );
};

const CoverageMatrix = ({ procs, dates, confirmed }) => {
  // ابنِ فهرساً سريعاً: مسار+مرحلة → العملية وحالتها
  const cell = (trackId, phaseId) => {
    const proc = procs.find(p => p.trackId === trackId && p.phaseId === phaseId);
    if (!proc) return null;
    const state = confirmed[proc.key] ? "confirmed" : dates[proc.key] ? "dated" : "empty";
    return { proc, state };
  };

  return (
    <div className="cov-wrap">
      <table className="cov-table">
        <caption className="cov-caption">
          خريطة التغطية: كل معيّن عملية؛ الممتلئ مؤكَّد، والباهت محدَّد، والفارغ غير محجوز
        </caption>
        <thead>
          <tr>
            <th scope="col" className="cov-corner"><span className="sr-only">المسار</span></th>
            {PHASES.map(ph => (
              <th key={ph.id} scope="col" className="cov-phase">
                <span className="cov-phase-num">{ph.id}</span>
                <span className="cov-phase-name">{ph.nameAr}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TRACKS.map(t => {
            const done = PHASES.filter(ph => {
              const c = cell(t.id, ph.id);
              return c && c.state !== "empty";
            }).length;
            return (
              <tr key={t.id}>
                <th scope="row" className="cov-track">
                  <span className="cov-track-name" style={{ color: t.color }}>{t.nameAr}</span>
                  <span className="cov-track-meta">{done}/4 · وزن {t.weight}%</span>
                </th>
                {PHASES.map(ph => {
                  const c = cell(t.id, ph.id);
                  if (!c) return <td key={ph.id} className="cov-cell" />;
                  return (
                    <td key={ph.id} className="cov-cell">
                      <Diamond color={t.color} state={c.state} />
                      <span className="sr-only">
                        {c.proc.nameAr} — {STATE[c.state].label}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default CoverageMatrix;
