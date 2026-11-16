// المراجعة المتتالية لملفات المشاركين: الموضع والجاران، والاختصارات لا تعمل داخل حقل أو نافذة
import { beforeEach, describe, expect, it } from 'vitest';
import { navKey, position, queueLabel, readQueue, saveQueue } from './review-queue.js';

const store = new Map();
globalThis.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };

describe('قائمة المراجعة', () => {
  beforeEach(() => store.clear());
  it('تحفظ ترتيب ما يظهر بلا تكرار، وتقرأ نفسه', () => {
    saveQueue(['a', 'b', 'a', '', 'c'], 'بانتظار الاعتماد');
    expect(readQueue()).toEqual({ ids: ['a', 'b', 'c'], label: 'بانتظار الاعتماد' });
  });
  it('الموضع والجاران، وطرفا القائمة بلا جار', () => {
    const q = { ids: ['a', 'b', 'c'], label: '' };
    expect(position(q, 'b')).toEqual({ index: 2, total: 3, prev: 'a', next: 'c', label: '' });
    expect(position(q, 'a')).toMatchObject({ index: 1, prev: null, next: 'b' });
    expect(position(q, 'c')).toMatchObject({ index: 3, prev: 'b', next: null });
  });
  it('لا شريط لمن فُتح من خارج القائمة، أو قائمة من واحد، أو تخزين تالف', () => {
    expect(position({ ids: ['a', 'b'] }, 'z')).toBeNull();
    expect(position({ ids: ['a'] }, 'a')).toBeNull();
    expect(position(null, 'a')).toBeNull();
    store.set('mi_admin_review_queue', '{bad');
    expect(readQueue()).toBeNull();
  });
  it('وصف القائمة من العرض السريع المختار فقط', () => {
    const P = [{ key: 'approval', label: 'بانتظار الاعتماد' }];
    expect(queueLabel(P, 'approval')).toBe('بانتظار الاعتماد');
    expect(queueLabel(P, '')).toBe('');
  });
});

describe('اختصارات التنقل', () => {
  const doc = (modal = false) => ({ querySelector: () => (modal ? {} : null) });
  const ev = (o) => ({ target: { tagName: 'DIV' }, ...o });
  it('السهم الأيسر وJ للتالي، والأيمن وK للسابق (بموضع المفتاح فتعمل بلوحة عربية)', () => {
    expect(navKey(ev({ key: 'ArrowLeft' }), doc())).toBe('next');
    expect(navKey(ev({ key: 'ت', code: 'KeyJ' }), doc())).toBe('next');
    expect(navKey(ev({ key: 'ArrowRight' }), doc())).toBe('prev');
    expect(navKey(ev({ key: 'ن', code: 'KeyK' }), doc())).toBe('prev');
    expect(navKey(ev({ key: 'a', code: 'KeyA' }), doc())).toBeNull();
  });
  it('لا تعمل داخل حقل كتابة، ولا مع نافذة مفتوحة، ولا مع مفتاح تعديل', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) expect(navKey(ev({ key: 'ArrowLeft', target: { tagName } }), doc())).toBeNull();
    expect(navKey(ev({ key: 'ArrowLeft', target: { isContentEditable: true } }), doc())).toBeNull();
    expect(navKey(ev({ key: 'ArrowLeft' }), doc(true))).toBeNull();
    expect(navKey(ev({ key: 'ArrowLeft', altKey: true }), doc())).toBeNull();
    expect(navKey(ev({ key: 'ArrowLeft', defaultPrevented: true }), doc())).toBeNull();
    expect(navKey(ev({ key: 'ArrowLeft', target: { tagName: 'BUTTON', closest: (q) => (q.includes('tablist') ? {} : null) } }), doc())).toBeNull();
  });
});
