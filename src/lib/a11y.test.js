import { describe, it, expect, vi } from 'vitest';
import { pressable } from './a11y';

describe('pressable', () => {
  it('يستجيب لـ Enter والمسافة ويتجاهل غيرهما', () => {
    const fn = vi.fn();
    const p = pressable(fn);
    const ev = (key) => ({ key, preventDefault: () => {} });
    p.onKeyDown(ev('Enter')); p.onKeyDown(ev(' ')); p.onKeyDown(ev('a'));
    expect(fn).toHaveBeenCalledTimes(2);
    expect(p.role).toBe('button');
    expect(p.tabIndex).toBe(0);
  });
});
