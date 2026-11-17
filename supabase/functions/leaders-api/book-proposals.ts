// ════════════════════════════════════════════════════════════════
// مقترحات تعديل الكتاب الأم (المرحلة 4، الخطوة 1، اعتمدها المالك 2026-11-15)
// ════════════════════════════════════════════════════════════════
// المدير الكاتب يقترح نصًا بديلًا لقسم من باب، ويعرضه على اللجنة، ويعتمده المدير العام أو يرده بملاحظة.
// لا شيء هنا يكتب في handbook_modules: المعتمد يدخل إصدارًا جديدًا من المستودع (الخطوة 2)، فيبقى المصدر واحدًا.
import { audit, db, Fail, must } from './core.ts';
import { canEdit, canMove, checkProposal, isStale, proposalCounts, proposalView, REFLECTION, splitEdit, targetLabel, visibleTo } from './book-proposals.js';
import { sectionById, sectionIdOf } from './section-refs.js';

type Viewer = { kind: 'expert' | 'admin'; ref: string; name: string; role: string; write: boolean; superAdmin?: boolean };
const MOD_COLS = 'id, dimension, chapter_key, min_level, body_md, reflection_ar';

// الجدول يُنشئه ترحيل 20261116000000 (deploy-gate: tolerant): قبله يُقرأ الكتاب بلا مقترحات
async function proposalRows() {
  const { data, error } = await db.from('book_proposals').select('*').order('updated_at', { ascending: false }).limit(2000);
  return error ? null : (data as any[]);
}

/** المقترحات كما يراها القارئ، بقسمها الحالي بالهوية، مع عداداتها */
export async function proposalsFor(v: Viewer, mods: any[]) {
  const rows = await proposalRows();
  if (rows === null) return { ready: false, list: [], counts: proposalCounts([]) };
  const byId = new Map(mods.map((m) => [m.id, m]));
  const list = rows.filter((p) => visibleTo(v, p) && byId.has(p.module_id)).map((p) => {
    const s = p.section_id ? sectionById(p.section_id) : null;
    return proposalView(v, p, byId.get(p.module_id), s && !s.retired ? s.key : null);
  });
  return { ready: true, list, counts: proposalCounts(list) };
}

const actor = (v: Viewer) => v.ref;
// خطأ القاعدة كما هو: الجدول غير موجود قبل ترحيله، أو قيد تجاوزه النص، أو غير ذلك
const dbFail = (e: any) => (/does not exist|relation/.test(String(e?.message || ''))
  ? new Fail('المقترحات تُفعَّل بعد تطبيق ترحيلها، والكتاب يُقرأ الآن', 503, 'db_error')
  : /check constraint|violates/.test(String(e?.message || '')) ? new Fail('النص أو السبب أطول من المسموح', 400, 'invalid')
    : new Fail('تعذّر حفظ المقترح، حاول بعد قليل', 503, 'db_error'));
async function moduleOf(id: string) {
  const { data } = await db.from('handbook_modules').select(MOD_COLS).eq('id', id).maybeSingle();
  return data as any;
}

// إنشاء مقترح أو تعديل مسودة كاتبها. submit: يُعرض على اللجنة مباشرة
export async function saveProposal(v: Viewer, b: any) {
  if (!v.write || v.kind !== 'admin') throw new Fail('اقتراح التعديل للمدير الكاتب', 403, 'forbidden');
  let prev: any = null;
  if (b?.id) {
    const { data } = await db.from('book_proposals').select('*').eq('id', String(b.id)).maybeSingle();
    if (!data) throw new Fail('المقترح غير موجود', 404, 'not_found');
    if (!canEdit(v, data)) throw new Fail('يعدّل المقترح كاتبه ما دام مسودة أو قيد المراجعة', 403, 'forbidden');
    prev = data;
  }
  const mod = await moduleOf(String(prev?.module_id || b?.module_id || ''));
  // تعديل مقترح قائم: قسمه الحالي بالهوية، وأصله يُحدَّث إلى نص القسم الآن (فيزول التقادم بالتحديث)
  const s = prev?.section_id ? sectionById(prev.section_id) : null;
  const section = prev ? (s && !s.retired ? s.key : prev.section) : b?.section;
  const c = checkProposal({ ...b, section }, mod);
  if (c.error) throw new Fail(c.error, 400, 'invalid');
  const val = c.value!;
  const status = b?.submit ? 'review' : (prev?.status || 'draft');
  const row: Record<string, unknown> = {
    module_id: val.module_id, section: val.section, section_id: val.section && val.section !== REFLECTION ? sectionIdOf(mod.dimension, mod.chapter_key, val.section) : null,
    base_md: val.base_md, proposed_md: val.proposed_md, reason: val.reason, status, updated_at: new Date().toISOString(),
  };
  // التعديل بحارس الحالة نفسها: إن اعتُمد المقترح أو رُد بين القراءة والكتابة لا يُكتب فوق القرار
  const q = prev
    ? db.from('book_proposals').update(row).eq('id', prev.id).eq('status', prev.status).select('id').maybeSingle()
    : db.from('book_proposals').insert({ ...row, author_ref: actor(v), author_name: v.name }).select('id').single();
  const { data, error } = await q;
  if (error) throw dbFail(error);
  if (!data) throw new Fail('تغيّرت حالة المقترح أثناء الحفظ (اعتُمد أو رُد). أعد تحميل الكتاب', 409, 'changed');
  await audit('admin', v.ref, prev ? 'book.proposal-edit' : 'book.proposal', 'book_proposals', (data as any).id, prev ? { status: prev.status } : null, { module_id: val.module_id, section: val.section, status });
  return { success: true, id: (data as any).id, status };
}

// نقل المقترح بين حالاته: العرض والسحب لكاتبه، والاعتماد والرد للمدير العام بملاحظة
export async function moveProposal(v: Viewer, b: any) {
  const id = String(b?.id || '');
  const to = String(b?.to || '');
  const note = String(b?.note || '').trim().slice(0, 2000);
  const { data: p } = await db.from('book_proposals').select('*').eq('id', id).maybeSingle();
  if (!p) throw new Fail('المقترح غير موجود', 404, 'not_found');
  if (!canMove(v, p, to)) {
    throw new Fail(to === 'approved' || to === 'rejected' ? 'اعتماد المقترح أو رده للمدير العام، وما كان قيد المراجعة' : 'لا يمكن نقل المقترح إلى هذه الحالة', 403, 'forbidden');
  }
  if (to === 'rejected' && note.length < 5) throw new Fail('اكتب سبب الرد ليعرف الكاتب ما يصلحه', 400, 'invalid');
  // يُعتمد النص الذي رآه المعتمد: إن عدّله كاتبه بعد فتحه يُرفض القرار ويُعاد عرضه
  if (to === 'approved' && String(b?.seen || '') !== String(p.updated_at || '')) throw new Fail('عدّل الكاتب المقترح بعد أن فتحته. راجع النص الجديد ثم اعتمده', 409, 'changed');
  if (to === 'approved') {
    const mod = await moduleOf(p.module_id);
    const s = p.section_id ? sectionById(p.section_id) : null;
    if (isStale({ ...p, section: s && !s.retired ? s.key : p.section }, mod)) throw new Fail('القسم تغيّر بعد كتابة المقترح. يحدّثه كاتبه على النص الحالي ثم يُعتمد', 409, 'stale');
  }
  const decided = to === 'approved' || to === 'rejected';
  const done = must(await db.from('book_proposals').update({
    status: to, updated_at: new Date().toISOString(),
    ...(decided ? { decided_by: v.ref, decided_at: new Date().toISOString(), decision_note: note } : {}),
    // الإعادة إلى مسودة من الاعتماد تمحو القرار، فيُراجع من جديد
    ...(to === 'draft' ? { decided_by: null, decided_at: null, decision_note: '' } : {}),
  }).eq('id', id).eq('status', p.status).eq('updated_at', p.updated_at).select('id')) as any[];
  if (!done?.length) throw new Fail('تغيّر المقترح للتو (قرار أو تعديل آخر). أعد تحميل الكتاب', 409, 'changed');
  await audit('admin', v.ref, `book.proposal-${to}`, 'book_proposals', id, { status: p.status }, { status: to, note: note || undefined });
  return { success: true, status: to };
}

// محرر الباب في الاستوديو (المرحلة 4، الخطوة 3): الباب كاملًا ← مقترح لكل قسم تغيّر، ولسؤال التأمل إن تغيّر.
// كلها تُتحقق قبل أن يُحفظ أي منها، ومقترح الكاتب المفتوح على القسم نفسه يُحدَّث ولا يُكرَّر.
export async function proposeFromEdit(v: Viewer, b: any) {
  if (!v.write || v.kind !== 'admin') throw new Fail('اقتراح التعديل للمدير الكاتب', 403, 'forbidden');
  const mod = await moduleOf(String(b?.module_id || ''));
  if (!mod) throw new Fail('الباب غير موجود', 404, 'not_found');
  // التعديل على النص الذي فتحه المحرر: إن تغيّر الباب بعده (إصدار أو مقترح دخل) لا يُحسب الفرق على نص لم يره
  if ('base_body_md' in (b || {}) && (String(b.base_body_md ?? '') !== String(mod.body_md ?? '') || String(b.base_reflection_ar ?? '').trim() !== String(mod.reflection_ar ?? '').trim())) {
    throw new Fail('تغيّر الباب منذ فتحت المحرر (صدر إصدار جديد). أغلق المحرر وافتحه ليُبنى تعديلك على النص الحالي', 409, 'stale');
  }
  const split = 'body_md' in (b || {}) ? splitEdit(mod.body_md, b.body_md) : { changes: [] as any[] };
  if ((split as any).error) throw new Fail((split as any).error, 400, 'invalid');
  const changes = [...(split as any).changes];
  if ('reflection_ar' in (b || {}) && String(b.reflection_ar ?? '').trim() !== String(mod.reflection_ar ?? '').trim()) changes.push({ section: REFLECTION, proposed: b.reflection_ar });
  if (!changes.length) throw new Fail('لم يتغير شيء في متن الباب ولا في سؤال التأمل', 400, 'unchanged');
  const vals = changes.map((c) => {
    const r = checkProposal({ section: c.section, proposed_md: c.proposed, reason: b?.reason }, mod);
    if (r.error) throw new Fail(`${targetLabel(c.section)}: ${r.error}`, 400, 'invalid');
    return r.value!;
  });
  const { data: open, error: oe } = await db.from('book_proposals').select('id, section, section_id, status').eq('module_id', mod.id).eq('author_ref', v.ref).in('status', ['draft', 'review']);
  if (oe) throw dbFail(oe);
  const now = new Date().toISOString();
  const rows = vals.map((val) => {
    // المقترح المفتوح على القسم نفسه بهويته (يبقى صحيحًا إن تغيّر العنوان بإصدار)، وإلا بعنوانه
    const sectionId = val.section !== REFLECTION && val.section ? sectionIdOf(mod.dimension, mod.chapter_key, val.section) : null;
    const prev = (open || []).find((p: any) => (sectionId && p.section_id ? p.section_id === sectionId : p.section === val.section));
    // «احفظه مسودة» لا يسحب مقترحًا معروضًا على اللجنة: يبقى قيد المراجعة بنصه الجديد
    const status = b?.submit === false && prev?.status !== 'review' ? 'draft' : 'review';
    return { val, prev, row: { module_id: mod.id, section: val.section, section_id: sectionId, base_md: val.base_md, proposed_md: val.proposed_md, reason: val.reason, updated_at: now, status } };
  });
  // الأقسام كلها في معاملة واحدة (20261117100000): تُحفظ جميعًا أو لا شيء، وسجل التدقيق معها
  const { data: saved, error: se } = await db.rpc('book_proposals_save', {
    p_module: mod.id, p_author_ref: v.ref, p_author_name: v.name, p_now: now,
    p_rows: rows.map(({ val, prev, row }) => ({ ...row, label: targetLabel(val.section), prev_id: prev?.id || null, prev_status: prev?.status || null })),
  });
  let ids: string[];
  if (!se) ids = (saved || []).map(String);
  else if (se.code === 'P0409') throw new Fail(`${se.message}: تغيّرت حالة مقترحك عليه أثناء الحفظ (اعتُمد أو رُد). لم يُحفظ شيء من تعديلك. أعد فتح المحرر`, 409, 'changed');
  else if (se.code === 'PGRST202' || se.code === '42883') ids = await saveOneByOne(v, mod, rows);
  else throw dbFail(se);
  return { success: true, count: ids.length, ids, sections: vals.map((x) => targetLabel(x.section)) };
}

// قبل الترحيل 20261117100000: كل قسم وحده كما كان، فالدالة الذرية غير موجودة بعد
async function saveOneByOne(v: Viewer, mod: any, rows: { val: any; prev: any; row: any }[]) {
  const ids: string[] = [];
  for (const { val, prev, row } of rows) {
    const { data, error } = prev
      ? await db.from('book_proposals').update(row).eq('id', prev.id).eq('status', prev.status).select('id').maybeSingle()
      : await db.from('book_proposals').insert({ ...row, author_ref: v.ref, author_name: v.name }).select('id').single();
    if (error) throw dbFail(error);
    if (!data) throw new Fail(`${targetLabel(val.section)}: تغيّرت حالة مقترحك عليه أثناء الحفظ (اعتُمد أو رُد). أعد فتح المحرر`, 409, 'changed');
    ids.push((data as any).id);
    await audit('admin', v.ref, prev ? 'book.proposal-edit' : 'book.proposal', 'book_proposals', (data as any).id, null, { module_id: mod.id, section: val.section, status: row.status, from: 'studio' });
  }
  return ids;
}
