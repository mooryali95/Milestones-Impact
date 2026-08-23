import React from 'react';
import ReactDOM from 'react-dom/client';
// رموز الهوية — تُطبَّق عالمياً على كل الشاشات بما فيها الصفحة الرئيسية.
// مُولَّد من shared/css عبر: python3 shared/build-css.py
import './styles/tokens.css';
import './styles/global.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
