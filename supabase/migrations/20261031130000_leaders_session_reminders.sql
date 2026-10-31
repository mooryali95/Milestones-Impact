-- تذكير الجلسة قبل يوم: يُرسل مرة واحدة لكل جلسة (reminded_at)، من المهمة الساعية نفسها
alter table leaders.coaching_sessions add column if not exists reminded_at timestamptz;
