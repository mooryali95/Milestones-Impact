import { mergeInbox, filterInbox, statusOf, countBySource } from './inbox';
import { RESULT } from './api';
import { SOURCES, FIELD } from '../config/sources';

const matrix = SOURCES.find((s) => s.id === 'matrix');
const site = SOURCES.find((s) => s.id === 'home-contact');

const ok = (data) => ({ state: RESULT.OK, data, message: '' });

const reg = (over) => ({ id: 'r1', name: 'سارة', registeredAt: '2026-08-01T10:00:00Z', ...over });
const req = (over) => ({ id: 'c1', name: 'نورة', created_at: '2026-09-02T08:00:00Z', ...over });

describe('mergeInbox', () => {
  it('تدمج المصدرين وترتّب بالأحدث عبرهما', () => {
    const items = mergeInbox([matrix, site], {
      matrix: ok([reg({ id: 'r1', registeredAt: '2026-08-01T00:00:00Z' })]),
      'home-contact': ok([req({ id: 'c1', created_at: '2026-09-02T00:00:00Z' })]),
    });
    // الترتيب عبر المصدرين لا داخل كلٍّ على حدة
    expect(items.map((i) => i.row.id)).toEqual(['c1', 'r1']);
    expect(items[0].source.id).toBe('home-contact');
  });

  it('تقرأ مفتاح التاريخ الخاص بكل مصدر', () => {
    // المصفوفة registeredAt والموقع created_at — مفتاحٌ واحد لا يكفي.
    const items = mergeInbox([matrix, site], {
      matrix: ok([reg({ registeredAt: '2026-09-05T00:00:00Z' })]),
      'home-contact': ok([req({ created_at: '2026-09-01T00:00:00Z' })]),
    });
    expect(items[0].source.id).toBe('matrix');
  });

  it('تتجاوز مصدراً لم ينجح ولا تُسقط البقية', () => {
    const items = mergeInbox([matrix, site], {
      matrix: ok([reg()]),
      'home-contact': { state: RESULT.UNSUPPORTED, data: [], message: '' },
    });
    expect(items).toHaveLength(1);
    expect(items[0].source.id).toBe('matrix');
  });

  it('تتجاوز مصدراً لم تصله بيانات أصلاً', () => {
    expect(mergeInbox([matrix, site], { matrix: ok([reg()]) })).toHaveLength(1);
  });

  it('تاريخٌ مختلّ أو غائب يهبط للآخر ولا يُفسد الترتيب', () => {
    const items = mergeInbox([site], {
      'home-contact': ok([
        req({ id: 'bad', created_at: 'ليس تاريخاً' }),
        req({ id: 'none', created_at: null }),
        req({ id: 'good', created_at: '2026-09-01T00:00:00Z' }),
      ]),
    });
    expect(items[0].row.id).toBe('good');
    expect(items).toHaveLength(3);   // لا يُحذف أحد
  });

  it('بلا مصادر مرئية تعيد فارغاً', () => {
    expect(mergeInbox([], { matrix: ok([reg()]) })).toEqual([]);
  });
});

describe('filterInbox', () => {
  const items = mergeInbox([matrix, site], {
    matrix: ok([reg({ name: 'سارة القحطاني', email: 's@example.com' })]),
    'home-contact': ok([req({ name: 'نورة الدوسري', organization: 'وزارة الثقافة' })]),
  });

  it('بلا ترشيح تُعيد الكل', () => {
    expect(filterInbox(items)).toHaveLength(2);
  });

  it('تعزل مصدراً', () => {
    expect(filterInbox(items, { sourceId: 'home-contact' }).map((i) => i.row.name)).toEqual(['نورة الدوسري']);
  });

  it('تبحث في حقلٍ لا يوجد إلا في مصدرٍ واحد', () => {
    // «الجهة» في الموقع ولا مقابل لها في المصفوفة — والبحث لا ينفجر.
    expect(filterInbox(items, { query: 'وزارة' })).toHaveLength(1);
  });

  it('البحث لا يفرّق بين حالتَي الحرف ويتجاهل الفراغ حوله', () => {
    expect(filterInbox(items, { query: '  S@EXAMPLE.COM ' })).toHaveLength(1);
  });

  it('تجمع الترشيح والبحث', () => {
    expect(filterInbox(items, { sourceId: 'matrix', query: 'نورة' })).toHaveLength(0);
  });

  it('لا تبحث خارج الحقول المعلَنة في السجلّ', () => {
    // مفتاحٌ داخليّ في الصفّ لا يُطابَق — وإلا سُرّب ما لا يُعرض.
    const withSecret = mergeInbox([site], {
      'home-contact': ok([req({ session_token: 'سرّي-جداً' })]),
    });
    expect(filterInbox(withSecret, { query: 'سرّي' })).toHaveLength(0);
  });
});

describe('statusOf', () => {
  it('«طلب إعادة فتح» أخصّ من «مُقدَّم» فيغلبه', () => {
    // من طلب الفتح مُقدِّمٌ أيضاً، فالترتيب في السجلّ هو ما يحسم.
    const s = statusOf(matrix, { submitted: true, reopenRequested: true });
    expect(s.id).toBe('reopen');
  });

  it('تميّز المُقدَّم من قيد التخطيط', () => {
    expect(statusOf(matrix, { submitted: true }).id).toBe('submitted');
    expect(statusOf(matrix, { submitted: false }).id).toBe('planning');
  });

  it('غياب الحالة في الموقع يُقرأ «جديد»', () => {
    expect(statusOf(site, {}).id).toBe('new');
    expect(statusOf(site, { status: 'contacted' }).id).toBe('contacted');
  });

  it('حالةٌ لا تُطابق شيئاً تعيد null لا تنفجر', () => {
    expect(statusOf(site, { status: 'لا-وجود-له' })).toBe(null);
    expect(statusOf({ statuses: undefined }, {})).toBe(null);
  });
});

describe('countBySource', () => {
  it('تعدّ لكل مصدر على حدة', () => {
    const items = mergeInbox([matrix, site], {
      matrix: ok([reg({ id: 'a' }), reg({ id: 'b' })]),
      'home-contact': ok([req()]),
    });
    expect(countBySource(items)).toEqual({ matrix: 2, 'home-contact': 1 });
  });
});

describe('سلامة السجلّ نفسه', () => {
  it('لكل مصدرٍ مفاتيحه الأساسية', () => {
    for (const s of SOURCES) {
      expect(s.id && s.nameAr && s.whereAr && s.action && s.dataKey).toBeTruthy();
      expect(s.idKey && s.titleKey && s.dateKey).toBeTruthy();
      expect(Array.isArray(s.fields) && s.fields.length).toBeTruthy();
    }
  });

  it('المعرّفات فريدة — الصلاحيات تُربط بها', () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('كل حقلٍ نوعُه معروف — وإلا صُيِّر نصّاً بلا قصد', () => {
    const known = new Set(Object.values(FIELD));
    for (const s of SOURCES) for (const f of s.fields) {
      expect(known.has(f.type)).toBe(true);
      expect(f.labelAr).toBeTruthy();
    }
  });

  it('مفتاح التاريخ من ضمن الحقول المعلَنة', () => {
    for (const s of SOURCES) {
      expect(s.fields.some((f) => f.key === s.dateKey)).toBe(true);
    }
  });
});
