// زمن القياس المعلن من مصدر واحد (assessment-time.js): الفعلي إن كفى، وإلا المقدَّر من الأسئلة. يُحفظ دقائق في الذاكرة
import { db } from './core.ts';
import { estimateMinutes, measuredMinutes } from './assessment-time.js';
import { forForm, usesForms } from './logic.js';
import { counted } from './counting.ts';

const cache = new Map<string, { at: number; minutes: number | null }>();
const TTL = 10 * 60e3;

export async function instrumentMinutes(instrumentId: string | null | undefined): Promise<number | null> {
  if (!instrumentId) return null;
  const hit = cache.get(instrumentId);
  if (hit && Date.now() - hit.at < TTL) return hit.minutes;
  let minutes: number | null = null;
  try {
    // أوقات القياسات المسلَّمة لأداة واحدة (آخر 500) بلا العرض والاختبار، لوسيط الزمن بلا بيانات شخصية
    const { data: rows } = await counted(db.from('assessments').select('started_at, submitted_at, participants!inner(is_demo, is_test)')
      .eq('instrument_id', instrumentId).not('submitted_at', 'is', null), 'participants').order('submitted_at', { ascending: false }).limit(500);
    minutes = measuredMinutes(rows || []);
    if (minutes == null) {
      let { data: qs } = await db.from('questions').select('text_ar, help_ar, kind, options, form').eq('instrument_id', instrumentId).eq('active', true);
      qs = qs || [];
      if (usesForms(qs)) qs = forForm(qs, (qs.find((q: any) => q.form) as any).form);
      minutes = estimateMinutes(qs);
    }
  } catch (e) { console.error('instrument minutes:', e); }
  cache.set(instrumentId, { at: Date.now(), minutes });
  return minutes;
}

export async function baselineMinutes(): Promise<number | null> {
  const { data } = await db.from('instruments').select('id').eq('kind', 'baseline').eq('active', true).order('version', { ascending: false }).limit(1).maybeSingle();
  return instrumentMinutes((data as any)?.id);
}
