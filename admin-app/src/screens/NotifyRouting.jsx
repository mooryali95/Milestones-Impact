// ════════════════════════════════════════════════════════════════
// «التوجيه» في مركز البريد: أين يصل كل إشعار للإدارة (مركز الإشعارات، المرحلة 4، التصور 6.2)
// ════════════════════════════════════════════════════════════════
// الفهرس والقرار من _shared/notify-routing.js نفسه الذي تقرر به الدوال، فالمصفوفة هنا ما يجري فعلًا لا وصف له.
// القراءة من admin.notify-routing (الإعداد المحفوظ وعدّ آخر 7 أيام)، وصحة القنوات من admin.ops-health (ops-watch.js)
// بالحكم نفسه في ops-health.js. الحفظ عبر admin.settings-save للمالك وحده: الخادم يرفض إطفاء صف مقفل ويكتب السجل
// ويرسل بريدًا أمنيًا للملاك بما تغير.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { dateTime, L } from '../leaders.js';
import { Spinner, useUI } from '../ui.jsx';
import { useOpsHealth } from '../ops-watch.js';
import { agoAr, slackLabel } from '../../../supabase/functions/leaders-api/ops-health.js';
import {
  CATEGORIES, CHANNEL_AR, CHANNELS, compactRows, DEFAULT_PRESET, impactOf, matrixOf, paymentFallback, PRESETS, TIER_AR,
} from '../../../supabase/functions/_shared/notify-routing.js';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourAr = (h) => `${String(h).padStart(2, '0')}:00`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// المسودة كما تُحفظ: الإعداد الجاهز، والصفوف المخالفة له وحدها، وساعة الملخص
export const draftValue = (d) => ({ preset: d.preset, rows: compactRows(d.preset, d.rows), digest_hour: d.digest_hour });

// حال Slack المفترضة للمعاينة من صحة القنوات: يعمل إن ضُبط بوته أو الرابط، وإلا غير مضبوط
export const previewState = (h) => (h ? (h.slack?.configured || h.alerts?.webhook ? 'ok' : 'unconfigured') : 'ok');

function Health({ h, failed }) {
  if (failed) return <p className="la-muted small">تعذّرت قراءة صحة القنوات الآن.</p>;
  if (!h) return <Spinner />;
  const s = h.slack || {};
  const fine = s.configured && !(s.error_at && !(Date.parse(s.ok_at || 0) >= Date.parse(s.error_at)));
  const when = (iso) => (iso ? agoAr(iso) || dateTime(iso) : null);
  return (
    <ul className="pay-health nr-health">
      <li className={fine ? 'ok' : 'bad'}><b>{fine ? '✓' : '✗'}</b><span>Slack</span>
        <small className="la-muted">{!s.configured ? `غير مضبوط${s.missing?.length ? `: ينقص ${s.missing.join(' و')}` : ''}، فالمهم يصل بالبريد والملخص ببريد واحد يوميًا`
          : `${s.ok_at ? `آخر نجاح ${when(s.ok_at)}` : 'لم يُنشر شيء بعد'}${s.error ? ` · آخر خطأ: ${slackLabel(s.error)} ${when(s.error_at) || ''}` : ''}`}</small></li>
      <li className={h.alerts?.webhook ? 'ok' : ''}><b>{h.alerts?.webhook ? '✓' : '·'}</b><span>رابط التنبيه</span><small className="la-muted">{h.alerts?.webhook ? 'مضبوط، ويُعد قناة Slack حين يصل' : 'غير مضبوط (اختياري)'}</small></li>
      <li className={h.alerts?.email ? 'ok' : 'bad'}><b>{h.alerts?.email ? '✓' : '✗'}</b><span>بريد التنبيه</span><small className="la-muted">{h.alerts?.email ? 'مضبوط: الحرج والمقفل يصلانه دائمًا' : 'غير مضبوط: لا يصلك بريد تنبيه. أضف LEADERS_ALERT_EMAIL'}</small></li>
    </ul>
  );
}

function Impact({ d, saved, draft, state }) {
  const now = impactOf(d.counts, saved, state, d.days);
  const next = impactOf(d.counts, draft, state, d.days);
  const total = Object.values(d.counts || {}).reduce((n, x) => n + x, 0);
  return (
    <div className="nr-impact" role="status" aria-live="polite">
      <p>لو طُبق هذا الإعداد على آخر {d.days} أيام لوصلك <b data-impact="draft">{next.email}</b> بريدًا بدل <b data-impact="saved">{now.email}</b> بالإعداد المحفوظ، و<b>{next.slack}</b> سطرًا في Slack{next.digest ? `، ودخل الملخص ${next.digest} حدثًا` : ''}.</p>
      <small className="la-muted">
        من {total} حدثًا في سجل التنبيهات والإشعارات{d.capped ? ' (بلغ سقف القراءة، فالعدد أكبر)' : ''}{state === 'ok' ? '، على فرض أن Slack يعمل' : '، وSlack غير مضبوط فالمهم يتحول إلى البريد'}.
        {d.alert_mail_week != null && ` ووصل بريد التنبيه فعلًا ${d.alert_mail_week} رسالة في المدة نفسها.`}
        {' '}تقدير: فترات التهدئة القائمة تخفض الفعلي عنه.
        {d.count_errors?.length > 0 && ` تعذّرت قراءة بعض المصادر (${d.count_errors.join('، ')})، فالمعاينة ناقصة.`}
      </small>
    </div>
  );
}

export default function NotifyRouting() {
  const { toast, confirm } = useUI();
  const [d, setD] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // مجموعات الجدول تُطوى بفئتها (المرحلة 3 من تدقيق اللوحة)، والطيّ عرض فقط: الصفوف المطوية تبقى في المسودة كما هي
  const [folded, setFolded] = useState(() => new Set());
  const fold = (cat) => setFolded((s) => { const n = new Set(s); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
  const ops = useOpsHealth(true);
  const load = useCallback(async () => {
    const r = await L('admin.notify-routing');
    setD(r);
    if (r?.success) setDraft(paymentFallback(r.settings, r.legacy_payment_owner, r.saved));
  }, []);
  useEffect(() => { load(); }, [load]);
  const base = useMemo(() => (d?.success ? paymentFallback(d.settings, d.legacy_payment_owner, d.saved) : null), [d]);
  const matrix = useMemo(() => (draft ? matrixOf(draftValue(draft)) : []), [draft]);
  if (!d) return <section className="la-card" aria-labelledby="nr-title"><h3 id="nr-title">التوجيه</h3><Spinner /></section>;
  if (!d.success) return <section className="la-card" aria-labelledby="nr-title"><h3 id="nr-title">التوجيه</h3><p className="la-err" role="alert">{d.message}</p></section>;
  const canEdit = d.owner && d.ready;
  const dirty = !same(draftValue(draft), draftValue(base));
  const state = previewState(ops.data);
  const setCell = (e, c, on) => setDraft((cur) => {
    const row = { ...e.want, [c]: on };
    return { ...cur, rows: { ...cur.rows, [e.key]: row } };
  });
  const save = async () => {
    if (!(await confirm('حفظ توجيه الإشعارات؟ يصل الملاك جميعًا بريد أمني بما تغير، ويُسجَّل الحفظ في سجل التدقيق.'))) return;
    setBusy(true); setErr('');
    const r = await L('admin.settings-save', { group: 'notifications', values: draftValue(draft) });
    setBusy(false);
    if (!r.success) { setErr(r.message); toast(r.message); return; }
    toast(r.notice?.mailed ? `حُفظ التوجيه، وأُرسل البريد الأمني إلى ${r.notice.mailed} من الملاك` : 'حُفظ التوجيه');
    load();
  };
  const groups = Object.entries(CATEGORIES).map(([cat, label]) => [cat, label, matrix.filter((e) => e.category === cat)]).filter(([, , rows]) => rows.length);
  return (
    <section className="la-card nr" aria-labelledby="nr-title" data-section="routing">
      <div className="la-row between">
        <h3 id="nr-title">التوجيه <small className="la-muted">· أين يصل كل إشعار للإدارة</small></h3>
        {d.updated && <small className="la-muted">آخر تعديل: {d.updated.by} · {dateTime(d.updated.at)}</small>}
      </div>
      <><p className="la-muted small">الحرج بريد وSlack، والمهم Slack، والمعلوماتي في الملخص اليومي.</p><details className="la-more small muted"><summary>كيف يعمل؟</summary><p>الحرج بالبريد وSlack معًا، والمهم في Slack فورًا والبريد احتياطه إن لم يصل، والمعلوماتي في الملخص اليومي. الصفوف المقفلة (الأمان والمال والحذف وطلبات التواصل) بريدها دائم، ويمكن إضافة Slack إليها فقط. رموز الدخول وبريد المشاركين لا يمر بهذا الجدول.</p></details></>
      {!d.ready && <p className="la-muted" role="status">مخزن الإعدادات لم يُرحَّل بعد، فيعمل «متوازن» ولا يُحفظ تعديل.</p>}
      {!d.owner && <p className="la-muted small" data-owner-only>الحفظ للمالك وحده. ترى هنا ما يجري الآن.</p>}
      {d.legacy_payment_owner && !d.saved && <p className="la-chip warn">مفتاح «تنبيه الإدارة عند كل دفعة» القديم مفتوح، فصفا الدفعة والاسترداد بالبريد مع Slack. عدّلهما هنا واحفظ ليحل المركز محله.</p>}

      <div className="nr-presets" role="radiogroup" aria-label="الإعداد الجاهز">
        {Object.entries(PRESETS).map(([k, p]) => (
          <label key={k} className={`nr-preset ${draft.preset === k ? 'on' : ''}`}>
            <input type="radio" name="nr-preset" value={k} checked={draft.preset === k} disabled={!canEdit} onChange={() => setDraft((cur) => ({ ...cur, preset: k }))} />
            <b>{p.label}</b>{k === DEFAULT_PRESET && <small className="la-muted"> (الافتراضي)</small>}
          </label>
        ))}
        {canEdit && Object.keys(draft.rows).length > 0 && <button type="button" className="btn-sm ghost" onClick={() => setDraft((cur) => ({ ...cur, rows: {} }))}>أعد الصفوف إلى الإعداد الجاهز</button>}
      </div>

      <div className="la-table-wrap">
        <table className="la-table nr-matrix t24">
          <thead><tr><th scope="col">الحدث</th><th scope="col">الطبقة</th>{CHANNELS.map((c) => <th key={c} scope="col">{CHANNEL_AR[c]}</th>)}<th scope="col">{CHANNEL_AR.log}</th></tr></thead>
          {groups.map(([cat, label, rows]) => (
            <tbody key={cat} id={`nr-g-${cat}`}>
              <tr className="nr-cat"><th colSpan={6} scope="colgroup">
                <button type="button" className="nr-fold" aria-expanded={!folded.has(cat)} aria-controls={`nr-g-${cat}`} onClick={() => fold(cat)}>
                  <span aria-hidden="true">{folded.has(cat) ? '◂' : '▾'}</span> {label} <small className="la-muted">({rows.length}{rows.some((e) => e.custom) ? ` · ${rows.filter((e) => e.custom).length} معدّل` : ''})</small>
                </button>
              </th></tr>
              {!folded.has(cat) && rows.map((e) => {
                const none = !CHANNELS.some((c) => e.want[c]);
                return (
                  <tr key={e.key} data-event={e.key} className={e.custom ? 'custom' : ''}>
                    <th scope="row">{e.label}{e.locked && <span className="la-chip nr-lock" title="بريده لا يُطفأ">لا يمكن إيقافه</span>}{e.custom && <small className="la-muted"> · معدّل</small>}</th>
                    <td><small className="la-muted">{TIER_AR[e.tier]}</small></td>
                    {CHANNELS.map((c) => {
                      const allowed = e.allow.includes(c);
                      const lockedMail = e.locked && c === 'email';
                      return (
                        <td key={c}>
                          {allowed ? <input type="checkbox" checked={!!e.want[c]} disabled={!canEdit || lockedMail}
                            aria-label={`${e.label}: ${CHANNEL_AR[c]}`} onChange={(x) => setCell(e, c, x.target.checked)} /> : <span className="la-muted" aria-label={`${CHANNEL_AR[c]} غير متاح لهذا الحدث`}>·</span>}
                        </td>
                      );
                    })}
                    <td>{none ? <span className="la-chip">السجل</span> : <span className="la-muted">·</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      <div className="la-grid2">
        <div>
          <h4>صحة القنوات</h4>
          <Health h={ops.data} failed={ops.failed} />
        </div>
        <div>
          <h4>معاينة الأثر</h4>
          <Impact d={d} saved={base} draft={draft} state={state} />
          <h4>موعد الملخص اليومي</h4>
          <label className="la-row">
            <span>كل يوم الساعة</span>
            <select aria-label="ساعة الملخص اليومي بتوقيت الرياض" value={draft.digest_hour} disabled={!canEdit} onChange={(x) => setDraft((cur) => ({ ...cur, digest_hour: Number(x.target.value) }))}>
              {HOURS.map((h) => <option key={h} value={h} dir="ltr">{hourAr(h)}</option>)}
            </select>
            <span>بتوقيت الرياض</span>
          </label>
          <small className="la-muted">في سلسلة «الملخص اليومي» في Slack، ولا يُنشر فارغًا. إن لم يصل فبريد واحد بدله.</small>
        </div>
      </div>
      {err && <p className="la-err" role="alert">{err}</p>}
      {canEdit && (
        <div className="la-row">
          <button className="btn-sm primary" disabled={busy || !dirty} onClick={save}>{busy ? 'لحظة…' : 'احفظ التوجيه'}</button>
          <button type="button" className="btn-sm ghost" disabled={busy || !dirty} onClick={() => { setDraft(base); setErr(''); }}>تراجع</button>
        </div>
      )}
    </section>
  );
}
