// ════════════════════════════════════════════════════════════════
// الكتاب الأم في اللوحة: القارئ المشترك (shared/master-book) بأفعال الإدارة
// ════════════════════════════════════════════════════════════════
// يقرؤه كل مدير، ويعلّق ويحسم ويقترح التعديل المدير الكاتب بعامل ثانٍ، ويعتمد المقترح المدير العام
// (القواعد على الخادم في master-book.ts وbook-proposals.ts)
//
// المرحلة 3 من تدقيق اللوحة (2026-11-23): كان القارئ يغطي رأس اللوحة وشريطها. صار يُعرض داخل منطقة المحتوى
// في إطار له شريط إدارة ثابت («→ رجوع إلى لوحة الإدارة» ومسار الصفحة و«ملء الشاشة»)، وEsc يخرج منه.
// القارئ نفسه لا يتغير (مشترك مع بوابة الخبير): الإطار يحوي عناصره الثابتة (العلامة المائية والنوافذ) بخاصية
// transform، فتغطي العلامة المائية الإطار كله وتبقى ظاهرة في الوضعين.
import React, { useEffect, useMemo, useState } from 'react';
import MasterBook from '../../../shared/master-book/MasterBook.jsx';
import { L } from '../leaders.js';
import { ScreenHead } from '../PageHeader.jsx';
import { MENU_TEXT, MoreMenu } from './PersonShell.jsx';

// مكونات المرحلتين 6 و18 تمر إلى القارئ المشترك: الترويسة الموحدة و«إجراءات ▾»
const UI = { Head: ScreenHead, Menu: MoreMenu, menuText: MENU_TEXT };

const FULL_KEY = 'mi_admin_book_full';
const typing = (t) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(t?.tagName) || t?.isContentEditable;

export default function MasterBookScreen({ onClose, onExperts }) {
  const [full, setFullRaw] = useState(() => { try { return sessionStorage.getItem(FULL_KEY) === '1'; } catch { return false; } });
  const setFull = (on) => { setFullRaw(on); try { sessionStorage.setItem(FULL_KEY, on ? '1' : ''); } catch { /* محجوب */ } };
  // Esc: يخرج من ملء الشاشة أولًا، ثم من الكتاب إلى اللوحة. نافذة القارئ المفتوحة (تعليقات، فهرس…) تغلق نفسها أولًا
  useEffect(() => {
    const k = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || typing(e.target)) return;
      if (document.querySelector('.mb-sheet-wrap, [aria-modal="true"]')) return;
      e.preventDefault();
      if (full) setFull(false); else onClose?.();
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [full, onClose]);
  const api = useMemo(() => ({
    get: () => L('admin.book'),
    add: (b) => L('admin.book-comment', b),
    del: (id) => L('admin.book-comment-delete', { id }),
    status: (id, status) => L('admin.book-comment-status', { id, status }),
    reader: (expert_id, committee, on) => L('admin.book-reader', { expert_id, committee, on }),
    propose: (b) => L('admin.book-proposal-save', b),
    move: (id, to, note, seen) => L('admin.book-proposal-status', { id, to, note, seen }),
    // «أصدر الكتاب» للمدير العام (book-release.ts)
    release: () => L('admin.book-release'),
    releaseStart: () => L('admin.book-release-start'),
    releasePr: () => L('admin.book-release-pr'),
    releasePublish: (number, sha) => L('admin.book-release-publish', { number, sha }),
  }), []);
  return (
    <div className={`mbs${full ? ' full' : ''}`}>
      {/* المرحلة 20: لا مسار (يكرر القائمة الجانبية)، و«ملء الشاشة» الزر الثانوي الوحيد، والرجوع يظهر في ملء الشاشة وحده ومعه Esc */}
      <div className="mbs-bar" role="navigation" aria-label="شريط الكتاب الأم">
        {full && <button type="button" className="btn-sm ghost" onClick={onClose} title="Esc">رجوع إلى لوحة الإدارة</button>}
        <button type="button" className="btn-sm ghost mbs-full" aria-pressed={full} onClick={() => setFull(!full)}>{full ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'}</button>
      </div>
      <div className="mbs-frame">
        <MasterBook api={api} onClose={onClose} onExperts={onExperts} place="admin" ui={UI} />
      </div>
    </div>
  );
}
