// ════════════════════════════════════════════════════════════════
// إشعار الخطة المقدَّمة في مصفوفة التأثير (matrix_plan) بجدول التوجيه (مركز الإشعارات، التصور 5 و6.4)
// ════════════════════════════════════════════════════════════════
// مسار ownerNotice نفسه في leaders-api/notify.ts، بلا core.ts لأن user-api دالة مستقلة: إن قرر الجدول Slack نُشر سطر ثابت
// برابط شاشة المصفوفة وحده (بلا اسم ولا بريد ولا تفاصيل الخطة)، ثم يُعاد القرار بحال Slack، فما لم يصل يحوّله route إلى
// البريد. والمستشار (MATRIX_NOTIFY_EMAIL) يصله بريد كل خطة كما كان، فلا تبقى خطة بلا قناة في أي إعداد.
import { route, screenOf, slackStateOf } from './notify-routing.js';
import { SITES } from './sites.js';

export const PLAN_EVENT = 'matrix_plan';
export const planLine = () => `📋 خطة مقدمة في مصفوفة التأثير\n${SITES.admin}/${screenOf(PLAN_EVENT)}`;

export type PlanNoticeDeps = {
  settings: unknown;
  // مستقبل المستشار مضبوط: بريد لكل خطة مهما قرر الجدول
  advisor: boolean;
  slackConfigured: () => boolean;
  slackDeliver: (text: string) => Promise<boolean>;
  // البريد بمتنه الكامل، ويرد هل أُرسل
  mail: () => Promise<boolean>;
};
export type PlanNoticeResult = { slack: boolean; email: boolean; digest: boolean };

export async function planNotice(d: PlanNoticeDeps): Promise<PlanNoticeResult> {
  const plan = route(PLAN_EVENT, d.settings);
  const configured = d.slackConfigured();
  const slack = plan.slack && configured ? await d.slackDeliver(planLine()).catch(() => false) : false;
  const decided = route(PLAN_EVENT, d.settings, plan.slack ? slackStateOf({ delivered: slack, configured }) : 'ok');
  const email = decided.email || d.advisor ? await d.mail().catch(() => false) : false;
  return { slack, email, digest: decided.digest };
}
