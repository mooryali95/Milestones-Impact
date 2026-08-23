import React from "react";
import { BRAND } from "../config/constants";

// ════════════════════════════════════════════════════════════════
// FOOTER — تذييل التواصل وحقوق النشر
// ════════════════════════════════════════════════════════════════
// كان معرّفاً داخل App() فيُعاد إنشاؤه في كل تصيير؛ نقله خارجها يمنع ذلك.

const Footer = () => (
  <div className="app-footer">
    <p style={{ marginBottom: "0.3rem" }}>
      للتواصل: <a href="tel:0532134539" style={{ color: BRAND.color, textDecoration: "none" }}>0532134539</a>
      {" | "}
      <a href="mailto:omar@sunkvalue.com" style={{ color: BRAND.color, textDecoration: "none" }}>omar@sunkvalue.com</a>
    </p>
    <p>© {new Date().getFullYear()} Milestone Impact — جميع الحقوق محفوظة</p>
  </div>
);

export default Footer;
