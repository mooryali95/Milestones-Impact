// يولّد shared/css/brand.css من shared/js/brand.js: node scripts/brand/build-css.mjs
import { writeFileSync } from 'node:fs';
import { BRAND } from '../../shared/js/brand.js';

const head = `/* ══════════════════════════════════════════════════════════════
   ألوان الهوية: متغيرات CSS مولَّدة من shared/js/brand.js، لا تُحرَّر يدويًا
   ══════════════════════════════════════════════════════════════
   node scripts/brand/build-css.mjs يعيد توليده. يستورده تطبيق القادة ولوحة الإدارة،
   ولا يُكتب لون هوية بقيمته في ملف آخر (يفحصه leaders-app/src/single-source.test.js). */
`;
const vars = Object.entries(BRAND).map(([k, v]) => `  --brand-${k}: ${v};`).join('\n');
writeFileSync(new URL('../../shared/css/brand.css', import.meta.url), `${head}:root {\n${vars}\n}\n`);
