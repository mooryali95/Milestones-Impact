-- ════════════════════════════════════════════════════════════════
-- مصدر كل تعديل في جداول المحتوى (D01 في سجل قرارات لجنة الخبراء)
-- ════════════════════════════════════════════════════════════════
-- لكل جدول محتوى عمودا updated_at وupdated_by. اللوحة تختمهما ببريد المشرف ووقت الحفظ.
-- وكل كتابة لا تختمهما (ترحيل، أو SQL يدوي، أو مسار في الدالة نسي الختم) يختمها المشغّل
-- بـ db:<الدور> والوقت، فيرى كشف الانحراف (scripts/content/export-live.mjs) من غيّر الصف ومتى.
-- القيمة السابقة لكل حفظ من اللوحة في leaders.audit_log (عمود before).
-- آمن لإعادة التشغيل.

create or replace function leaders.content_provenance() returns trigger
language plpgsql set search_path to 'leaders' as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := coalesce(new.updated_at, now());
    new.updated_by := coalesce(new.updated_by, 'db:' || current_user);
  elsif new.updated_at is not distinct from old.updated_at then
    -- الكاتب لم يختم: ليس حفظًا من اللوحة
    new.updated_at := now();
    new.updated_by := 'db:' || current_user;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['handbook_modules', 'questions', 'instruments', 'learning_models', 'content_items', 'tracks', 'grid_cells',
                           'journey_stages', 'stage_requirements', 'katon_topics', 'katon_sentences'] loop
    if to_regclass('leaders.' || t) is not null then
      execute format('alter table leaders.%I add column if not exists updated_at timestamptz, add column if not exists updated_by text', t);
      execute format('drop trigger if exists %I on leaders.%I', t || '_provenance', t);
      execute format('create trigger %I before insert or update on leaders.%I for each row execute function leaders.content_provenance()', t || '_provenance', t);
    end if;
  end loop;
end $$;

insert into leaders.schema_migrations (name) values ('20261107100000_leaders_content_provenance') on conflict do nothing;
