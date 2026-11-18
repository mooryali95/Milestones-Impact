// جدول توجيه الإشعارات (_shared/notify-routing.js): كل طبقة مع كل حال لسلاك، والصف المقفل، والإعداد التالف، والفهرس.
// التصور 2026-11-16، القسم 10.1. اللوحة تستورد الوحدة نفسها لرسم المركز في المرحلة 4
import {
  CATEGORIES, CHANNELS, DEFAULT_PRESET, DEFAULT_SETTINGS, EVENTS, EVENT_INDEX, PRESETS, SLACK_DOWN_MS, SLACK_STATES, TIERS, TIER_AR,
  eventOf, normalizeSettings, route, slackStateOf, wanted,
} from '../../supabase/functions/_shared/notify-routing.js';

const pick = (r) => [r.email, r.slack, r.digest];
const keyOfTier = (tier, extra = {}) => EVENTS.find((e) => e.tier === tier && !e.locked && !e.digest && e.allow.length === 3 && Object.entries(extra).every(([k, v]) => e[k] === v)).key;

describe('route: «متوازن» الافتراضي بكل طبقة وكل حال لسلاك', () => {
  // [بريد، سلاك فوري، الملخص]
  const TABLE = {
    critical: { ok: [true, true, false], failed: [true, false, false], unconfigured: [true, false, false] },
    important: { ok: [false, true, false], failed: [true, false, false], unconfigured: [true, false, false] },
    info: { ok: [false, false, true], failed: [false, false, true], unconfigured: [false, false, true] },
  };
  for (const [tier, states] of Object.entries(TABLE)) {
    for (const [state, want] of Object.entries(states)) {
      it(`${TIER_AR[tier]} وسلاك ${state}`, () => {
        expect(pick(route(keyOfTier(tier), undefined, state))).toEqual(want);
        expect(route(keyOfTier(tier), undefined, state).log).toBe(true);
      });
    }
  }
  it('سجل فقط لا يرسل شيئًا في أي حال', () => {
    const ev = { key: 'x_log', tier: 'log', allow: ['email', 'slack', 'digest'], locked: false, digest: false };
    for (const s of SLACK_STATES) expect(pick(route(ev, undefined, s))).toEqual([false, false, false]);
  });
  it('حال سلاك غير معروفة تُعامل فشلًا: البريد لا يسكت', () => {
    expect(route(keyOfTier('important'), undefined, 'weird').email).toBe(true);
    expect(route(keyOfTier('important'), undefined).email).toBe(false);
  });
  it('الافتراضي «متوازن» بقرار المالك', () => {
    expect(DEFAULT_PRESET).toBe('balanced');
    expect(PRESETS.balanced.label).toBe('متوازن');
    expect(DEFAULT_SETTINGS).toEqual({ preset: 'balanced', rows: {}, digest_hour: 9 });
  });
});

describe('route: الإعدادات الجاهزة الأخرى', () => {
  it('هادئ: المعلوماتي إلى السجل وحده', () => {
    expect(pick(route(keyOfTier('info'), { preset: 'quiet' }, 'ok'))).toEqual([false, false, false]);
    expect(pick(route(keyOfTier('important'), { preset: 'quiet' }, 'ok'))).toEqual([false, true, false]);
  });
  it('كل شيء: المهم بريد وسلاك، والمعلوماتي سلاك فوري، فإن فشل سلاك فالبريد', () => {
    expect(pick(route(keyOfTier('important'), { preset: 'all' }, 'ok'))).toEqual([true, true, false]);
    expect(pick(route(keyOfTier('info'), { preset: 'all' }, 'ok'))).toEqual([false, true, false]);
    expect(route(keyOfTier('info'), { preset: 'all' }, 'failed').email).toBe(true);
  });
  it('الحرج بريد وسلاك في كل إعداد جاهز', () => {
    for (const p of Object.keys(PRESETS)) expect(pick(route(keyOfTier('critical'), { preset: p }, 'ok'))).toEqual([true, true, false]);
  });
});

describe('route: الصف المقفل والقنوات المسموحة والصفوف المعدلة', () => {
  it('الصف المقفل يرسل البريد ولو خُزّن مطفأ', () => {
    const r = route('payment_mismatch', { rows: { payment_mismatch: { email: false, slack: false, digest: false } } }, 'ok');
    expect(r.email).toBe(true);
    expect(r.locked).toBe(true);
    expect(r.slack).toBe(false);
  });
  it('مفتاح المساعد بلا بريد في أي حال (بريد الملاك الأمني يغطيه)، وبريد الملاك نفسه مقفل', () => {
    for (const s of SLACK_STATES) expect(route('agent_key_changed', undefined, s).email).toBe(false);
    expect(route('agent_key_changed', { preset: 'all' }, 'ok').email).toBe(false);
    expect(route('agent_key_changed', undefined, 'ok').slack).toBe(true);
    expect(EVENT_INDEX.agent_key_mail.locked).toBe(true);
  });
  it('صف معدّل يغلب الإعداد الجاهز، وصف لحدث مجهول أو بقيم غير منطقية يسقط', () => {
    const k = keyOfTier('important');
    expect(pick(route(k, { rows: { [k]: { email: true, slack: false } } }, 'ok'))).toEqual([true, false, false]);
    expect(normalizeSettings({ rows: { nope: { email: true }, [k]: { email: 'yes' } } }).rows).toEqual({ [k]: { email: false, slack: false, digest: false } });
  });
  it('ما يدخل الملخص مع سطره الفوري: الدفعة الجديدة (قرار المالك) وطلبات الخبراء والرعاية', () => {
    for (const k of ['payment_new', 'expert_application', 'sponsor_request', 'booking_not_eligible']) {
      expect(pick(route(k, undefined, 'ok'))).toEqual([false, true, true]);
    }
  });
  it('طلب التواصل بالبريد وSlack (قرار المالك)', () => {
    expect(pick(route('contact_request', undefined, 'ok'))).toEqual([true, true, false]);
  });
  it('«Slack لا يستقبل» بريد وحده ومقفل، ومرة كل ست ساعات', () => {
    expect(pick(route('slack_down', undefined, 'failed'))).toEqual([true, false, false]);
    expect(SLACK_DOWN_MS).toBe(6 * 36e5);
  });
});

describe('الإعداد التالف أو المتعذر يطبق الافتراضي', () => {
  for (const bad of [null, undefined, 'x', 42, { preset: 'loud' }, { rows: 'x' }]) {
    it(JSON.stringify(bad) ?? 'undefined', () => {
      expect(normalizeSettings(bad)).toEqual({ preset: 'balanced', rows: {}, digest_hour: 9 });
      expect(wanted(keyOfTier('info'), bad)).toEqual(wanted(keyOfTier('info')));
    });
  }
});

describe('الفهرس', () => {
  it('كل حدث له طبقة وفئة وتسمية عربية وقنوات مسموحة، ولا مفتاح مكرر', () => {
    const keys = EVENTS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of EVENTS) {
      expect(TIERS).toContain(e.tier);
      expect(Object.keys(CATEGORIES)).toContain(e.category);
      expect(e.label.length).toBeGreaterThan(3);
      expect(e.allow.every((c) => CHANNELS.includes(c))).toBe(true);
      // المقفل بريده مسموح دائمًا
      if (e.locked) expect(e.allow).toContain('email');
    }
  });
  it('كل نوع تنبيه ترفعه الدوال اليوم في الفهرس بطبقته من الجرد', () => {
    const tiers = {
      critical: ['mail_cap', 'mail_failed', 'mail_unconfigured', 'captcha_unconfigured', 'audit_failed', 'cert_key_missing', 'certificate_issue',
        'payment_mismatch', 'payment_unmatched', 'erase_request', 'erase_reminder', 'erase_files_failed', 'erase_close_failed', 'erase_audit_failed',
        'creem-webhook', 'agent_spend_cap', 'agent_ledger_error', 'agent_model_unknown', 'agent_model_config'],
      important: ['internal', 'client_boot_failures', 'mail_rejected', 'mail_counter_unavailable', 'mail_quota_70', 'mail_queue_stuck', 'mail_queue_carryover',
        'booking_not_eligible', 'seat_check_unavailable', 'leaders-hooks', 'agent_key_changed', 'agent_key_reverted', 'agent_enabled', 'agent_disabled',
        'agent_spend_80', 'agent_eval_stale', 'alert_test'],
    };
    for (const [tier, keys] of Object.entries(tiers)) for (const k of keys) expect([k, EVENT_INDEX[k]?.tier]).toEqual([k, tier]);
    // المال والحذف مقفلان
    for (const k of ['payment_mismatch', 'payment_unmatched', 'creem-webhook', 'erase_request', 'certificate_issue']) expect(EVENT_INDEX[k].locked).toBe(true);
  });
  it('النوع بلاحقة معرّف يأخذ صف أصله، والمجهول «مهم» غير مقفل', () => {
    expect(eventOf('booking_not_eligible:ev_77').key).toBe('booking_not_eligible');
    expect(eventOf('something_new')).toMatchObject({ tier: 'important', locked: false, unknown: true });
  });
  it('حال سلاك من نتيجة الإرسال', () => {
    expect(slackStateOf({ delivered: true, configured: true })).toBe('ok');
    expect(slackStateOf({ delivered: false, configured: true })).toBe('failed');
    expect(slackStateOf({ delivered: false, configured: false })).toBe('unconfigured');
  });
});
