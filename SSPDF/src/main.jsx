import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error("SSPDF crash:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBF8EF", fontFamily: "Tahoma, sans-serif", padding: 24 }}>
          <div style={{ textAlign: "center", maxWidth: 360 }}>
            <div style={{ display: "inline-block", background: "#061318", color: "#C79A4B", fontWeight: 900, borderRadius: 8, padding: "6px 14px", marginBottom: 16 }}>SSPDF</div>
            <h2 style={{ color: "#061318", fontSize: "1.1rem", marginBottom: 8 }}>حدث خطأ غير متوقع</h2>
            <p style={{ color: "#5C6B74", fontSize: "0.85rem", marginBottom: 20 }}>لم تُفقد بياناتك — أعد تحميل الصفحة للمتابعة.</p>
            <button onClick={() => window.location.reload()}
              style={{ background: "#C79A4B", color: "#061318", fontWeight: 700, border: "none", borderRadius: 8, padding: "10px 24px", fontSize: "0.9rem", cursor: "pointer" }}>
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
