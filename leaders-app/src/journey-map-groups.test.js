// مرحلتان تسيران معًا (قرار المالك 2026-11-23): من يقف فيهما يُعدّ في مجموعتهما مرة واحدة، فمجموع ما تعرضه الخريطة
// لكل محور يساوي عدد من فيه، ولا يتكرر الشخص في رقمين. والبرنامج المتتابع بلا هذه الحقول (لقطته كما كانت)
import { describe, expect, it } from 'vitest';
import { journeyMap, mapLanes } from '../../supabase/functions/leaders-api/journey-map.js';
import { STAGES, STAGES_WITH, legacyOutputs } from './journey-legacy.cases.js';

describe('عدّ المراحل المتوازية', () => {
  it('المتتابع بلا here_by_group', () => {
    const m = journeyMap({ stages: STAGES, people: [], today: new Date('2026-12-15T10:00:00Z') });
    expect(m.here_by_group).toBeUndefined();
  });
  it('المتوازي: مجموع المجموعات وغير المتوازي في كل محور يساوي here_by_phase', () => {
    const all = legacyOutputs();
    let checked = 0;
    for (const pn of Object.keys(all)) {
      for (const c of Object.values(all[pn].cohorts)) {
        const m = c.mapFull;
        if (!m?.here_by_group) continue;
        const tg = mapLanes(m.stages.map((s) => ({ key: s.key, ...STAGES_WITH.find((x) => x.key === s.key) }))).together;
        for (const [ph, n] of Object.entries(m.here_by_phase)) {
          const sum = m.stages.filter((s) => (s.phase || 'qualification') === ph && !s.off && !s.service && !(tg[s.key] && tg[s.key] !== s.key))
            .reduce((a, s) => a + (tg[s.key] === s.key ? m.here_by_group[s.key] ?? 0 : s.here), 0);
          expect(sum, `${pn} ${ph}`).toBe(n);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JourneyMapView from '../../shared/ui/JourneyMap.jsx';
describe('عرض الخريطة للمتوازي', () => {
  const map = {
    program: { name: 'برنامج' }, cohort: { name: 'دفعة', today_stages: ['consult'] },
    totals: { total: 37, finished: 0, late: 37 }, here_by_phase: { admission: 14, qualification: 23 },
    here_by_group: { training: 23 }, late_by_group: { training: 23 }, lanes: { together: { training: 'training', ojt: 'training' }, tracks: [] },
    stages: [
      { key: 'profile', title: 'الملف', phase: 'admission', here: 14, done: 0, late: 14, duration_days: 4 },
      { key: 'training', title: 'التدريب', phase: 'qualification', here: 23, done: 0, late: 23, duration_days: 1 },
      { key: 'ojt', title: 'التوجيه على رأس العمل', phase: 'qualification', here: 23, done: 0, late: 23, duration_days: 4 },
      { key: 'consult', title: 'الاستشارة', phase: 'qualification', here: 0, done: 0, late: 0, duration_days: 4 },
    ],
  };
  const html = renderToStaticMarkup(React.createElement(JourneyMapView, { map }));
  it('الرقم مرة واحدة للمجموعة، والثانية «ضمن العدد»، و«متأخر» لا يتكرر', () => {
    expect(html.match(/class="jm-here">23</g)?.length).toBe(1);
    expect(html).toContain('ضمن العدد');
    expect(html.match(/23 متأخر/g)?.length).toBe(1);
  });
  it('أكبر تجمع باسم المرحلتين معًا، و«موعدها اليوم» حيث لا أحد، والدفعة متأخرة عن جدولها', () => {
    expect(html).toContain('عند «<b>التدريب والتوجيه على رأس العمل</b>» معًا');
    expect(html).toContain('موعدها اليوم');
    expect(html).toContain('الدفعة متأخرة عن جدولها');
  });
});
