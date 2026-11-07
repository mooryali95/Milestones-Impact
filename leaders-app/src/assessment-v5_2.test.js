// حراس الحزمة 8 (D03): طبقة الموازنة v5.2 فوق v5.1، بحارس رتبة طول المفتاح والمجيبين الآليين، ووسم الأبواب
// بباب تعليمها، وتوحيد مفردات القرار وسياق القطاع العام، والتفعيل مشروط بالطبقة. والترحيل يُختبر في PGlite.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { applyBalance, balanceSql, MIGRATION, V51 } from '../../scripts/questions/build-v5_2.mjs';
import { EDITS, LENGTH_EXCEPTIONS } from '../../scripts/questions/edits-v5_2.mjs';
import { check } from '../../scripts/questions/verify-v5_2.mjs';
import { cells, gains, keyRank, MAX_RANK_SHARE, order, responders, STRATEGIES } from '../../scripts/questions/lengths.mjs';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const V52 = JSON.parse(read('supabase/content/questions/v5.2/items.json'));

describe('المقاييس', () => {
  const q = (lens, key) => ({ kind: 'choice', options: lens.map((n, i) => ({ label: 'س'.repeat(n), score: i === key ? 4 : 0 })) });
  it('رتبة المفتاح بالطول تنازليًا والتعادل بالموضع، والمجيبون بالترتيب نفسه', () => {
    expect(keyRank(q([30, 40, 20, 35], 1))).toBe(1);
    expect(keyRank(q([30, 40, 20, 35], 2))).toBe(4);
    expect(keyRank(q([30, 30, 30, 30], 2))).toBe(3);
    expect(order(q([30, 40, 20, 35], 0))).toEqual([1, 3, 0, 2]);
    expect(STRATEGIES.longest(q([30, 40, 20, 35], 0))).toBe(1);
    expect(STRATEGIES.second(q([30, 40, 20, 35], 0))).toBe(3);
    expect(STRATEGIES.shortest(q([30, 40, 20, 35], 0))).toBe(2);
  });
});

describe('v5.2', () => {
  it('مولَّد من v5.1 والطبقة، وكل فحوص D03 ناجحة', () => {
    expect(JSON.stringify(applyBalance(V51))).toBe(JSON.stringify(V52));
    expect(check()).toEqual([]);
  });
  it('لا رتبة فوق 35% في أي خلية، والمجيبون الآليون تأسيسيون بلا مكسب', () => {
    for (const c of cells(V52)) expect(c.max_share, c.cell).toBeLessThanOrEqual(MAX_RANK_SHARE);
    for (const r of responders(V52)) expect(Object.values(r.levels), `${r.instrument}/${r.form}/${r.strategy}`).toEqual(['beginner', 'beginner', 'beginner']);
    for (const g of gains(V52)) expect(g.gain, `${g.strategy}/${g.pre_form}/${g.dim}`).toBeLessThanOrEqual(5);
  });
  it('الدرجات ومواضع المفاتيح كما في v5.1، والمعرّفات ثابتة', () => {
    V51.forEach((a, i) => {
      expect(V52[i].id).toBe(a.id);
      expect(V52[i].options.map((o) => o.score)).toEqual(a.options.map((o) => o.score));
    });
  });
  it('وسم الأبواب بباب تعليمها، ومفردات القرار الموحدة، وسياق القطاع العام', () => {
    for (const c of ['M-S2', 'M-S2B', 'M-K2', 'M-K2B', 'M-S6', 'M-S6B']) expect(V52.filter((q) => q.code === c).every((q) => q.chapter_key === 'ch4'), c).toBe(true);
    for (const c of ['L-S4', 'L-S4T']) expect(V52.filter((q) => q.code === c).every((q) => q.chapter_key === 'ch5'), c).toBe(true);
    expect(V52.filter((q) => q.instrument === 'baseline-v5' || q.instrument === 'post-v3').some((q) => /عبور مشروط/.test(JSON.stringify(q)))).toBe(false);
    expect(V52.some((q) => /مانح/.test(JSON.stringify(q)))).toBe(false);
    for (const k of Object.keys(EDITS)) expect(V51.some((q) => q.code === k), k).toBe(true);
    // استثناءات ±40% مسماة بتعليل وثلاثة على الأكثر، وقواعد D03 كلها عليها
    expect(Object.keys(LENGTH_EXCEPTIONS).length).toBeLessThanOrEqual(3);
    for (const why of Object.values(LENGTH_EXCEPTIONS)) expect(String(why).length).toBeGreaterThanOrEqual(30);
  });
});

describe('الترحيل والتفعيل', () => {
  const SQL = read(`supabase/migrations/${MIGRATION}.sql`);
  it('مؤجل بقرار D03، ومولَّد كما هو مودع، والتفعيل يشترطه', () => {
    expect(gateOf(SQL).gate).toBe('deferred');
    expect(balanceSql(V51, V52).sql).toBe(SQL);
    const act = read('supabase/migrations/20261102100100_leaders_activate_v5.sql');
    expect(act).toContain(`where name = '${MIGRATION}'`);
    expect(act.indexOf(MIGRATION)).toBeLessThan(act.indexOf("\nupdate leaders.instruments set active"));
  });
  async function seed(rows) {
    const db = new PGlite();
    await db.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key);
      insert into leaders.schema_migrations values ('20261105150000_leaders_v5_1_pre_activation');
      create table leaders.instruments (id serial primary key, key text unique);
      insert into leaders.instruments (key) values ('baseline-v5'), ('post-v3');
      create table leaders.assessments (id serial primary key, instrument_id int);
      create table leaders.questions (id serial primary key, instrument_id int, code text, text_ar text, options jsonb, chapter_key text, competency_ar text);`);
    // دفعة واحدة بدل صف صف: الاختبار يبني ثلاث قواعد
    const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
    if (rows.length) await db.exec(`insert into leaders.questions (instrument_id, code, text_ar, options, chapter_key, competency_ar)
      select i.id, v.code, v.text_ar, v.options::jsonb, v.chapter_key, v.competency_ar from (values ${rows.map((q) => `(${lit(q.instrument)}, ${lit(q.code)}, ${lit(q.text_ar)}, ${lit(JSON.stringify(q.options))}, ${lit(q.chapter_key)}, ${lit(q.competency_ar)})`).join(', ')})
      as v(instrument, code, text_ar, options, chapter_key, competency_ar) join leaders.instruments i on i.key = v.instrument`);
    return db;
  }
  it('يحدّث ما تغيّر، وإعادته آمنة، ويرفض إن خالف صف نص v5.1، وإن بدأ قياس', async () => {
    const { changed } = balanceSql(V51, V52);
    const before = V51.filter((q) => changed.some((c) => c.instrument === q.instrument && c.code === q.code));
    const db = await seed(before);
    await db.exec(SQL);
    await db.exec(SQL);
    const got = (await db.query('select i.key, q.code, q.text_ar, q.options, q.chapter_key, q.competency_ar from leaders.questions q join leaders.instruments i on i.id = q.instrument_id')).rows;
    for (const c of changed) {
      const r = got.find((x) => x.key === c.instrument && x.code === c.code);
      expect(r.options).toEqual(c.options);
      expect(r.chapter_key).toBe(c.chapter_key);
      expect(r.competency_ar).toBe(c.competency_ar);
    }
    expect((await db.query(`select 1 from leaders.schema_migrations where name = '${MIGRATION}'`)).rows).toHaveLength(1);
    if (changed.length) {
      const drift = await seed(before.map((q, i) => (i === 0 ? { ...q, text_ar: `${q.text_ar} عُدّل يدويًا` } : q)));
      await expect(drift.exec(SQL)).rejects.toThrow(/لم يطابق نص v5.1/);
    }
    const started = await seed(before);
    await started.exec("insert into leaders.assessments (instrument_id) select id from leaders.instruments where key = 'baseline-v5'");
    await expect(started.exec(SQL)).rejects.toThrow(/قياسات مبدوءة/);
    // قاعدة بلا فقرات الأداتين (لقطة المخطط): بلا أثر، ويُسجَّل الترحيل
    const empty = await seed([]);
    await empty.exec('delete from leaders.schema_migrations');
    await empty.exec(SQL);
    expect((await empty.query(`select 1 from leaders.schema_migrations where name = '${MIGRATION}'`)).rows).toHaveLength(1);
  }, 30000);
});
