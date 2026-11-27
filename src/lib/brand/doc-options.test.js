// المرحلة 33: قرار رمز التحقق (القائد والأدمن). دالة واحدة effectiveQr، والقرار حي لا يُجمَّد، والمنع يحجب الرمز والرابط
// ويُبقي البصمة، وverifyDoc يرد ردًا محايدًا. وعقد الصلاحيات: القائد يكتب owner لنفسه، والأدمن يكتب admin بصلاحية الكتابة
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { capstoneReport } from './capstone.js';
import { finalDocument, institutionalReport } from './institutional.js';
import { verifyMark } from './verify-mark.js';
import { adminChoice, ADMIN_QR_CHOICES, docOptionsView, effectiveQr, withAdminQr, withOwnerQr } from '../../../supabase/functions/leaders-api/doc-options.js';
import { freezeIssued } from '../../../supabase/functions/leaders-api/doc-quality.js';
import { DOC_QR_AR, DOC_VERIFY_AR } from '../../../supabase/functions/leaders-api/labels.js';
import { docFormFor } from '../../../supabase/functions/leaders-api/doc-form.js';
import { dispatchTables } from '../../../scripts/ops/action-contract.mjs';
import { MIGRATIONS, MIGRATION_GATES } from '../../../supabase/functions/leaders-api/migrations.js';
import { EXAMPLES } from '../../../supabase/content/initiative-guide/v1/examples.js';
import { exampleDoc } from '../../../leaders-app/src/guide.js';

const read = (p) => readFileSync(p, 'utf8');
const frozen = (doc_options) => {
  const d0 = exampleDoc(EXAMPLES[0]);
  const d = { ...d0, review: null, sponsor: null, meta: { ...d0.meta, example: false, status: 'approved', approved_at: '2026-11-20T10:00:00Z', version: 1, ref: 'MI-CP-QR000033',
    org: { name: 'هيئة تجريبية', logo: null, color: '#1F6F5C' }, participant: { name: 'سارة' }, track_key: 'M2I2L2', doc_form: docFormFor({ track: 'M2I2L2' }) } };
  return { ...d, issued: freezeIssued(d), ...(doc_options !== undefined && { doc_options }) };
};
const QR_TAG = /<svg class="qr"/;

describe('effectiveQr: قرار الأدمن، وإلا تفضيل القائد، وإلا مفعّل', () => {
  it('الافتراض مفعّل، ولأي قيمة تالفة', () => {
    for (const o of [undefined, null, {}, [], 'x', { owner: 'no' }, { owner: { qr: 'false' } }, { admin: { qr: 0 } }]) {
      expect(effectiveQr(o)).toEqual({ qr: true, source: 'default', forced: false });
    }
  });
  it('تفضيل القائد يسري ما لم يقرر الأدمن', () => {
    expect(effectiveQr({ owner: { qr: false } })).toEqual({ qr: false, source: 'owner', forced: false });
    expect(effectiveQr({ owner: { qr: true } }).qr).toBe(true);
  });
  it('قرار الأدمن يعلو دائمًا في الاتجاهين، ويعطل مفتاح القائد', () => {
    expect(effectiveQr({ owner: { qr: false }, admin: { qr: true } })).toEqual({ qr: true, source: 'admin', forced: true });
    expect(effectiveQr({ owner: { qr: true }, admin: { qr: false } })).toEqual({ qr: false, source: 'admin', forced: true });
  });
  it('الكتابة: القائد يغير owner وحده، والأدمن admin وحده، و«يتبع صاحبها» يحذف قرار الأدمن', () => {
    const a = withAdminQr({ owner: { qr: false } }, 'show', { by: 'a@x.sa', at: '2026-11-26T00:00:00Z', reason: '  سبب  ' });
    expect(a).toEqual({ owner: { qr: false }, admin: { qr: true, by: 'a@x.sa', at: '2026-11-26T00:00:00Z', reason: 'سبب' } });
    expect(withOwnerQr(a, true)).toEqual({ ...a, owner: { qr: true } });
    expect(withAdminQr(a, 'follow')).toEqual({ owner: { qr: false } });
    expect(withAdminQr({}, 'withhold', { by: 'a' }).admin.reason).toBeNull();
    expect(() => withOwnerQr({}, 'yes')).toThrow();
    expect(() => withAdminQr({}, 'hide')).toThrow();
    expect(ADMIN_QR_CHOICES.map((k) => adminChoice(withAdminQr({}, k)))).toEqual(ADMIN_QR_CHOICES);
  });
  it('ما يُلحق بالوثيقة: القرار وحده، بلا من قرر ولا سببه', () => {
    const v = docOptionsView({ owner: { qr: true }, admin: { qr: false, by: 'a@x.sa', at: 't', reason: 'سر' } });
    expect(v).toEqual({ owner: { qr: true }, admin: { qr: false } });
    expect(JSON.stringify(v)).not.toMatch(/a@x\.sa|سر/);
    expect(effectiveQr(v)).toEqual(effectiveQr({ owner: { qr: true }, admin: { qr: false } }));
  });
});

describe('الطباعة بالقرار الحي', () => {
  it('المنع (من القائد أو الأدمن): لا رمز ولا رابط في المؤسسية وملف العمل والنهائية، وتبقى البصمة والرقم المرجعي', () => {
    for (const o of [{ owner: { qr: false } }, { owner: { qr: true }, admin: { qr: false } }]) {
      const d = frozen(o);
      for (const r of [institutionalReport(d), capstoneReport(d), finalDocument(d, { qr: true })]) {
        expect(r.body).not.toMatch(QR_TAG);
        expect(r.body).not.toContain('/v/doc/');
        expect(r.body).toContain(d.issued.fingerprint);
        expect(r.meta.footer).toBe(`MI-CP-QR000033-V1  ·  ${d.issued.fingerprint}`);
      }
      expect(verifyMark(d)).toMatchObject({ url: null, fingerprint: d.issued.fingerprint });
    }
  });
  it('الإظهار المفروض على قائد منعه يطبع الرمز، والقرار لا يغير البصمة المجمدة', () => {
    const d = frozen({ owner: { qr: false }, admin: { qr: true } });
    expect(institutionalReport(d).body).toMatch(QR_TAG);
    expect(d.issued.fingerprint).toBe(frozen().issued.fingerprint);
  });
  it('خيار التنزيل qr:false يبقى نافذًا فوق الإظهار', () => {
    expect(institutionalReport(frozen({ admin: { qr: true } }), { qr: false }).body).not.toMatch(QR_TAG);
    expect(institutionalReport(frozen()).body).toMatch(QR_TAG);
  });
});

describe('عقد الخادم: الصلاحيات والرد المحجوب والقراءة الحية', () => {
  const ts = read('supabase/functions/leaders-api/capstone.ts');
  const index = read('supabase/functions/leaders-api/index.ts');
  const tables = dispatchTables(index);
  const fn = (name) => ts.slice(ts.indexOf(`export async function ${name}(`), ts.indexOf('\n}\n', ts.indexOf(`export async function ${name}(`)));

  it('الإجراءان في جدوليهما: capstone.options للمشارك، وadmin.capstone-options للأدمن بغلاف الكتابة', () => {
    expect(tables.participant).toContain('capstone.options');
    expect(tables.admin).toContain('admin.capstone-options');
    for (const t of ['open', 'expert', 'coordinator']) {
      expect(tables[t]).not.toContain('capstone.options');
      expect(tables[t]).not.toContain('admin.capstone-options');
    }
    expect(tables.participant).not.toContain('admin.capstone-options');
    expect(index).toMatch(/'admin\.capstone-options': \(a, b\) => A\.writer\(a, X\.adminOptions, b\)/);
    expect(index).toMatch(/'capstone\.options': \(p, b\) => X\.ownerOptions\(p, b\)/);
  });
  it('القائد يكتب owner لنفسه وحده (معرّف جلسته لا معرّف من الجسم)، والأدمن admin بمن قرر', () => {
    const owner = fn('ownerOptions');
    expect(owner).toMatch(/optionsRow\(p\.id\)/);
    expect(owner).toMatch(/writeOptions\(p\.id, /);
    expect(owner).toMatch(/withOwnerQr\(/);
    expect(owner).not.toMatch(/participant_id|withAdminQr/);
    const admin = fn('adminOptions');
    expect(admin).toMatch(/withAdminQr\(before, choice, \{ by: a\.email/);
    expect(admin).not.toMatch(/withOwnerQr/);
  });
  it('كل تغيير في التدقيق بالقيمة قبله وبعده', () => {
    expect(fn('ownerOptions')).toMatch(/audit\('participant', p\.email, 'capstone\.options', 'capstones', p\.id, \{[^}]+\}, \{[^}]+\}\)/);
    expect(fn('adminOptions')).toMatch(/audit\('admin', a\.email, 'admin\.capstone-options', 'capstones', p\.id,\s*\{[^}]+\},\s*\{[^}]+\}\)/);
  });
  it('الرد المحجوب: found وwithheld ونص محايد، بلا اسم المبادرة ولا الجهة ولا البرنامج', () => {
    const v = fn('verifyDoc');
    const withheld = v.slice(v.indexOf('if (!effectiveQr(row.doc_options).qr)'), v.indexOf('const s = row.snapshot'));
    expect(withheld).toMatch(/found: true/);
    expect(withheld).toMatch(/withheld: true/);
    expect(withheld).toMatch(/DOC_VERIFY_AR\.withheld/);
    expect(withheld).not.toMatch(/initiative|org|program|form|approved_at|ref/);
    expect(DOC_VERIFY_AR.withheld).toBe('هذه البصمة مسجلة لوثيقة معتمدة لدى Milestone Impact، ومحتواها محجوب بقرار صاحبها، فلا يمكن هنا مطابقة ما بين يديك');
    expect(DOC_VERIFY_AR.withheld).not.toMatch(/صحيحة|أصلية/);
    expect(DOC_VERIFY_AR.registered).not.toMatch(/صحيحة|أصلية|تطابق النسخة المحفوظة/);
    expect(DOC_VERIFY_AR.registered).toMatch(/بعنوانها وجهتها وتاريخ اعتمادها/);
    expect(DOC_QR_AR.owner_off).not.toMatch(/صحيحة|أصلية/);
    // كل ما يُطبع أو يُعرض من العبارتين لا يدعي أصالة ولا مطابقة محتوى
    for (const v of [...Object.values(DOC_VERIFY_AR), ...Object.values(DOC_QR_AR)].filter((x) => typeof x === 'string')) expect(v).not.toMatch(/أصال|أصلي|صحيح|النسخة المحفوظة/);
    expect(read('leaders-app/src/screens/Verify.jsx')).toMatch(/DOC_VERIFY_AR\.registered/);
    expect(withheld).not.toMatch(/authentic/);
    // الظاهر كذلك: registered لا authentic، فالخادم لا يطابق المحتوى
    const visible = v.slice(v.indexOf('const s = row.snapshot'));
    expect(visible).toMatch(/registered: true/);
    expect(visible).not.toMatch(/authentic/);
    // قبل الترحيل يُعاد البحث بدون العمود فيعمل التحقق كما كان
    expect(v).toMatch(/missingColumn\(lookErr\)/);
  });
  it('القرار يُقرأ حيًا مع كل وثيقة ولا يدخل لقطة الاعتماد', () => {
    expect(ts).toMatch(/const doc = \{ \.\.\.c\.snapshot, doc_options: options \}/);
    expect(ts).toMatch(/doc = \{ \.\.\.built\.doc, doc_options: options \}/);
    const approve = ts.slice(ts.indexOf('async function approve('), ts.indexOf('export async function adminReview'));
    expect(approve).not.toMatch(/doc_options/);
  });
  it('بوابة البرنامج: الفعل مصنف، ويبقى للمنسحب قراره في وثيقته', () => {
    for (const set of ['DEMO_OPEN', 'GATE_PROGRAM', 'GATE_KEPT']) {
      const body = index.slice(index.indexOf(`const ${set} = new Set([`), index.indexOf(']);', index.indexOf(`const ${set} = new Set([`)));
      expect(body).toContain("'capstone.options'");
    }
  });
});

describe('الترحيل واللقطة', () => {
  const name = '20261130030000_leaders_capstone_doc_options';
  const sql = read(`supabase/migrations/${name}.sql`);
  it('عمود jsonb غير فارغ افتراضه {} بقيد الكائن، متسامح وآمن لإعادة التشغيل', () => {
    expect(sql.split('\n')[0]).toMatch(/^-- deploy-gate: tolerant /);
    expect(sql).toMatch(/add column if not exists doc_options jsonb not null default '\{\}'::jsonb/);
    expect(sql).toMatch(/check \(jsonb_typeof\(doc_options\) = 'object'\)/);
    expect(sql).toMatch(/exception when duplicate_object then null/);
    expect(sql).toMatch(new RegExp(`values \\('${name}'\\) on conflict do nothing`));
    expect(MIGRATIONS).toContain(name);
    expect(MIGRATION_GATES[name][0]).toBe('tolerant');
  });
  it('اللقطة تحمل العمود والقيد', () => {
    const base = read('supabase/schema/baseline.sql');
    expect(base).toMatch(/-- as-of migration: \d{14}_/);
    expect(base).toMatch(/doc_options jsonb default '\{\}'::jsonb not null/);
    expect(base).toMatch(/capstones_doc_options_check CHECK \(\(jsonb_typeof\(doc_options\) = 'object'::text\)\)/);
  });
});

describe('الواجهتان', () => {
  it('مفتاح القائد بسطر يشرح ما يُرى، ومعطل بـ«قرار فريق البرنامج»؛ وخيارات الأدمن الثلاث؛ وVerify يعرض المحجوب', () => {
    const cap = read('leaders-app/src/screens/Capstone.jsx');
    expect(cap).toMatch(/call\('capstone\.options', \{ qr \}\)/);
    expect(cap).toMatch(/state\.forced \? `\$\{DOC_QR_AR\.forced\}: \$\{state\.qr \? DOC_QR_AR\.owner_on : DOC_QR_AR\.owner_off\}`/);
    expect(DOC_QR_AR.forced).toBe('قرار فريق البرنامج');
    const adm = read('admin-app/src/screens/Capstones.jsx');
    expect(adm).toMatch(/L\('admin\.capstone-options'/);
    expect(Object.keys(DOC_QR_AR.admin_choices)).toEqual(ADMIN_QR_CHOICES);
    expect(read('leaders-app/src/screens/Verify.jsx')).toMatch(/r\.withheld && /);
  });
});
