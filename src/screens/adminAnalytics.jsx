import React from "react";
import { RESULT } from "../lib/api";
import StateNotice from "../components/StateNotice";
import { fmtShort } from "../lib/dateUtils";

// ════════════════════════════════════════════════════════════════
// التحليلات — كم زيارةً فُتحت، ولأي صفحة
// ════════════════════════════════════════════════════════════════
// ══ ما تقوله هذه الأرقام وما لا تقوله ══
// تُعدّ *زيارات* لا *أشخاصاً*. المعرّف visit_id عشوائيّ يموت بإغلاق
// التبويب: من يفتح الموقع من الجوال ثم الحاسوب زيارتان، ومن يعود
// غداً زيارةٌ أخرى. لا نظام تحليلات يعدّ الأشخاص حقاً، ومن يسمّي
// الرقم «أشخاصاً» يعِد بما لا يملك — فالتسمية هنا «زيارات» عمداً،
// ومكتوبٌ تحتها ما تعنيه.

const RANGES = [
  { id: '7d', labelAr: 'آخر ٧ أيام', days: 7 },
  { id: '30d', labelAr: 'آخر ٣٠ يوماً', days: 30 },
  { id: '90d', labelAr: 'آخر ٩٠ يوماً', days: 90 },
];

export default function AdminAnalytics({ state, data, message, range, setRange, onRetry }) {
  const daily = data?.daily || [];
  const pages = data?.pages || [];
  const totals = data?.totals || { views: 0, visits: 0 };
  const peak = daily.reduce((m, d) => Math.max(m, d.views), 0) || 1;

  return (
    <>
      <div className="sec-head">
        <h2 className="sec-title">التحليلات</h2>
        <div className="range-tabs">
          {RANGES.map((r) => (
            <button key={r.id} className={`range-tab ${range === r.id ? "on" : ""}`} onClick={() => setRange(r.id)}>
              {r.labelAr}
            </button>
          ))}
        </div>
      </div>

      {state !== RESULT.OK ? (
        <StateNotice state={state} message={message} onRetry={onRetry}
          emptyTitle="لا زيارات مسجَّلة بعد"
          emptyBody="الجدول موجود ولم تصله زيارة — تأكّد أن وسم القياس منشور في صفحات الموقع." />
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat" style={{ borderTopColor: "var(--petrol-mid)" }}>
              <div className="stat-v" style={{ color: "var(--petrol-mid)" }}>{totals.views.toLocaleString("en")}</div>
              <div className="stat-l">فتحات الصفحات</div>
            </div>
            <div className="stat" style={{ borderTopColor: "var(--gold-deep)" }}>
              <div className="stat-v" style={{ color: "var(--gold-deep)" }}>{totals.visits.toLocaleString("en")}</div>
              <div className="stat-l">زيارات</div>
            </div>
          </div>

          <p className="adm-hint" style={{ marginBottom: "1rem" }}>
            «زيارة» = تبويب متصفّح فُتح فيه الموقع. من يفتحه من جهازين زيارتان، ومن يعود غداً
            زيارةٌ أخرى — <strong>ولا تُقرأ هذه الأرقام عدداً للأشخاص</strong>.
          </p>

          <div className="adm-consultant">
            <h4>الزيارات عبر الزمن</h4>
            <div className="spark">
              {daily.map((d) => (
                <div key={d.day} className="spark-col" title={`${d.day} — ${d.views} فتحة · ${d.visits} زيارة`}>
                  <div className="spark-bar" style={{ height: `${Math.max(2, (d.views / peak) * 100)}%` }} />
                </div>
              ))}
            </div>
            {daily.length > 0 && (
              <div className="spark-axis">
                <span>{fmtShort(daily[0].day)}</span>
                <span>{fmtShort(daily[daily.length - 1].day)}</span>
              </div>
            )}
          </div>

          <div className="adm-consultant">
            <h4>أكثر الصفحات فتحاً</h4>
            <div style={{ overflowX: "auto" }}>
              <table className="output-table" style={{ minWidth: "420px" }}>
                <thead><tr><th>الموقع</th><th>الصفحة</th><th>فتحات</th><th>زيارات</th></tr></thead>
                <tbody>
                  {pages.map((p, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: "nowrap" }}>{p.site}</td>
                      <td style={{ direction: "ltr", textAlign: "right" }}>{p.path}</td>
                      <td>{p.views.toLocaleString("en")}</td>
                      <td>{p.visits.toLocaleString("en")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="adm-consultant">
        <h4>مصدرٌ ثانٍ للأرقام</h4>
        <p className="adm-note" style={{ marginTop: ".5rem" }}>
          Cloudflare Web Analytics يقيس الصفحات نفسها من حافة الشبكة — بلا كوكيز وبلا أثرٍ على السرعة.
          أرقامه تظهر في لوحة Cloudflare لا هنا، وهو مرجعٌ يُقابَل به هذا الجدول:
          اختلافٌ كبير بينهما يعني أن حاجب إعلانات يمنع أحدهما.
        </p>
      </div>
    </>
  );
}
