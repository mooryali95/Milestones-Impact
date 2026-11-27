// ════════════════════════════════════════════════════════════════
// صفحة المسار (المرحلة 23، تصور الرحلة والمسار 4.7): دوال خالصة تقرأ ما هو قائم ولا تنشئ مصدرًا جديدًا
// ════════════════════════════════════════════════════════════════
// رحلة المسار من trackManifest(k).card.journey (البطاقة نفسها التي تقرؤها الرحلة والكتاب والوثيقة)، وكل بند يُربط
// بمرحلته من journey_stages في رد admin.catalog. والخط الزمني من journeyTimeline نفسه بمتطلبات البرنامج التي تنطبق
// على مستويات المسار (requirementApplies، القاعدة التي يبني بها الخادم رحلة المشارك).
import { DIMENSIONS, requirementApplies, trackLevels } from '../../supabase/functions/leaders-api/logic.js';
import { trackManifest } from '../../supabase/functions/leaders-api/track-manifest.js';
import { journeyHref } from './attendance-groups.js';

/** المتطلبات التي تنطبق على مستويات المسار، فيرى المدير رحلة هذا المسار كاملة (المشتركة والخاصة بمستواه) */
export function trackRequirements(catalog, k) {
  const levels = trackLevels(k);
  if (!levels) return [];
  return (catalog?.stage_requirements || []).filter((r) => requirementApplies(r, levels));
}

/**
 * صفوف «رحلة المسار»: صف لكل إطار بمستواه، وبنوده بأسمائها ومراحلها، ومختبراته، وجسوره، ونجمة الإطار المعمّق.
 * البند الذي ليس في البرنامج يبقى برمزه بلا مرحلة ولا رابط، فلا يُخترع له موضع.
 */
export function trackJourneyRows(catalog, k) {
  const m = trackManifest(k);
  const levels = m.levels;
  const reqs = catalog?.stage_requirements || [];
  const stages = new Map((catalog?.journey_stages || []).map((s) => [s.key, s]));
  const labs = new Map((catalog?.lab_links || []).map((l) => [l.key, l]));
  const pid = catalog?.program_id || null;
  const rows = DIMENSIONS.map((d) => {
    const f = m.card.journey.by_framework?.[d] || { requirements: [], labs: [] };
    return {
      dimension: d, level: levels[d], deep: m.priority === d,
      items: f.requirements.map((code) => {
        const r = reqs.find((x) => x.code === code && x.active !== false);
        const s = r ? stages.get(r.stage_key) : null;
        return { code, title: r?.title_ar || code, stage: s?.title_ar || null, stage_key: s?.key || null,
          href: r && pid ? journeyHref(pid, `req=${encodeURIComponent(r.id)}`) : null };
      }),
      labs: f.labs.map((key) => ({ key, title: labs.get(key)?.title_ar || key })),
      bridges: m.card.bridges.filter((b) => b.dimension === d).map((b) => b.title),
    };
  });
  return { rows, hours: m.card.support.estimate_hours, priority: m.priority };
}

/** «أين يُحرَّر»: الوجهة واسمها لكل جزء من الصفحة، من مصادره الأربعة */
export const EDIT_WHERE = {
  identity: { label: 'نموذج هوية المسار', action: 'identity' },
  profile: { label: 'ملف المحتوى', file: 'supabase/content/tracks/v2/profiles.json' },
  journey: { label: 'ملف المحتوى', file: 'supabase/content/tracks/v2/cards.json وslices.json' },
  stages: { label: 'الرحلة والمتطلبات', tab: 'journey' },
  project: { label: 'النماذج في «كتاب القائد»', tab: 'handbook' },
  handbook: { label: 'كتاب القائد', tab: 'handbook' },
};

/** هل توجيه الرحلة في الهوية مطابق لنص الملف؟ فيُخفى الحقل خلف «تخصيص» */
export const sameJourney = (track, profile) => !!profile?.journey_ar
  && String(track?.journey_ar || '').trim() === String(profile.journey_ar).trim();
