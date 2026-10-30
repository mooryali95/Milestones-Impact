-- ربط الجلسات الفردية بملف الخبير بدل نص الاسم. «coach» يبقى كما جاء من الحجز أو المسجّل.
alter table leaders.coaching_sessions add column if not exists expert_id uuid references leaders.experts(id) on delete set null;
create index if not exists coaching_sessions_expert_idx on leaders.coaching_sessions (expert_id);
-- ما سُجّل سابقًا: يُربط بالخبير إن طابق نص المدرب بريده أو اسمه
update leaders.coaching_sessions s set expert_id = e.id
  from leaders.experts e
  where s.expert_id is null and s.coach is not null
    and (lower(trim(s.coach)) = e.email or trim(s.coach) = e.full_name);
