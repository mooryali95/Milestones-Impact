-- اسم المنتج «كتاب القائد» بدل «كتيب القائد» (قرار المالك 2026-11-16) على القاعدة الحية. قراءة فقط.
-- يُشغَّل بسير migrate.yml في الوضع verify: يعدّ الصفوف التي فيها «كتيب» في كل عمود نصي بمخطط leaders.
-- سجلات التاريخ ونصوص المستخدمين لا تُحسب (audit_log وتعليقات الكتاب وإجابات المشاركين ورسائل المساعد): تبقى كما كُتبت.

-- 1) لا «كتيب» في نصوص المحتوى والإعداد
with cols as (
  select c.table_name t, c.column_name col
    from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
   where c.table_schema = 'leaders' and c.data_type in ('text', 'jsonb', 'character varying', 'ARRAY')
     and c.table_name not in ('audit_log', 'book_comments', 'book_proposals', 'conversation_messages', 'conversations', 'model_submissions',
                              'handbook_progress', 'katon_answers', 'notifications', 'mail_log', 'schema_migrations')
     and c.table_name not like 'backup\_%'
), hits as (
  select t, col, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from leaders.%I where %I::text like %L', t, col, '%كتيب%'), false, true, '')))[1]::text::int as n
    from cols
)
select coalesce(sum(n), 0) = 0 as ok,
       coalesce(string_agg(t || '.' || col || '=' || n, '، ' order by t, col) filter (where n > 0), 'لا شيء') as detail
  from hits;
