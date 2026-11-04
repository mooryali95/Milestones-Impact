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
