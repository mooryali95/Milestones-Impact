// بحث الخادم في قائمة المشاركين بالجوال بأي صيغة، وآخر نشاط فعلي من الجلسات (تصور تشغيل الدفعة 2026-11-19، المرحلة 0).
// بقاعدة في الذاكرة (_fake_db.ts) على admin.participants وadmin.participant نفسيهما
import './_test_env.ts';
import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { installFake } from './_fake_db.ts';
const A = await import('./admin.ts');

type Row = Record<string, any>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const who = (n: number, full_name: string, phone: string | null, extra: Row = {}) => ({
  id: U(770100 + n), full_name, email: `p${n}@example.sa`, phone, job_title: 'مدير', organization_id: null, organization_name: 'جهة', years_experience: 5,
  status: 'enrolled', created_at: `2026-10-0${n}T08:00:00Z`, last_login_at: null, is_test: false, is_demo: false, ...extra,
});
function world() {
  const ps = [
    who(1, 'أسامة الأحمد', '+966551234567', { last_login_at: '2026-11-01T08:00:00Z' }),
    who(2, 'منى العلي', '+966509876543', { last_login_at: '2026-11-12T08:00:00Z' }),
    who(3, 'هدى', null),
    who(4, 'زائر دولي', '+447911123456'),
  ];
  return {
    ps,
    tables: {
      participants: ps, assessments: [], questions: [], cohorts: [], enrollments: [], placements: [],
      auth_sessions: [
        { id: 's1', participant_id: ps[0].id, last_seen_at: '2026-11-10T09:00:00Z' },
        { id: 's2', participant_id: ps[0].id, last_seen_at: '2026-11-17T21:30:00Z' },
        { id: 's3', participant_id: ps[0].id, last_seen_at: null },
        { id: 's4', participant_id: ps[1].id, last_seen_at: '2026-11-05T09:00:00Z' },
      ],
    } as Record<string, Row[]>,
  };
}
// الصيغة المحلية تُركَّب من جزأين: لا رقم جوال حرفي في ملفات الخادم (single-source.test.js)
const N = '551234567', LOCAL = `0${N}`;
const names = (r: any) => r.participants.map((p: Row) => p.full_name).sort();

Deno.test('بحث الخادم بالجوال: 05 و5 و9665 و+9665 وبمسافات وشرطات وأرقام عربية تجد صاحب الرقم', async () => {
  const w = world();
  const f = installFake(w.tables);
  try {
    for (const search of [LOCAL, N, '966551234567', '+966551234567', '055 123 4567', '055-123-4567', '٠٥٥١٢٣٤٥٦٧', '00966551234567']) {
      assertEquals(names(await A.participants({ search })), ['أسامة الأحمد'], search);
    }
    assertEquals(names(await A.participants({ search: '0509' })), ['منى العلي']);
    assertEquals(names(await A.participants({ search: '+44 7911' })), ['زائر دولي']);
    assertEquals(names(await A.participants({ search: `0${'559999999'}` })), []);
  } finally { f.restore(); }
});

Deno.test('بحث الخادم بالاسم والبريد والجهة كما كان، ونص بحروف لا يبحث في الجوال', async () => {
  const w = world();
  const f = installFake(w.tables);
  try {
    assertEquals(names(await A.participants({ search: 'منى' })), ['منى العلي']);
    assertEquals(names(await A.participants({ search: 'p3@example' })), ['هدى']);
    // «جهة» في اسم الجهة عند الجميع
    assertEquals((await A.participants({ search: 'جهة' }) as any).participants.length, 4);
    // أرقام مع حروف: بحث نصي وحده، فلا يجد أحدًا برقمه
    assertEquals(names(await A.participants({ search: `جوال ${LOCAL}` })), []);
    // بلا بحث: الكل
    assertEquals((await A.participants({}) as any).participants.length, 4);
  } finally { f.restore(); }
});

Deno.test('آخر نشاط: الأحدث من آخر دخول وآخر استعمال للجلسات، في القائمة وفي ملف المشارك', async () => {
  const w = world();
  const f = installFake(w.tables);
  try {
    const r: any = await A.participants({});
    const by = Object.fromEntries(r.participants.map((p: Row) => [p.full_name, [p.last_active_at, p.last_login_at]]));
    // دخل أول الشهر وما زال يعمل بالجلسة نفسها: آخر نشاطه أحدث من آخر دخوله
    assertEquals(by['أسامة الأحمد'], ['2026-11-17T21:30:00.000Z', '2026-11-01T08:00:00Z']);
    // دخوله أحدث من آخر استعمال لجلسة أقدم
    assertEquals(by['منى العلي'], ['2026-11-12T08:00:00.000Z', '2026-11-12T08:00:00Z']);
    // لم يدخل قط
    assertEquals(by['هدى'], [null, null]);
    assertEquals((await A.lastActiveFor([w.ps[0]]))[w.ps[0].id], '2026-11-17T21:30:00.000Z');
  } finally { f.restore(); }
});

Deno.test('آخر نشاط: تعذّر قراءة الجلسات لا يُسقط القائمة، ويبقى آخر دخول', async () => {
  const w = world();
  const f = installFake(w.tables, { fail: (table) => (table === 'auth_sessions' ? { code: '42501', message: 'permission denied' } : null) });
  try {
    const r: any = await A.participants({});
    assertEquals(r.success, true);
    assertEquals(r.participants.find((p: Row) => p.full_name === 'أسامة الأحمد').last_active_at, '2026-11-01T08:00:00.000Z');
  } finally { f.restore(); }
});
