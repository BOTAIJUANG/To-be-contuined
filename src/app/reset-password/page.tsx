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

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 0',
  border: 'none', borderBottom: '1px solid #E8E4DC',
  marginTop: '8px', fontFamily: 'inherit',
  fontSize: '13px', background: 'transparent',
  color: '#1E1C1A', letterSpacing: '0.05em', outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontFamily: '"Montserrat", sans-serif',
  fontSize: '10px', letterSpacing: '0.25em',
  color: '#888580', textTransform: 'uppercase',
};

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
    <div style={{
      width: 'min(calc(100% - 60px), 420px)',
      margin: 'auto', padding: '80px 0',
    }}>

      {/* ── 載入中 ── */}
      {pageState === 'loading' && (
        <div style={{ color: '#888580', fontSize: '13px', letterSpacing: '0.1em' }}>
          驗證連結中...
        </div>
      )}

      {/* ── 連結無效 ── */}
      {pageState === 'invalid' && (
        <div>
          <div style={{ fontSize: '20px', fontFamily: '"Noto Serif TC", serif', fontWeight: 200, letterSpacing: '0.15em', color: '#1E1C1A', marginBottom: '16px' }}>
            連結已失效
          </div>
          <p style={{ fontSize: '13px', color: '#888580', lineHeight: 2, marginBottom: '28px' }}>
            此重設連結已過期或無效，請重新申請。
          </p>
          <button
            onClick={() => router.push('/member')}
            style={{ padding: '12px 32px', border: '1px solid #E8E4DC', background: 'transparent', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', color: '#1E1C1A', cursor: 'pointer' }}
          >
            返回會員頁
          </button>
        </div>
      )}

      {/* ── 輸入新密碼 ── */}
      {pageState === 'ready' && (
        <div>
          <div style={{ fontSize: '20px', fontFamily: '"Noto Serif TC", serif', fontWeight: 200, letterSpacing: '0.15em', color: '#1E1C1A', marginBottom: '8px' }}>
            重設密碼
          </div>
          <p style={{ fontSize: '13px', color: '#888580', lineHeight: 2, marginBottom: '32px' }}>
            請輸入您的新密碼。
          </p>

          {errorMsg && (
            <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '16px', padding: '10px', background: '#fef0f0', border: '1px solid #f5c6c6' }}>
              {errorMsg}
            </div>
          )}

          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>新密碼</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 8 個字元" style={inputStyle} />
          </div>
          <div style={{ marginBottom: '32px' }}>
            <label style={labelStyle}>確認新密碼</label>
            <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} placeholder="再輸入一次" style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && handleReset()} />
          </div>

          <button
            onClick={handleReset}
            disabled={loading}
            style={{ width: '100%', padding: '14px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.3em', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? '更新中...' : '確認重設密碼'}
          </button>
        </div>
      )}

      {/* ── 完成 ── */}
      {pageState === 'done' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
          <div style={{ fontSize: '18px', fontFamily: '"Noto Serif TC", serif', fontWeight: 200, letterSpacing: '0.15em', color: '#1E1C1A', marginBottom: '8px' }}>
            密碼已重設
          </div>
          <p style={{ fontSize: '13px', color: '#888580', lineHeight: 2 }}>
            正在跳轉至登入頁...
          </p>
        </div>
      )}
    </div>
  );
}
