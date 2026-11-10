// تدقيق الإنتاج، المرحلة أ (2026-11-10): لوحة الخبير في رحلة واحدة، وتسجيل كل رفض 4xx باسم فعله،
// وترويسات صفحة التطبيق ومساراتها.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('لوحة الخبير في رحلة واحدة (6.2)', () => {
  const index = read('supabase/functions/leaders-api/index.ts');
  const dash = index.slice(index.indexOf("'xp.dashboard': async"), index.indexOf("'xp.consent'"));
  it('الملخص يجمع الأقسام الأربعة بالأفعال نفسها التي تُطلب وحدها', () => {
    for (const [action, fn] of [['xp.reviews', 'V2.reviews(e)'], ['xp.participants', 'FL.participants(e)'], ['xp.peer-list', 'PR.expertList(e)'], ['xp.sus-state', "SU.state('expert', e)"]]) {
      expect(dash, action).toContain(`settle('${action}', ${fn})`);
      expect(index, action).toContain(`'${action}': (e) => ${fn},`);
    }
    expect(dash).toContain('return { ...d, preload: { reviews, participants, peers, sus } };');
  });
  it('لا تجميع قبل الموافقة أو الاعتماد، ولا في إعادة التحميل الخفيفة', () => {
    expect(dash).toContain('if (!d?.success || d.consent_needed || d.onboarding || b.lite === true) return d;');
  });
  it('خطأ قسم يبقى له بشكل رد الفعل وحده، ولا يُسقط اللوحة', () => {
    const settle = index.slice(index.indexOf('async function settle'), index.indexOf('const QUIET'));
    expect(settle).toContain('return { success: false, message: e.message, code: e.code, ...e.extra };');
    expect(settle).toContain("code: 'internal', ref");
  });
  it('الواجهة تقرأ المجمّع مرة واحدة وتطلب كل قسم وحده إن غاب', () => {
    const ui = read('leaders-app/src/screens/ExpertPortal.jsx');
    for (const c of ['AdvisorReviews initial={pre.reviews}', 'PeerQueue say={setMsg} initial={pre.peers}', 'MyParticipants onOpen={openFile} initial={pre.participants}', 'initial={pre.sus}']) expect(ui, c).toContain(c);
    expect(ui.match(/useEffect\(\(\) => \{ if \(!initial\) load\(\); \}, \[\]\);/g)).toHaveLength(3);
    expect(ui).toContain('preload: undefined');
    expect(read('leaders-app/src/SusCard.jsx')).toContain('if (initial) return undefined;');
  });
});

describe('كل رفض 4xx مسجّل باسم فعله (6.1)', () => {
  const index = read('supabase/functions/leaders-api/index.ts');
  it('في معالج الأخطاء العام وفي الأقسام المجمّعة، بلا بريد ولا متن', () => {
    expect(index).toContain('logRefusal(action, e.status, e.code);\n      return reply(req,');
    expect(index).toContain('logRefusal(action, e.status, e.code); return { success: false');
    const log = index.slice(index.indexOf('function logRefusal'), index.indexOf('function logRefusal') + 260);
    expect(log).toContain('console.warn(`leaders-api refused ${action} ${status} ${code || \'-\'}`)');
    expect(log).not.toMatch(/email|message|body/);
  });
});

describe('صفحة التطبيق ومساراتها (4.1 و4.2)', () => {
  it('صفحات التطبيق بلا Access-Control-Allow-Origin الافتراضي، والوسائط تبقيه', () => {
    const h = read('leaders-app/public/_headers');
    for (const path of ['/', '/org', '/x', '/verify']) expect(h, path).toContain(`\n${path}\n  Cache-Control: no-cache\n  ! Access-Control-Allow-Origin\n`);
    expect(h).toMatch(/\/media\/\*\n(?: {2}.*\n)*? {2}Access-Control-Allow-Origin: \*/);
  });
  it('favicon.ico وmanifest.json تُخدم بملفيها قبل قاعدة التطبيق', () => {
    const r = read('leaders-app/public/_redirects');
    const spa = r.indexOf('/*  /index.html  200');
    for (const line of [/\/favicon\.ico\s+\/favicon\.svg\s+(200|301)/, /\/manifest\.json\s+\/manifest\.webmanifest\s+(200|301)/]) {
      const m = r.match(line);
      expect(m, String(line)).not.toBeNull();
      expect(m.index).toBeLessThan(spa);
    }
  });
});
