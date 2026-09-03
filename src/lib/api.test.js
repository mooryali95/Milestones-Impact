import { classify, RESULT } from './api';

// ════════════════════════════════════════════════════════════════
// تصنيف ردّ الخادم
// ════════════════════════════════════════════════════════════════
// الخطأ الذي وقع مرّتين في هذا المشروع: واجهةٌ تعرض فراغاً واحداً
// لثلاث حالات مختلفة — «لا طلبات»، و«ليس لك صلاحية»، و«الخادم لا
// يعرف هذا الإجراء بعد». فيظنّ المستشار أن لا شيء وصل.

describe('classify', () => {
  it('تميّز الفارغ الحقيقي عن الفشل', () => {
    const r = classify({ success: true, requests: [] }, 'requests');
    expect(r.state).toBe(RESULT.OK);
    expect(r.data).toEqual([]);
  });

  it('تُخرج البيانات من المفتاح المطلوب', () => {
    const r = classify({ success: true, registrations: [{ id: 1 }] }, 'registrations');
    expect(r.data).toEqual([{ id: 1 }]);
  });

  it('تعرف الإجراء الذي لم يُنفَّذ في الخادم بعد', () => {
    const r = classify({ success: false, code: 'unsupported_action' }, 'requests');
    expect(r.state).toBe(RESULT.UNSUPPORTED);
  });

  it('تعرف المنع فتقوله بدل أن تعرضه فراغاً', () => {
    expect(classify({ success: false, code: 'forbidden' }, 'x').state).toBe(RESULT.DENIED);
    expect(classify({ success: false, code: 'denied' }, 'x').state).toBe(RESULT.DENIED);
  });

  it('تنقل رسالة الخادم بنصّها ولا تبتلعها', () => {
    const r = classify({ success: false, message: 'انتهت الجلسة' }, 'x');
    expect(r.state).toBe(RESULT.ERROR);
    expect(r.message).toBe('انتهت الجلسة');
  });

  it('انقطاع الشبكة ليس فراغاً', () => {
    // callFn تعيد null أو كائناً فاشلاً حين يسقط الاتصال.
    const r = classify(null, 'x');
    expect(r.state).toBe(RESULT.ERROR);
    expect(r.data).toEqual([]);
  });

  it('نجاحٌ بلا مفتاح البيانات يعيد مصفوفة لا undefined', () => {
    // وإلا انفجر .map في التصيير.
    expect(classify({ success: true }, 'requests').data).toEqual([]);
  });
});
