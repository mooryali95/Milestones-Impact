import { describe, expect, it } from 'vitest';
import { countPending, leadersTotal } from './pending.js';

describe('ما ينتظر القرار', () => {
  it('يعدّ الجديد من كل مصدر، ويتحمّل غياب أي مصدر', () => {
    const p = countPending({
      contacts: { contacts: [{ status: 'new' }, { status: 'read' }, {}] },
      reviews: { pending_approval: [{ id: 1 }], submitted: [{ id: 2 }, { id: 3 }] },
      submissions: { submissions: [{ id: 's' }] },
    });
    expect(p).toEqual({ contacts: 2, approvals: 1, requirements: 2, participants: 3, models: 1 });
    expect(leadersTotal(p)).toBe(4);
    expect(countPending({})).toEqual({ contacts: 0, approvals: 0, requirements: 0, participants: 0, models: 0 });
    expect(leadersTotal(null)).toBe(0);
  });
});
