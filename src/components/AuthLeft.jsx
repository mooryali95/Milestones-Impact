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
          <div
            key={t.id}
            className="auth-left-track"
            style={{ background: t.color + '22', color: t.color, border: '1px solid ' + t.color + '44' }}
          >
            {t.nameAr} {t.weight}%
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default AuthLeft;
