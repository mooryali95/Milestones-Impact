import React from "react";
import { BRAND, CONTACT } from "../config/constants";

// ════════════════════════════════════════════════════════════════
// FOOTER — تذييل التواصل وحقوق النشر
// ════════════════════════════════════════════════════════════════
// كان معرّفاً داخل App() فيُعاد إنشاؤه في كل تصيير؛ نقله خارجها يمنع ذلك.

const Footer = () => (
  <div className="app-footer">
    <p style={{ marginBottom: "0.3rem" }}>
      للتواصل: <a href={`mailto:${CONTACT.email}`} style={{ color: BRAND.color, textDecoration: "none" }}>{CONTACT.email}</a>
    </p>
    <p>© {new Date().getFullYear()} Milestone Impact. جميع الحقوق محفوظة.</p>
  </div>
);

export default Footer;
