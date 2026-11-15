// ════════════════════════════════════════════════════════════════
// الكتاب الأم في اللوحة: القارئ المشترك (shared/master-book) بأفعال الإدارة
// ════════════════════════════════════════════════════════════════
// يقرؤه كل مدير، ويعلّق ويحسم المدير الكاتب بعامل ثانٍ (القواعد على الخادم في master-book.ts)
import React, { useMemo } from 'react';
import MasterBook from '../../../shared/master-book/MasterBook.jsx';
import { L } from '../leaders.js';

export default function MasterBookScreen({ onClose }) {
  const api = useMemo(() => ({
    get: () => L('admin.book'),
    add: (b) => L('admin.book-comment', b),
    del: (id) => L('admin.book-comment-delete', { id }),
    status: (id, status) => L('admin.book-comment-status', { id, status }),
  }), []);
  return <MasterBook api={api} onClose={onClose} place="admin" />;
}
