import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { alertWebhook, MAIL_FROM_DEFAULT, sendCounted } from '../_shared/mail.ts';
import { clientIp, turnstileOk } from '../_shared/guard.ts';
import { insertContactRequest, notifyAdmin } from '../_shared/contact.ts';
import { slackUse } from '../_shared/slack.ts';
import { handle, readEnv } from './handler.ts';
import { streamAnswer } from './model.ts';
import { supabaseStore } from './store.ts';

// agent-chat: المساعد الآلي في الموقع العام. المنطق كله في handler.ts، وهنا ربطه بالأسرار والقاعدة والشبكة.
// verify_jwt = true (supabase/config.toml): البوابة ترفض ما ليس بمفتاح anon قبل الدالة، ثم Turnstile عند البدء.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const MAIL_CAP = Number(Deno.env.get('LEADERS_MAIL_DAILY_CAP') || '80') || 80;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
slackUse(db);
const store = supabaseStore(db, insertContactRequest);
// تحويلات المساعد بالنوع contact القائم في العداد الموحد، بمصدرها
const sendEmail = async (to: string, subject: string, html: string) =>
  (await sendCounted(db, to, subject, html, { kind: 'contact', source: 'agent-chat', cap: MAIL_CAP, key: RESEND_API_KEY, from: MAIL_FROM_DEFAULT })).ok;

Deno.serve((req: Request) => {
  const env = readEnv();
  return handle(req, {
    store,
    env,
    clientIp,
    turnstile: (token, ip) => turnstileOk(env.turnstileSecret, token, ip),
    model: (messages, onText, signal) => streamAnswer(env.apiKey, env.model, messages, onText, signal),
    notifyAdmin: (row) => notifyAdmin(db, row, sendEmail, env.adminEmail, `المساعد الآلي من ${row.product}`),
    alert: (kind, detail) => alertWebhook(kind, detail),
  });
});
