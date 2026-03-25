'use client';

// ════════════════════════════════════════════════
// app/reset-password/page.tsx  ──  重設密碼頁
//
// Supabase 重設密碼連結會帶 access_token 在 URL hash：
// /reset-password#access_token=xxx&type=recovery
//
// 需要手動解析 hash，用 setSession 建立 session
// 然後才能呼叫 updateUser 更新密碼
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import s from './reset-password.module.css';

type PageState = 'loading' | 'ready' | 'invalid' | 'done';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [password,  setPassword]  = useState('');
  const [password2, setPassword2] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [errorMsg,  setErrorMsg]  = useState('');

  // ── 解析 URL hash，建立 Supabase session ──────────
  useEffect(() => {
    const handleHash = async () => {
      // 取得 URL hash，例如：#access_token=xxx&refresh_token=yyy&type=recovery
      const hash = window.location.hash.substring(1); // 去掉開頭的 #
      if (!hash) { setPageState('invalid'); return; }

      // 解析 hash 參數
      const params = new URLSearchParams(hash);
      const accessToken  = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type         = params.get('type');

      // 確認是密碼重設類型
      if (type !== 'recovery' || !accessToken || !refreshToken) {
        setPageState('invalid');
        return;
      }

      // 用 token 建立 session
      const { error } = await supabase.auth.setSession({
        access_token:  accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error('setSession error:', error);
        setPageState('invalid');
        return;
      }

      setPageState('ready');
    };

    handleHash();
  }, []);

  // ── 送出新密碼 ────────────────────────────────────
  const handleReset = async () => {
    if (!password || !password2) { setErrorMsg('請填寫新密碼'); return; }
    if (password !== password2)  { setErrorMsg('兩次密碼不一致'); return; }
    if (password.length < 8)     { setErrorMsg('密碼至少 8 個字元'); return; }

    setLoading(true);
    setErrorMsg('');

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) { setErrorMsg(error.message); return; }

    setPageState('done');
    setTimeout(() => router.push('/member'), 2500);
  };

  return (
    <div className={s.container}>

      {/* ── 載入中 ── */}
      {pageState === 'loading' && (
        <div className={s.loadingText}>驗證連結中...</div>
      )}

      {/* ── 連結無效 ── */}
      {pageState === 'invalid' && (
        <div>
          <div className={s.headingLarge}>連結已失效</div>
          <p className={s.description}>
            此重設連結已過期或無效，請重新申請。
          </p>
          <button onClick={() => router.push('/member')} className={s.backBtn}>
            返回會員頁
          </button>
        </div>
      )}

      {/* ── 輸入新密碼 ── */}
      {pageState === 'ready' && (
        <div>
          <div className={s.heading}>重設密碼</div>
          <p className={s.descriptionReady}>
            請輸入您的新密碼。
          </p>

          {errorMsg && (
            <div className={s.error}>{errorMsg}</div>
          )}

          <div className={s.field}>
            <label className={s.label}>新密碼</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="至少 8 個字元"
              className={s.input}
            />
          </div>
          <div className={s.fieldLast}>
            <label className={s.label}>確認新密碼</label>
            <input
              type="password"
              value={password2}
              onChange={e => setPassword2(e.target.value)}
              placeholder="再輸入一次"
              className={s.input}
              onKeyDown={e => e.key === 'Enter' && handleReset()}
            />
          </div>

          <button
            onClick={handleReset}
            disabled={loading}
            className={s.submitBtn}
          >
            {loading ? '更新中...' : '確認重設密碼'}
          </button>
        </div>
      )}

      {/* ── 完成 ── */}
      {pageState === 'done' && (
        <div className={s.doneWrap}>
          <div className={s.doneIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1E1C1A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="9 12 11.5 14.5 16 9.5" />
            </svg>
          </div>
          <div className={s.doneHeading}>密碼已重設</div>
          <p className={s.doneText}>正在跳轉至登入頁...</p>
        </div>
      )}
    </div>
  );
}
