-- ════════════════════════════════════════════════════════════════
-- آخر فحص لمنتجي Creem (تصور مصدر السعر، المرحلة 3: الشفافية)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تكتب العمود بتحديث منفصل يتحمل غيابه (payments.ts storeCheck)، وتقرأ الإعداد بـ* فتعمل قبل الترحيل وبعده
-- يُملأ عند حفظ إعداد الدفع وبزر «تحقق من Creem»: نوع الفوترة والعملة ونمط الضريبة والوضع لكل منتج (creem-product.js)
alter table leaders.payment_settings add column if not exists creem_check jsonb;
comment on column leaders.payment_settings.creem_check is 'آخر قراءة لمنتجي Creem (GET /v1/products/{id}) للتحقق ونمط الضريبة، لا للسعر';
insert into leaders.schema_migrations (name) values ('20261125100000_leaders_payment_creem_check') on conflict do nothing;
