import React from 'react';

const BRAND_COLOR = '#6B9DAD';

const MILogo = ({ size = 40, color = BRAND_COLOR }) => (
  <svg viewBox="0 0 60 70" fill="none" style={{ width: size, height: size * 70 / 60 }}>
    <path d="M30 8L45 23L30 38L15 23Z" stroke={color} strokeWidth="2" fill="none" />
    <circle cx="30" cy="23" r="4" stroke={color} strokeWidth="1.5" fill="none" />
    <line x1="30" y1="38" x2="30" y2="50" stroke={color} strokeWidth="2" />
    <path d="M18 50L30 65L42 50" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);

export default MILogo;
