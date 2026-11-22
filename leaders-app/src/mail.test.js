// قالب البريد: العائلات وسطر المعاينة ودعوة التقويم
import { describe, expect, it } from 'vitest';
import { bdi, icsEvent, icsFold, icsSequence, MAIL_FAMILY, mailCode, mailNote, mailRows, mailShell, mailText, plainText } from '../../supabase/functions/_shared/mail.ts';

const dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

describe('البريد', () => {
  it('العائلة تضع سطرها، وسطر المعاينة مخفي داخل الرسالة', () => {
    const h = mailShell('عنوان', '<p>نص</p>', { family: 'sessions', preheader: 'غدًا 10:00' });
    expect(h).toContain(MAIL_FAMILY.sessions);
    expect(h).toMatch(/display:none[^>]*>غدًا 10:00/);
  });
  it('دعوة التقويم صحيحة ومهرّبة، وبتنبيه قبل نصف ساعة', () => {
    const r = icsEvent({ uid: 'x1', start: '2026-11-02T07:00:00Z', end: '2026-11-02T07:45:00Z', title: 'جلسة، مع; د. منى', url: 'https://meet.example/x' });
    const t = dec(r.content);
    expect(r.filename).toBe('session.ics');
    expect(t).toContain('DTSTART:20261102T070000Z');
    expect(t).toContain('DTEND:20261102T074500Z');
    expect(t).toContain('SUMMARY:جلسة، مع\\; د. منى');
    expect(t).toContain('TRIGGER:-PT30M');
    expect(t.split('\r\n').at(-2)).toBe('END:VCALENDAR');
  });
  // ملف التقويم مصدر واحد لدعوة الورشة وإشعار تغييرها ودعوة الجلسة الجماعية وإلغائها (icsEvent)
  const bytes = (l) => new TextEncoder().encode(l).length;
  const unfold = (t) => t.replace(/\r\n /g, '');
  const field = (t, k) => new RegExp(`^${k}:(.*)$`, 'm').exec(unfold(t).replace(/\r/g, ''))?.[1];
  it('الدعوة ثم تغيير الموعد ثم الإلغاء: المعرّف ثابت، ورقم التسلسل يكبر، والإلغاء بـMETHOD:CANCEL', () => {
    const base = { uid: 'row-7', title: 'جلسة جماعية: الاستشارة · برنامج القادة', url: 'https://meet.example/x' };
    const t0 = '2026-11-22T08:00:00.000Z', t1 = '2026-11-23T09:30:00.000Z', t2 = '2026-11-24T07:15:10.000Z';
    const invite = icsEvent({ ...base, start: '2026-12-06T07:00:00Z', end: '2026-12-06T08:30:00Z', sequence: icsSequence(t0) });
    const moved = icsEvent({ ...base, start: '2026-12-07T08:00:00Z', end: '2026-12-07T09:00:00Z', sequence: icsSequence(t0, t1) });
    const off = icsEvent({ ...base, start: '2026-12-07T08:00:00Z', end: '2026-12-07T09:00:00Z', sequence: icsSequence(t1, t2, null), method: 'CANCEL' });
    const [a, b, c] = [invite, moved, off].map((x) => dec(x.content));
    expect([a, b, c].map((t) => field(t, 'UID'))).toEqual(['row-7@sunkvalue.com', 'row-7@sunkvalue.com', 'row-7@sunkvalue.com']);
    expect([a, b, c].map((t) => field(t, 'METHOD'))).toEqual(['PUBLISH', 'PUBLISH', 'CANCEL']);
    const seq = [a, b, c].map((t) => Number(field(t, 'SEQUENCE')));
    expect(seq).toEqual([Date.parse(t0) / 1000, Date.parse(t1) / 1000, Math.floor(Date.parse(t2) / 1000)]);
    expect(seq[0] < seq[1] && seq[1] < seq[2]).toBe(true);
    // رقم التسلسل ضمن عدد صحيح 32 بت (حد بعض برامج التقويم)
    expect(seq[2]).toBeLessThan(2 ** 31);
    expect(field(b, 'DTSTART')).toBe('20261207T080000Z');
    // ملف الإلغاء: حالة ملغاة، بلا تنبيه ولا رابط، واسم ونوع يقولان إنه إلغاء
    expect(c).toContain('STATUS:CANCELLED');
    expect(c).not.toMatch(/VALARM|URL:|LOCATION:/);
    expect([off.filename, off.content_type]).toEqual(['cancel.ics', 'text/calendar; charset=utf-8; method=CANCEL']);
    expect([invite.filename, invite.content_type]).toEqual(['session.ics', 'text/calendar; charset=utf-8; method=PUBLISH']);
    expect(a).not.toContain('STATUS:CANCELLED');
    // ترتيب الأقسام سليم في كل ملف
    for (const t of [a, b, c]) {
      const lines = t.split('\r\n');
      expect([lines[0], lines[4], lines.at(-3), lines.at(-2), lines.at(-1)]).toEqual(['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'END:VEVENT', 'END:VCALENDAR', '']);
    }
  });
  it('رقم التسلسل: أحدث الأوقات المعطاة بالثواني، ويبقى كما هو لإعادة الإرسال، وبلا وقت مقروء يأخذ الساعة', () => {
    expect(icsSequence('2026-11-22T08:00:00Z', '2026-11-22T08:00:05.900Z')).toBe(Math.floor(Date.parse('2026-11-22T08:00:05.900Z') / 1000));
    expect(icsSequence('2026-11-22T08:00:00Z')).toBe(icsSequence('2026-11-22T08:00:00Z', undefined, ''));
    const now = Math.floor(Date.now() / 1000);
    expect(icsSequence(null, 'x')).toBeGreaterThanOrEqual(now);
    // ملف إلغاء بلا رقم يأخذ الساعة: لا يخرج إلغاء بلا تسلسل
    expect(Number(field(dec(icsEvent({ uid: 'u', start: '2026-12-06T07:00:00Z', end: '2026-12-06T08:00:00Z', title: 'x', method: 'CANCEL' }).content), 'SEQUENCE'))).toBeGreaterThanOrEqual(now);
    // والدعوة بلا رقم تبقى بلا سطر تسلسل (دعوة الورشة كما كانت)
    expect(dec(icsEvent({ uid: 'u', start: '2026-12-06T07:00:00Z', end: '2026-12-06T08:00:00Z', title: 'x' }).content)).not.toContain('SEQUENCE');
  });
  it('الأسطر تنتهي بـCRLF، والطويل يُطوى عند 75 بايتًا بلا قطع حرف عربي، وفكّ الطي يعيد النص كما هو', () => {
    const title = 'جلسة جماعية مع المستشار: مراجعة خطة المبادرة وقياس أثرها على المستفيدين في الربع القادم · برنامج القادة';
    const url = `https://teams.microsoft.com/l/meetup-join/${'x'.repeat(160)}`;
    const t = dec(icsEvent({ uid: 'x1', start: '2026-11-02T07:00:00Z', end: '2026-11-02T07:45:00Z', title, description: 'قاعة الاجتماعات، الدور الثالث; المبنى الرئيسي', url, sequence: 5 }).content);
    expect(t.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(t).not.toMatch(/[^\r]\n/);
    const lines = t.split('\r\n');
    expect(lines.every((l) => bytes(l) <= 75)).toBe(true);
    expect(lines.filter((l) => l.startsWith(' ')).length).toBeGreaterThan(3);
    // لا حرف مقطوع: النص يُقرأ UTF-8 بلا حرف بديل، وفكّ الطي يعيد العنوان والرابط كاملين
    expect(t).not.toContain('�');
    expect(field(t, 'SUMMARY')).toBe(title);
    expect(field(t, 'URL')).toBe(url);
    expect(field(t, 'DESCRIPTION')).toBe('قاعة الاجتماعات، الدور الثالث\\; المبنى الرئيسي');
    // الدالة نفسها: القصير كما هو، والطويل قطع أولها 75 وما بعدها مسافة ثم 74
    expect(icsFold('SUMMARY:قصير')).toBe('SUMMARY:قصير');
    const parts = icsFold(`X:${'a'.repeat(200)}`).split('\r\n');
    expect(parts.map((l) => l.length)).toEqual([75, 75, 54]);
    expect(parts.slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(parts.join('').replace(/ /g, '')).toBe(`X:${'a'.repeat(200)}`);
  });
});

// P1-13: Gmail يحذف head وسمات html وbody، فما بقي من الاتجاه هو ما على الجداول والخلايا والفقرات نفسها.
// بواجهة إنجليزية كان المتن كله يسار الصفحة، وتنتقل نقطة الجملة إلى أول السطر ويتقلب الاسم اللاتيني
describe('اتجاه البريد بعد حذف Gmail لسمات html وbody', () => {
  const NAME = 'Sara <b>Al-Otaibi</b>';
  const URL = `https://teams.microsoft.com/l/meetup-join/${'x'.repeat(160)}`;
  const html = mailShell('طلب تقدير', mailText(`أهلًا ${bdi(NAME)}، يشارك ${bdi('a@b.sa')} في البرنامج.`)
    + mailRows([['الاسم', 'John Smith'], ['الرابط', URL, true]]) + mailNote(bdi('KPIs first.')) + mailCode('482913', 'صالح 10 دقائق'));
  // كما يعرضه Gmail: المتن داخل عنصر بلا اتجاه، في صفحة اتجاهها اتجاه الواجهة
  const gmail = () => {
    document.documentElement.setAttribute('dir', 'ltr');
    const box = document.createElement('div');
    box.innerHTML = html.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '');
    return box;
  };
  const rtl = (el, what) => {
    expect(el.getAttribute('dir'), what).toBe('rtl');
    expect(el.style.textAlign, what).toBe('right');
  };
  it('الإطار وخلية المتن والعنوان وكل فقرة: rtl ومحاذاة يمين بعد الحذف', () => {
    expect(html).toMatch(/<html dir="rtl"/);   // ما كان وحده يحمل الاتجاه
    const box = gmail();
    const [frame, card] = box.querySelectorAll('table');
    rtl(frame, 'الإطار الخارجي');
    rtl(card, 'البطاقة');
    const cell = box.querySelector('h1').closest('td');
    rtl(cell, 'خلية المتن');
    expect(cell.getAttribute('align')).toBe('right');
    for (const el of box.querySelectorAll('h1, p')) {
      rtl(el, el.outerHTML.slice(0, 40));
      expect(el.getAttribute('align')).toBe('right');
    }
    // لا align على الجداول: يجعلها عائمة في المتصفحات فيخرج ما بعدها عن مكانه
    for (const t of box.querySelectorAll('table')) expect(t.getAttribute('align') || 'center').toBe('center');
  });
  it('القيمة التي كتبها المستخدم معزولة في bdi ومرمّزة، والنص العادي لا يتغير', () => {
    const box = gmail();
    const names = [...box.querySelectorAll('bdi')].map((b) => b.textContent);
    expect(names).toEqual(expect.arrayContaining([NAME, 'a@b.sa', 'John Smith', URL, 'KPIs first.', '482913']));
    expect(box.querySelector('bdi b')).toBeNull();
    expect(plainText(mailText(`أهلًا ${bdi('Sara')}، تفضل.`))).toBe('أهلًا Sara، تفضل.');
  });
  it('خلية القيمة تكسر الرابط الطويل فلا يمد الرسالة على الجوال، وصفوفها rtl', () => {
    const box = gmail();
    const rows = [...box.querySelectorAll('tr')].filter((tr) => tr.cells.length === 2 && tr.querySelector('bdi'));
    expect(rows).toHaveLength(2);
    for (const tr of rows) {
      const [k, v] = tr.cells;
      rtl(k, 'التسمية');
      expect(v.getAttribute('align')).toBe('right');
      expect(v.style.textAlign).toBe('right');
      expect(v.getAttribute('style')).toMatch(/word-break:break-word;overflow-wrap:anywhere/);
    }
    // القيمة اللاتينية تبقى ltr في خلية محاذاتها يمين
    expect(rows[1].cells[1].getAttribute('dir')).toBe('ltr');
    expect(rows[0].cells[1].getAttribute('dir')).toBe('rtl');
  });
});
