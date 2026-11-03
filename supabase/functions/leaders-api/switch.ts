// ════════════════════════════════════════════════════════════════
// التبديل بين الحسابات: مشارك ↔ خبير ↔ منسق جهة، لصاحب البريد نفسه ودون خروج ودخول
// ════════════════════════════════════════════════════════════════
// الجلسة النافذة في بوابة تثبت ملكية البريد، فتُصدر للوجهة جلسة جديدة إن كان للبريد فيها حساب صالح.
// لا يُنشأ حساب في الوجهة من هنا أبدًا: من لا حساب له فيها يُرد بلا جلسة.
import { audit, CONFIG, db, Fail, hash, must, randomToken } from './core.ts';
import { issueSession } from './participant.ts';
import { viewerActive } from './logic.js';
import { Door, rolesOf } from './doors.ts';

type Ctx = { ip: string | null; ua?: string | null };
const EXPERT_OK = ['active', 'paused', 'invited', 'applied'];

export async function switchTo(email: string, from: Door, to: unknown, ctx: Ctx) {
  const target = String(to || '') as Door;
  if (!['participant', 'expert', 'org'].includes(target) || target === from) throw new Fail('وجهة غير معروفة');
  if (!(await rolesOf(email)).includes(target)) throw new Fail('لا حساب لك في هذه البوابة', 403, 'no_role');
  let token = '';
  if (target === 'participant') {
    const { data: p } = await db.from('participants').select('id').eq('email', email).eq('is_demo', false).maybeSingle();
    if (!p) throw new Fail('لا حساب لك في هذه البوابة', 403, 'no_role');
    token = await issueSession(p.id, 'switch', { ip: ctx.ip, ua: ctx.ua ?? null } as any);
  } else if (target === 'expert') {
    const { data: e } = await db.from('experts').select('id, status').eq('email', email).maybeSingle();
    if (!e || !EXPERT_OK.includes(e.status)) throw new Fail('لا حساب لك في هذه البوابة', 403, 'no_role');
    token = randomToken();
    must(await db.from('expert_sessions').insert({ expert_id: e.id, token_hash: await hash(token), ip: ctx.ip, user_agent: ctx.ua || null, expires_at: new Date(Date.now() + 14 * 864e5).toISOString() }));
  } else {
    const { data: c } = await db.from('org_coordinators').select('*').eq('email', email).limit(1).maybeSingle();
    if (!c || !viewerActive(c)) throw new Fail('لا حساب لك في هذه البوابة', 403, 'no_role');
    token = randomToken();
    must(await db.from('coordinator_sessions').insert({ coordinator_id: c.id, token_hash: await hash(token), method: 'switch', ip: ctx.ip, user_agent: ctx.ua || null,
      expires_at: new Date(Date.now() + CONFIG.coordinatorDays * 864e5).toISOString() }));
    await db.from('org_coordinators').update({ last_login_at: new Date().toISOString(), status: 'active' }).eq('id', c.id);
  }
  await audit('system', email, `switch.${from}-${target}`, 'participants', null);
  return { success: true, to: target, token };
}

// بوابات البريد الأخرى، لعرض زر التبديل
export const otherDoors = async (email: string, here: Door) => (await rolesOf(email)).filter((d) => d !== here);
