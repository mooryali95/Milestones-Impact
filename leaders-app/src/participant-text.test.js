// نصوص المشارك تطابق ما يجري فعلًا (مراجعة 2026-11-09، البنود B1 إلى B7): الترحيب وخطوة إكمال التسجيل (D04)،
// ومدة الاعتماد يوما عمل من مصدرها (D04)، والقاعة تكوينية بلا دعوة لم تُبنَ (D17)، وشريط الجهة بمقاعد عقدها (D20)،
// والمستشار باسمه، و«طلبات التوجيه» كما في عنوان بطاقتها، وقسم «أثري» يُفتح مع القياس البعدي.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';
import { hardcodedFacts, renderJourneyText } from '../../supabase/functions/leaders-api/journey.js';
import { CONTINUOUS_SOURCE_AR, KATON_ENABLED, PHASE_AR } from '../../supabase/functions/leaders-api/labels.js';
import { FINAL_DEFAULTS } from '../../supabase/functions/leaders-api/final.js';
import { MIGRATIONS } from '../../supabase/functions/leaders-api/migrations.js';
import { hasAccess, impactOpen } from './gates.js';
import { OnboardingNextCard, OnboardingWelcome } from './Onboarding.jsx';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const api = (f) => read(`supabase/functions/leaders-api/${f}`);
const MIG = '20261110100000_leaders_approval_two_working_days';
const SQL = read(`supabase/migrations/${MIG}.sql`);

const me = ({ access, label = 'يوما عمل' } = {}) => ({
  participant: { id: 'p1', full_name: 'سارة عبدالله الأحمد' },
  profile: { approved: false },
  ...(access !== undefined && { access }),
  journey: [{ key: 'approval', status: 'locked', items: [], ...(label ? { duration_label: label } : {}) }],
});
const welcome = (m) => renderToStaticMarkup(React.createElement(OnboardingWelcome, { me: m, step: null, onStart: () => {} }));
const nextCard = (m) => renderToStaticMarkup(React.createElement(OnboardingNextCard, { me: m, onClose: () => {} }));

// النصوص المصححة كما تظهر للمشارك: لا شرطة ولا واصلة فيها
const FIXED = [
  'إكمال التسجيل برسم البرنامج إن لم ترعك جهة، فتُفتح رحلتك كاملة',
  'يومي عمل',
  'إجاباتك في الجولات للتعلم، ولا تدخل تقييمك المستمر ولا الختامي.',
  'لا قاعة مفتوحة لدفعتك الآن. حين يفتحها الخبير تجدها هنا.',
  'يُفتح مع القياس البعدي في طور الأثر',
  ' · مستشارك: ',
  'برعاية جهتك: الرسوم مغطاة ضمن مقاعد عقدها ومدته',
  'بعد الاعتماد تُفتح لك: كتيبك، ومبادرتك، والقاعة، وطلبات التوجيه.',
];

describe('B1: الترحيب يذكر خطوة إكمال التسجيل لمن لم يُفتح له البرنامج (D04)', () => {
  it('الحق في البند من القاعدة الواحدة التي يوجّه بها App.jsx', () => {
    expect(hasAccess(null, 'program')).toBe(true);                         // خادم أقدم بلا access: الدفع مطفأ
    expect(hasAccess({ access: { program: 'free' } }, 'program')).toBe(true);
    expect(hasAccess({ access: { program: 'sponsor' } }, 'program')).toBe(true);
    expect(hasAccess({ access: { program: null } }, 'program')).toBe(false);
    expect(read('leaders-app/src/App.jsx')).toContain('const paidFor = (item) => hasAccess(me, item);');
  });
  it('من عليه رسم البرنامج يقرأ الخطوة، ومن فُتح له يقرأ أن رحلته تُفتح بعد الاعتماد', () => {
    const due = welcome(me({ access: { program: null } }));
    expect(due).toContain(`خلال يومي عمل، ثم ${FIXED[0]}.`);
    for (const access of [undefined, { program: 'free' }, { program: 'sponsor' }, { program: 'paid' }]) {
      const open = welcome(me({ access }));
      expect(open).toContain('خلال يومي عمل، ثم تُفتح رحلتك كاملة.');
      expect(open).not.toContain('إكمال التسجيل');
    }
  });
});

describe('B2: مدة الاعتماد يوما عمل في كل موضع (D04)', () => {
  it('الترحيب وبطاقة «ما بعد ذلك» من مرحلة الاعتماد، وبغيابها الموعد المعلن نفسه', () => {
    expect(welcome(me())).toContain('<b>اعتماد مسارك</b> خلال يومي عمل');
    expect(nextCard(me())).toContain('ويعتمد مسارك خلال يومي عمل');
    expect(welcome(me({ label: null }))).toContain('خلال يومي عمل');
    expect(read('leaders-app/src/Onboarding.jsx')).not.toContain('أيام عمل قليلة');
    // الجمل من الموعد المعلن بصيغتها بعد «خلال»، والوسم المرفوع لا يدخل جملة
    expect(welcome(me({ label: 'يوما عمل' }))).not.toContain('خلال يوما عمل');
    expect(read('leaders-app/src/screens/Journey.jsx')).toContain('const reviewWait = APPROVAL_SLA_AR;');
  });
  it('صفحة الانتظار والخادم على الموعد نفسه', () => {
    const pw = read('leaders-app/src/screens/Paywall.jsx');
    expect(pw).toContain('const due = at ? businessDays(at, 2) : null;');
    expect(pw).toContain('ويعتمد مسارك خلال يومي عمل');
    expect(api('payments.ts')).toContain('خلال يومي عمل من إنهاء القياس');
  });
  it('الترحيل جديد متسامح ومسجَّل، وفي ترويسته أن المالك يطبّقه بسير migrate.yml', () => {
    expect(MIGRATIONS).toContain(MIG);
    expect(gateOf(SQL).gate).toBe('tolerant');
    expect(SQL).toMatch(/يطبّقه المالك بسير migrate\.yml/);
    expect(SQL).toContain(`insert into leaders.schema_migrations (name) values ('${MIG}') on conflict do nothing;`);
  });
  it('النص ثابت لأن الرمز بيومين لا يُقرأ صحيحًا بعد «خلال»، ولا رقم فيه يرفضه الحارس', () => {
    expect(renderJourneyText('{duration} عمل', { durationDays: 2 })).toBe('يومان عمل');
    expect(hardcodedFacts('يوما عمل')).toBeNull();
  });
  it('يحدّث الصف الذي على قيمته الأصلية وحده، ولا يمس تعديل اللوحة، وآمن لإعادة التشغيل', async () => {
    const db = new PGlite();
    await db.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key);
      create table leaders.journey_stages (program_id uuid not null, key text not null, duration_label text not null, duration_days smallint not null, primary key (program_id, key));
      insert into leaders.journey_stages values
        ('00000000-0000-0000-0000-000000000001', 'approval', '{duration} عمل', 3),
        ('00000000-0000-0000-0000-000000000002', 'approval', 'خمسة أيام عمل', 5),
        ('00000000-0000-0000-0000-000000000001', 'evaluation', '{duration}', 14);`);
    await db.exec(SQL);
    await db.exec(SQL);
    const { rows } = await db.query('select program_id, key, duration_label, duration_days from leaders.journey_stages order by program_id, key');
    expect(rows.map((r) => [r.key, r.duration_label, r.duration_days])).toEqual([
      ['approval', 'يوما عمل', 2], ['evaluation', '{duration}', 14], ['approval', 'خمسة أيام عمل', 5],
    ]);
    expect((await db.query('select name from leaders.schema_migrations')).rows).toEqual([{ name: MIG }]);
  });
});

describe('B3: القاعة تكوينية ولا تعد بدعوة (D17)', () => {
  const hall = read('leaders-app/src/screens/Hall.jsx');
  it('النصان المصححان', () => {
    expect(hall).toContain(`'${FIXED[2]}'`);
    expect(hall).toContain(FIXED[3]);
    expect(hall).not.toContain('وتصلك دعوة');
    expect(hall).not.toContain('يُحتسب في تقييمك المستمر');
  });
  it('ما يجعلهما صادقين: إجابات الجولة لا تدخل المستمر ولا الختامي، ولا بريد عند فتح القاعة', () => {
    expect(KATON_ENABLED).toBe(false);
    expect(Object.keys(CONTINUOUS_SOURCE_AR)).not.toContain('hall');
    expect(FINAL_DEFAULTS.sources.katon).toBe(0);
    expect(api('hall.ts')).not.toMatch(/sendMail\(/);
  });
});

describe('B4: «أثري» يُفتح مع القياس البعدي في طور الأثر', () => {
  it('النص والحكم الذي يفتحه', () => {
    expect(read('leaders-app/src/App.jsx')).toContain(`locked: '${FIXED[4]}'`);
    expect(PHASE_AR.impact).toBe('الأثر');
    const journey = (status) => ({ journey: [{ key: 'evaluation', phase: 'impact', status, items: [{ code: 'E-POST' }] }] });
    expect(impactOpen(journey('locked'))).toBe(false);
    expect(impactOpen(journey('active'))).toBe(true);
  });
});

describe('B5: المستشار باسمه في طلبات التوجيه', () => {
  it('«مستشارك» كما في بقية شاشات المشارك', () => {
    const pr = read('leaders-app/src/screens/PeerRequests.jsx');
    expect(pr).toContain('{d.advisor ? ` · مستشارك: ${d.advisor}` : \'\'}');
    expect(pr).not.toContain('خبير دفعتك');
    expect(api('peer.ts')).toMatch(/advisor: adv \? firstName\(adv\.full_name\) : null/);
  });
});

describe('B6: شريط الجهة لا يعد بتغطية مطلقة (D20)', () => {
  it('التغطية ضمن مقاعد العقد ومدته، والشريط لا يعرف من الجهة إلا اسمها ولونها', () => {
    const signIn = read('leaders-app/src/screens/SignIn.jsx');
    expect(signIn).toContain(`<small>${FIXED[6]}</small>`);
    expect(signIn).not.toContain('رسوم القياس والبرنامج مغطاة');
    expect(api('participant.ts')).toContain('org: { name: r.org.name, short_name: r.org.short_name, color: r.org.color }');
  });
});

describe('B7: «طلبات التوجيه» كما في عنوان بطاقتها', () => {
  it('بطاقة «ما بعد ذلك» تسمي البطاقة باسمها', () => {
    expect(nextCard(me())).toContain(FIXED[7]);
    expect(read('leaders-app/src/screens/PeerRequests.jsx')).toContain('<h3 id="pr-h">طلبات التوجيه</h3>');
  });
});

describe('النصوص المصححة بلا شرطة ولا واصلة', () => {
  it('كل نص', () => {
    for (const s of FIXED) expect(s, s).not.toMatch(/[-‐-―−]/);
  });
});
