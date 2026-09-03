import { CAN, MANAGE_ACCESS, normalize, can, canManageAccess, visibleSources, summarize } from './permissions';
import { SOURCES } from '../config/sources';

// ════════════════════════════════════════════════════════════════
// الصلاحيات
// ════════════════════════════════════════════════════════════════
// الحالة الخطرة هنا ليست «منع من يستحق» بل «فتح لمن لا يستحق».
// فأكثر ما يلي يثبّت أن الغياب والشكل المُعطَل والقيمة المجهولة
// كلها تُغلق لا تفتح.

const full = normalize({
  [MANAGE_ACCESS]: true,
  sources: { matrix: ['view', 'edit', 'export', 'delete'], 'home-contact': ['view'] },
});

describe('normalize', () => {
  it('تقرأ الشكل الذي يرسله الخادم', () => {
    expect(full.manage_access).toBe(true);
    expect(full.sources.matrix).toEqual(['view', 'edit', 'export', 'delete']);
    expect(full.sources['home-contact']).toEqual(['view']);
  });

  it('تسقط إذناً لا تعرفه بدل منحه صامتاً', () => {
    const p = normalize({ sources: { matrix: ['view', 'sudo', 'drop_table'] } });
    expect(p.sources.matrix).toEqual(['view']);
  });

  it('manage_access لا يُمنح إلا بـ true صريحة', () => {
    // "yes" و1 وغيرها صادقة في JS — ولا تكفي هنا.
    for (const v of ['yes', 1, 'true', {}, []]) {
      expect(normalize({ [MANAGE_ACCESS]: v }).manage_access).toBe(false);
    }
    expect(normalize({ [MANAGE_ACCESS]: true }).manage_access).toBe(true);
  });

  it('تعيد UNKNOWN لا كائناً فارغاً حين لا تصل الأذونات', () => {
    // الفرق جوهري: الكائن الفارغ يعني «لا صلاحية»، وnull يعني
    // «لم نعرف بعد» — والواجهة تعرض انتظاراً لا لوحةً فارغة.
    expect(normalize(null)).toBe(null);
    expect(normalize(undefined)).toBe(null);
    expect(normalize('admin')).toBe(null);
    expect(normalize(42)).toBe(null);
  });

  it('تتحمّل قائمةً ليست مصفوفة', () => {
    const p = normalize({ sources: { matrix: 'view', 'home-contact': ['view'] } });
    expect(p.sources.matrix).toBeUndefined();
    expect(p.sources['home-contact']).toEqual(['view']);
  });
});

describe('can', () => {
  it('تمنح ما مُنح صراحةً', () => {
    expect(can(full, 'matrix', CAN.EDIT)).toBe(true);
    expect(can(full, 'home-contact', CAN.VIEW)).toBe(true);
  });

  it('تمنع ما لم يُمنح على هذا المصدر بعينه', () => {
    // العرض على «الموقع» لا يعني التعديل عليه، ولا التعديل على المصفوفة.
    expect(can(full, 'home-contact', CAN.EDIT)).toBe(false);
    expect(can(full, 'home-contact', CAN.DELETE)).toBe(false);
  });

  it('تمنع على مصدر لا وجود له', () => {
    expect(can(full, 'no-such-source', CAN.VIEW)).toBe(false);
  });

  it('تمنع حين تكون الأذونات مجهولة', () => {
    expect(can(null, 'matrix', CAN.VIEW)).toBe(false);
    expect(can(undefined, 'matrix', CAN.VIEW)).toBe(false);
  });

  it('manage_access لا يمنح صلاحيةً على البيانات ضمناً', () => {
    // من يدير الوصول ليس بالضرورة من يقرأ الطلبات — فصلٌ مقصود.
    const onlyManager = normalize({ [MANAGE_ACCESS]: true, sources: {} });
    expect(canManageAccess(onlyManager)).toBe(true);
    expect(can(onlyManager, 'matrix', CAN.VIEW)).toBe(false);
  });
});

describe('visibleSources', () => {
  it('لا تُظهر إلا ما يملك عرضه', () => {
    const p = normalize({ sources: { 'home-contact': ['view'] } });
    expect(visibleSources(p, SOURCES).map((s) => s.id)).toEqual(['home-contact']);
  });

  it('عدم العرض يُخفي المصدر، ولا يعرضه فارغاً', () => {
    const p = normalize({ sources: { matrix: ['edit'] } });  // تعديل بلا عرض
    expect(visibleSources(p, SOURCES)).toEqual([]);
  });

  it('المجهول لا يُظهر شيئاً', () => {
    expect(visibleSources(null, SOURCES)).toEqual([]);
  });
});

describe('summarize', () => {
  it('تصف ما يملكه بلغة تُقرأ', () => {
    const s = summarize(full, SOURCES);
    expect(s).toContain('إدارة الوصول');
    expect(s).toContain('مصفوفة التأثير: عرض، تعديل، تصدير، حذف');
    expect(s).toContain('طلب تواصل استراتيجي: عرض');
  });

  it('تميّز «بلا صلاحية» عن «لم تصل»', () => {
    expect(summarize(normalize({ sources: {} }), SOURCES)).toBe('بلا أي صلاحية');
    expect(summarize(null, SOURCES)).toBe('الأذونات لم تصل بعد');
  });
});
