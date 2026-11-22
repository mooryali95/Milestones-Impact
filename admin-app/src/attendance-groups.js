// تجميع متطلبات الجلسات الجماعية في «الحضور والجلسات» حسب البرنامج (قرار المالك 2026-11-22).
// المصدر واحد: stage_requirements كما يعيدها admin.activities، والبرامج الحية والمؤرشفة (archived_programs) من الحمولة نفسها.
// لا يُنشأ هنا متطلب ولا يُنسخ: «+ متطلب حضور» ينقل إلى محرر رحلة البرنامج (حفظه ونسخه ونشره كما هي).
// المتطلب الموقوف (active=false) أو التابع لبرنامج مؤرشف لا يظهر إلا عند «إظهار المؤرشف والموقوف».

export function groupWorkshopReqs({ requirements = [], programs = [], archived_programs = [], workshops = [] }, { showHidden = false } = {}) {
  const live = new Map(programs.map((p) => [p.id, p]));
  const gone = new Map(archived_programs.map((p) => [p.id, p]));
  const groups = new Map();
  let hidden = 0;
  for (const r of requirements) {
    if (r.kind !== 'workshop') continue;
    const archived = gone.has(r.program_id);
    const off = archived || r.active === false;
    if (off) hidden += 1;
    if (off && !showHidden) continue;
    const key = r.program_id || 'none';
    if (!groups.has(key)) groups.set(key, { program_id: r.program_id, name: live.get(r.program_id)?.name || gone.get(r.program_id)?.name || 'البرنامج', archived, reqs: [] });
    groups.get(key).reqs.push({ ...r, off, sessions: workshops.filter((s) => s.requirement_id === r.id).length });
  }
  // البرامج الحية أولًا بترتيبها في الحمولة، ثم المؤرشفة
  const order = (g) => (g.archived ? programs.length : programs.findIndex((p) => p.id === g.program_id));
  return { groups: [...groups.values()].sort((a, b) => order(a) - order(b)), hidden };
}

// رابط محرر رحلة البرنامج نفسه: إضافة متطلب جلسات (add=workshop) أو فتح متطلب قائم (req=<id>)
export const journeyHref = (programId, q) => `#/leaders/journey/${encodeURIComponent(programId)}?${q}`;
