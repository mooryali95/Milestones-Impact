// ════════════════════════════════════════════════════════════════
// حاجز الأخطاء: استثناء في العرض لا يُفرغ الصفحة بل يعرض رسالة ومخرجًا
// ════════════════════════════════════════════════════════════════
import React from 'react';
import { UNEXPECTED_ERROR } from '../../supabase/functions/leaders-api/labels.js';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error('leaders-app:', error, info?.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main id="main" className="page narrow stack" role="alert">
        <h1>تعذّر عرض الصفحة</h1>
        <p>{UNEXPECTED_ERROR}</p>
        <div className="row">
          <button className="btn" onClick={() => location.reload()}>حدّث الصفحة</button>
          <a className="btn ghost" href="/">رحلتي</a>
        </div>
      </main>
    );
  }
}

// ════════════════════════════════════════════════════════════════
// حاجز القسم: خطأ في رسم قسم واحد (رحلتي، كتابي، مبادرتي، لوحة الخبير...) يعرض رسالة في مكانه،
// والترويسة والتنقل وزر الخروج خارجه فتبقى تعمل. يُعطى key بالقسم فيُصفَّر عند الانتقال (كحاجز شاشات الإدارة، #385).
// خطأ تحميل ملف القسم بعد نشر أحدث لا يصلحه «حاول مرة أخرى» (React.lazy يحفظ الوعد المرفوض): يُطلب تحديث الصفحة.
// الحاجز الأخير حول التطبيق كله باقٍ في main.jsx لما يفوت هذا (الترويسة أو الإطار نفسه).
// ════════════════════════════════════════════════════════════════
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch/i;
export class SectionBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('leaders-app section:', error, info?.componentStack); }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = CHUNK_ERROR.test(String(error?.message || error));
    return (
      <div className="page narrow stack">
        <div className="alert err stack" role="alert">
          <b>{chunk ? 'صدر تحديث للمنصة، فحدّث الصفحة لتفتح هذا القسم.' : 'تعذّر عرض هذا القسم.'}</b>
          <span>بقية المنصة تعمل، وبياناتك لم تتأثر.</span>
          <div className="row">
            {chunk
              ? <button type="button" className="btn sm" onClick={() => location.reload()}>حدّث الصفحة</button>
              : <button type="button" className="btn sm" onClick={() => this.setState({ error: null })}>حاول مرة أخرى</button>}
            {this.props.onHome && <button type="button" className="btn sm ghost" onClick={this.props.onHome}>{this.props.homeLabel || 'رحلتي'}</button>}
          </div>
        </div>
      </div>
    );
  }
}
