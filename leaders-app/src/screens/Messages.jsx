// ════════════════════════════════════════════════════════════════
// مركز الرسائل للمشارك: ما أرسلناه إليه (وصل بالبريد أو كتمه)، وما يصله بالبريد لكل فئة
// ════════════════════════════════════════════════════════════════
// المكوّن المشترك MessageCenter (للمشارك والخبير والمنسق) بإجراءات المشارك me.messages (messages.ts).
// رابط ذيل البريد وترويسة الإلغاء يفتحان هذا القسم: /?tab=messages&prefs=<الفئة> (deeplink.js)
import React from 'react';
import { call } from '../api.js';
import MessageCenter from './MessageCenter.jsx';

const ACTIONS = { list: 'me.messages', read: 'me.messages-read', prefs: 'me.mail-prefs' };

export default function Messages({ onBack, onUnread }) {
  return <MessageCenter call={call} actions={ACTIONS} onBack={onBack} backLabel="رجوع إلى رحلتي" onUnread={onUnread} />;
}
