#!/usr/bin/env node
// عميل R2 صغير بلا حزم (توقيع AWS SigV4 لواجهة S3)، للنسخ الاحتياطي خارج GitHub (D09).
//   node scripts/ops/r2.mjs put <المفتاح> <الملف> [نوع المحتوى]
//   node scripts/ops/r2.mjs get <المفتاح> <الملف>
//   node scripts/ops/r2.mjs head <المفتاح>
//   node scripts/ops/r2.mjs list <البادئة>
// البيئة: R2_ACCOUNT_ID وR2_ACCESS_KEY_ID وR2_SECRET_ACCESS_KEY وR2_BUCKET. الرمز مقصور على الدلو
// بقراءة الكائنات وكتابتها، وقفل الاحتفاظ في الدلو يمنع حذف النسخ والكتابة فوقها (R2 لا يقدم رمز كتابة فقط).
import { createHash, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const hex = (b) => createHash('sha256').update(b).digest('hex');
const hmac = (k, s) => createHmac('sha256', k).update(s).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export const encodePath = (p) => p.split('/').map(enc).join('/');

// توقيع طلب S3 (AWS SigV4). يعيد الرؤوس كاملة بما فيها Authorization.
export function sign({ method, host, path, query = {}, headers = {}, body = '', accessKeyId, secretAccessKey, region = 'auto', service = 's3', date = new Date() }) {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = headers['x-amz-content-sha256'] || hex(body);
  const all = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(all).sort();
  const canonicalQuery = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(String(query[k]))}`).join('&');
  const canonical = [method, path, canonicalQuery, names.map((n) => `${n}:${all[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { ...all, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

export function client(env = process.env) {
  for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) if (!env[k]) throw new Error(`${k} مطلوب`);
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const call = async (method, key, { body = '', query = {}, headers = {} } = {}) => {
    const path = `/${env.R2_BUCKET}/${key ? encodePath(key) : ''}`;
    const h = sign({ method, host, path, query, headers, body, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY });
    delete h.host;
    const qs = Object.keys(query).length ? `?${new URLSearchParams(query)}` : '';
    const r = await fetch(`https://${host}${path}${qs}`, { method, headers: h, body: method === 'PUT' ? body : undefined });
    if (!r.ok && !(method === 'HEAD' && r.status === 404)) throw new Error(`R2 ${method} ${key || ''}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r;
  };
  return {
    put: (key, body, type = 'application/octet-stream', meta = {}) => call('PUT', key, { body, headers: { 'content-type': type, ...Object.fromEntries(Object.entries(meta).map(([k, v]) => [`x-amz-meta-${k}`, v])) } }),
    get: async (key) => Buffer.from(await (await call('GET', key)).arrayBuffer()),
    head: async (key) => { const r = await call('HEAD', key); return r.status === 404 ? null : { bytes: Number(r.headers.get('content-length')), modified: r.headers.get('last-modified') }; },
    list: async (prefix) => {
      const xml = await (await call('GET', '', { query: { 'list-type': '2', prefix } })).text();
      return [...xml.matchAll(/<Key>([^<]+)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>/g)].map((m) => ({ key: m[1], bytes: Number(m[2]) }));
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, key, file, type] = process.argv.slice(2);
  const r2 = client();
  if (cmd === 'put') {
    const body = readFileSync(file);
    await r2.put(key, body, type, { sha256: hex(body) });
    console.log(`✓ ${key} (${body.length} بايت، sha256 ${hex(body).slice(0, 12)})`);
  } else if (cmd === 'get') {
    const body = await r2.get(key);
    writeFileSync(file, body);
    console.log(`✓ ${key} ← ${file} (${body.length} بايت)`);
  } else if (cmd === 'head') console.log(JSON.stringify(await r2.head(key)));
  else if (cmd === 'list') for (const o of await r2.list(key || '')) console.log(`${o.key}\t${o.bytes}`);
  else { console.error('الأوامر: put وget وhead وlist'); process.exit(2); }
}
