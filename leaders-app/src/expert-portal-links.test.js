// بوابة الخبير بعد فحص الجاهزية (2026-11-11):
// 1) رابط الدعوة: الخادم يبنيه ببريد مرمّز (%40) والبوابة كانت تشترط «@» صريحة ولا تقبل نقطة قبلها، فلم يُقرأ رابط قط.
//    الصيغة الآن في مصدر واحد (logic.js) يبنيها الخادم ويقرؤها البوابة.
// 2) رفض الخادم في التقييم الختامي وطابور الأقران والقاعة كان يظهر بعلامة النجاح في رأس الصفحة بعيدًا عن القسم.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expertInviteHash, readExpertInvite } from '../../supabase/functions/leaders-api/logic.js';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
// رمز الدعوة كما يولّده randomToken(): 32 بايتًا بترميز base64url (43 حرفًا بلا نقاط)
const CODE = 'Zq3_x-9KpL0aB7cD2eF4gH6iJ8kM1nO5pQ_rS-tUvWx';

describe('رابط دعوة الخبير: صيغة واحدة يبنيها الخادم وتقرؤها البوابة', () => {
  it('يُقرأ ما يبنيه الخادم، ولو في البريد نقطة أو علامة +', () => {
    for (const email of ['xp@example.org', 'first.last@example.org', 'a.b+c@sub.example.sa']) {
      const hash = expertInviteHash(email, CODE);
      expect(hash).toContain('%40');
      expect(readExpertInvite(hash), email).toEqual({ email, code: CODE });
    }
  });

  it('يُقبل البريد مفكوكًا إن فكّه برنامج البريد، ويُوحَّد بحروف صغيرة', () => {
    expect(readExpertInvite(`#invite=First.Last@Example.org.${CODE}`)).toEqual({ email: 'first.last@example.org', code: CODE });
  });

  it('يُرفض الرابط التالف بلا استثناء يكسر الصفحة', () => {
    for (const bad of ['', '#demo=abc', `#invite=${CODE}`, `#invite=xp%40example.org.short`, `#invite=not-an-email.${CODE}`, `#invite=%E0%A4%A.${CODE}`, `#invite=.${CODE}`]) {
      expect(readExpertInvite(bad), bad).toBeNull();
    }
  });

  it('الخادم والبوابة يستعملان الصيغة المشتركة لا نسختين منها', () => {
    const server = read('supabase/functions/leaders-api/experts.ts');
    expect(server).toContain('${expertInviteHash(e.email, code)}');
    expect(server).not.toMatch(/#invite=\$\{/);
    const portal = read('leaders-app/src/screens/ExpertPortal.jsx');
    expect(portal).toContain('readExpertInvite(location.hash)');
    expect(portal).not.toMatch(/location\.hash\.match\(\/\^#invite=/);
  });
});

describe('رفض الخادم في أقسام الخبير يُعرض خطأً في قسمه', () => {
  const file = read('leaders-app/src/screens/ExpertFile.jsx');
  const portal = read('leaders-app/src/screens/ExpertPortal.jsx');
  it('لا يمرّر أحد ضابط الرسالة الخام إلى قسم (say={setMsg}) فيضيع معنى الخطأ', () => {
    for (const src of [file, portal]) expect(src).not.toMatch(/say=\{setMsg\}|toast=\{setMsg\}/);
  });
  it('كل رفض يُقال بعلم الخطأ، والقاعة المشتركة تمرّره', () => {
    for (const src of [file, portal]) {
      expect(src).not.toMatch(/return say\(r\.message\);/);
      expect(src).toMatch(/return say\(r\.message, true\);/);
    }
    const hall = read('shared/hall/HallControl.jsx');
    expect(hall).toContain('if (!r.success) return toast(r.message, true);');
    expect(hall).not.toMatch(/toast\(r\.message\)/);
  });
});
