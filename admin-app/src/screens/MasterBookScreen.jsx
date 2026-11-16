// ════════════════════════════════════════════════════════════════
// الكتاب الأم في اللوحة: القارئ المشترك (shared/master-book) بأفعال الإدارة
// ════════════════════════════════════════════════════════════════
// يقرؤه كل مدير، ويعلّق ويحسم ويقترح التعديل المدير الكاتب بعامل ثانٍ، ويعتمد المقترح المدير العام
// (القواعد على الخادم في master-book.ts وbook-proposals.ts)
import React, { useMemo } from 'react';
import MasterBook from '../../../shared/master-book/MasterBook.jsx';
import { L } from '../leaders.js';

export default function MasterBookScreen({ onClose, onExperts }) {
  const api = useMemo(() => ({
    get: () => L('admin.book'),
    add: (b) => L('admin.book-comment', b),
    del: (id) => L('admin.book-comment-delete', { id }),
    status: (id, status) => L('admin.book-comment-status', { id, status }),
    reader: (expert_id, committee, on) => L('admin.book-reader', { expert_id, committee, on }),
    propose: (b) => L('admin.book-proposal-save', b),
    move: (id, to, note, seen) => L('admin.book-proposal-status', { id, to, note, seen }),
  }), []);
  return <MasterBook api={api} onClose={onClose} onExperts={onExperts} place="admin" />;
}
