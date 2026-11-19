// أسماء مقروءة في ملف المشارك وطابور المراجعة (P8): عنوان المتطلب يحمل رموز إعداد النشاط فيُحوَّل بإعداد برنامجه،
// وكل برنامج بإعداده هو، وما لا رمز فيه لا يمس القاعدة.
import './_test_env.ts';
import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';

const A = await import('./admin.ts');

const seed = () => ({
  stage_requirements: [
    { id: 'r1', code: 'O-SESS', program_id: 'pA', config: { sessions_required: 4, minutes: 60 }, title_ar: '{sessions:O-SESS} توجيه' },
    { id: 'r2', code: 'O-SESS', program_id: 'pB', config: { sessions_required: 2, minutes: 45 }, title_ar: '{sessions:O-SESS} توجيه' },
  ],
});

Deno.test('العنوان يُحوَّل بإعداد برنامجه هو، ولا يبقى رمز خام', async () => {
  const w = installFake(seed());
  try {
    const out = await A.readableReqTitles([
      { participant_id: 'x', stage_requirements: { title_ar: '{sessions:O-SESS} توجيه بمدة {minutes:O-SESS}', program_id: 'pA' } },
      { participant_id: 'y', stage_requirements: { title_ar: '{sessions:O-SESS} توجيه', program_id: 'pB' } },
      { participant_id: 'z', stage_requirements: { title_ar: 'سجل المعالم', program_id: 'pA' } },
    ]);
    assertEquals(out.map((r: any) => r.stage_requirements.title_ar), ['أربع جلسات توجيه بمدة 60 دقيقة', 'جلستان توجيه', 'سجل المعالم']);
  } finally { w.restore(); }
});

Deno.test('بلا رموز لا قراءة إضافية، والصف كما هو', async () => {
  const w = installFake(seed());
  try {
    const rows = [{ stage_requirements: { title_ar: 'خطة التطوير', program_id: 'pA' } }];
    const out = await A.readableReqTitles(rows);
    assertEquals(out, rows);
  } finally { w.restore(); }
});
