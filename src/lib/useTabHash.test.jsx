import React, { useState, useCallback, act } from 'react';
import { createRoot } from 'react-dom/client';
import useTabHash from './useTabHash';

// ════════════════════════════════════════════════════════════════
// useTabHash
// ════════════════════════════════════════════════════════════════
// الخطاف الوحيد في المشروع الذي يكتب في تاريخ المتصفّح. تحقّقه كان
// بالمتصفّح وحده، وذلك تحقّقٌ لا يتكرّر مع كل تعديل. الحالات المثبّتة
// أدناه هي بالضبط ما ينكسر بصمت: الفرق بين replace وpush (يقرّر إن كان
// زرّ الرجوع يعمل أصلاً)، وحارس everEnabled (يقرّر إن كان التحديث يحفظ
// تبويبك أم يعيدك إلى المصفوفة).

global.IS_REACT_ACT_ENVIRONMENT = true;

const ALLOWED = ['matrix', 'timeline', 'report'];

function mount({ initialTab = 'matrix', enabled = true } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // ما طلبه الخطاف من تغيير للتبويب — لا ما غيّرناه نحن في الاختبار.
  const asked = [];
  const state = { asked };

  function Harness(props) {
    const [tab, setTab] = useState(initialTab);
    state.tab = tab;
    state.setTab = setTab;
    // هويّة ثابتة: لولاها لأُعيد تسجيل المستمع في كل تصيير، فتنجح
    // الاختبارات حتى لو أُسقط التنظيف.
    const fromHook = useCallback((t) => { asked.push(t); setTab(t); }, []);
    useTabHash({ tab, setTab: fromHook, allowed: ALLOWED, enabled: props.enabled });
    return null;
  }

  const render = (e) => act(() => { root.render(<Harness enabled={e} />); });
  render(enabled);

  return {
    state,
    setEnabled: render,
    setTab: (t) => act(() => { state.setTab(t); }),
    unmount: () => act(() => { root.unmount(); container.remove(); }),
  };
}

// jsdom ينفّذ الرجوع في مهمّة لاحقة لا في دورة صغرى، فانتظار tick واحد
// يمرّ قبل أن يقع شيء — والاختبار عندئذٍ ينجح بلا أن يفحص شيئاً.
// ننتظر الحدث نفسه بدل تخمين مهلة.
const goBack = () => act(async () => {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('لم يقع popstate')), 2000);
    window.addEventListener('popstate', () => {
      clearTimeout(timer);
      setTimeout(resolve, 0);
    }, { once: true });
    window.history.back();
  });
});

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('الاعتماد من العنوان عند الدخول', () => {
  it('تبويبٌ مسموح في الرابط يُفتح بدل الافتراضي', () => {
    window.history.replaceState(null, '', '#/report');
    const h = mount();
    expect(h.state.tab).toBe('report');
    h.unmount();
  });

  it('لا يعتمد مرتين: العودة إلى تبويب آخر لا يُلغيها قراءةٌ ثانية للرابط', () => {
    window.history.replaceState(null, '', '#/report');
    const h = mount();
    h.setTab('timeline');
    expect(h.state.tab).toBe('timeline');
    expect(window.location.hash).toBe('#/timeline');
    h.unmount();
  });

  it('رابطٌ مشترَك لا يُكتب فوقه أثناء اعتماده', () => {
    // تأثير الكتابة يعمل في تصيير الاعتماد نفسه ويرى tab القديم. كان
    // يستبدل «#/report» بـ«#/matrix» — أي يمحو المدخل الذي فُتح عليه
    // الرابط — ثم يدفع «#/report». فيظهر عنوانٌ خاطئ لحظةً، والأسوأ أن
    // الرجوع من رابطٍ مشترَك يهبط على المصفوفة بدل مغادرة الموقع.
    window.history.replaceState(null, '', '#/report');
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    const h = mount({ initialTab: 'matrix' });
    expect(h.state.tab).toBe('report');
    expect(window.location.hash).toBe('#/report');
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    h.unmount();
    push.mockRestore();
    replace.mockRestore();
  });

  it('الرجوع من رابطٍ مشترَك يغادر الموقع ولا يهبط على المصفوفة', async () => {
    // العَرَض الثاني للخلل نفسه: كتابةٌ زائدة تُضيف مدخلاً لتبويبٍ لم
    // يزُره أحد، فيصير زرّ الرجوع يدور داخل التطبيق بدل الخروج منه.
    window.history.replaceState(null, '', '/');
    window.history.pushState(null, '', '#/report');   // الوصول عبر الرابط
    const h = mount({ initialTab: 'matrix' });
    expect(h.state.tab).toBe('report');
    await goBack();
    expect(window.location.hash).toBe('');
    h.unmount();
  });

  it('التبديل بعد رابطٍ مشترَك يدفع، فيعود الرجوع إليه', async () => {
    // لو استُبدل هنا لمحا أوّلُ تبديل المدخلَ الذي فُتح عليه الرابط.
    window.history.replaceState(null, '', '#/report');
    const h = mount({ initialTab: 'matrix' });
    h.setTab('timeline');
    expect(window.location.hash).toBe('#/timeline');
    await goBack();
    expect(window.location.hash).toBe('#/report');
    expect(h.state.tab).toBe('report');
    h.unmount();
  });

  it('بلا هاش يبقى التبويب الافتراضي، ويُكتب في الرابط', () => {
    const h = mount({ initialTab: 'matrix' });
    expect(h.state.tab).toBe('matrix');
    expect(window.location.hash).toBe('#/matrix');
    h.unmount();
  });
});

describe('العنوان الكاذب يُصحَّح', () => {
  it('اسم تبويب لا وجود له يُستبدل بالمعروض فعلاً', () => {
    window.history.replaceState(null, '', '#/nonsense');
    const h = mount({ initialTab: 'matrix' });
    expect(h.state.tab).toBe('matrix');
    expect(window.location.hash).toBe('#/matrix');
    h.unmount();
  });

  it('تبويبٌ موجود لكنه غير متاح بعد يُصحَّح كذلك', () => {
    // «التقرير» يُقفل قبل ثلاثة مواعيد. رابطٌ يعِد به ولا يعرضه أسوأ من لا رابط.
    window.history.replaceState(null, '', '#/report');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    function H() {
      const [tab, setTab] = useState('matrix');
      useTabHash({ tab, setTab, allowed: ['matrix', 'timeline'], enabled: true });
      return null;
    }
    act(() => { root.render(<H />); });
    expect(window.location.hash).toBe('#/matrix');
    act(() => { root.unmount(); container.remove(); });
  });

  it('هاش مشوّه الترميز لا يُسقط التصيير', () => {
    // decodeURIComponent('%E0%A4%A') يرمي URIError.
    window.history.replaceState(null, '', '#/%E0%A4%A');
    const h = mount({ initialTab: 'matrix' });
    expect(h.state.tab).toBe('matrix');
    h.unmount();
  });
});

describe('أول كتابة تستبدل وما بعدها يدفع', () => {
  // هذا هو الفرق الذي يقرّر إن كان زرّ الرجوع يعمل: لو دُفعت الكتابة
  // الأولى لصار الرجوع من التبويب الأول يغيّر العنوان بلا أثر مرئي.
  // نراقب النداءين مباشرةً — عدّاد history.length في jsdom تتقاسمه
  // اختبارات الملف كلّه، فيقيس ترتيب التنفيذ لا سلوك الخطاف.
  it('الكتابة الأولى استبدال لا دفع', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    const h = mount({ initialTab: 'matrix' });
    expect(window.location.hash).toBe('#/matrix');
    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(null, '', '#/matrix');
    h.unmount();
    push.mockRestore();
    replace.mockRestore();
  });

  it('كل تبديل بعدها دفعٌ يترك أثراً في التاريخ', () => {
    const h = mount({ initialTab: 'matrix' });
    const push = vi.spyOn(window.history, 'pushState');
    h.setTab('timeline');
    h.setTab('report');
    expect(window.location.hash).toBe('#/report');
    expect(push.mock.calls.map((c) => c[2])).toEqual(['#/timeline', '#/report']);
    h.unmount();
    push.mockRestore();
  });

  it('إعادة ضبط التبويب على قيمته لا تكتب شيئاً', () => {
    const h = mount({ initialTab: 'matrix' });
    h.setTab('timeline');
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    h.setTab('timeline');
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    h.unmount();
    push.mockRestore();
    replace.mockRestore();
  });
});

describe('زرّ الرجوع', () => {
  it('يعيد التبويب السابق بدل الخروج من التطبيق', async () => {
    const h = mount({ initialTab: 'matrix' });
    h.setTab('timeline');
    h.setTab('report');
    expect(h.state.tab).toBe('report');

    await goBack();
    expect(window.location.hash).toBe('#/timeline');
    expect(h.state.tab).toBe('timeline');

    await goBack();
    expect(window.location.hash).toBe('#/matrix');
    expect(h.state.tab).toBe('matrix');
    h.unmount();
  });

  it('يتجاهل هاشاً خارج المسموح بدل أن يعرض تبويباً غير متاح', () => {
    const h = mount({ initialTab: 'matrix' });
    h.setTab('timeline');
    window.history.replaceState(null, '', '#/nonsense');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(h.state.tab).toBe('timeline');
    h.unmount();
  });

  it('لا يستمع بعد التفكيك', () => {
    const h = mount({ initialTab: 'matrix' });
    h.setTab('timeline');
    h.unmount();
    // React 18 لا يحذّر من ضبط حالة في شجرة مفكّكة، فغياب الخطأ ليس
    // دليلاً — نعدّ الطلبات: مستمعٌ باقٍ يطلب تبويباً بعد الرحيل.
    const before = h.state.asked.length;
    window.history.replaceState(null, '', '#/report');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(h.state.asked.length).toBe(before);
  });
});

describe('المغادرة والعودة', () => {
  it('الخروج من الشاشة يمسح الهاش', () => {
    const h = mount({ initialTab: 'timeline' });
    expect(window.location.hash).toBe('#/timeline');
    h.setEnabled(false);
    expect(window.location.hash).toBe('');
    h.unmount();
  });

  it('التحديث لا يفقد التبويب رغم مرور الشاشة بحالة غير مفعّلة أولاً', () => {
    // splash ← main: يبدأ التطبيق غير مفعّل لحظةً حتى تُستعاد الجلسة.
    // بلا حارس everEnabled يمسح تأثيرُ المغادرة الهاشَ قبل أن يُقرأ.
    window.history.replaceState(null, '', '#/report');
    const h = mount({ initialTab: 'matrix', enabled: false });
    expect(window.location.hash).toBe('#/report');
    h.setEnabled(true);
    expect(h.state.tab).toBe('report');
    h.unmount();
  });

  it('العودة إلى الشاشة تعتمد الرابط من جديد', () => {
    const h = mount({ initialTab: 'matrix' });
    h.setEnabled(false);
    expect(window.location.hash).toBe('');
    window.history.replaceState(null, '', '#/timeline');
    h.setEnabled(true);
    expect(h.state.tab).toBe('timeline');
    h.unmount();
  });

  it('لا يكتب شيئاً ما دامت الشاشة غير مفعّلة', () => {
    const h = mount({ initialTab: 'matrix', enabled: false });
    expect(window.location.hash).toBe('');
    h.setTab('report');
    expect(window.location.hash).toBe('');
    h.unmount();
  });
});
