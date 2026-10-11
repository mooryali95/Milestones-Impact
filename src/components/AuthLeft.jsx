import React from "react";
import Wordmark from "./Wordmark";
import { TRACKS } from "../config/constants";

// ════════════════════════════════════════════════════════════════
// AUTH LEFT — اللوحة اليسرى المشتركة في شاشات الدخول
// ════════════════════════════════════════════════════════════════
// شرائح المسارات تُشتق من TRACKS بدل تكرار الأسماء والألوان والأوزان.

const AuthLeft = ({ quote }) => (
  <div className="auth-left">
    <div className="auth-left-grid"/>
    <div className="auth-left-content">
      <Wordmark width={200} variant="inverted" />
      <div className="auth-left-quote">
        {quote.split('||').map((part, i) => <span key={i}>{part}</span>)}
      </div>
      <div className="auth-left-attr">Milestone Impact • الإطار الحاكم</div>
      <div className="auth-left-tracks">
        {TRACKS.map(t => (
          // ألوان المسارات درجاتٌ على محور الجرافيت: تُقرأ على الأرضيات الفاتحة
          // وتختفي على هذه اللوحة الداكنة — كانت بين 1.01:1 و2.35:1، و«الإنشاء»
          // لا يُرى أصلاً. فالنصّ رمليّ والحدّ نحاسيّ، والتتابع يحمله الترتيب.
          <div key={t.id} className="auth-left-track">
            {t.nameAr} {t.weight}%
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default AuthLeft;
