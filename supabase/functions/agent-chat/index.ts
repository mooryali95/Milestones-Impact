import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { alertWebhook, MAIL_FROM_DEFAULT, sendCounted } from '../_shared/mail.ts';
import { clientIp, turnstileOk } from '../_shared/guard.ts';
import { insertContactRequest, notifyAdmin } from '../_shared/contact.ts';
import { slackUse } from '../_shared/slack.ts';
import { handle, readEnv } from './handler.ts';
import { streamAnswer } from './model.ts';
import { readRuntime } from './runtime.ts';
import { versions } from './version.ts';
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

const lead = () => db.schema('leaders');

Deno.serve((req: Request) => {
  const env = readEnv();
  // التفعيل والمفتاح من صف الإعداد (اللوحة) بخزن 60 ثانية، وLEADERS_AGENT_ENABLED مفتاح طوارئ فوقه (runtime.ts)
  const runtime = () => readRuntime(() => lead().rpc('agent_runtime'), {
    mode: Deno.env.get('LEADERS_AGENT_ENABLED'), envKey: env.apiKey, fingerprint: async () => (await versions(env.model)).fingerprint,
  });
  return handle(req, {
    store,
    env,
    runtime,
    keyStatus: async (ok, code, source) => {
      const { error } = await lead().rpc('agent_key_status', { p_ok: ok, p_error: code, p_source: source });
      if (error) console.error('agent key status:', error.code);
    },
    clientIp,
    turnstile: (token, ip) => turnstileOk(env.turnstileSecret, token, ip),
    model: (messages, onText, signal, apiKey, opts) => streamAnswer(apiKey || '', env.model, messages, onText, signal, undefined, opts),
    notifyAdmin: (row) => notifyAdmin(db, row, sendEmail, env.adminEmail, `المساعد الآلي من ${row.product}`),
    alert: (kind, detail) => alertWebhook(kind, detail),
  });
});
