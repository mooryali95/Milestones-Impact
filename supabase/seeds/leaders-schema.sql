-- بذرة البدء المحلي (supabase start في سير التكامل): مخطط leaders فارغًا فقط.
-- PostgREST يُعلن له المخطط في config.toml ويرفض البدء إن لم يجده، واللقطة التي تملؤه تُطبَّق بعد البدء
-- (scripts/integration/apply-migrations.sh). لا بيانات هنا، ولا يُشغَّل على الإنتاج.
create schema if not exists leaders;
