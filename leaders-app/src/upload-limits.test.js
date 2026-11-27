import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { orphanPaths, uploadRefusal, UPLOAD_LIMITS } from '../../supabase/functions/leaders-api/upload-limits.js';
import { join } from 'node:path';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const ago = (h) => new Date(NOW - h * 36e5).toISOString();
const read = (f) => readFileSync(join(process.cwd(), f), 'utf8');

describe('حد روابط الرفع اليومي', () => {
  it('يرفض عند بلوغ عدد الروابط الصادرة في 24 ساعة', () => {
    const used = Array.from({ length: UPLOAD_LIMITS.perDay - 1 }, () => ({ created_at: ago(1), metadata: { size: 1024 } }));
    expect(uploadRefusal({ issued: UPLOAD_LIMITS.perDay - 1, files: used, now: NOW })).toBe(null);
    // روابط صادرة بلا رفع تُحسب بسقف الملف: طلب الروابط قبل الرفع لا يعبر حد الحجم
    expect(uploadRefusal({ issued: UPLOAD_LIMITS.perDay - 1, files: [], now: NOW })).toBe('bytes');
    expect(uploadRefusal({ issued: UPLOAD_LIMITS.perDay, files: [], now: NOW })).toBe('count');
  });
  it('يجمع حجم ما رُفع في آخر 24 ساعة وحده', () => {
    const big = { created_at: ago(1), metadata: { size: UPLOAD_LIMITS.bytesPerDay } };
    const old = { created_at: ago(30), metadata: { size: UPLOAD_LIMITS.bytesPerDay * 2 } };
    expect(uploadRefusal({ issued: 0, files: [old], now: NOW })).toBe(null);
    expect(uploadRefusal({ issued: 0, files: [old, big], now: NOW })).toBe('bytes');
  });
  it('upload.url يعد ويسجل قبل توقيع الرابط', () => {
    const s = read('supabase/functions/leaders-api/participant.ts');
    const fn = s.slice(s.indexOf('export async function uploadUrl'), s.indexOf('export async function cvAttach'));
    expect(fn.indexOf("eq('action', 'upload.url')")).toBeGreaterThan(-1);
    expect(fn.indexOf("audit('participant', p.id, 'upload.url'")).toBeLessThan(fn.indexOf('createSignedUploadUrl'));
    expect(fn).toMatch(/429, 'rate'/);
  });
});

describe('الملفات اليتيمة', () => {
  const ref = new Set(['p1/cv/a.pdf', 'p1/evidence/b.pdf']);
  it('يحذف غير المربوط الأقدم من المدة وحده', () => {
    const objs = [
      { path: 'p1/cv/a.pdf', created_at: ago(100) },
      { path: 'p1/evidence/b.pdf', created_at: ago(100) },
      { path: 'p1/evidence/c.pdf', created_at: ago(100) },
      { path: 'p1/evidence/d.pdf', created_at: ago(1) },
      { path: 'p1/evidence/e.pdf', created_at: null },
      { path: 'p1/other/f.pdf', created_at: ago(100) },
      { path: 'root.pdf', created_at: ago(100) },
    ];
    expect(orphanPaths(objs, ref, NOW)).toEqual(['p1/evidence/c.pdf']);
  });
  it('مربوط بالمهمة الأسبوعية', () => {
    expect(read('supabase/functions/leaders-api/index.ts')).toMatch(/orphan_files: await \(await import\('\.\/orphan-files\.ts'\)\)\.sweepOrphans\(\)/);
  });
});
