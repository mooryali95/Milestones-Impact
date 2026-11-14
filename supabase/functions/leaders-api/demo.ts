// ════════════════════════════════════════════════════════════════
// حساب العرض التوضيحي للورش: فتح من اللوحة، وإعادة ضبط، وأزرار تخطٍّ
// ════════════════════════════════════════════════════════════════
// مشارك حقيقي بعلامة is_demo، يمر بالرحلة نفسها التي يمر بها أي مشارك، لكنه:
// يُفتح من اللوحة بلا كلمة مرور، ويُعتمد مستواه آليًا، ولا يدخل القوائم ولا الإحصاءات،
// ولا يصله بريد، ويُعاد إلى البداية بضغطة. أزرار التخطي تعمل له وحده.
import { audit, CONFIG, db, DEMO_MAIL_DOMAIN, Fail, must } from './core.ts';
import { assessmentGet, assessmentSubmit, issueSession, profileSave } from './participant.ts';
import { scoreFor } from './logic.js';
import type { Admin } from './admin.ts';

type Body = Record<string, any>;
type Ctx = { ip: string | null; ua: string | null };
const DEMO_EMAIL = `demo@${DEMO_MAIL_DOMAIN}`;   // sendMail لا يرسل إلى هذا النطاق أبدًا
// رقم وهمي بصيغة صحيحة لإكمال الملف فقط (لا يُتصل به ولا يُنشر)
const DEMO_PHONE = '05' + '0'.repeat(8);

// حساب العرض الأصلي يُعرَّف ببريده الخاص لا بالعلامة وحدها: is_demo تعني «خارج القوائم والإحصاءات والبريد»، ويحملها
// أيضًا حساب اختبار وسمه المالك (2026-11-11). فلا يتعطل فتح العرض بوجود أكثر من حساب موسوم، ولا تحذف إعادة الضبط إلا هذا
async function demoRow() {
  const { data } = await db.from('participants').select('*').eq('is_demo', true).eq('email', DEMO_EMAIL).maybeSingle();
  if (data) return data;
  return must(await db.from('participants').insert({
    email: DEMO_EMAIL, full_name: 'مشارك العرض', is_demo: true, source: 'admin',
  }).select('*').single(), 'تعذّر إنشاء حساب العرض');
}

// يفتح تطبيق المشارك بحساب العرض: رابط بجلسة جاهزة في جزء الرابط (لا يصل إلى أي خادم)
export async function open(a: Admin, _b: Body, ctx: Ctx) {
  const p = await demoRow();
  // رابط عرض جديد يُبطل ما قبله: رمز ظهر على شاشة سابقة لا يبقى صالحًا (M5)
  await db.from('auth_sessions').update({ revoked_at: new Date().toISOString() }).eq('participant_id', p.id).is('revoked_at', null);
  const token = await issueSession(p.id, 'demo', ctx);
  await audit('admin', a.email, 'demo.open', 'participants', p.id);
  return { success: true, url: `${CONFIG.appUrl.replace(/\/$/, '')}/#demo=${token}`, status: p.status };
}

// إعادة الضبط: يُحذف الحساب بكل ما عليه، ويُنشأ من جديد عند الفتح التالي
export async function reset(a: Admin) {
  const { data: p } = await db.from('participants').select('id').eq('is_demo', true).eq('email', DEMO_EMAIL).maybeSingle();
  if (p) {
    await db.from('certificates').delete().eq('participant_id', p.id);
    must(await db.from('participants').delete().eq('id', p.id), 'تعذّر حذف حساب العرض');
  }
  await audit('admin', a.email, 'demo.reset', 'participants', p?.id || 'none');
  return { success: true };
}

const onlyDemo = (p: any) => { if (!p.is_demo) throw new Fail('هذا متاح لحساب العرض فقط', 403); };

// تخطّي الملف الشخصي: بيانات عرض جاهزة
export async function fillProfile(p: any) {
  onlyDemo(p);
  return profileSave(p, { fields: {
    full_name: 'مشارك العرض', job_title: 'مدير إدارة المشاريع', organization_name: 'جهة العرض التوضيحي',
    sector: 'حكومي', phone: DEMO_PHONE, years_experience: 8, work_scope: null,
    bio: 'حساب توضيحي لعرض رحلة القائد في الورشة الأولى.',
  } });
}

// تخطّي القياس: إجابات واقعية (لا كلها مثالية) ثم الإرسال، فيُعتمد المستوى آليًا وتظهر الرحلة
export async function fillAssessment(p: any) {
  onlyDemo(p);
  const g: any = await assessmentGet(p, {});
  const ids = g.questions.map((q: any) => q.id);
  const { data: qs } = await db.from('questions').select('id, tier, kind, options').in('id', ids);
  const now = new Date().toISOString();
  const rows = (qs || []).map((q: any, i: number) => {
    const opts = (q.options || []).map((o: any, k: number) => ({ k, s: Number(o.score) })).filter((o: any) => o.s >= 0).sort((x: any, y: any) => y.s - x.s);
    // أغلبها أفضل خيار، وبعضها الثاني، فيخرج مستوى متوسط واقعي يصلح للشرح
    const pick = opts[(i % 3 === 2 && opts.length > 1) ? 1 : 0];
    return { assessment_id: g.assessment.id, question_id: q.id, value: { k: pick.k }, score: scoreFor(q, pick.k), answered_at: now };
  });
  if (rows.length) must(await db.from('assessment_answers').upsert(rows));
  const fresh = must(await db.from('participants').select('*').eq('id', p.id).single());
  return assessmentSubmit(fresh, { assessment_id: g.assessment.id });
}
