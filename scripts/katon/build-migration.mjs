// يولّد ترحيل «كاتون»: الجداول، وبنك البداية من supabase/content/katon/v1/topics.json مسودةً.
// الاستعمال: node scripts/katon/build-migration.mjs > supabase/migrations/20261103150000_leaders_katon.sql
import { readFileSync } from 'node:fs';
const topics = JSON.parse(readFileSync(new URL('../../supabase/content/katon/v1/topics.json', import.meta.url), 'utf8'));
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const j = (o) => `${q(JSON.stringify(o))}::jsonb`;
let sql = `-- ════════════════════════════════════════════════════════════════
-- نموذج «كاتون»: المواضيع وجملها الست، وإجابات المشاركين، ونقاط البرنامج
-- ════════════════════════════════════════════════════════════════
-- مولَّد من scripts/katon/build-migration.mjs. آمن لإعادة التشغيل.
-- بنك البداية من ملف الأسس يُدرج مسودة (status=draft): يراجعه الأدمن ويضبط المفاتيح ثم ينشره.

alter table leaders.programs add column if not exists katon_points jsonb not null default '{}'::jsonb;

create table if not exists leaders.katon_topics (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique check (char_length(key) between 2 and 60),
  title_ar   text not null check (char_length(title_ar) between 2 and 160),
  dimension  text check (dimension in ('milestone', 'impact', 'leadership')),
  layers     jsonb not null default '{}'::jsonb,   -- competencies[], principles[], assumptions[], logic
  source     text,
  status     text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort       smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leaders.katon_sentences (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid not null references leaders.katon_topics(id) on delete cascade,
  sort       smallint not null default 0,
  question   text not null check (question in ('why', 'what', 'how', 'absent', 'who', 'when')),
  text_ar    text not null check (char_length(text_ar) between 8 and 600),
  key        text not null default 'opinion' check (key in ('true', 'false', 'opinion')),
  explain_ar text check (char_length(explain_ar) <= 800),
  tasks      jsonb not null default '{}'::jsonb,   -- support|lead|guide|eval: تكليف كل فريق
  updated_at timestamptz not null default now()
);
create index if not exists katon_sentences_topic_idx on leaders.katon_sentences (topic_id, sort);

create table if not exists leaders.katon_answers (
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  sentence_id    uuid not null references leaders.katon_sentences(id) on delete cascade,
  choice         text not null check (choice in ('question', 'research', 'true', 'false', 'idea', 'can', 'believe', 'assume')),
  note           text check (char_length(note) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (participant_id, sentence_id)
);
create index if not exists katon_answers_sentence_idx on leaders.katon_answers (sentence_id);

alter table leaders.katon_topics    enable row level security;
alter table leaders.katon_sentences enable row level security;
alter table leaders.katon_answers   enable row level security;
revoke all on leaders.katon_topics, leaders.katon_sentences, leaders.katon_answers from public, anon, authenticated;
grant all on leaders.katon_topics, leaders.katon_sentences, leaders.katon_answers to service_role;

-- ── بنك البداية (مسودة) ──
`;
topics.forEach((t, i) => {
  sql += `\ninsert into leaders.katon_topics (key, title_ar, dimension, layers, source, status, sort)
values (${q(t.key)}, ${q(t.title_ar)}, ${q(t.dimension)}, ${j(t.layers)}, ${q(t.source)}, 'draft', ${i + 1})
on conflict (key) do nothing;\n`;
  sql += `insert into leaders.katon_sentences (topic_id, sort, question, text_ar, key, tasks)
select tp.id, v.sort, v.question, v.text_ar, v.key, v.tasks::jsonb
from leaders.katon_topics tp, (values\n${t.sentences.map((s, k) => `  (${k + 1}, ${q(s.question)}, ${q(s.text_ar)}, ${q(s.key)}, ${q(JSON.stringify(s.tasks))})`).join(',\n')}\n) as v(sort, question, text_ar, key, tasks)
where tp.key = ${q(t.key)} and not exists (select 1 from leaders.katon_sentences x where x.topic_id = tp.id);\n`;
});
process.stdout.write(sql);
