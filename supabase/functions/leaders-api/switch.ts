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
const SESSION_TABLE: Record<Door, string> = { participant: 'auth_sessions', expert: 'expert_sessions', org: 'coordinator_sessions' };
const EXPERT_OK = ['active', 'paused', 'invited', 'applied'];

// sessionId: الجلسة التي يُبدَّل منها. الجلسة الجديدة ترث لحظة دخولها، فالتبديل ذهابًا وإيابًا لا يمدّد السقف المطلق
// (30 يومًا من الدخول الفعلي)، ولا يصنع جلسة أطول عمرًا مما كان لصاحبها (تدقيق 2026-11-14، N11)
export async function switchTo(email: string, from: Door, to: unknown, ctx: Ctx, sessionId: string | null = null) {
  const target = String(to || '') as Door;
  const { data: src } = sessionId ? await db.from(SESSION_TABLE[from]).select('created_at').eq('id', sessionId).maybeSingle() : { data: null };
  const bornAt = src?.created_at ? String(src.created_at) : new Date().toISOString();
  const hardEnd = Date.parse(bornAt) + CONFIG.sessionMaxDays * 864e5;
  if (hardEnd <= Date.now()) throw new Fail('الجلسة منتهية، سجّل الدخول من جديد', 401, 'session');
  const until = (days: number) => new Date(Math.min(Date.now() + days * 864e5, hardEnd)).toISOString();
  if (!['participant', 'expert', 'org'].includes(target) || target === from) throw new Fail('وجهة غير معروفة');
  if (!(await rolesOf(email)).includes(target)) throw new Fail('لا حساب لك في هذه البوابة', 403, 'no_role');
  let token = '';
  if (target === 'participant') {
    const { data: p } = await db.from('participants').select('id').eq('email', email).eq('is_demo', false).maybeSingle();
    if (!p) throw new Fail('لا حساب لك في هذه البوابة', 403, 'no_role');
    token = await issueSession(p.id, 'switch', { ip: ctx.ip, ua: ctx.ua ?? null } as any, bornAt);
  } else if (target === 'expert') {
    const { data: e } = await db.from('experts').select('id, status').eq('email', email).maybeSingle();
    if (!e || !EXPERT_OK.includes(e.status)) throw new Fail('لا حساب لك في هذه البوابة', 403, 'no_role');
    token = randomToken();
    must(await db.from('expert_sessions').insert({ expert_id: e.id, token_hash: await hash(token), ip: ctx.ip, user_agent: ctx.ua || null, created_at: bornAt, expires_at: until(14) }));
  } else {
    const { data: c } = await db.from('org_coordinators').select('*').eq('email', email).limit(1).maybeSingle();
    if (!c || !viewerActive(c)) throw new Fail('لا حساب لك في هذه البوابة', 403, 'no_role');
    token = randomToken();
    must(await db.from('coordinator_sessions').insert({ coordinator_id: c.id, token_hash: await hash(token), method: 'switch', ip: ctx.ip, user_agent: ctx.ua || null, created_at: bornAt,
      expires_at: until(CONFIG.coordinatorDays) }));
    await db.from('org_coordinators').update({ last_login_at: new Date().toISOString(), status: 'active' }).eq('id', c.id);
  }
  await audit('system', email, `switch.${from}-${target}`, 'participants', null);
  return { success: true, to: target, token };
}

// بوابات البريد الأخرى، لعرض زر التبديل
export const otherDoors = async (email: string, here: Door) => (await rolesOf(email)).filter((d) => d !== here);
