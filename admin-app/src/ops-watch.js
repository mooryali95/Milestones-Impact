// ════════════════════════════════════════════════════════════════
// متابعة صحة البريد والتنبيه: طلب واحد مشترك بين بطاقة النظرة العامة وشريط اللوحة
// ════════════════════════════════════════════════════════════════
// admin.ops-health كل 60 ثانية على الأكثر، وما دامت الصفحة ظاهرة وفيها من يقرأ (الشريط أو البطاقة).
// الصفحة المخفية لا تسأل، وتعود فتسأل فور ظهورها إن مضت المدة. الحكم من ops-health.js نفسه الذي يقرؤه الخادم.
import { useEffect, useState } from 'react';
import { L } from './leaders.js';
import { opsVerdict } from '../../supabase/functions/leaders-api/ops-health.js';

export const POLL_MS = 60e3;

// هل يحين سؤال جديد؟ (منطق بلا متصفح للاختبار)
export const dueIn = (lastAt, now = Date.now(), visible = true) => (visible ? Math.max(0, lastAt + POLL_MS - now) : null);

let data = null;
let lastAt = 0;
let inflight = null;
let timer = null;
const subs = new Set();
const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
const emit = () => subs.forEach((fn) => fn(data));

function schedule() {
  clearTimeout(timer);
  timer = null;
  if (!subs.size) return;
  const wait = dueIn(lastAt, Date.now(), visible());
  if (wait == null) return;
  timer = setTimeout(() => { refresh(); }, wait);
}
export function refresh() {
  if (inflight) return inflight;
  inflight = L('admin.ops-health').catch(() => null).then((r) => {
    // رد فاشل لا يمحو آخر حال مقروءة: تبقى ظاهرة ويُعاد السؤال في موعده
    if (r?.success && r.mail) data = r; else if (!data) data = r || { success: false };
    lastAt = Date.now();
    inflight = null;
    emit();
    schedule();
    return data;
  });
  return inflight;
}
function onVisibility() { if (visible() && Date.now() - lastAt >= POLL_MS) refresh(); else schedule(); }

function subscribe(fn) {
  subs.add(fn);
  if (subs.size === 1 && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  if (data) fn(data);
  if (!inflight && Date.now() - lastAt >= POLL_MS && visible()) refresh(); else schedule();
  return () => {
    subs.delete(fn);
    if (!subs.size) {
      clearTimeout(timer); timer = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}

// للاختبار
export function resetOpsWatch() { data = null; lastAt = 0; inflight = null; clearTimeout(timer); timer = null; subs.clear(); }

// الحقائق والحكم. enabled=false (المراقب): لا طلب ولا حكم
export function useOpsHealth(enabled = true) {
  const [d, setD] = useState(() => (enabled ? data : null));
  useEffect(() => (enabled ? subscribe(setD) : undefined), [enabled]);
  const ok = enabled && d?.success && d.mail;
  return { data: ok ? d : null, failed: !!(enabled && d && d.success === false), verdict: ok ? opsVerdict(d, Date.now()) : null, refresh };
}
