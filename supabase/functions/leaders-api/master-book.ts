// ════════════════════════════════════════════════════════════════
// الكتاب الأم: قراءته وتعليقات الخبراء والإدارة عليه (المرحلة 1 من التصور، اعتمده المالك 2026-11-15)
// ════════════════════════════════════════════════════════════════
// القارئ واحد في اللوحة وبوابة الخبير. الخبير يقرأ إن كان عضوًا فاعلًا في لجنة المحتوى أو القياس (bookAccess)،
// والمدير بأي دور (المراقب يقرأ ولا يكتب). يكتب التعليق الخبير والمدير الكاتب، ويحذفه كاتبه، ويحسمه المدير الكاتب.
// المتن والاختبار يُرسلان كما هما: هذا كتاب المراجعين، والإجابة الصحيحة جزء مما يراجعونه.
import { all, audit, CONFIG, db, Fail, must, sha256Hex } from './core.ts';
import { canDelete, canResolve, cleanComment, commentTarget, draftChapters, openCounts, orderChapters, rowChapterId, threads, versionFromMigration, authorRole, bookAccess, shareRoster, toggleCommittee } from './master-book.js';
import { DRAFTS } from './master-book-drafts.js';
import { sectionById, sectionIdOf } from './section-refs.js';

type Viewer = { kind: 'expert' | 'admin'; ref: string; name: string; role: string; write: boolean };

export const expertViewer = (e: any): Viewer => {
  if (!bookAccess(e)) throw new Fail('الكتاب الأم متاح لأعضاء لجنتي المحتوى والقياس', 403, 'book_access');
  return { kind: 'expert', ref: String(e.id), name: String(e.full_name || e.email || 'خبير'), role: authorRole('expert', { committees: e.committees || [] }), write: true };
};
// يكتب المدير بصلاحية الكتابة وعامل ثانٍ (كما في writer)، ويقرأ الباقون
export const adminViewer = (a: { email: string; role: string; method?: string }): Viewer => ({
  kind: 'admin', ref: a.email, name: a.email.split('@')[0], role: authorRole('admin', { role: a.role }),
  write: (a.role === 'admin' || a.role === 'super_admin') && a.method !== 'email',
});

// بصمة الباب: يُعرف بها أن تعليقًا كُتب على نص تغيّر بعده
const fp = (m: any) => sha256Hex(`${m.body_md || ''}\u0000${m.quiz_md || ''}\u0000${m.reflection_ar || ''}`);

async function modules() {
  const rows = must(await db.from('handbook_modules').select('id, dimension, chapter_key, sort, title_ar, min_level, body_md, quiz_md, reflection_ar, updated_at')) as any[];
  return orderChapters(rows);
}
// الجدول يُنشئه ترحيل 20261115160000 (deploy-gate: tolerant): قبله يُقرأ الكتاب بلا تعليقات
async function commentRows() {
  const { data, error } = await db.from('book_comments').select('*').order('created_at').limit(5000);
  // تعليق المسودة بلا module_id (ترحيل 20261115190000): معرّفه في القارئ «draft:مفتاحها» كما تُعرض
  // بهوية القسم (المرحلة 2): التعليق يظهر تحت عنوان قسمه الحالي إن تغيّر بعده، والملغى يبقى بعنوانه المحفوظ
  return error ? null : (data as any[]).map((r) => {
    const sec = r.section_id ? sectionById(r.section_id) : null;
    return { ...r, module_id: rowChapterId(r), section: sec && !sec.retired ? sec.key : r.section };
  });
}
// المسودات المعروضة على اللجنة بصيغة الأبواب، من وثائقها (master-book-drafts.js المولَّد)
const drafts = () => draftChapters(DRAFTS as any[]);
async function version() {
  const { data } = await db.from('schema_migrations').select('name').like('name', '%\\_leaders\\_handbook\\_%').order('name', { ascending: false }).limit(1);
  return versionFromMigration(data?.[0]?.name) || null;
}

export async function book(v: Viewer) {
  const [mods, rows, ver] = await Promise.all([modules(), commentRows(), version()]);
  const ds = drafts();
  const prints = Object.fromEntries(await Promise.all([...mods.map(async (m) => [m.id, await fp(m)]), ...ds.map(async (d) => [d.id, await fp({ body_md: d.md })])]));
  const list = threads(rows || [], prints);
  const mine = (c: any) => ({ ...c, mine: canDelete(v, c), replies: (c.replies || []).map((r: any) => ({ ...r, mine: canDelete(v, r) })) });
  // للإدارة وحدها: من يقرأ الكتاب الآن ومن يمكن إضافته، ورابط بوابة الخبراء
  const share = v.kind === 'admin'
    ? { portal_url: `${CONFIG.appUrl}/x`, ...shareRoster(((await db.from('experts').select('id, full_name, email, title, status, committees').neq('status', 'rejected').limit(500)).data || []) as any[]) }
    : null;
  // للإدارة وحدها (المرحلة 3 من «الكتاب الأم»): ما يعتمد على كل باب من القاعدة، فيُعرف حجم أي تعديل قبله.
  // تعذّر القراءة لا يُسقط الكتاب: تُعرض اللوحة بلا هذه الأجزاء
  const deps = v.kind === 'admin' ? await bookDeps().catch(() => null) : null;
  return {
    success: true, version: ver, generated_at: new Date().toISOString(), share, deps,
    viewer: { kind: v.kind, name: v.name, role: v.role, write: v.write, resolve: canResolve(v) },
    comments_ready: rows !== null,
    chapters: [...mods.map((m) => ({
      id: m.id, dimension: m.dimension, chapter_key: m.chapter_key, sort: m.sort, title: m.title_ar, min_level: m.min_level,
      md: m.body_md || '', quiz_md: m.quiz_md || '', reflection: m.reflection_ar || '', updated_at: m.updated_at,
    })), ...ds],
    comments: list.map(mine),
    counts: openCounts(list),
  };
}

export async function addComment(v: Viewer, b: any) {
  if (!v.write) throw new Fail('حسابك للقراءة فقط', 403, 'read_only');
  const mods = [...await modules(), ...drafts().map((d) => ({ id: d.id, body_md: d.md }))];
  const c = cleanComment(b, { modules: mods.map((m) => ({ id: m.id, body_md: m.body_md })) });
  if (c.error) throw new Fail(c.error, 400, 'invalid');
  const val = c.value!;
  if (val.parent_id) {
    const { data: p } = await db.from('book_comments').select('*').eq('id', val.parent_id).maybeSingle();
    if (!p || p.deleted_at || p.parent_id || rowChapterId(p) !== val.module_id) throw new Fail('التعليق المردود عليه غير موجود', 400, 'invalid');
  }
  const mod = mods.find((m) => m.id === val.module_id);
  const target = commentTarget(val.module_id);
  const row: Record<string, unknown> = { ...val, ...target, fingerprint: await fp(mod), author_kind: v.kind, author_ref: v.ref, author_name: v.name, author_role: v.role };
  if (!target.draft_key) delete row.draft_key;
  // هوية القسم للباب (لا للمسودة ولا للباب كله)، فيتبع التعليق قسمه إن تغيّر عنوانه
  const sid = !target.draft_key && val.section ? sectionIdOf(mod.dimension, mod.chapter_key, val.section) : null;
  if (sid) row.section_id = sid;
  let { data, error } = await db.from('book_comments').insert(row).select('id').single();
  // قبل ترحيل section_id (20261115200000) يُحفظ التعليق بعنوانه وحده
  if (error && row.section_id) { delete row.section_id; ({ data, error } = await db.from('book_comments').insert(row).select('id').single()); }
  if (error) throw new Fail(target.draft_key ? 'التعليق على المسودات يُفعَّل بعد تطبيق ترحيله، وقراءتها متاحة الآن' : 'تعذّر حفظ التعليق، حاول بعد قليل', 503, 'db_error');
  await audit(v.kind === 'admin' ? 'admin' : 'system', v.kind === 'admin' ? v.ref : `expert:${v.ref}`, 'book.comment', 'book_comments', (data as any).id, null, { module_id: val.module_id, section: val.section, reply: !!val.parent_id });
  return { success: true, id: (data as any).id };
}

export async function deleteComment(v: Viewer, b: any) {
  const id = String(b?.id || '');
  const { data: c } = await db.from('book_comments').select('id, author_kind, author_ref, deleted_at').eq('id', id).maybeSingle();
  if (!c || c.deleted_at) throw new Fail('التعليق غير موجود', 404, 'not_found');
  if (!canDelete(v, c)) throw new Fail('يحذف التعليق كاتبه وحده', 403, 'forbidden');
  must(await db.from('book_comments').update({ deleted_at: new Date().toISOString() }).eq('id', id));
  await audit(v.kind === 'admin' ? 'admin' : 'system', v.kind === 'admin' ? v.ref : `expert:${v.ref}`, 'book.comment-delete', 'book_comments', id);
  return { success: true };
}

export async function setStatus(v: Viewer, b: any) {
  if (!canResolve(v)) throw new Fail('حسم التعليقات للإدارة', 403, 'forbidden');
  const id = String(b?.id || '');
  const status = b?.status === 'open' ? 'open' : 'resolved';
  const { data: c } = await db.from('book_comments').select('id, parent_id, status, deleted_at').eq('id', id).maybeSingle();
  if (!c || c.deleted_at || c.parent_id) throw new Fail('التعليق غير موجود', 404, 'not_found');
  must(await db.from('book_comments').update(status === 'resolved'
    ? { status, resolved_by: v.ref, resolved_at: new Date().toISOString() }
    : { status, resolved_by: null, resolved_at: null }).eq('id', id));
  await audit('admin', v.ref, `book.comment-${status}`, 'book_comments', id, { status: c.status }, { status });
  return { success: true };
}

// إضافة خبير إلى لجنة أو إزالته منها من نافذة المشاركة: العضوية نفسها التي يضبطها ملف الخبير (experts.committees)
export async function setReader(a: { email: string }, b: any) {
  const id = String(b?.expert_id || '');
  const { data: e } = await db.from('experts').select('id, full_name, status, committees').eq('id', id).maybeSingle();
  if (!e) throw new Fail('الخبير غير موجود', 404, 'not_found');
  const next = toggleCommittee(e.committees || [], String(b?.committee || ''), b?.on !== false);
  if (!next) throw new Fail('اللجنة غير معروفة', 400, 'invalid');
  if (b?.on !== false && e.status !== 'active') throw new Fail('فعّل ملف الخبير أولًا من قسم الخبراء، ثم أضفه إلى اللجنة', 400, 'inactive');
  const { error } = await db.from('experts').update({ committees: next }).eq('id', e.id);
  if (error) throw new Fail('تعذّر حفظ العضوية، حاول بعد قليل', 503, 'db_error');
  await audit('admin', a.email, 'book.reader', 'experts', e.id, { committees: e.committees || [] }, { committees: next });
  return { success: true, committees: next };
}

// ما يعتمد على الأبواب في القاعدة: فقرات القياس في الأدوات الفاعلة، وأدوات المختبر، ومن أكمل الباب (فاختباره مقفل).
// المسارات ووثيقة المبادرة محتوى في المستودع، فيقرؤها القارئ من مصدرها (shared/master-book/deps.js)
async function bookDeps() {
  const [ins, questions, labs, progress] = await Promise.all([
    db.from('instruments').select('id, key, title_ar, active').then((r: any) => (r.data || []) as any[]),
    all((f, t) => db.from('questions').select('code, dimension, chapter_key, competency_ar, instrument_id').eq('active', true).order('id').range(f, t)),
    db.from('lab_items').select('key, dimension, chapter_key, title_ar, min_level, active').order('sort').then((r: any) => (r.data || []) as any[]),
    all((f, t) => db.from('handbook_progress').select('module_id').order('participant_id').order('module_id').range(f, t)),
  ]);
  const live = new Map(ins.filter((i: any) => i.active).map((i: any) => [i.id, i.title_ar || i.key]));
  const completions: Record<string, number> = {};
  for (const r of progress as any[]) completions[r.module_id] = (completions[r.module_id] || 0) + 1;
  return {
    questions: (questions as any[]).filter((q) => live.has(q.instrument_id) && q.chapter_key)
      .map((q) => ({ code: q.code, dimension: q.dimension, chapter_key: q.chapter_key, competency: q.competency_ar || null, instrument: live.get(q.instrument_id) })),
    labs: labs.filter((l: any) => l.active !== false).map((l: any) => ({ key: l.key, dimension: l.dimension, chapter_key: l.chapter_key, title: l.title_ar, min_level: l.min_level })),
    completions,
  };
}
