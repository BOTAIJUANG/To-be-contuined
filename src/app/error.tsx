'use client';

// app/error.tsx  ──  全域錯誤邊界

import { useEffect } from 'react';
import s from './error.module.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { console.error('頁面錯誤:', error); }, [error]);

  return (
    <div className={s.wrap}>
      <div className={s.icon}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#B8B5B0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 className={s.title}>頁面發生錯誤</h2>
      <p className={s.desc}>
        很抱歉，頁面載入時發生了問題。<br />
        請嘗試重新整理，或聯絡客服協助。
      </p>
      <button onClick={reset} className={s.btn}>重新整理</button>
    </div>
  );
}
