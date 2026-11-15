// المبادرات المحلولة بترتيب العرض: مصدر واحد يقرؤه تطبيق المشارك (guide.js) ولوحة الإدارة (تنبيه القرب من المثال).
// قطاعاتها هي EXAMPLE_SECTORS في visibility.js (الخادم لا يستورد JSON)، ويحرس اختبار تطابقهما.
import GOV from './sectors/gov.json';
import HEALTH from './sectors/health.json';

export const EXAMPLES = Object.freeze([GOV, HEALTH]);
