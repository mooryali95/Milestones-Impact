// نسب الزائر لجهته: أولوية الرابط، وذاكرة 30 يومًا، وتجاهل موقعنا نفسه
import { describe, expect, it } from 'vitest';
import { cleanCampaign, cleanCode, KEEP_DAYS, mergeAttribution, refHost } from './attribution.js';

const day = 864e5;

describe('attribution', () => {
  it('cleans codes and campaigns', () => {
    expect(cleanCode('SAFARA')).toBe('safara');
    expect(cleanCode('a b')).toBe('');
    expect(cleanCampaign('whatsapp_oct')).toBe('whatsapp_oct');
    expect(cleanCampaign('<x>')).toBe('');
  });

  it('reads the referring host and ignores our own site', () => {
    expect(refHost('https://www.mi.manzoma.sa/programs?x=1', 'leaders.sunkvalue.com')).toBe('mi.manzoma.sa');
    expect(refHost('https://leaders.sunkvalue.com/verify', 'leaders.sunkvalue.com')).toBe('');
    expect(refHost('', 'leaders.sunkvalue.com')).toBe('');
  });

  it('a new org link replaces the old one with its campaign', () => {
    const prev = { org: 'old1', campaign: 'mail', ref: 'a.sa', at: 0 };
    const next = mergeAttribution(prev, { org: 'safara', campaign: '' }, day);
    expect(next).toMatchObject({ org: 'safara', campaign: '', ref: 'a.sa' });
  });

  it('keeps the first referring site', () => {
    const prev = mergeAttribution(null, { ref: 'mi.manzoma.sa' }, 0);
    expect(mergeAttribution(prev, { ref: 'google.com' }, day).ref).toBe('mi.manzoma.sa');
  });

  it('forgets after the keep window', () => {
    const prev = { org: 'safara', at: 0 };
    expect(mergeAttribution(prev, {}, (KEEP_DAYS - 1) * day)?.org).toBe('safara');
    expect(mergeAttribution(prev, {}, (KEEP_DAYS + 1) * day)).toBeNull();
  });
});
