-- ════════════════════════════════════════════════════════════════
-- حفظ مقترحات محرر الاستوديو في عملية واحدة (خارطة الإصلاح 2026-11-15، ب1)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant قبل الدالة يحفظ الخادم كل قسم وحده كما كان (book-proposals.ts proposeFromEdit)
-- كان كل قسم يُحفظ في طلب مستقل، فخطأ في المنتصف يترك بعض المقترحات محفوظة وبعضها لا. هنا الأقسام كلها وسجل
-- التدقيق لكل منها في معاملة واحدة: تُحفظ جميعًا أو لا يُحفظ شيء. التحقق من المحتوى يبقى في الخادم قبل الاستدعاء
-- (checkProposal)، والقيود هنا حارس أخير. لا يستدعيها إلا دور الخدمة. آمن لإعادة التشغيل.
--
-- p_rows: مصفوفة، لكل عنصر: section, section_id, base_md, proposed_md, reason, status, prev_id (أو null), prev_status
-- يعيد المعرّفات بترتيب الصفوف. مقترح سابق تغيّرت حالته أثناء الحفظ يُفشل العملية كلها برمز P0409 ونصه القسم.

create or replace function leaders.book_proposals_save(
  p_module uuid, p_author_ref text, p_author_name text, p_rows jsonb, p_now timestamptz default now())
returns uuid[] language plpgsql as $$
declare
  r jsonb;
  out_ids uuid[] := '{}';
  new_id uuid;
  is_edit boolean;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'book_proposals_save: لا صفوف' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    is_edit := nullif(r->>'prev_id', '') is not null;
    if is_edit then
      update leaders.book_proposals
         set section = coalesce(r->>'section', ''), section_id = nullif(r->>'section_id', ''),
             base_md = coalesce(r->>'base_md', ''), proposed_md = r->>'proposed_md', reason = r->>'reason',
             status = r->>'status', updated_at = p_now
       where id = (r->>'prev_id')::uuid and module_id = p_module and author_ref = p_author_ref and status = r->>'prev_status'
      returning id into new_id;
      if new_id is null then
        raise exception '%', coalesce(r->>'label', r->>'section', '') using errcode = 'P0409';
      end if;
    else
      insert into leaders.book_proposals (module_id, section, section_id, base_md, proposed_md, reason, status, author_ref, author_name, updated_at)
      values (p_module, coalesce(r->>'section', ''), nullif(r->>'section_id', ''), coalesce(r->>'base_md', ''), r->>'proposed_md',
              r->>'reason', r->>'status', p_author_ref, coalesce(p_author_name, ''), p_now)
      returning id into new_id;
    end if;
    insert into leaders.audit_log (actor_type, actor, action, entity, entity_id, before, after)
    values ('admin', p_author_ref, case when is_edit then 'book.proposal-edit' else 'book.proposal' end, 'book_proposals', new_id::text, null,
            jsonb_build_object('module_id', p_module, 'section', coalesce(r->>'section', ''), 'status', r->>'status', 'from', 'studio'));
    out_ids := out_ids || new_id;
    new_id := null;
  end loop;
  return out_ids;
end;
$$;

revoke all on function leaders.book_proposals_save(uuid, text, text, jsonb, timestamptz) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function leaders.book_proposals_save(uuid, text, text, jsonb, timestamptz) to service_role;
  end if;
end;
$$;

insert into leaders.schema_migrations (name) values ('20261117100000_leaders_book_proposals_save') on conflict do nothing;
