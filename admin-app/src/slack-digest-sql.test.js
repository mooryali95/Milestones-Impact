// ترحيل 20261116190000 (مركز الإشعارات، المرحلة 3): فئة «الملخص اليومي» في leaders.slack_threads. القيد يقبل الفئات الخمس
// ويرفض غيرها، وإعادة التشغيل آمنة، وكل فئة في slack.ts لها مكان في القيد. والملخص من جدول التوجيه وحده
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { DIGEST_HOUR_RIYADH, digestEvents, EVENTS, screenOf } from '../../supabase/functions/_shared/notify-routing.js';

const dir = join(__dirname, '../../supabase/migrations');
const BASE = readFileSync(join(dir, '20261115130000_leaders_slack_threads.sql'), 'utf8');
const DIGEST = readFileSync(join(dir, '20261116190000_leaders_slack_digest_category.sql'), 'utf8');
const SLACK = readFileSync(join(__dirname, '../../supabase/functions/_shared/slack.ts'), 'utf8');

async function db() {
  const d = new PGlite();
  await d.exec(`create role anon; create role authenticated; create schema leaders;
    create table leaders.schema_migrations (name text primary key);`);
  await d.exec(BASE);
  return d;
}

describe('ترحيل فئة الملخص اليومي', () => {
  it('متسامح بوسم البوابة: قبله يُنشر الملخص بلا سلسلة', () => {
    expect(DIGEST).toMatch(/^-- deploy-gate: tolerant /m);
  });
  it('القيد يقبل digest مع الفئات القائمة، ويرفض غيرها، ويُعاد تشغيله بلا خطأ', async () => {
    const d = await db();
    await expect(d.exec(`insert into leaders.slack_threads (day, category) values ('2026-11-17', 'digest')`)).rejects.toThrow();
    await d.exec(DIGEST);
    await d.exec(DIGEST);
    for (const c of ['alerts', 'codes', 'mail', 'hello', 'digest']) await d.exec(`insert into leaders.slack_threads (day, category) values ('2026-11-17', '${c}')`);
    await expect(d.exec(`insert into leaders.slack_threads (day, category) values ('2026-11-18', 'other')`)).rejects.toThrow();
    const { rows } = await d.query(`select name from leaders.schema_migrations`);
    expect(rows.map((r) => r.name)).toContain('20261116190000_leaders_slack_digest_category');
  });
  it('كل فئة في SLACK_CATEGORIES لها مكان في القيد', () => {
    const cats = [...SLACK.match(/export type SlackCategory = ([^;]+);/)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(cats).toEqual(['alerts', 'codes', 'mail', 'digest']);
    for (const c of cats) expect(DIGEST).toContain(`'${c}'`);
  });
});

describe('ما يدخل الملخص اليومي («متوازن»)', () => {
  it('المعلوماتي والمهم الموسوم وحدهما، ولا حرج ولا مقفل', () => {
    const keys = digestEvents();
    expect(keys).toEqual(expect.arrayContaining(['expert_application', 'sponsor_request', 'payment_new', 'payment_refund', 'owner_login_known_device', 'booking_not_eligible', 'expert_profile_done', 'matrix_plan']));
    for (const k of keys) {
      const e = EVENTS.find((x) => x.key === k);
      expect([k, e.tier === 'critical' || e.locked]).toEqual([k, false]);
    }
    expect(keys).not.toContain('contact_request');
    expect(keys).not.toContain('expert_no_match');
  });
  it('«هادئ» لا ملخص للمعلوماتي، ولكل حدث في الملخص شاشة في اللوحة، والموعد 9:00', () => {
    expect(digestEvents({ preset: 'quiet' })).not.toContain('matrix_plan');
    for (const k of digestEvents()) expect(screenOf(k)).toMatch(/^#\//);
    expect(DIGEST_HOUR_RIYADH).toBe(9);
  });
});
