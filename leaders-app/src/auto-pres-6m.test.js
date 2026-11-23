// بندان يدويان صارا تلقائيين باعتماد المالك 2026-11-23: E-PRES من اعتماد التقييم الختامي، وR-6M من مراجعة اليوم 180
import { describe, expect, it } from 'vitest';
import { AUTO_CHECKS, AUTO_EVIDENCE, AUTO_OVERRIDABLE, buildJourney, completionSource } from '../../supabase/functions/leaders-api/logic.js';
import { SYSTEM_REQUIREMENT_CODES } from '../../supabase/functions/leaders-api/content-lock.js';

const stages = [{ key: 'evaluation', sort: 1 }, { key: 'report', sort: 2 }];
const requirements = [
  { id: 'pres', code: 'E-PRES', stage_key: 'evaluation', kind: 'meeting', required: true, sort: 1 },
  { id: 'r6m', code: 'R-6M', stage_key: 'report', kind: 'check', required: false, sort: 1 },
];
const items = (state, progress = {}) => buildJourney({ stages, requirements, progress, levels: {}, state }).flatMap((s) => s.items);
const item = (code, state, progress) => items(state, progress).find((i) => i.code === code);

describe('E-PRES وR-6M تلقائيان', () => {
  it('في AUTO_CHECKS والرموز النظامية، ومصدرهما «تلقائي»', () => {
    for (const c of ['E-PRES', 'R-6M']) {
      expect(AUTO_CHECKS[c]).toBeTypeOf('function');
      expect(SYSTEM_REQUIREMENT_CODES).toContain(c);
      expect(completionSource({ code: c, kind: 'check' })).toBe('auto');
    }
  });
  it('E-PRES يكتمل باعتماد التقييم الختامي وحده', () => {
    expect(item('E-PRES', {}).status).toBe('pending');
    expect(item('E-PRES', { finalApproved: false }).status).toBe('pending');
    const it2 = item('E-PRES', { finalApproved: true });
    expect(it2).toMatchObject({ status: 'done', auto: true, override_ok: true, auto_note: 'اعتُمد التقييم الختامي' });
  });
  it('R-6M يكتمل بإرسال مراجعة اليوم 180، وتأكيد الراعي دليل يُعرض لا شرط', () => {
    expect(item('R-6M', {}).status).toBe('pending');
    expect(item('R-6M', { review180: true })).toMatchObject({ status: 'done', auto_note: 'سُجّلت مراجعة يوم 180' });
    expect(item('R-6M', { review180: true, review180Verified: true }).auto_note).toBe('سُجّلت مراجعة يوم 180 وأكّدها الراعي');
  });
  it('صف «done» يدوي سابق يبقى معدودًا (لا تراجع)، وبلا نص دليل فيظهر تجاوزًا يدويًا', () => {
    const p = { pres: { status: 'done' }, r6m: { status: 'done' } };
    expect(item('E-PRES', {}, p)).toMatchObject({ status: 'done', auto_note: null });
    expect(item('R-6M', {}, p).status).toBe('done');
    expect(item('E-PRES', {}, { pres: { status: 'pending' } }).status).toBe('pending');
  });
  it('بقية التلقائي لا يقرأ الصف اليدوي كما كان', () => {
    const j = buildJourney({ stages, requirements: [{ id: 'x', code: 'A-DONE', stage_key: 'evaluation', kind: 'auto', sort: 1 }], progress: { x: { status: 'done' } }, levels: {}, state: {} });
    expect(j[0].items[0]).toMatchObject({ status: 'pending' });
    expect(j[0].items[0].override_ok).toBeUndefined();
    expect(AUTO_OVERRIDABLE).toEqual(['E-PRES', 'R-6M']);
    expect(Object.keys(AUTO_EVIDENCE).sort()).toEqual(['E-PRES', 'R-6M']);
  });
});
