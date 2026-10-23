import { describe, it, expect } from 'vitest';
import { contrast, detectBackground, inkColor, inspect, removeBackground, trimBox } from './logo.js';

// صورة 20×20 بيضاء فيها مربع أسود 8×8 وفي وسطه نقطة بيضاء (جزء داخلي يجب أن يبقى)
function sample() {
  const w = 20, h = 20, d = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 6; y < 14; y += 1) for (let x = 6; x < 14; x += 1) { const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 10; }
  const c = (10 * w + 10) * 4; d[c] = d[c + 1] = d[c + 2] = 255;
  return { d, w, h };
}

describe('معالجة شعار الجهة', () => {
  it('تكتشف الخلفية البيضاء وتفرّغها من الحواف دون الأجزاء الداخلية', () => {
    const { d, w, h } = sample();
    const bg = detectBackground(d, w, h);
    expect(bg.kind).toBe('solid');
    const cleared = removeBackground(d, w, h, bg.color);
    expect(cleared).toBeGreaterThan(0.8);
    expect(d[3]).toBe(0);
    expect(d[(10 * w + 10) * 4 + 3]).toBe(255);
  });
  it('تقصّ إلى حدود الشعار', () => {
    const { d, w, h } = sample();
    removeBackground(d, w, h, [255, 255, 255]);
    const b = trimBox(d, w, h, 0);
    expect(b).toEqual({ x: 6, y: 6, w: 8, h: 8 });
  });
  it('الشعار الشفاف يُعرف ولا يُمس', () => {
    const d = new Uint8ClampedArray(10 * 10 * 4);
    expect(detectBackground(d, 10, 10).kind).toBe('transparent');
  });
  it('الفحص يحذّر من الدقة المنخفضة والتباين الضعيف', () => {
    const r = inspect({ width: 120, height: 60, bg: { kind: 'solid' }, cleared: 0.5, ink: [240, 240, 240] });
    expect(r.find((x) => x.text.includes('الدقة')).level).toBe('bad');
    expect(inspect({ width: 740, height: 264, bg: { kind: 'solid' }, cleared: 0.8 }).find((x) => x.text.includes('الدقة')).level).toBe('ok');
    expect(r.find((x) => x.text.includes('التباين') || x.text.includes('فاتح')).level).toBe('warn');
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
    expect(inkColor(new Uint8ClampedArray([1, 2, 3, 255]))).toEqual([1, 2, 3]);
  });
});
