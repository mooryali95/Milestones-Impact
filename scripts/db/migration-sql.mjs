// قراءة نص ترحيل SQL قراءة بنيوية بلا قاعدة (تصور تحديث المنصة بلا أثر، المرحلة 6): المصدر الواحد الذي يقرأ به
// فاحص الترحيلات (migration-lint.mjs) وخطة النسخ قبل التطبيق (premigration-backup.mjs) والتطبيق بلا معاملة
// (migration-tx.mjs) أوامرَ الترحيل وما تمسه من جداول.
//
// statements(sql) يقسم النص أوامر عند الفاصلة المنقوطة خارج النصوص والتعليقات وأجسام الدولار ($$ أو $tag$)، ويعيد لكل أمر:
//   text   نصه كما هو (للإرسال أمرًا أمرًا في الترحيل بلا معاملة)
//   code   نصه بلا تعليقات، والنصوص المقتبسة فارغة ('')، وأجسام الدولار $body$، بأحرف صغيرة ومسافات مفردة (للمطابقة)
//   bodies أجسام الدولار بترتيبها (جسم do يُقرأ لأنه ينفذ لحظة الترحيل، وجسم الدالة لا يُقرأ لأنه لا ينفذ)
//   line   سطر بدايته في الملف
// analyze(sql) يصنّف كل أمر عملية واحدة أو أكثر ({ op, table, ... })، وهو تحليل محافظ: ما لا يُفهم من كتلة do
// (execute ديناميكي) يُعلَّم unknown، فتنسخ خطة النسخ المخطط كاملًا بدل أن تخمّن.

const IDENT = '(?:"[^"]+"|[a-z_][a-z0-9_$]*)';
const NAME = `${IDENT}(?:\\.${IDENT})?`;

// الاسم المؤهل بمخططه: بلا مخطط يُعدّ public (مسار البحث الافتراضي في الإنتاج)
export function normName(raw) {
  const parts = String(raw).split('.').map((p) => p.replace(/^"|"$/g, '').toLowerCase());
  return parts.length === 1 ? `public.${parts[0]}` : `${parts[0]}.${parts[1]}`;
}
// جداول النسخ داخل القاعدة: backup_<الوصف> (المعتمد منذ 2026-11-14)، و<الجدول>_backup_<التاريخ> الأقدم
export const isBackupTable = (name) => /^[a-z0-9_]+\.(backup_|[a-z0-9_]+_backup_)/.test(name);

export function statements(sql) {
  const out = [];
  let text = '', code = '', bodies = [], line = 1, startLine = 1, i = 0;
  const n = sql.length;
  const push = () => {
    const t = text.trim();
    const c = code.replace(/\s+/g, ' ').trim().toLowerCase();
    if (c) out.push({ text: t, code: c, bodies, line: startLine });
    text = ''; code = ''; bodies = [];
  };
  while (i < n) {
    const ch = sql[i];
    if (!code.trim() && !/\s/.test(ch) && !(ch === '-' && sql[i + 1] === '-') && !(ch === '/' && sql[i + 1] === '*')) startLine = line;
    if (ch === '\n') { line++; text += ch; code += ' '; i++; continue; }
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      text += sql.slice(i, stop); code += ' '; i = stop; continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      let depth = 1, j = i + 2;
      while (j < n && depth) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; } else if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; } else j++;
      }
      const chunk = sql.slice(i, j);
      line += (chunk.match(/\n/g) || []).length;
      text += chunk; code += ' '; i = j; continue;
    }
    if (ch === "'") {
      // E'..' يقبل الشرطة المائلة هروبًا، والعادي '' وحده
      const escaped = /[eE]/.test(sql[i - 1] || '') && !/[a-zA-Z0-9_]/.test(sql[i - 2] || '');
      let j = i + 1;
      while (j < n) {
        if (escaped && sql[j] === '\\') { j += 2; continue; }
        if (sql[j] === "'") { if (sql[j + 1] === "'") { j += 2; continue; } break; }
        j++;
      }
      const chunk = sql.slice(i, j + 1);
      line += (chunk.match(/\n/g) || []).length;
      text += chunk; code += "''"; i = j + 1; continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < n) { if (sql[j] === '"') { if (sql[j + 1] === '"') { j += 2; continue; } break; } j++; }
      const chunk = sql.slice(i, j + 1);
      text += chunk; code += chunk; i = j + 1; continue;
    }
    if (ch === '$' && !/[a-zA-Z0-9_]/.test(sql[i - 1] || '')) {
      const m = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end < 0 ? n : end + tag.length;
        const chunk = sql.slice(i, stop);
        bodies.push(sql.slice(i + tag.length, end < 0 ? n : end));
        line += (chunk.match(/\n/g) || []).length;
        text += chunk; code += ' $body$ '; i = stop; continue;
      }
    }
    if (ch === ';') { text += ch; push(); i++; continue; }
    text += ch; code += ch; i++;
  }
  push();
  return out;
}

// الإجراءات في alter table مفصولة بفواصل خارج الأقواس
function splitTop(s) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const re = (s) => new RegExp(s);
const ALTER_TABLE = re(`^alter table (?:if exists )?(?:only )?(${NAME}) (.*)$`);
const CREATE_TABLE = re(`^create (?:(?:global |local )?(?:temporary |temp |unlogged ))?table (?:if not exists )?(${NAME})`);
const CREATE_INDEX = re(`^create (unique )?index (concurrently )?(if not exists )?(?:(${NAME}) )?on (?:only )?(${NAME})`);
const DROP_INDEX = re(`^drop index (concurrently )?`);
const REINDEX = /^reindex (?:\(.*?\) )?(?:index|table|schema|database|system) (concurrently )?/;
const DROP = re(`^drop (table|view|materialized view) (?:if exists )?((?:${NAME}(?:, ?)?)+)`);
const CREATE_VIEW = re(`^create (?:or replace )?(?:materialized )?view (?:if not exists )?(${NAME})`);
const UPDATE = re(`^(?:with .* )?update (?:only )?(${NAME})`);
const DELETE = re(`^(?:with .* )?delete from (?:only )?(${NAME})`);
const TRUNCATE = re(`^truncate (?:table )?(?:only )?((?:${NAME}(?:, ?)?)+)`);
const INSERT = re(`^(?:with .* )?insert into (${NAME})`);
const RENAME_TABLE = re(`^alter (?:table|view) (?:if exists )?(${NAME}) rename to `);
const TX = /^(begin|start transaction|commit|end|rollback|savepoint|release savepoint|abort)\b/;
const FUNCTION = /^create (?:or replace )?(?:function|procedure)\b/;
const DO = /^do\b/;
const FUNCTION_NAME = re(`^create (?:or replace )?(?:function|procedure) (${NAME}) ?\\(`);
const SELECT_CALL = re(`^select (?:\\* from )?(${NAME}) ?\\(`);
// استدعاءات لا تكتب في جداول الترحيل: الجدولة، وإعدادات الجلسة، وإعادة تحميل PostgREST
const SAFE_CALL = /^(cron|pg_catalog|extensions|vault)\.|^public\.(set_config|pg_notify|pg_sleep|now|current_setting)$/;

const names = (list) => list.split(',').map((x) => x.trim()).filter(Boolean).map(normName);

// عمليات أمر واحد. ops: { op, table?, column?, detail? }
function opsOf(stmt, fns = new Map()) {
  const c = stmt.code;
  const ops = [];
  let m;
  if (TX.test(c)) return [{ op: 'tx-control', detail: c.split(' ')[0] }];
  if ((m = c.match(FUNCTION_NAME))) return [{ op: 'function', name: normName(m[1]) }];
  if (FUNCTION.test(c)) return [{ op: 'function' }];
  if (DO.test(c)) return doOps(stmt.bodies);
  // select دالة_مساعدة(...): الدالة المعرّفة في الترحيل نفسه يُقرأ جسمها (ترقيعات المحتوى تمر بها)، وغيرها لا يُعرف ما تكتبه
  if ((m = c.match(SELECT_CALL))) {
    const fn = normName(m[1]);
    if (SAFE_CALL.test(fn)) return [{ op: 'other' }];
    const body = fns.get(fn);
    return body ? doOps([body]).map((o) => (o.op === 'do' ? { op: 'other' } : { ...o, via: fn })) : [{ op: 'unknown', detail: `استدعاء ${fn}` }];
  }
  if ((m = c.match(RENAME_TABLE))) return [{ op: 'rename', table: normName(m[1]), detail: 'rename to' }];
  if ((m = c.match(CREATE_TABLE))) return [{ op: 'create-table', table: normName(m[1]), asSelect: / as (?:\(?\s*)?(select|table|with)\b/.test(c) }];
  if ((m = c.match(CREATE_INDEX))) return [{ op: 'create-index', table: normName(m[5]), concurrently: !!m[2], ifNotExists: !!m[3] }];
  if ((m = c.match(DROP_INDEX))) return [{ op: 'drop-index', concurrently: !!m[1] }];
  if ((m = c.match(REINDEX))) return [{ op: 'reindex', concurrently: !!m[1] }];
  if ((m = c.match(DROP))) return names(m[2]).map((t) => ({ op: m[1] === 'table' ? 'drop-table' : 'drop-view', table: t }));
  if ((m = c.match(CREATE_VIEW))) return [{ op: 'create-view', table: normName(m[1]) }];
  if ((m = c.match(ALTER_TABLE))) {
    const table = normName(m[1]);
    for (const a of splitTop(m[2])) ops.push(alterOp(table, a));
    return ops;
  }
  if ((m = c.match(UPDATE))) return [{ op: 'update', table: normName(m[1]) }];
  if ((m = c.match(DELETE))) return [{ op: 'delete', table: normName(m[1]) }];
  if ((m = c.match(TRUNCATE))) return names(m[1]).map((t) => ({ op: 'truncate', table: t }));
  if ((m = c.match(INSERT))) return [{ op: 'insert', table: normName(m[1]), upsert: /on conflict .* do update/.test(c) }];
  return [{ op: 'other' }];
}

function alterOp(table, a) {
  let m;
  if ((m = a.match(re(`^add (?:column )?(?:if not exists )?(${IDENT}) (.*)$`))) && !/^(constraint|primary key|unique|check|foreign key|exclude)\b/.test(a.slice(4))) {
    const def = m[2];
    return { op: 'add-column', table, column: m[1], notNull: /\bnot null\b/.test(def), hasDefault: /\bdefault\b/.test(def) || /\bgenerated\b/.test(def) };
  }
  if ((m = a.match(re(`^drop (?:column )?(?:if exists )?(${IDENT})`))) && !/^drop (constraint|default|not null|identity|expression)\b/.test(a)) {
    return { op: 'drop-column', table, column: m[1] };
  }
  if ((m = a.match(re(`^alter (?:column )?(${IDENT}) (.*)$`)))) {
    const rest = m[2];
    if (/^set not null\b/.test(rest)) return { op: 'set-not-null', table, column: m[1] };
    if (/^(set data )?type\b/.test(rest)) return { op: 'column-type', table, column: m[1] };
    return { op: 'alter-column', table, column: m[1] };
  }
  if ((m = a.match(re(`^rename (?:column )?(${IDENT}) to `))) && !/^rename constraint\b/.test(a)) return { op: 'rename', table, column: m[1], detail: 'rename column' };
  if (/^rename to /.test(a)) return { op: 'rename', table, detail: 'rename to' };
  return { op: 'alter-other', table };
}

// كتلة do تنفذ لحظة الترحيل: ما فيها من تغيير بيانات أو بنية يُقرأ، وexecute الديناميكي لا يُعرف هدفه
function doOps(bodies) {
  const ops = [];
  for (const body of bodies) {
    const flat = body.replace(/--[^\n]*/g, ' ').replace(/'(?:[^']|'')*'/g, "''").replace(/\s+/g, ' ').toLowerCase();
    if (/\bexecute\b/.test(flat)) ops.push({ op: 'unknown', detail: 'execute داخل do' });
    for (const [kind, rx] of [['update', re(`(?:^|[;\\s])update (?:only )?(${NAME}) `)], ['delete', re(`(?:^|[;\\s])delete from (?:only )?(${NAME})`)],
      ['truncate', re(`(?:^|[;\\s])truncate (?:table )?(?:only )?(${NAME})`)], ['insert', re(`(?:^|[;\\s])insert into (${NAME})`)]]) {
      for (const m of flat.matchAll(new RegExp(rx.source, 'g'))) {
        // «on conflict ... do update set» ليست أمر update، و«before update on» في المشغّل كذلك
        if (kind === 'update' && /\b(do|before|after|or|of|for)$/.test(flat.slice(0, m.index + 1).trim())) continue;
        // insert داخل do: «on conflict ... do update» في ذيله حتى الفاصلة المنقوطة التالية، كمسار الأمر المفرد
        const end = flat.indexOf(';', m.index);
        const upsert = kind === 'insert' && /\bon conflict\b.*\bdo update\b/.test(flat.slice(m.index, end < 0 ? undefined : end));
        ops.push({ op: kind, table: normName(m[1]), inDo: true, ...(kind === 'insert' ? { upsert } : {}) });
      }
    }
    for (const m of flat.matchAll(new RegExp(`alter table (?:if exists )?(?:only )?(${NAME}) ([^;]*)`, 'g'))) {
      const table = normName(m[1]);
      for (const a of splitTop(m[2])) ops.push({ ...alterOp(table, a), inDo: true });
    }
  }
  return ops.length ? ops : [{ op: 'do' }];
}

export function analyze(sql) {
  const list = statements(sql);
  // أجسام الدوال المعرّفة في الترحيل نفسه، بأسمائها، ليُقرأ ما تكتبه حين تُستدعى فيه
  const fns = new Map();
  for (const s of list) {
    const m = s.code.match(FUNCTION_NAME);
    if (m && s.bodies.length) fns.set(normName(m[1]), s.bodies.join('\n'));
  }
  return list.flatMap((s) => opsOf(s, fns).map((o) => ({ ...o, line: s.line, stmt: s })));
}

// وسم الترحيل بلا معاملة في سطوره الأولى، كوسم deploy-gate
export const NO_TX_RE = /^--\s*migrate:\s*no-transaction\b/m;
export const noTransaction = (sql) => NO_TX_RE.test(sql.split('\n').slice(0, 15).join('\n'));
