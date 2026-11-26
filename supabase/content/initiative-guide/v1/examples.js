// المبادرات المحلولة بترتيب العرض: مصدر واحد يقرؤه تطبيق المشارك (guide.js) ولوحة الإدارة (تنبيه القرب من المثال).
// قطاعاتها هي EXAMPLE_SECTORS في visibility.js (الخادم لا يستورد JSON)، ويحرس اختبار تطابقهما.
import GOV from './sectors/gov.json';
import HEALTH from './sectors/health.json';
import STARTUP from './sectors/startup.json';

export const EXAMPLES = Object.freeze([GOV, HEALTH, STARTUP]);

// المثال التطوعي للتأسيسي (تخفيف وثيقة المبادرة للتأسيسي، المرحلة 3): فصول التأسيسي وحدها بأعمدته، مطوي خلف «أرني مثالًا».
// ليس من قطاعات الرؤية الثلاثة: يحكمه مفتاح أمثلة الحقل (examples.field) وحده. والقرب منه يُنبَّه إليه كبقية الأمثلة
import VOLUNTEER from './sectors/volunteer-beginner.json';
export const BEGINNER_EXAMPLE = Object.freeze(VOLUNTEER);
