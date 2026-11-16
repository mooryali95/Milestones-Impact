// الرحلة J1 («رفع العوائق: عن بعد بلا رابط ولا موعد»): جلسة جماعية تُحفظ بلا موعد وبلا رابط، ويراها المشارك «يُحدد لاحقًا»
// و«يصلك الرابط قبل الجلسة» لا تاريخ 1970. اختبار لكل موضع يقرأ starts_at وends_at للجلسة الجماعية:
// القيد في القاعدة، والتنظيف، والحالة والترتيب ونافذة الحضور، والجاهزية بأدواتها الثلاث، وبطاقة «جلستك القادمة» وملفا التقويم،
// وقائمة ربط القاعة، وملف الدفعة في اللوحة.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import {
  bySessionTime, checkinOpen, isUndated, linkPending, SESSION_LINK_LATER_AR, SESSION_TBD_AR, workshopSchedule, workshopStatus,
} from '../../supabase/functions/leaders-api/logic.js';
import { cohortSetup, sessionsFor, undatedFor } from '../../supabase/functions/leaders-api/cohort-setup.js';
import { launchReadiness } from '../../supabase/functions/leaders-api/readiness.js';
import { hallWorkshopLabel } from '../../supabase/functions/leaders-api/hall.js';
import { cohortHub } from '../../admin-app/src/cohort-hub.js';
import { icsFor } from './ics.js';
import { NextSession, nextSession, sessionIcs } from './screens/Journey.jsx';
import Activity from './screens/Activities.jsx';

const ROOT = join(__dirname, '../..');
const MIG = '20261116010000_leaders_journey_blocks';
const NOW = Date.parse('2026-11-16T09:00:00Z');
const H = 36e5;
const at = (h) => new Date(NOW + h * H).toISOString();
const undated = { id: 'u1', title_ar: 'اليوم الأول عن بعد', mode: 'online', join_url: null, starts_at: null, ends_at: null, active: true, cohort_id: 'c1', created_at: at(-48) };
const dated = { id: 'd1', title_ar: 'اليوم الثاني', mode: 'in_person', location_ar: 'القاعة', starts_at: at(24), ends_at: at(30), active: true, cohort_id: 'c1', created_at: at(-24) };

describe('الترحيل: الموعد فارغ معًا أو محدد معًا', () => {
  const sql = readFileSync(join(ROOT, `supabase/migrations/${MIG}.sql`), 'utf8');
  it('رأسه بوابة نشر tolerant واسمه يُسجَّل', () => {
    expect(sql).toMatch(/^-- deploy-gate: tolerant /m);
    expect(sql).toContain(`insert into leaders.schema_migrations (name) values ('${MIG}')`);
  });
  it('على قاعدة حقيقية: يقبل الفارغين والمؤرخ، ويرفض الجزئي والمقلوب، ويُعاد تشغيله بلا خطأ', async () => {
    const db = new PGlite();
    await db.exec(`create schema leaders;
      create table leaders.schema_migrations (name text primary key);
      create table leaders.workshop_sessions (id serial primary key, title_ar text not null, starts_at timestamptz not null, ends_at timestamptz not null, check (ends_at > starts_at));
      insert into leaders.workshop_sessions (title_ar, starts_at, ends_at) values ('قائمة', '2026-11-20 09:00Z', '2026-11-20 15:00Z');`);
    await db.exec(sql);
    await db.exec(sql);
    await db.exec(`insert into leaders.workshop_sessions (title_ar) values ('بلا موعد')`);
    await db.exec(`insert into leaders.workshop_sessions (title_ar, starts_at, ends_at) values ('مؤرخة', '2026-12-01 09:00Z', '2026-12-01 12:00Z')`);
    await expect(db.exec(`insert into leaders.workshop_sessions (title_ar, starts_at) values ('بدء وحده', '2026-12-01 09:00Z')`)).rejects.toThrow(/workshop_sessions_dates_check/);
    await expect(db.exec(`insert into leaders.workshop_sessions (title_ar, starts_at, ends_at) values ('مقلوبة', '2026-12-01 12:00Z', '2026-12-01 09:00Z')`)).rejects.toThrow(/workshop_sessions_dates_check/);
    const { rows } = await db.query('select count(*)::int as n from leaders.workshop_sessions');
    expect(rows[0].n).toBe(3);
    const { rows: m } = await db.query('select name from leaders.schema_migrations');
    expect(m.map((x) => x.name)).toEqual([MIG]);
    // القيد القديم غير المسمى (workshop_sessions_check) سقط فعلًا: لا يبقى إلا القيد الجديد
    const { rows: k } = await db.query(`select conname from pg_constraint where conrelid = 'leaders.workshop_sessions'::regclass and contype = 'c' order by conname`);
    expect(k.map((x) => x.conname)).toEqual(['workshop_sessions_dates_check']);
  });
  it('اللقطة المجمّعة بالقيد الجديد والعمودين الاختياريين', () => {
    const base = readFileSync(join(ROOT, 'supabase/schema/baseline.sql'), 'utf8');
    const table = base.slice(base.indexOf('create table if not exists leaders.workshop_sessions'), base.indexOf(');', base.indexOf('create table if not exists leaders.workshop_sessions')));
    expect(table).toContain('starts_at timestamp with time zone,');
    expect(table).toContain('ends_at timestamp with time zone,');
    expect(table).toContain('workshop_sessions_dates_check');
    expect(table).not.toContain('workshop_sessions_check CHECK ((ends_at > starts_at))');
  });
});

describe('workshopSchedule: الحفظ من اللوحة (activities.ts: workshopSave)', () => {
  it('عن بعد بلا رابط ولا موعد يُقبل: «يُحدد لاحقًا»', () => {
    expect(workshopSchedule({ mode: 'online', join_url: '', starts_at: null, ends_at: '' })).toEqual({ starts_at: null, ends_at: null, join_url: null });
  });
  it('رسائل صحيحة: الجزئي، والمقلوب، والصيغة، والرابط بلا https', () => {
    expect(workshopSchedule({ starts_at: at(1), ends_at: null }).error).toBe('حدد وقتي البدء والانتهاء معًا، أو اتركهما فارغين ليُحدد الموعد لاحقًا');
    expect(workshopSchedule({ starts_at: null, ends_at: at(1) }).error).toBe('حدد وقتي البدء والانتهاء معًا، أو اتركهما فارغين ليُحدد الموعد لاحقًا');
    expect(workshopSchedule({ starts_at: at(2), ends_at: at(1) }).error).toBe('وقت الانتهاء يجب أن يكون بعد وقت البدء');
    expect(workshopSchedule({ starts_at: at(2), ends_at: at(2) }).error).toBe('وقت الانتهاء يجب أن يكون بعد وقت البدء');
    expect(workshopSchedule({ starts_at: 'غدًا', ends_at: at(2) }).error).toBe('صيغة الموعد غير صحيحة');
    expect(workshopSchedule({ mode: 'online', join_url: 'zoom.us/j/1' }).error).toBe('رابط الاجتماع يبدأ بـ https، أو اتركه فارغًا ليُضاف لاحقًا');
  });
  it('المؤرخ يُنظَّف ISO، والرابط للجلسة عن بعد وحدها', () => {
    expect(workshopSchedule({ mode: 'online', join_url: ' https://zoom.us/j/1 ', starts_at: at(1), ends_at: at(2) })).toEqual({ starts_at: at(1), ends_at: at(2), join_url: 'https://zoom.us/j/1' });
    expect(workshopSchedule({ mode: 'in_person', join_url: 'https://zoom.us/j/1', starts_at: at(1), ends_at: at(2) }).join_url).toBeNull();
  });
});

describe('حالة النشاط للمشارك (logic.js: workshopStatus وcheckinOpen وbySessionTime)', () => {
  it('غير المؤرخة بعد المؤرخة، بلا تاريخ، ولا تُفتح، ولا تُحتسب آليًا، وتُعلَّم «الرابط لاحقًا»', () => {
    const st = workshopStatus({ verify: 'auto', sessions_required: 2 }, [undated, dated], new Set(), NOW + 40 * H);
    expect(st.sessions.map((s) => s.id)).toEqual(['d1', 'u1']);
    const u = st.sessions[1];
    expect(u).toMatchObject({ undated: true, starts_at: null, ends_at: null, open: false, attended: false, can_join: false, link_later: true });
    expect(st.sessions[0]).toMatchObject({ undated: false, attended: true, link_later: false });
    expect(st.count).toBe(1);
    expect(JSON.stringify(st)).not.toContain('1970');
  });
  it('الحضور المسجّل يدويًا لغير المؤرخة يُحتسب (التوثيق بيد المدرب)', () => {
    expect(workshopStatus({ verify: 'manual' }, [undated], new Set(['u1']), NOW).done).toBe(true);
  });
  it('نافذة الحضور مغلقة دائمًا لغير المؤرخة، وللمؤرخة كما كانت', () => {
    expect(checkinOpen(undated, NOW)).toBe(false);
    expect(checkinOpen({ ...undated, starts_at: at(0) }, NOW)).toBe(false);
    expect(checkinOpen(dated, NOW + 24 * H)).toBe(true);
    expect(isUndated(dated)).toBe(false);
    expect([undated, dated].sort(bySessionTime).map((s) => s.id)).toEqual(['d1', 'u1']);
  });
});

describe('الجاهزية: «يُحدد لاحقًا» لا يمنع الإطلاق ويظهر في العدّاد', () => {
  const cohort = { id: 'c1', name: 'دفعة الجهة', organization_id: 'o1', status: 'open', advisor_expert_id: 'e1', schedule: { s: {} }, starts_on: '2026-11-01', ends_on: '2027-01-01' };
  it('sessionsFor تعدّها وundatedFor تعدّها منفصلة (cohort-setup.js، ومنه programs.ts وsystem.ts)', () => {
    expect(sessionsFor(cohort, [undated], NOW)).toBe(1);
    expect(undatedFor(cohort, [undated, dated])).toBe(1);
    expect(sessionsFor(cohort, [{ ...dated, starts_at: at(-30 * 24), ends_at: at(-30 * 24 + 1) }], NOW)).toBe(0);
    expect(undatedFor(cohort, [{ ...undated, active: false }])).toBe(0);
  });
  it('بند الجلسات في ملف الدفعة جاهز ويقول «بموعد يُحدد لاحقًا» بعدده الصحيح', () => {
    const only = cohortSetup({ cohort, upcomingSessions: 1, undatedSessions: 1 }).find((x) => x.key === 'sessions');
    expect(only).toMatchObject({ ok: true, detail: 'جلسة واحدة بموعد يُحدد لاحقًا' });
    expect(cohortSetup({ cohort, upcomingSessions: 3, undatedSessions: 3 }).find((x) => x.key === 'sessions').detail).toBe('3 جلسات بموعد يُحدد لاحقًا');
    const mix = cohortSetup({ cohort, upcomingSessions: 3, undatedSessions: 1 }).find((x) => x.key === 'sessions');
    expect(mix.detail).toBe('3 جلسة قادمة أو حديثة، منها جلسة واحدة بموعد يُحدد لاحقًا');
    expect(cohortSetup({ cohort, upcomingSessions: 2 }).find((x) => x.key === 'sessions').detail).toBe('2 جلسة قادمة أو حديثة');
  });
  it('جاهزية الإطلاق (readiness.js، ومنها system.ts وبوابة المراحل) تعدّ غير المؤرخة', () => {
    const items = launchReadiness({ organizations: [{ id: 'o1', name: 'الجهة', status: 'active' }], cohorts: [cohort], sessions: [undated] }, NOW);
    expect(items.find((x) => x.key === 'sessions')).toMatchObject({ ok: true, label: 'لكل دفعة جهة مواعيد قادمة أو صيغة الكتيب، وجلسة واحدة بموعد يُحدد لاحقًا' });
  });
  it('الجلسة بلا دفعة تُعد مرة واحدة لا مرة لكل دفعة', () => {
    const cohorts = ['c1', 'c2', 'c3'].map((id) => ({ ...cohort, id, name: id }));
    const all = { ...undated, cohort_id: null };
    const label = (sessions) => launchReadiness({ organizations: [{ id: 'o1', name: 'الجهة', status: 'active' }], cohorts, sessions }, NOW).find((x) => x.key === 'sessions').label;
    expect(label([all])).toContain('وجلسة واحدة بموعد يُحدد لاحقًا');
    expect(label([all, { ...undated, id: 'u2', cohort_id: 'c2' }])).toContain('وجلستان بموعد يُحدد لاحقًا');
    expect(label([all, { ...undated, id: 'u9', cohort_id: 'other' }])).toContain('وجلسة واحدة بموعد');
  });
  it('ملف الدفعة في اللوحة يمرر العدد (cohort-hub.js)', () => {
    const hub = cohortHub({ cohort: { ...cohort, members: 3, upcoming_sessions: 1, undated_sessions: 1, program_id: 'p1' }, programs: [{ id: 'p1', name: 'البرنامج', requirements: 3, versions: [] }], cohorts: [], orgs: [] });
    const item = (hub.items || hub.checklist || hub).find?.((x) => x.key === 'sessions') || JSON.stringify(hub);
    expect(JSON.stringify(item)).toContain('جلسة واحدة بموعد يُحدد لاحقًا');
  });
});

describe('ما يراه المشارك: لا 1970 ولا تقويم ولا «قادمة»', () => {
  const journey = (sessions) => [{ items: [{ activity: { type: 'workshop', sessions } }] }];
  const view = (s) => workshopStatus({ verify: 'join' }, s, new Set(), NOW).sessions;
  it('nextSession: المؤرخة القادمة أولًا، وبلا مؤرخة أول غير مؤرخة (Journey.jsx)', () => {
    expect(nextSession(journey(view([undated, dated])), NOW).id).toBe('d1');
    expect(nextSession(journey(view([undated])), NOW).id).toBe('u1');
    expect(nextSession(journey(view([{ ...dated, starts_at: at(-30), ends_at: at(-24) }])), NOW)).toBeNull();
  });
  it('بطاقة «لك جلسة سيُعلن موعدها» بلا زر تقويم', () => {
    const html = renderToStaticMarkup(React.createElement(NextSession, { session: view([undated])[0] }));
    expect(html).toContain('لك جلسة سيُعلن موعدها');
    // العنوان يقول إن الموعد يُعلن لاحقًا، فلا يُكرر في السطر
    expect(html).not.toContain(`الموعد ${SESSION_TBD_AR}`);
    expect(html).toContain('عن بعد · ' + SESSION_LINK_LATER_AR);
    expect(html).toContain(SESSION_LINK_LATER_AR);
    expect(html).not.toContain('1970');
    expect(html).not.toContain('أضفها إلى تقويمك');
    expect(html).not.toContain('جلستك القادمة');
  });
  it('بند النشاط في الرحلة: «يُحدد لاحقًا» و«يصلك الرابط»، بلا «قادمة» ولا تلميح QR لجلسة عن بعد (Activities.jsx)', () => {
    const a = workshopStatus({ verify: 'qr' }, [undated], new Set(), NOW);
    const html = renderToStaticMarkup(React.createElement(Activity, { item: { id: 'r1', activity: a }, open: true, setToast: () => {} }));
    expect(html).toContain(SESSION_TBD_AR);
    expect(html).toContain(SESSION_LINK_LATER_AR);
    expect(html).not.toContain('1970');
    expect(html).not.toContain('قادمة');
    expect(html).not.toContain('أضف إلى تقويمي');
    expect(html).not.toContain('امسح رمز الحضور');
    const inPerson = renderToStaticMarkup(React.createElement(Activity, { item: { id: 'r1', activity: workshopStatus({ verify: 'qr' }, [dated], new Set(), NOW) }, open: true, setToast: () => {} }));
    expect(inPerson).toContain('امسح رمز الحضور');
  });
  it('«يصلك الرابط» لما قبل الجلسة وحدها: لا للجارية ولا المنتهية (linkPending)', () => {
    const later = { ...dated, mode: 'online', join_url: null, location_ar: null };
    const [past] = workshopStatus({ verify: 'join' }, [{ ...later, starts_at: at(-30), ends_at: at(-24) }], new Set(), NOW).sessions;
    const [live] = workshopStatus({ verify: 'join' }, [{ ...later, starts_at: at(-1), ends_at: at(2) }], new Set(), NOW).sessions;
    const [soon] = workshopStatus({ verify: 'join' }, [later], new Set(), NOW).sessions;
    expect([linkPending(past, NOW), linkPending(live, NOW), linkPending(soon, NOW), linkPending(view([undated])[0], NOW)]).toEqual([false, false, true, true]);
    const card = renderToStaticMarkup(React.createElement(NextSession, { session: { ...live, open: true } }));
    expect(card).toContain('جلستك الآن');
    expect(card).not.toContain(SESSION_LINK_LATER_AR);
  });
  it('تحقق بالانضمام ولا رابط بعد: لا «انضم من هنا» بلا زر، بل متى يظهر الزر', () => {
    const render = (s) => renderToStaticMarkup(React.createElement(Activity, { item: { id: 'r1', activity: workshopStatus({ verify: 'join' }, s, new Set(), NOW) }, open: true, setToast: () => {} }));
    const html = render([undated]);
    expect(html).not.toContain('انضم إلى الجلسة من هنا');
    expect(html).toContain('يظهر زر الانضمام هنا حين يُضاف رابط الجلسة');
    expect(render([{ ...undated, join_url: 'https://meet.example/x' }])).toContain('انضم إلى الجلسة من هنا');
  });
  it('نشاط حضور بلا جلسات: «لم تُجدول بعد» لا «حضرت 0 من 1»', () => {
    const html = renderToStaticMarkup(React.createElement(Activity, { item: { id: 'r1', activity: workshopStatus({}, [], new Set(), NOW) }, open: true, setToast: () => {} }));
    expect(html).toContain('لم تُجدول بعد');
    expect(html).not.toContain('حضرت 0 من 1');
  });
  it('ملفا التقويم فارغان لغير المؤرخة (ics.js وsessionIcs)', () => {
    expect(icsFor({ uid: 'u1', title: 'x', start: null, end: null })).toBe('');
    expect(sessionIcs(view([undated])[0])).toBe('');
    expect(sessionIcs(view([dated])[0])).toContain('DTSTART:');
  });
  it('قائمة ربط القاعة: «يُحدد لاحقًا» لا تاريخ 1970 (HallControl.jsx)', () => {
    expect(hallWorkshopLabel({ title: 'اليوم الأول', starts_at: null })).toBe(`اليوم الأول · ${SESSION_TBD_AR}`);
    expect(hallWorkshopLabel({ title: 'اليوم الأول', starts_at: at(1) })).not.toContain('1970');
  });
});
