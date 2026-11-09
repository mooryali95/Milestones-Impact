// خادم محاكاة لتسجيل الفيديو التعريفي من الواجهة الحقيقية: الحالة تتقدم مع كل خطوة كما يفعل الخادم،
// والأشكال مطابقة لما تختبره اختبارات المتصفح (e2e/leaders-*.spec.js). لا شبكة ولا قاعدة ولا بريد.
const NAME = 'سارة عبدالله الأحمد';
const LIKERT = ['نادرًا جدًا', 'نادرًا', 'أحيانًا', 'غالبًا', 'دائمًا'].map((label, k) => ({ k, label }));
const stage = (key, title_ar, phase, status, items = [], extra = {}) => ({ key, title_ar, phase, status, items, done: items.filter((i) => i.status === 'done').length, total: items.length, ...extra });

export function createMockServer() {
  // approved منفصل عن assessed: الجولة الكاملة تعتمد فور الإرسال (approveOnSubmit)، وفيديو المشارك يُظهر «قيد المراجعة» ثم يعتمد
  const s = { named: false, profileDone: false, assessed: false, approved: false, approveOnSubmit: true, chapterDone: false, points: 0, mine: [], answered: false };
  const me = () => ({
    success: true,
    participant: { id: 'p1', full_name: NAME, email: 'sara@company.sa', status: s.assessed ? 'enrolled' : 'registered', consented_at: '2026-11-01T00:00:00Z', organization_name: 'هيئة التحوّل الرقمي', organization_linked: true },
    profile: {
      full_name: NAME, phone: s.profileDone ? '0551234567' : '', job_title: s.profileDone ? 'مديرة إدارة المشاريع' : '', organization_name: s.profileDone ? 'هيئة التحوّل الرقمي' : '',
      years_experience: s.profileDone ? 9 : null, work_scope: s.profileDone ? 'program' : null, sector: s.profileDone ? 'حكومي' : '',
      approved: s.approved, level: s.assessed ? 'intermediate' : null,
      track: s.assessed ? { title: 'القيادة من خلال الآخرين', summary: 'تتقن أدوات العمل، والفرق الذي ينتظرك في الناس.', strengths: 'أقوى أطرك: إدارة المشروعات وتحويل المشروع إلى أثر.', journey: 'المختبر: خريطة أصحاب المصلحة، والأسبوع الصعب، وأنماط إدارة الخلاف.' } : null,
      dimensions: s.assessed ? [{ dimension: 'milestone', level: 'advanced', approved: s.approved }, { dimension: 'impact', level: 'intermediate', approved: s.approved }, { dimension: 'leadership', level: 'intermediate', approved: s.approved }] : [],
    },
    journey: [
      stage('profile', 'الملف الشخصي', 'admission', s.profileDone ? 'done' : 'active', [{ id: 'i1', code: 'P-INFO', kind: 'system', title_ar: 'بيانات الملف', required: true, status: s.profileDone ? 'done' : 'pending' }]),
      stage('assessment', 'تحديد المستوى', 'admission', s.assessed ? 'done' : s.profileDone ? 'active' : 'locked', [{ id: 'i2', code: 'A-DONE', kind: 'system', title_ar: 'إرسال القياس', required: true, status: s.assessed ? 'done' : 'pending' }]),
      stage('approval', 'اعتماد المستوى', 'admission', s.approved ? 'done' : s.assessed ? 'active' : 'locked', [], { duration_label: 'يومي عمل' }),
      stage('training', 'التدريب', 'qualification', s.approved ? 'active' : 'locked', [
        { id: 'r0', code: 'T-ATTEND', kind: 'attendance', title_ar: 'حضور الأيام التدريبية', required: true, status: 'done', auto: true },
        { id: 'r1', code: 'T-HB', kind: 'reading', title_ar: 'قراءة كتيبك الشخصي', required: true, status: s.chapterDone ? 'done' : 'pending' },
        { id: 'r2', code: 'T-PLAN', kind: 'upload', title_ar: 'تسمية مبادرتك', required: true, status: 'pending' },
      ], { duration_label: '4 أيام تدريبية' }),
      stage('ojt_coaching', 'التوجيه على رأس العمل', 'qualification', 'locked', [], { duration_label: '4 أسابيع', lock_reason: 'تُفتح بعد التدريب' }),
      stage('consulting', 'الاستشارة', 'qualification', 'locked', [], { stage_mode: 'on_demand', duration_label: 'أسبوعان' }),
      stage('leadership_coaching', 'التوجيه القيادي', 'qualification', 'locked', [], { stage_mode: 'on_demand', duration_label: '4 أسابيع' }),
      stage('support', 'الدعم والتمكين', 'impact', 'locked', [], { duration_label: '3 أشهر' }),
      stage('evaluation', 'التقييم والقياس', 'impact', 'locked', [{ id: 'e1', code: 'E-POST', kind: 'system', title_ar: 'القياس البعدي', required: true, status: 'pending' }], { duration_label: 'أسبوعان' }),
      stage('report', 'التقرير النهائي', 'impact', 'locked', [], { duration_label: 'أسبوع' }),
    ],
    // بشكل الخادم (milestones.js وcontinuous.js): due وlate_days وpct، والاتجاه {dir}، ولكل مصدر value وreason
    milestones: s.assessed ? [
      { id: 'm1', title_ar: 'تسمية المبادرة', due: '2026-11-08', status: 'done', late_days: 0 },
      { id: 'm2', title_ar: 'بطاقة المبادرة', due: '2026-11-12', status: 'due_soon', late_days: 0 },
      { id: 'm3', title_ar: 'هيكل تجزئة العمل', due: '2026-11-26', status: 'on_time', late_days: 0 },
    ] : [],
    milestone_summary: { done: 1, total: 3, late: 0, max_late: 0, pct: 33 },
    continuous: s.assessed ? { index: 68, trend: { dir: 'up' }, components: [
      { key: 'quizzes', label: 'اختبارات الكتيب', value: 80, reason: '4 أبواب' },
      { key: 'models', label: 'النماذج التطبيقية', value: 75, reason: 'نموذجان' },
      { key: 'milestones', label: 'المعالم', value: 75, reason: 'معلم واحد' },
      { key: 'peer', label: 'الإسهام المؤكَّد في طلبات الأقران', value: null, reason: 'لم تكتمل له أحداث كافية بعد' },
    ], events: [] } : null,
    group: s.assessed ? { name: 'فريق التوجيه', members: 5 } : null, project_mode: 'individual',
    progress: s.assessed ? 32 : s.profileDone ? 12 : 5, passkeys: 1, prompt_passkey: false,
    cohort: { name: 'دفعة نوفمبر 2026', starts_on: '2026-11-04', ends_on: '2027-02-20' },
  });
  const chapters = [
    ['c1', 'milestone', 'لماذا هذه المنهجية؟'], ['c2', 'milestone', 'إعادة تعريف المعلم'], ['c3', 'milestone', 'الطبقة الأولى: المشروع'],
    ['c4', 'impact', 'سلسلة القيمة الخماسية'], ['c5', 'impact', 'من تقارير الإنجاز إلى تقارير الأثر'], ['c6', 'impact', 'إعادة تعريف الأثر'],
    ['c7', 'leadership', 'سلسلة الاستجابة الخماسية'], ['c8', 'leadership', 'من التسليم الشكلي إلى التسليم القيادي'], ['c9', 'leadership', 'إعادة تعريف قائد المشاريع'],
  ].map(([id, dimension, title], i) => ({ id, dimension, title, done: i === 0 ? s.chapterDone : false }));
  const peer = () => ({
    success: true, supervision: 'peers_expert', supervision_ar: 'الأقران يجيبون ويؤكّد الخبير', team: 'guide', team_ar: 'فريق التوجيه',
    teams: { support: 'فريق الدعم', lead: 'فريق القيادة', guide: 'فريق التوجيه', eval: 'فريق التقييم' }, advisor: 'م. عمر', mine_open: s.mine.length,
    items: [
      ...s.mine.map((t, i) => ({ id: `m${i}`, text: t, source: 'free', source_ar: 'سؤال حر', target_team: null, target_team_ar: 'الجميع', status: 'open', status_ar: 'بانتظار إجابة', at: '2026-11-05T09:00:00Z', mine: true, author: NAME, answers: [] })),
      { id: 'q9', text: 'ما الفرق بين المخرج والمنفعة في سجل المنافع؟', source: 'sentence', source_ar: 'جملة في الكتيب', target_team: 'guide', target_team_ar: 'فريق التوجيه', status: 'answered', status_ar: 'أُجيب', at: '2026-11-04T10:00:00Z', mine: false, author: 'خالد السبيعي',
        answers: [{ id: 'a1', text: 'المخرج ما يسلّمه المشروع، والمنفعة ما يتغير بعده عند المستفيد.', status: 'pending', status_ar: 'بانتظار تأكيد الخبير', expert_note: null, at: '2026-11-04T12:00:00Z', author: 'نورة العتيبي' }] },
      { id: 'q8', text: 'كيف أقنع الراعي بتمويل المرحلة الثانية؟', source: 'free', source_ar: 'سؤال حر', target_team: null, target_team_ar: 'الجميع', status: 'confirmed', status_ar: 'أكّده الخبير', at: '2026-11-02T09:00:00Z', mine: false, author: 'محمد الغامدي',
        answers: [{ id: 'a0', text: 'اعرض عليه منفعة مقيسة من المرحلة الأولى قبل أي طلب.', status: 'confirmed', status_ar: 'أكّده الخبير', expert_note: null, at: '2026-11-02T10:00:00Z', author: 'فهد القحطاني' }] },
    ],
  });
  const capstoneSections = [
    { id: 'm-charter', key: 'initiative-charter', title: 'بطاقة المبادرة', icon: '◆', dimension: 'milestone', complete: true, missing: 0, status: 'reviewed' },
    { id: 'm-wbs', key: 'wbs', title: 'هيكل تجزئة العمل', icon: '◆', dimension: 'milestone', complete: false, missing: 2, status: 'draft' },
    { id: 'm-benefits', key: 'benefits-register', title: 'سجل المنافع', icon: '◆', dimension: 'impact', complete: true, missing: 0, status: 'reviewed' },
    { id: 'm-stake', key: 'stakeholders', title: 'خريطة أصحاب المصلحة', icon: '◆', dimension: 'leadership', complete: false, missing: 1, status: 'draft' },
  ];
  const RUBRIC = ['الاتساق الاستراتيجي', 'واقعية التخطيط', 'القيمة والدليل', 'الحوكمة والملكية', 'المخاطر والتغيير', 'الوضوح والعرض'];

  const reply = (b) => {
    switch (b.action) {
      case 'auth.start': if (b.full_name) s.named = true; return s.named ? { success: true, sent: true } : { success: true, needs_name: true };
      case 'auth.verify': return b.code === '246810' ? { success: true, token: 'tok-demo-recording-000000000000', ...me() } : { success: false, message: 'الرمز غير صحيح' };
      case 'me': return me();
      case 'profile.save': s.profileDone = true; return me();
      // est_minutes من الأداة الفعالة على الخادم ويتغير من اللوحة، فلا رقم في الفيديو
      case 'assessment.get': return {
        success: true, assessment: { id: 'a1', kind: 'baseline', status: 'in_progress', est_minutes: null },
        questions: [
          { id: 'q1', dimension: 'milestone', tier: 'behavior', kind: 'likert', text: 'أراجع المعالم مع فريقي كل أسبوع وأوثّق قرار كل معلم.', options: LIKERT },
          { id: 'q2', dimension: 'impact', tier: 'skill', kind: 'mcq', text: 'أي مؤشر يقيس الأثر لا الإنجاز؟', options: [{ k: 0, label: 'عدد الورش المنفذة' }, { k: 1, label: 'تغيّر سلوك المستفيدين' }, { k: 2, label: 'نسبة الصرف من الميزانية' }] },
          { id: 'q3', dimension: 'leadership', tier: 'behavior', kind: 'likert', text: 'أعرض اعتراضي المسبّب على الراعي قبل التحرّك حين أرى خطرًا.', options: LIKERT },
        ],
        answers: {}, before: {},
      };
      case 'assessment.answer': return { success: true };
      case 'assessment.submit': s.assessed = true; if (s.approveOnSubmit) s.approved = true; return me();
      case 'handbook.toc': return { success: true, name: NAME, code: 'M3I2L2', chapters, points: { total: s.points, rank: { title: 'مستكشف', next: { title: 'ممارس', at: 75, left: 75 - s.points } } }, models: { total: 4, submitted: 1 } };
      case 'handbook.chapter': {
        const ch = chapters.find((c) => c.id === b.id) || chapters[0];
        return {
          success: true, reading: null, done: ch.done ? { score: 1, total: 1 } : null, watermark: `${NAME} · sara@company.sa`,
          chapter: { id: ch.id, dimension: ch.dimension, chapter_key: 'ch1', title: ch.title, md: '## المعلم قرار\nكل معلم **قرار** يُتخذ لا تاريخ يمر. حين يصبح المعلم نقطة قيادة وتحكّم تنتقل الإدارة من متابعة الزمن إلى قيادة القيمة.\n\n> المعلم الذي لا يرتبط بالمسار الحرج وسجل المخاطر وإجراء التغيير تاريخ يُرجى، لا نقطة تحكم.\n\n## أبعاد المعلم الخمسة\n1. قرار: من يقرر عند المعلم وماذا.\n2. توقيت: متى تُطرح الأسئلة بدل أن تتقادم.\n3. تحكّم: حدود التحمّل والتصعيد.\n4. قياس: معيار يُفحص لا تاريخ يُرجى.\n5. قيمة: منفعة يخدمها المعلم.' },
          quiz: [{ q: 'ما المعلم في هذه المنهجية؟', options: ['تاريخ في الخطة', 'نقطة قرار وتحكّم', 'اجتماع متابعة'] }],
          reflection: 'ما آخر معلم مرّ في مشروعك دون قرار؟ وماذا كان ينبغي أن يُقرَّر عنده؟',
        };
      }
      case 'handbook.ping': return { success: true, reading: null };
      case 'handbook.complete': s.chapterDone = true; s.points = 20; return { success: true, score: 1, total: 1, results: [{ correct: true, answer: 1, why: 'المعلم نقطة قرار.' }], first: true, gained: 20, points: { total: 20, rank: { title: 'مستكشف' } } };
      case 'models.list': return { success: true, models: [{ id: 'm1', key: 'raci', dimension: 'milestone', title_ar: 'مصفوفة المسؤوليات', summary_ar: 'من يقرر ومن ينفذ', points: 30, fields_n: 4, progress: 0, submission: null, min_level: 'beginner' }] };
      case 'achievements': return { success: true, total: s.points, rank: { title: 'مستكشف' }, ledger: [] };
      case 'capstone.get': return {
        success: true, initiative: 'رقمنة خدمات المستفيدين', scope: 'program', scope_title: 'برنامج', level: 'intermediate', track: { title: 'القيادة من خلال الآخرين', priority: 'milestone' },
        capstone: { status: 'draft', status_title: 'قيد البناء', summary: 'برنامج لرقمنة ثلاث خدمات للمستفيدين خلال ستة أشهر، بمنفعة مقيسة: خفض زمن الخدمة من أسبوع إلى يومين.' },
        sections: capstoneSections, checks: [{ key: 'sponsor', title: 'للمبادرة راعٍ من الجهة ببريد صحيح', ok: true, detail: null }, { key: 'wbs-owner', title: 'لكل حزمة عمل مالك واحد', ok: false, detail: 'حزم بلا مالك: WP-2' }],
        readiness: 58, ready_min: 80, can_submit: false, blocker: 'فصول لم تكتمل: هيكل تجزئة العمل، خريطة أصحاب المصلحة',
        rubric: RUBRIC.map((title, i) => ({ key: `k${i}`, title, anchors: ['1', '2', '3', 'وصف المستوى الأعلى'] })),
      };
      case 'hall.state': return { success: true, session: null };
      case 'peer.list': return peer();
      case 'peer.ask': s.mine.push(b.text); return peer();
      case 'experts.suggest': return { success: true, role: 'coach', roles: [], contexts: {}, dimensions: {}, requests: [], candidates: [] };
      case 'certificate': return { success: true, certificate: null };
      case 'cert.verify': return { success: true, found: true, status: 'valid', certificate: { kind: 'completion_success', serial: b.serial || 'MI-LDR-2026-000142', name_ar: NAME, program_ar: 'برنامج إدارة المشروعات للقادة', cohort_ar: 'دفعة نوفمبر 2026', org: { name: 'هيئة التحوّل الرقمي' }, issued_at: '2027-02-25T00:00:00Z' } };
      case 'lab.list': return { success: true, items: [], points: 0 };
      case 'org.visibility': return { success: true, list: true, scores: true, share_consented: false, org: 'هيئة التحوّل الرقمي' };
      case 'sessions.list': return { success: true, items: [{ id: 's1', device: 'Chrome على Windows', at: '2026-11-05T09:00:00Z', current: true }] };
      default: return { success: true, items: [], list: [] };
    }
  };
  return { s, reply };
}
