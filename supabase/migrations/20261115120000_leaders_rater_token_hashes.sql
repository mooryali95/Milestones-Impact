-- ════════════════════════════════════════════════════════════════
-- روابط المقيّم كلها صالحة حتى إغلاق الدورة (P1-14)
-- ════════════════════════════════════════════════════════════════
-- deploy-gate: tolerant الدالة تطابق token_hash أولًا ثم token_hashes وتتحمل غياب العمود (impact.ts raterFrom وtokenPatch)، فتعمل قبله وبعده
-- كان تذكير تقييم 360 يكتب بصمة جديدة مكان القديمة، فيموت رابط الدعوة الأولى، والدعوة المنتظرة في طابور البريد،
-- والنموذج المفتوح برمزه القديم، وتقول للمقيّم «الرابط غير صالح أو أُلغي» والدعوة وعدته بالصلاحية حتى الإغلاق.
-- token_hashes بصمات كل رمز صادر للدعوة الجارية ومعها الأحدث، والتذكير يضيف ولا يستبدل. token_hash يبقى الأحدث
-- فتطابقه الدالة السابقة كما كانت. ينتهي كل رمز بانقضاء المهلة أو الإلغاء أو إغلاق الدورة كما كان.
-- آمن لإعادة التشغيل.

alter table leaders.raters add column if not exists token_hashes text[] not null default '{}';

update leaders.raters set token_hashes = array[token_hash]
  where token_hash is not null and not (token_hashes @> array[token_hash]);

create index if not exists raters_token_hashes_gin on leaders.raters using gin (token_hashes);

insert into leaders.schema_migrations (name) values ('20261115120000_leaders_rater_token_hashes') on conflict do nothing;
