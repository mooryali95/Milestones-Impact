import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksVerdict, isReleaseRef, migrationsOf, releaseStage, versionOfRef } from '../../supabase/functions/leaders-api/book-release.js';
import { applyProposals as fromScript } from '../../scripts/handbook/release.mjs';
import { applyProposals } from '../../supabase/functions/leaders-api/book-release.js';

const run = (name, status, conclusion) => ({ name, status, conclusion });

describe('زر «أصدر الكتاب»: قراءة الحالة', () => {
  it('حكم الفحوص: يعمل، أو فشل، أو نجح ci-ok', () => {
    expect(checksVerdict([])).toBe('pending');
    expect(checksVerdict([run('checks', 'in_progress', null), run('ci-ok', 'queued', null)])).toBe('pending');
    expect(checksVerdict([run('checks', 'completed', 'failure'), run('ci-ok', 'completed', 'failure')])).toBe('failure');
    expect(checksVerdict([run('checks', 'completed', 'success'), run('deploy', 'completed', 'skipped'), run('ci-ok', 'completed', 'success')])).toBe('success');
    // تشغيل ملغى بدفعة أحدث لا يُعد فشلًا ما دام ci-ok الأحدث نجح
    expect(checksVerdict([run('web', 'completed', 'cancelled'), run('ci-ok', 'completed', 'success')])).toBe('success');
    expect(checksVerdict([run('checks', 'completed', 'success')])).toBe('pending');
  });
  it('ترحيلات الطلب بترتيبها، وفرع الإصدار وإصداره', () => {
    expect(migrationsOf([{ filename: 'supabase/migrations/20261116000101_leaders_book_proposals_v3_2.sql' }, { filename: 'supabase/migrations/20261116000100_leaders_handbook_v3_2.sql' }, { filename: 'supabase/content/handbook/v3.2/IMPACT.md' }]))
      .toEqual(['20261116000100_leaders_handbook_v3_2', '20261116000101_leaders_book_proposals_v3_2']);
    expect(isReleaseRef('handbook/release-v3.2')).toBe(true);
    expect(isReleaseRef('claude/x')).toBe(false);
    expect(versionOfRef('handbook/release-v3.2')).toBe('v3.2');
  });
  it('المراحل: ينتظر، يُبنى، تعذّر، للمراجعة، يُنشر، نُشر', () => {
    expect(releaseStage({})).toBe('idle');
    expect(releaseStage({ run: { status: 'in_progress' } })).toBe('building');
    expect(releaseStage({ run: { status: 'completed', conclusion: 'failure' } })).toBe('failed');
    expect(releaseStage({ run: { status: 'completed', conclusion: 'success' }, pr: { state: 'open' } })).toBe('review');
    expect(releaseStage({ pr: { state: 'closed', merged: true }, applied: false })).toBe('merging');
    expect(releaseStage({ pr: { state: 'closed', merged: true }, applied: true })).toBe('published');
    expect(releaseStage({ run: { status: 'completed', conclusion: 'success' }, pr: { state: 'closed', merged: false } })).toBe('idle');
  });
  it('المعاينة والسير بمنطق واحد: السكربت يعيد تصدير ما في الخادم', () => {
    expect(fromScript).toBe(applyProposals);
  });
  it('أفعال الإصدار للمدير العام وحده بالعامل الثاني (superWriter)، والمفتاح سر في الدالة لا في الشيفرة', () => {
    const index = readFileSync(join(process.cwd(), 'supabase/functions/leaders-api/index.ts'), 'utf8');
    for (const a of ['admin.book-release', 'admin.book-release-start', 'admin.book-release-pr', 'admin.book-release-publish']) {
      expect(index).toMatch(new RegExp(`'${a.replace('.', '\\.')}': \\(a, b\\) => A\\.superWriter\\(`));
    }
    const ts = readFileSync(join(process.cwd(), 'supabase/functions/leaders-api/book-release.ts'), 'utf8');
    expect(ts).toContain("Deno.env.get('GITHUB_RELEASE_TOKEN')");
    expect(ts).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_/);
    // النشر بعد خضرة الفحوص وبالنسخة التي راجعها المدير
    expect(ts).toMatch(/pr\.checks !== 'success'/);
    expect(ts).toMatch(/String\(b\?\.sha \|\| ''\) !== pr\.sha/);
  });
});
