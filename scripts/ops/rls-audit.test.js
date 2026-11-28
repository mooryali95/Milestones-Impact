import { describe, it, expect } from 'vitest';
import { audit, loadAllow, QUERY } from '../db/rls-audit.mjs';

const row = (o) => ({ schema: 'leaders', name: 't', kind: 'r', rls: true, options: '', grants: '[]', policy_roles: '[]', ...o });

describe('rls-audit', () => {
  it('دالة SECURITY DEFINER ينفذها anon أو بلا search_path تفشل', () => {
    const fn = (o) => ({ schema: 'public', name: 'f()', kind: 'fn', exec_roles: '[]', search_path: true, ...o });
    expect(audit([fn({})]).violations).toEqual([]);
    expect(audit([fn({ exec_roles: '["anon"]' })]).violations.map((v) => v.rule)).toEqual(['definer-exposed']);
    expect(audit([fn({ search_path: false })]).violations.map((v) => v.rule)).toEqual(['definer-exposed']);
  });
  it('جدول أجنبي ممنوح يفشل، وتسلسل بـ USAGE أو UPDATE يفشل وبـ SELECT وحده لا', () => {
    expect(audit([row({ kind: 'f', rls: false, grants: JSON.stringify([{ role: 'anon', privilege: 'SELECT' }]) })]).violations.map((v) => v.rule)).toEqual(['foreign-grant']);
    expect(audit([row({ kind: 'S', seq_grants: JSON.stringify([{ role: 'authenticated', privilege: 'USAGE' }]) })]).violations.map((v) => v.rule)).toEqual(['sequence-grant']);
    expect(audit([row({ kind: 'S', seq_grants: JSON.stringify([{ role: 'anon', privilege: 'SELECT' }]) })]).violations).toEqual([]);
  });
  it('حالة نظيفة تنجح: RLS مفعّلة ومنح يقابله سياسة للدور', () => {
    const r = audit([row({ grants: JSON.stringify([{ role: 'authenticated', privilege: 'SELECT' }]), policy_roles: '["authenticated"]' })]);
    expect(r.violations).toEqual([]);
    expect(r.unused).toEqual([]);
  });
  it('جدول بلا RLS يفشل', () => {
    expect(audit([row({ rls: false })]).violations.map((v) => v.rule)).toEqual(['no-rls']);
  });
  it('منح anon بلا سياسة له يفشل', () => {
    const r = audit([row({ grants: JSON.stringify([{ role: 'anon', privilege: 'SELECT' }]), policy_roles: '["authenticated"]' })]);
    expect(r.violations.map((v) => v.rule)).toEqual(['grant-no-policy']);
  });
  it('منح anon صلاحية TRUNCATE يفشل ولو وُجدت سياسة', () => {
    const r = audit([row({ grants: JSON.stringify([{ role: 'anon', privilege: 'TRUNCATE' }]), policy_roles: '["anon"]' })]);
    expect(r.violations.map((v) => v.rule)).toEqual(['rls-bypass-grant']);
  });
  it('عرض ممنوح لـ anon وليس security_invoker يفشل', () => {
    const r = audit([row({ kind: 'v', grants: JSON.stringify([{ role: 'anon', privilege: 'SELECT' }]) })]);
    expect(r.violations.map((v) => v.rule)).toEqual(['view-grant']);
    expect(audit([row({ kind: 'v', options: 'security_invoker=true', grants: JSON.stringify([{ role: 'anon', privilege: 'SELECT' }]) })]).violations).toEqual([]);
  });
  it('الاستثناء الصريح يقبل المخالفة، والاستثناء المعطوب أو بلا سبب يفشل', () => {
    const allow = { tables: { 'leaders.t': { rules: ['no-rls'], reason: 'سبب', needs_decision: true } } };
    const r = audit([row({ rls: false })], allow);
    expect(r.violations).toEqual([]);
    expect(r.needsDecision).toEqual(['leaders.t']);
    expect(audit([row()], allow).unused).toHaveLength(1);
    expect(audit([row({ rls: false })], { tables: { 'leaders.t': { rules: ['no-rls'] } } }).unused).toHaveLength(1);
  });
  it('ملف الاستثناءات المودع صالح ولكل استثناء سبب', () => {
    for (const e of Object.values(loadAllow('scripts/db/rls-audit-allow.json').tables)) expect(e.reason).toBeTruthy();
  });
  it('الاستعلام يستثني sspdf المجمد', () => {
    expect(QUERY).toContain("'sspdf'");
  });
});
