/* ════════════════════════════════════════════════════════════════════
   ░░  مقياس جاهزية الأثر: المحتوى والحساب (بلا DOM)  ░░
   ════════════════════════════════════════════════════════════════════
   - ١٥ عبارة: ثلاث لكل حلقة من حلقات سلسلة النتائج الخمس، وكل عبارة فكرة واحدة
   - سلّم تغطية من 0 إلى 3، وكل مرساة مفهوم واحد
   - الناتج «قراءة أولية»: رأي مجيب واحد في جهته، لا حكم على الجهة
   - يُحمَّل قبل assessment.js في الصفحة (window.MIAssessmentCore)،
     ويُستورد في اختبار الوحدة tests/home/assessment-core.test.js
   ════════════════════════════════════════════════════════════════════ */

(function (root, factory) {
  const api = factory();
  root.MIAssessmentCore = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const VERSION = 'readiness-v2';

  const LINKS = [
    {
      key: 'inputs', name: 'المدخلات', en: 'Inputs',
      questions: [
        'لكل مشروع مالك واحد مسمّى يُسأل عن نتيجته.',
        'تُكتب غاية المشروع في جملة تصف التغيير المطلوب قبل اعتماد ميزانيته.',
        'تُخصَّص موارد المشروع بحسب أولويته بين مشاريع الجهة.',
      ],
      advice: 'ابدؤوا بتكليف مكتوب لكل مشروع يسمّي مالكًا واحدًا، ويصف التغيير المطلوب قبل اعتماد الميزانية، ووزّعوا الموارد بحسب أولوية المشروع بين مشاريع الجهة.',
    },
    {
      key: 'activities', name: 'الأنشطة', en: 'Activities',
      questions: [
        'للمشروع معالم قرار محددة سلفًا يُراجَع عندها استمراره.',
        'تُرصد مخاطر المشروع في سجل يُحدَّث دوريًا.',
        'يُصعَّد الانحراف عن الخطة إلى صاحب القرار في وقت يسمح بالتصحيح.',
      ],
      advice: 'اعتمدوا دورة حياة موحّدة للمشروع ببوابات قرار، وسجلًّا للمخاطر يُراجع في اجتماع دوري بصلاحيات تصعيد واضحة.',
    },
    {
      key: 'outputs', name: 'المخرجات', en: 'Outputs',
      questions: [
        'لكل مخرج معايير قبول مكتوبة قبل بدء العمل عليه.',
        'تستلم المخرجَ جهة محددة تتولى تشغيله بعد المشروع.',
        'يُوثَّق عند الإغلاق ما سُلِّم مقابل ما خُطط له.',
      ],
      advice: 'حدّدوا لكل مخرج معيار قبول مكتوبًا قبل التنفيذ، وسمّوا الجهة التي تستلمه وتشغّله بعد المشروع، ووثّقوا عند الإغلاق ما سُلِّم مقابل ما خُطط له.',
    },
    {
      key: 'outcomes', name: 'النتائج', en: 'Outcomes',
      questions: [
        'لكل مشروع مؤشر نتيجة يقيس تغيرًا عند المستفيد.',
        'يُقاس خط الأساس للمؤشر قبل بدء التنفيذ.',
        'تُقاس النتائج بعد التسليم بمدة تكفي لظهورها.',
      ],
      advice: 'انقلوا القياس من عدّ الأنشطة إلى رصد التغيّر: مؤشر نتيجة لكل مشروع، وخط أساس قبل التنفيذ، وقياس بعد التسليم بمدة تكفي لظهور النتيجة.',
    },
    {
      key: 'impact', name: 'الأثر', en: 'Impact',
      questions: [
        'لكل منفعة متوقعة مالك من الجهة يتابع تحققها بعد إغلاق المشروع.',
        'تُعرض أدلة الأثر على صانعي القرار عند توزيع الميزانيات.',
        'يُوقف المشروع أو يُعدَّل مساره حين تُظهر الأدلة أنه لا يحقق منفعته.',
      ],
      advice: 'سمّوا لكل منفعة مالكًا يتابع تحققها بعد الإغلاق، واعرضوا أدلة الأثر عند توزيع الميزانيات، وأوقفوا المشروع أو عدّلوا مساره حين تُظهر الأدلة أنه لا يحقق منفعته.',
    },
  ];

  // سلّم تغطية: كم من مشاريع الجهة تنطبق عليه العبارة
  const SCALE = [
    { v: 0, label: 'لا يحدث' },
    { v: 1, label: 'في بعض المشاريع' },
    { v: 2, label: 'في أغلب المشاريع' },
    { v: 3, label: 'في كل المشاريع' },
  ];
  const MAX = SCALE[SCALE.length - 1].v;

  // حدود المستويات مؤقتة: موروثة من النسخة الأولى بلا سند تجريبي، وتبقى حتى تُجرى
  // جلسة تحديد المعايير (standard-setting) على بيانات حقيقية.
  // المرجع: docs/audit/2026-11-13-خارطة-تنفيذ-آفاق-القياس-v1.md
  const LEVEL_CUTOFFS = [
    { min: 0,  name: 'مرحلة النية',          desc: 'النوايا حاضرة، لكن الأثر لا يزال رهين الاجتهاد الفردي. الأولوية لبناء الأساس: مالك مسمّى لكل مشروع وغاية مكتوبة ومعالم قرار.' },
    { min: 40, name: 'مرحلة التأسيس',        desc: 'ثمة ممارسات قائمة، لكنها غير منتظمة. الأولوية لتعميمها على المشاريع كلها وربط المخرجات بنتائج قابلة للقياس.' },
    { min: 60, name: 'مرحلة الانضباط',       desc: 'التنفيذ منضبط والمخرجات موثّقة. الخطوة التالية قياس النتائج بعد التسليم وعرض أدلة الأثر على صانعي القرار.' },
    { min: 80, name: 'مرحلة الأثر المؤسسي', desc: 'الأثر يُقاس ويُدار ويُغذّي القرار. الأولوية لصون هذه الممارسات وتعميمها على المحفظة كاملة.' },
  ];

  // فارق أقل من 12 نقطة مئوية بين أضعف حلقة والتي تليها لا يكفي لتسمية حلقة أضعف:
  // إجابة واحدة بدرجة واحدة تحرّك الحلقة نحو 11 نقطة (1 من 9).
  const CLOSE_GAP = 12;

  const SINGLE_VIEW_NOTE = 'هذه قراءة شخص واحد لجهته، وتزداد موثوقيتها حين يجيب عدة أشخاص من الجهة نفسها.';

  // تسطيح العبارات مع ربط كل عبارة بحلقتها
  const QUESTIONS = [];
  LINKS.forEach((link, li) => link.questions.forEach((text) => QUESTIONS.push({ text, li })));
  const TOTAL = QUESTIONS.length;

  function levelFor(total) {
    let level = LEVEL_CUTOFFS[0];
    LEVEL_CUTOFFS.forEach((l) => { if (total >= l.min) level = l; });
    return level;
  }

  function joinNames(links) {
    const names = links.map((l) => l.name);
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join('، ') + ' و' + names[names.length - 1];
  }

  /**
   * حساب القراءة الأولية من الإجابات. دالة خالصة: لا DOM ولا حالة.
   *
   * @param {number[]} answers ‏15 إجابة بترتيب العبارات، كل منها عدد صحيح من 0 إلى 3
   * @returns {{
   *   version: string,
   *   total: number,                       // 0 إلى 100، مقرّبة
   *   level: {min:number,name:string,desc:string},
   *   perLink: {key,name,en,advice,sum,pct}[],   // بترتيب السلسلة، pct مقرّبة
   *   weakest: object[],                   // كل الحلقات المتعادلة في أدنى درجة
   *   strongest: object[],                 // كل الحلقات المتعادلة في أعلى درجة
   *   focus: {kind:'single'|'tied'|'close'|'even', links:object[], label:string, names:string}
   * }}
   */
  function scoreReadiness(answers) {
    if (!Array.isArray(answers) || answers.length !== TOTAL) {
      throw new Error('scoreReadiness: expected ' + TOTAL + ' answers');
    }
    answers.forEach((v) => {
      if (!Number.isInteger(v) || v < 0 || v > MAX) throw new Error('scoreReadiness: answer out of range');
    });

    const perLink = LINKS.map((link, li) => {
      const vals = answers.filter((_, i) => QUESTIONS[i].li === li);
      const sum = vals.reduce((a, b) => a + b, 0);
      const raw = (sum / (vals.length * MAX)) * 100;
      return { key: link.key, name: link.name, en: link.en, advice: link.advice, sum, raw, pct: Math.round(raw) };
    });

    // الدرجة الكلية متوسط غير موزون لنسب الحلقات الخمس: لكل حلقة وزن متساوٍ (20%)
    // مهما كان عدد عباراتها، فلا ترجح حلقة لمجرد أن عباراتها أكثر.
    const total = Math.round(perLink.reduce((a, l) => a + l.raw, 0) / perLink.length);
    const level = levelFor(total);

    const sums = perLink.map((l) => l.sum);
    const lo = Math.min.apply(null, sums);
    const hi = Math.max.apply(null, sums);
    const weakest = perLink.filter((l) => l.sum === lo);
    const strongest = perLink.filter((l) => l.sum === hi);

    let focus;
    if (lo === hi) {
      focus = { kind: 'even', links: [], label: 'الحلقات الخمس متساوية الدرجة', names: '' };
    } else if (weakest.length > 1) {
      focus = { kind: 'tied', links: weakest, label: 'الحلقات الأضعف بالدرجة نفسها:', names: joinNames(weakest) };
    } else {
      const lowRaw = weakest[0].raw;
      const near = perLink.filter((l) => l.raw - lowRaw < CLOSE_GAP);
      focus = near.length > 1
        ? { kind: 'close', links: near, label: 'حلقات متقاربة في أدنى السلسلة، ولا تنفرد واحدة بالضعف:', names: joinNames(near) }
        : { kind: 'single', links: weakest, label: 'الحلقة الأضعف:', names: weakest[0].name };
    }

    return { version: VERSION, total, level, perLink, weakest, strongest, focus };
  }

  return { VERSION, LINKS, SCALE, MAX, LEVEL_CUTOFFS, CLOSE_GAP, SINGLE_VIEW_NOTE, QUESTIONS, TOTAL, levelFor, scoreReadiness };
});
