// حارس الصلاحيات: كل إجراء إدارة يغيّر شيئًا يمر بـ requireWrite (مباشرة أو عبر A.writer)،
// فلا يضيف أحد إجراء كتابة يستطيعه حساب «عرض فقط».
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '../../supabase/functions/leaders-api');
const src = Object.fromEntries(readdirSync(DIR).filter((f) => f.endsWith('.ts')).map((f) => [f, readFileSync(join(DIR, f), 'utf8')]));
const index = src['index.ts'];
const ALIAS = Object.fromEntries([...index.matchAll(/import \* as (\w+) from '\.\/(\w+)\.ts'/g)].map((m) => [m[1], `${m[2]}.ts`]));
const block = index.slice(index.indexOf('const admin:'), index.indexOf('\n};', index.indexOf('const admin:')));
const actions = [...block.matchAll(/'(admin\.[\w-]+)':\s*([^\n]+)/g)].map((m) => ({ name: m[1], handler: m[2] }));
// إجراء كتابة إن كان في اسمه فعل تغيير (كلمة كاملة بين الشرطات): admin.coordinator-save ← save
const VERBS = new Set(['save', 'delete', 'remove', 'approve', 'review', 'issue', 'revoke', 'reissue', 'assign', 'create', 'add', 'update', 'move',
  'reorder', 'grant', 'set', 'toggle', 'publish', 'restore', 'version', 'available', 'mark', 'reset', 'import', 'send', 'invite', 'archive', 'upgrade', 'close', 'reopen', 'pin', 'waive', 'endorse']);
const isWrite = (name) => name.slice(6).split(/[-.]/).some((w) => VERBS.has(w));

// هل الدالة المستدعاة تتحقق بنفسها؟ نقرأ جسمها من ملفها
function guarded(handler) {
  if (/\bA\.writer\(|requireWrite\(/.test(handler)) return true;
  const m = handler.match(/\b([A-Z])\.(\w+)\b/);
  if (!m) return false;
  const file = src[ALIAS[m[1]]] || '';
  const at = file.search(new RegExp(`export (async )?function ${m[2]}\\b`));
  if (at < 0) return false;
  const body = file.slice(at, file.indexOf('\n}\n', at));
  return /requireWrite\(|writer\(/.test(body);
}

describe('صلاحيات إجراءات الإدارة', () => {
  it('وُجدت الإجراءات', () => expect(actions.length).toBeGreaterThan(50));
  it('كل إجراء كتابة يتحقق من صلاحية الكتابة', () => {
    expect(actions.filter((a) => isWrite(a.name)).length).toBeGreaterThan(25);
    const open = actions.filter((a) => isWrite(a.name) && !guarded(a.handler)).map((a) => a.name);
    expect(open).toEqual([]);
  });
});
