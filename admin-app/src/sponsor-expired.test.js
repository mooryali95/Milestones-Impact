// تصور المرحلة 2، المرحلة 2.2: شارة «انتهت مهلة الرابط» حمراء ومرشح لها في قائمة الوثائق، وزرّا «أعد الدعوة» و«اعتمد دون تأييد»
// متجاوران في لوحة التأييد. الحالة من الخادم (sponsor_state، قاعدة sponsorState الواحدة في capstone.js)، فلا قاعدة هنا.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyFilters, presetCounts } from './filters.js';
import { CAP_PRESETS, capEmpty } from './screens/Capstones.jsx';
import { SPONSOR_STATE_AR } from '../../supabase/functions/leaders-api/capstone.js';
import { SPONSOR_STATE_TONE } from '../../supabase/functions/leaders-api/labels.js';

const src = readFileSync(join(__dirname, 'screens/Capstones.jsx'), 'utf8');
const caps = [
  { participant_id: 'a', status: 'accepted', sponsor_status: 'pending', sponsor_state: 'expired' },
  { participant_id: 'b', status: 'accepted', sponsor_status: 'pending', sponsor_state: 'pending' },
  { participant_id: 'c', status: 'approved', sponsor_status: 'endorsed', sponsor_state: 'endorsed' },
];

describe('انتهاء مهلة الراعي في الإدارة', () => {
  it('مرشح للمنتهي يعدّه من الحالة المشتقة وحدها', () => {
    const p = CAP_PRESETS.find((x) => x.key === 'sponsor_expired');
    expect(p.label).toBe('انتهت مهلة الراعي');
    expect(presetCounts(caps, CAP_PRESETS)).toMatchObject({ sponsor_expired: 1, accepted: 2 });
    expect(applyFilters(caps, { presets: CAP_PRESETS }, { view: 'sponsor_expired' }).map((x) => x.participant_id)).toEqual(['a']);
    expect(capEmpty({ view: 'sponsor_expired', q: '', org: '', scope: '' }, 3).title).toBe('لا وثائق في «انتهت مهلة الراعي» الآن');
  });
  it('الشارة حمراء من القاموس الواحد، بلا قاموس محلي للحالة', () => {
    expect(SPONSOR_STATE_AR.expired).toBe('انتهت مهلة الرابط');
    expect(src).not.toMatch(/const SPONSOR = \{/);
    // المرحلة 17: النبرة من SPONSOR_STATE_TONE عبر StatusChip، لا من سطر الشاشة
    expect(SPONSOR_STATE_TONE.expired).toBe('bad');
    expect(src).toMatch(/tones=\{SPONSOR_STATE_TONE\}/);
    expect(src).toMatch(/<SponsorChip state=\{x\.sponsor_state\} \/>/);
    expect(src).toMatch(/<SponsorChip state=\{c\.sponsor_state\} \/>/);
  });
  it('زرّا الإعادة والاعتماد دون تأييد متجاوران', () => {
    expect(src).toMatch(/'أعد الدعوة'\}<\/button>\n\s+<input aria-label="سبب الاعتماد دون تأييد"[^\n]+\n\s+<button[^\n]+>اعتمد دون تأييد<\/button>/);
  });
});
