// قالب البريد: العائلات وسطر المعاينة ودعوة التقويم
import { describe, expect, it } from 'vitest';
import { bdi, icsEvent, MAIL_FAMILY, mailCode, mailNote, mailRows, mailShell, mailText, plainText } from '../../supabase/functions/_shared/mail.ts';

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
