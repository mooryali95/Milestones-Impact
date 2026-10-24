// ════════════════════════════════════════════════════════════════
// بنك المحتوى: مقاطع وملفات وروابط تُرفع مرة وتُوسم لمن هي
// ════════════════════════════════════════════════════════════════
// منهج كل مسار من المسارات الـ27 يتركب وحده من الوسوم، ويعرضه نشاط
// «منهج المسار» في الرحلة. المعاينة تريك ما يراه صاحب أي مسار.
import React, { useEffect, useState } from 'react';
import { DIM, DIMS, L } from '../leaders.js';
import { CONTENT_FIELDS, CONTENT_KIND, audienceLabel, contentToForm, reorderIds } from '../methodology.js';
import Form from '../Form.jsx';
import { Spinner, useUI } from '../ui.jsx';

function Move({ rows, id, reload, canWrite }) {
  const { toast } = useUI();
  if (!canWrite) return null;
  const go = async (dir) => {
    const ids = reorderIds(rows, 'content_items', id, dir);
    if (!ids) return;
    const r = await L('admin.reorder', { entity: 'content_items', ids });
    if (!r.success) return toast(r.message);
    reload();
  };
  return <><button className="la-mv" onClick={() => go(-1)} aria-label="نقل لأعلى">▲</button><button className="la-mv" onClick={() => go(1)} aria-label="نقل لأسفل">▼</button></>;
}

function Preview({ tracks }) {
  const [track, setTrack] = useState('');
  const [d, setD] = useState(null);
  useEffect(() => { if (track) { setD(null); L('admin.curriculum', { track }).then(setD); } }, [track]);
  return (
    <section className="la-card">
      <label className="la-row">
        <b>كما يراه صاحب مسار</b>
        <select value={track} onChange={(e) => setTrack(e.target.value)} aria-label="المسار">
          <option value="">اختر مسارًا</option>
          {tracks.map((t) => <option key={t.key} value={t.key}>{t.key}{t.title_ar ? ` · ${t.title_ar}` : ''}</option>)}
        </select>
      </label>
      {track && (!d ? <Spinner /> : !d.success ? <div className="la-err">{d.message}</div> : (
        <div className="la-grid">
          <div>
            <h4>مواد البنك ({d.items.length})</h4>
            {d.items.length ? <ol>{d.items.map((i) => <li key={i.id}>{i.title_ar} <small className="la-chip">{CONTENT_KIND[i.kind]}</small>{!i.required && <small className="la-chip">اختياري</small>}</li>)}</ol>
              : <p className="la-muted">لا مواد لهذا المسار بعد.</p>}
          </div>
          <div>
            <h4>أبواب الكتيب ({d.chapters.length})</h4>
            <ol>{d.chapters.map((c) => <li key={c.id}>{c.title} <small className="la-muted">{DIM[c.dimension]}</small></li>)}</ol>
          </div>
        </div>
      ))}
    </section>
  );
}

export default function ContentBank({ catalog, reload, canWrite }) {
  const { toast } = useUI();
  const [form, setForm] = useState(null);
  const items = catalog.content_items || [];
  const save = (base) => (v) => L('admin.save', { entity: 'content_items', row: { ...base, ...v } });
  const edit = (c) => setForm({
    title: c.id ? 'تحرير مادة' : 'مادة جديدة', fields: CONTENT_FIELDS, values: contentToForm(c),
    onSave: save(c.id ? { id: c.id } : { sort: items.filter((x) => (x.dimension || null) === (c.dimension || null)).length + 1 }),
    onDelete: c.id ? () => L('admin.delete', { entity: 'content_items', id: c.id }) : undefined,
  });
  const groups = [[null, 'للجميع'], ...DIMS.map((d) => [d, DIM[d]])];
  return (
    <>
      <p className="la-muted">
        ارفع المادة مرة واحدة وحدد لمن هي، فتظهر تلقائيًا لكل مسار يناسبها. أضف نشاط «منهج المسار» في أي مرحلة من «الرحلة والمتطلبات»
        ليعرض لكل مشارك مواد مساره، ويكتمل بمشاهدتها وفتحها فعلًا. أبواب الكتيب تبقى في «كتيب القائد».
      </p>
      <Preview tracks={catalog.tracks || []} />
      {groups.map(([dim, label]) => {
        const list = items.filter((x) => (x.dimension || null) === dim).sort((a, b) => a.sort - b.sort);
        return (
          <section key={dim || 'all'} className="la-card">
            <div className="la-row between">
              <b>{label} <small className="la-muted">({list.length})</small></b>
              {canWrite && <button className="la-link" onClick={() => edit({ kind: 'video', dimension: dim, required: true, active: true, min_pct: 90 })}>+ مادة</button>}
            </div>
            {list.length ? (
              <ul className="la-reqs">
                {list.map((c) => (
                  <li key={c.id} className={c.active ? '' : 'off'}>
                    <span>
                      {c.title_ar} <small className="la-chip">{CONTENT_KIND[c.kind]}</small>
                      <small className="la-chip">{audienceLabel(c)}</small>
                      {!c.required && <small className="la-chip">اختياري</small>}
                      {c.minutes ? <small className="la-muted"> {c.minutes} د</small> : null}
                    </span>
                    <span className="la-row">
                      <Move rows={items} id={c.id} reload={reload} canWrite={canWrite} />
                      <a className="la-link" href={c.url} target="_blank" rel="noopener noreferrer">افتح</a>
                      {canWrite && <button className="la-link" onClick={() => edit(c)}>تحرير</button>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="la-muted">لا مواد.</p>}
          </section>
        );
      })}
      {form && <Form {...form} onClose={(saved) => { setForm(null); if (saved) { toast('تم الحفظ'); reload(); } }} />}
    </>
  );
}
