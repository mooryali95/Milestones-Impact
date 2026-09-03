#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════
// نسخ الملفات المشتركة إلى مجلدات المواقع
// ════════════════════════════════════════════════════════════════
// كل مشروع على Cloudflare Pages يخدم مجلده وحده جذراً (راجع
// DEPLOY-CLOUDFLARE.md): مشروع mi-home جذره home/، وmi-leaders
// جذره leaders/. فمجلد shared/ لا يُنشر أصلاً، و/shared/js/… يعطي
// 404 في الإنتاج.
//
// والنتيجة أن ملفاً واحداً يجب أن يوجد نسخاً. وهذا بعينه ما أنتج
// سبع نسخٍ من لوحة الألوان في هذا المشروع، وكلٌّ انحرفت عن أختها.
//
// فبدل الوعد بألا تنحرف: تُنسخ بأمرٍ واحد، ويكشف الانحرافَ فحصٌ في
// CI. من عدّل نسخةً في مكانها أسقط البناء ورأى السبب.
//
//   node scripts/sync-shared.mjs          ينسخ
//   node scripts/sync-shared.mjs --check  يتحقّق فقط (لـ CI)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// المصدر → الوجهات
const FILES = [
  { from: 'shared/js/analytics.js', to: [
    'home/assets/js/analytics.js',
    'leaders/assets/js/analytics.js',
    'public/analytics.js',
  ] },
];

const BANNER = `/* ⚠ نسخة مُولَّدة — لا تُعدَّل هنا.
   المصدر: shared/js/analytics.js
   للتحديث: node scripts/sync-shared.mjs
   (‏CI يُسقط البناء إن اختلفت النسخة عن مصدرها.) */
`;

const check = process.argv.includes('--check');
let drift = 0;
let copied = 0;

for (const { from, to } of FILES) {
  const src = readFileSync(join(root, from), 'utf8');
  const want = BANNER + src;
  for (const dest of to) {
    const path = join(root, dest);
    const have = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (have === want) continue;
    if (check) {
      drift++;
      console.error(`✗ ${dest} ${have === null ? 'غير موجود' : 'يختلف عن'} ${from}`);
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, want);
      copied++;
      console.log(`✓ ${from} → ${dest}`);
    }
  }
}

if (check) {
  if (drift) {
    console.error(`\n${drift} نسخة منحرفة. شغّل: node scripts/sync-shared.mjs`);
    process.exit(1);
  }
  console.log('✓ كل النسخ مطابقة لمصادرها');
} else {
  console.log(copied ? `\nنُسخت ${copied} ملفات` : '\nكل النسخ محدَّثة أصلاً');
}
