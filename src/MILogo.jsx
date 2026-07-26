import React from 'react';

/**
 * MILogo — المعيّن الرسمي من حزمة الهوية v5
 * المصدر: svg/icon-transparent.svg
 * قاعدة الهوية: لا يُدوَّر المعيّن ولا يُشوَّه ولا تُضاف له ظلال.
 */
const BRAND_GOLD = '#A97A2E';

const MILogo = ({ size = 40, color = BRAND_GOLD }) => (
  <svg
    viewBox="0 0 512 512"
    style={{ width: size, height: size, display: 'block' }}
    role="img"
    aria-label="Milestone Impact"
  >
    <rect
      x="176" y="176" width="160" height="160"
      transform="rotate(45 256 256)"
      fill={color}
    />
  </svg>
);

export default MILogo;
