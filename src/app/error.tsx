'use client';

// ════════════════════════════════════════════════
// app/error.tsx  ──  全域錯誤邊界（Error Boundary）
//
// 【什麼是 Error Boundary？】
// 當頁面發生未預期的 JavaScript 錯誤時，
// 如果沒有 Error Boundary，整個網站會白屏（使用者什麼都看不到）。
// 有了 Error Boundary，錯誤會被「接住」，
// 然後顯示一個友善的錯誤訊息，使用者可以點按鈕重試。
//
// 【Next.js 的 error.tsx】
// 在 app/ 目錄下放一個 error.tsx，
// Next.js 會自動把它當作該路由底下所有頁面的 Error Boundary。
// 放在 app/error.tsx 就是「全站」的 Error Boundary。
//
// 【注意】
// error.tsx 必須是 'use client'（客戶端元件），
// 因為 Error Boundary 只能在客戶端運作。
// ════════════════════════════════════════════════

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };  // error 是錯誤物件
  reset: () => void;                   // reset 是重試函式
}) {
  // 在 console 記錄錯誤（方便開發時 debug）
  useEffect(() => {
    console.error('頁面錯誤:', error);
  }, [error]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '40px 20px',
      textAlign: 'center',
    }}>
      {/* 錯誤圖示 */}
      <div style={{ marginBottom: '20px' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#B8B5B0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      {/* 標題 */}
      <h2 style={{
        fontFamily: '"Noto Sans TC", sans-serif',
        fontWeight: 700,
        fontSize: '18px',
        letterSpacing: '0.2em',
        color: '#1E1C1A',
        marginBottom: '12px',
      }}>
        頁面發生錯誤
      </h2>

      {/* 說明文字 */}
      <p style={{
        fontSize: '13px',
        color: '#888580',
        lineHeight: 2,
        marginBottom: '28px',
        maxWidth: '400px',
      }}>
        很抱歉，頁面載入時發生了問題。<br />
        請嘗試重新整理，或聯絡客服協助。
      </p>

      {/* 重試按鈕 */}
      <button
        onClick={reset}
        style={{
          padding: '12px 44px',
          border: '1px solid #1E1C1A',
          background: '#1E1C1A',
          color: '#F7F4EF',
          fontFamily: '"Montserrat", sans-serif',
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.1em',
          cursor: 'pointer',
        }}
      >
        重新整理
      </button>
    </div>
  );
}
