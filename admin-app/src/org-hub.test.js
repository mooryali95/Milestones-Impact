import { describe, expect, it } from 'vitest';
import { orgReadiness, readinessSummary } from './org-hub.js';

const org = { id: 'o1', name: 'سفراء', status: 'active', invite_code: 'sufara', seats: 40, contract_ends: '2027-06-30', logo: 'data:x', cert_cobrand: true };
const journey = { cohort: { id: 'c1', name: 'دفعة سفراء' }, setup_missing: 0 };
const access = { state: 'active', n: 1 };
const r = (patch = {}) => orgReadiness({ org, access, journey, members: 29, pending: 0, now: '2026-11-14', ...patch });
const item = (x, k) => x.items.find((i) => i.key === k);

describe('جاهزية الجهة', () => {
  it('جهة مكتملة: سبعة بنود سليمة', () => {
    const x = r();
    expect(x.items.map((i) => i.key)).toEqual(['status', 'link', 'cohort', 'coordinator', 'contract', 'brand', 'approval']);
    expect(x.missing).toBe(0);
    expect(readinessSummary(x)).toBe('جاهزة');
  });

  it('صفحة «بدون جهة» بلا جاهزية', () => {
    expect(orgReadiness({ org: { id: 'none' } }).items).toEqual([]);
  });

  it('بلا دفعة: البند يقترح إنشاءها، وبدفعة ناقصة يقود إلى ملفها', () => {
    expect(item(r({ journey: { cohort: null } }), 'cohort')).toMatchObject({ ok: false, action: 'new-cohort' });
    const half = item(r({ journey: { ...journey, setup_missing: 2, setup: [{ title: 'المستشار الأساسي', ok: false }, { title: 'جدول المراحل', ok: false }, { title: 'الأعضاء', ok: true }] } }), 'cohort');
    expect(half).toMatchObject({ ok: false, action: 'cohort', other: 'c1' });
    expect(half.detail).toBe('«دفعة سفراء»: بقي فيها بندان (المستشار الأساسي، جدول المراحل)');
  });

  it('ما لم يُقرأ (الدفعة أو المنسق) لا يُعرض بندًا ناقصًا', () => {
    const x = r({ journey: null, access: null });
    expect(item(x, 'cohort')).toBeUndefined();
    expect(item(x, 'coordinator')).toBeUndefined();
  });

  it('المنسق المدعو الذي لم يدخل ناقص، ويقود إلى قسم المنسق', () => {
    expect(item(r({ access: { state: 'invited', email: 'k@x' } }), 'coordinator')).toMatchObject({ ok: false, action: 'coordinator' });
    expect(item(r({ access: { state: 'none' } }), 'coordinator').detail).toContain('لا منسق');
  });

  it('العقد: المنتهي، والمقاعد المكتملة، والناقص كلها تفتح التحرير', () => {
    expect(item(r({ org: { ...org, contract_ends: '2026-10-01' } }), 'contract').detail).toContain('انتهى العقد');
    expect(item(r({ members: 40 }), 'contract').detail).toContain('اكتملت المقاعد');
    expect(item(r({ org: { ...org, seats: null } }), 'contract')).toMatchObject({ ok: false, action: 'edit' });
  });

  it('الشعار يلزم فقط حين تحمل الشهادة هوية الجهة', () => {
    expect(item(r({ org: { ...org, logo: null } }), 'brand').ok).toBe(false);
    expect(item(r({ org: { ...org, logo: null, cert_cobrand: false } }), 'brand').ok).toBe(true);
  });

  it('الجهة غير الفعّالة والاعتماد المنتظر نقصان بزر', () => {
    const x = r({ org: { ...org, status: 'paused' }, pending: 12 });
    expect(item(x, 'status')).toMatchObject({ ok: false, action: 'edit' });
    expect(item(x, 'link')).toMatchObject({ ok: false, action: 'edit' });
    expect(item(x, 'approval')).toMatchObject({ ok: false, action: 'approve' });
    expect(readinessSummary(x)).toBe('بقي 3 بنود من 7');
  });
});

import { validateOrg } from './screens/OrgForm.jsx';
describe('رمز رابط الجهة في النموذج بشرط الخادم نفسه (تدقيق الرحلة 2026-11-14)', () => {
  const v = (invite_code) => ({ name: 'جهة', short_name: '', seats: '', contract: '', color: '#12414E', invite_code });
  const coord = { enabled: false, email: '' };
  it('الجديد أو المغيَّر من 10 إلى 40، فالمثال القديم القصير يُرفض قبل الحفظ لا بعده', () => {
    expect(validateOrg(v('moe-2026'), coord).invite_code).toMatch(/من 10 إلى 40/);
    expect(validateOrg(v('moe-leaders-2026'), coord).invite_code).toBeUndefined();
  });
  it('الرمز القائم الأقصر يبقى صالحًا ما لم يُغيَّر، كما في الخادم', () => {
    expect(validateOrg(v('wt01'), coord, 'wt01').invite_code).toBeUndefined();
  });
});
