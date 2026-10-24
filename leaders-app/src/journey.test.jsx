// @vitest-environment jsdom
// شاشة الرحلة تُرسم دون خطأ: يمنع عودة الصفحة البيضاء بسبب متغير يُستعمل قبل تعريفه
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import Journey from './screens/Journey.jsx';

const me = (approved) => ({
  journey: [],
  profile: { approved, full_name: 'سارة أحمد' },
  participant: { full_name: 'سارة أحمد', email: 's@example.com' },
  prompt_passkey: false,
});

describe('Journey', () => {
  it('renders for approved and pending participants', () => {
    for (const approved of [true, false]) {
      expect(() => renderToString(<Journey me={me(approved)} onUpdate={() => {}} onEditProfile={() => {}} onHandbook={() => {}} />)).not.toThrow();
    }
  });
});
