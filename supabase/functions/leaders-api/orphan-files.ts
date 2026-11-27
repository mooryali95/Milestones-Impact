// تنظيف الملفات اليتيمة في المخزن الخاص (تقرير الأمن الثاني، البند 1): مع التنظيف الأسبوعي في cron.reminders.
// يتيم = تحت <مشارك>/cv أو <مشارك>/evidence، مضى عليه أكثر من 48 ساعة، ولا يشير إليه participants.cv_path ولا
// participant_requirements.evidence_path. أي تعذّر في قراءة المراجع أو القوائم يوقف الحذف كله: قائمة مراجع ناقصة تحذف ملفًا مربوطًا
import { all, BUCKET, db, storage } from './core.ts';
import { orphanPaths, UPLOAD_LIMITS, UPLOAD_PURPOSES } from './upload-limits.js';

const PAGE = 1000;
async function list(path: string) {
  const out: any[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.from(BUCKET).list(path, { limit: PAGE, offset });
    if (error) throw new Error(`storage list ${path}: ${error.message}`);
    out.push(...(data || []));
    if ((data || []).length < PAGE) return out;
  }
}

export async function sweepOrphans() {
  // counting-exempt: مراجع الملفات لكل المشاركين، والعرض والاختبار منهم: ملف مربوط لا يُحذف أيًّا كان صاحبه
  const cv = await all((f, t) => db.from('participants').select('cv_path').not('cv_path', 'is', null).order('id').range(f, t));
  const ev = await all((f, t) => db.from('participant_requirements').select('evidence_path').not('evidence_path', 'is', null).order('participant_id').order('requirement_id').range(f, t));
  const referenced = new Set<string>([...cv.map((r: any) => r.cv_path), ...ev.map((r: any) => r.evidence_path)].filter(Boolean));
  const objects: { path: string; created_at: string | null }[] = [];
  for (const top of await list('')) {
    if (top.id) continue; // ملف في الجذر لا مجلد مشارك: لا يُمس
    for (const purpose of UPLOAD_PURPOSES) {
      for (const f of await list(`${top.name}/${purpose}`)) if (f.id) objects.push({ path: `${top.name}/${purpose}/${f.name}`, created_at: f.created_at || null });
    }
  }
  const orphans = orphanPaths(objects, referenced).slice(0, UPLOAD_LIMITS.sweepMax);
  let removed = 0;
  for (let i = 0; i < orphans.length; i += 100) {
    const chunk = orphans.slice(i, i + 100);
    const { error } = await storage.from(BUCKET).remove(chunk);
    if (error) { console.error('orphan remove:', error.message); continue; }
    removed += chunk.length;
  }
  return { scanned: objects.length, orphans: orphans.length, removed };
}
