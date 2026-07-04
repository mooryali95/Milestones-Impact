import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * العميل يعمل على schema "sspdf" حصراً — معزول عن public.
 * إن لم تُضبط متغيرات البيئة، يعمل التطبيق محلياً بدون قاعدة بيانات.
 */
export const supabase =
  url && key
    ? createClient(url, key, { db: { schema: "sspdf" } })
    : null;
