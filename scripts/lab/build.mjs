// يولّد ترحيل المختبر من phase1.mjs بعد التحقق من كل مواصفة بالمحرك نفسه
//   node scripts/lab/build.mjs > supabase/migrations/20261026140000_leaders_lab.sql
import { validateLab } from '../../supabase/functions/leaders-api/lab.js';
import { ITEMS } from './phase1.mjs';

const q = (s) => `$x$${s}$x$`;
const rows = ITEMS.map((it) => {
  const spec = validateLab(it.spec);
  return `insert into leaders.lab_items (key, kind, dimension, chapter_key, sort, min_level, minutes, points, title_ar, summary_ar, spec) values (
  ${q(it.key)}, ${q(it.kind)}, ${q(it.dimension)}, ${q(it.chapter_key)}, ${it.sort}, ${q(it.min_level)}, ${it.minutes}, ${it.points},
  ${q(it.title_ar)},
  ${q(it.summary_ar)},
  ${q(JSON.stringify(spec))}::jsonb
) on conflict (key) do nothing;`;
});

process.stdout.write(`-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة: مختبر القائد (المرحلة الأولى)
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل، ولا يطمس تعديلات الإدارة على المحتوى.
-- مولّد من scripts/lab/phase1.mjs بالأمر: node scripts/lab/build.mjs
--
--   • lab_items: أدوات العمل ومواقف المحاكاة، كل منها مواصفة خطوات (spec)
--     تُصحح على الخادم، ومربوطة بباب في الكتاب (dimension + chapter_key)
--   • lab_attempts: محاولات المشاركين خطوة خطوة، ومسار القرارات ونتيجتها
--   • مصدران جديدان للنقاط: lab عند الإتقان (70%) و lab_bonus عند التميز (90%)

create table if not exists leaders.lab_items (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z0-9-]{2,60}$'),
  kind        text not null check (kind in ('tool', 'scenario')),
  dimension   text not null references leaders.dimensions(key),
  chapter_key text,
  sort        smallint not null default 1,
  min_level   text not null default 'beginner' references leaders.levels(key),
  minutes     smallint not null default 10 check (minutes between 1 and 120),
  points      smallint not null default 30 check (points between 0 and 500),
  title_ar    text not null check (char_length(title_ar) <= 200),
  summary_ar  text check (char_length(summary_ar) <= 1000),
  spec        jsonb not null,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists leaders.lab_attempts (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references leaders.participants(id) on delete cascade,
  item_id        uuid not null references leaders.lab_items(id) on delete cascade,
  current        smallint not null default 0,
  path           smallint[] not null default '{}',
  answers        jsonb not null default '{}'::jsonb,
  results        jsonb not null default '{}'::jsonb,
  pct            smallint check (pct is null or pct between 0 and 100),
  started_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  finished_at    timestamptz
);
create index if not exists lab_attempts_participant_idx on leaders.lab_attempts (participant_id, item_id);

alter table leaders.lab_items    enable row level security;
alter table leaders.lab_attempts enable row level security;
grant all on leaders.lab_items, leaders.lab_attempts to service_role;

alter table leaders.points_ledger drop constraint if exists points_ledger_source_check;
alter table leaders.points_ledger add constraint points_ledger_source_check
  check (source in ('chapter', 'model', 'review', 'bonus', 'lab', 'lab_bonus'));

-- ── المحتوى: ست أدوات (اثنتان لكل إطار) وموقفان ──
${rows.join('\n\n')}
`);
