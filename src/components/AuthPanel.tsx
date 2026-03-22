'use client';

// ════════════════════════════════════════════════
// components/AuthPanel.tsx  ──  登入 / 註冊 / 忘記密碼
//
// 三個畫面：
// - login：Email 登入 + Google 登入
// - register：Email 註冊
// - forgot：忘記密碼（發送重設信）
// ════════════════════════════════════════════════

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

type AuthView = 'login' | 'register' | 'forgot';

// ── Google Logo ───────────────────────────────────
const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" style={{ flexShrink: 0 }}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// ── 共用樣式 ──────────────────────────────────────
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
const primaryBtnStyle: React.CSSProperties = {
  width: '100%', padding: '14px',
  background: '#1E1C1A', color: '#F7F4EF',
  border: 'none', fontFamily: '"Montserrat", sans-serif',
  fontSize: '12px', fontWeight: 600,
  letterSpacing: '0.3em', textTransform: 'uppercase',
  cursor: 'pointer', marginTop: '8px',
};
const tabStyle = (isActive: boolean): React.CSSProperties => ({
  padding: '12px 0', fontSize: '13px', letterSpacing: '0.15em',
  color: isActive ? '#1E1C1A' : '#888580',
  borderBottom: `2px solid ${isActive ? '#1E1C1A' : 'transparent'}`,
  cursor: 'pointer', flex: 1, textAlign: 'center',
  transition: 'all 0.3s', fontFamily: '"Noto Sans TC", sans-serif',
});

interface AuthPanelProps {
  onLoginSuccess: (name: string) => void;
}

export default function AuthPanel({ onLoginSuccess }: AuthPanelProps) {
  const [view,     setView]     = useState<AuthView>('login');
  const [loading,  setLoading]  = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 登入欄位
  const [loginEmail,    setLoginEmail]    = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // 註冊欄位
  const [regName,      setRegName]      = useState('');
  const [regEmail,     setRegEmail]     = useState('');
  const [regPhone,     setRegPhone]     = useState('');
  const [regBirthday,  setRegBirthday]  = useState('');
  const [regPassword,  setRegPassword]  = useState('');
  const [regPassword2, setRegPassword2] = useState('');

  // 忘記密碼欄位
  const [forgotEmail, setForgotEmail] = useState('');

  const clearMessages = () => { setErrorMsg(''); setSuccessMsg(''); };
  const switchView = (v: AuthView) => { setView(v); clearMessages(); };

  // ── Email 登入 ────────────────────────────────────
  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) { setErrorMsg('請填寫電子信箱與密碼'); return; }
    setLoading(true); clearMessages();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail, password: loginPassword,
    });

    setLoading(false);
    if (error) {
      const msg = error.message;
      if (msg.includes('Invalid login'))        setErrorMsg('電子信箱或密碼錯誤');
      else if (msg.includes('Email not confirmed')) setErrorMsg('請先至信箱驗證帳號');
      else if (msg.includes('rate limit'))      setErrorMsg('登入過於頻繁，請稍後再試');
      else                                      setErrorMsg('登入失敗，請稍後再試');
      return;
    }

    const name = data.user?.user_metadata?.name ?? loginEmail.split('@')[0];
    onLoginSuccess(name);
  };

  // ── Email 信箱域名防呆 ─────────────────────────────
  const checkEmailDomain = (email: string): string | null => {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return '請輸入有效的電子信箱';

    // 常見錯誤域名 → 正確域名
    const typoMap: Record<string, string> = {
      'gmial.com': 'gmail.com', 'gmil.com': 'gmail.com', 'gmai.com': 'gmail.com',
      'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
      'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com',
      'gmaill.com': 'gmail.com', 'gmaiil.com': 'gmail.com',
      'yaoo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com',
      'yahoo.con': 'yahoo.com', 'yhoo.com': 'yahoo.com',
      'yaoo.com.tw': 'yahoo.com.tw', 'yaho.com.tw': 'yahoo.com.tw',
      'yahoo.com.t': 'yahoo.com.tw', 'yahooo.com.tw': 'yahoo.com.tw',
      'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmial.com': 'hotmail.com',
      'hotmail.con': 'hotmail.com', 'hotmeil.com': 'hotmail.com',
      'outloo.com': 'outlook.com', 'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com',
      'iclod.com': 'icloud.com', 'icloud.con': 'icloud.com',
    };

    const suggestion = typoMap[domain];
    if (suggestion) return `電子信箱域名可能有誤，您是否要輸入 @${suggestion}？`;

    // 基本格式檢查：至少有一個 . 且 . 後面至少兩個字元
    const parts = domain.split('.');
    if (parts.length < 2 || parts[parts.length - 1].length < 2) {
      return '電子信箱格式不正確，請確認域名是否正確';
    }

    return null;
  };

  // ── Email 註冊 ────────────────────────────────────
  const handleRegister = async () => {
    if (!regName || !regPhone || !regEmail || !regPassword) { setErrorMsg('請填寫必填欄位（姓名、手機、電子信箱、密碼）'); return; }
    if (regPassword !== regPassword2) { setErrorMsg('兩次密碼不一致'); return; }
    if (regPassword.length < 8)       { setErrorMsg('密碼至少 8 個字元'); return; }

    // 信箱域名防呆
    const emailWarning = checkEmailDomain(regEmail);
    if (emailWarning) { setErrorMsg(emailWarning); return; }

    setLoading(true); clearMessages();

    const { data, error } = await supabase.auth.signUp({
      email: regEmail, password: regPassword,
      options: { data: { name: regName } },
    });

    if (error) {
      setLoading(false);
      const msg = error.message;
      if (msg.includes('already registered'))       setErrorMsg('此電子信箱已被註冊');
      else if (msg.includes('valid email'))          setErrorMsg('請輸入有效的電子信箱');
      else if (msg.includes('least 6'))              setErrorMsg('密碼至少需要 6 個字元');
      else if (msg.includes('Password'))             setErrorMsg('密碼格式不符合要求');
      else if (msg.includes('rate limit'))           setErrorMsg('操作過於頻繁，請稍後再試');
      else if (msg.includes('network'))              setErrorMsg('網路連線異常，請稍後再試');
      else                                           setErrorMsg('註冊失敗，請稍後再試');
      return;
    }

    // 寫入會員資料
    const userId = data.user?.id ?? data.session?.user?.id;
    if (userId) {
      try {
        await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id:  userId,
            name:     regName,
            phone:    regPhone || null,
            birthday: regBirthday || null,
          }),
        });
      } catch (err) {
        console.error('會員資料寫入失敗:', err);
      }
    }

    setLoading(false);
    setSuccessMsg('註冊成功！請確認您的電子信箱以完成驗證。');
    setTimeout(() => switchView('login'), 3000);
  };

  // ── 忘記密碼 ─────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!forgotEmail) { setErrorMsg('請填寫電子信箱'); return; }
    setLoading(true); clearMessages();

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`, // 重設密碼頁網址
    });

    setLoading(false);
    if (error) {
      if (error.message.includes('rate limit')) setErrorMsg('操作過於頻繁，請稍後再試');
      else setErrorMsg('發送失敗，請確認信箱是否正確');
      return;
    }

    setSuccessMsg('重設密碼信已寄出！請檢查您的電子信箱（包含垃圾郵件匣）。');
  };

  // ── Google 登入 ───────────────────────────────────
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/member` },
    });
  };

  return (
    <div style={{ maxWidth: '420px', margin: 'auto' }}>

      {/* ── Tab（登入/註冊）── */}
      {view !== 'forgot' && (
        <div style={{ display: 'flex', borderBottom: '1px solid #E8E4DC', marginBottom: '32px' }}>
          <div style={tabStyle(view === 'login')}    onClick={() => switchView('login')}>登入</div>
          <div style={tabStyle(view === 'register')} onClick={() => switchView('register')}>註冊</div>
        </div>
      )}

      {/* 忘記密碼 Header */}
      {view === 'forgot' && (
        <div style={{ marginBottom: '32px' }}>
          <button onClick={() => switchView('login')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888580', fontSize: '12px', letterSpacing: '0.1em', padding: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ← 返回登入
          </button>
          <div style={{ fontSize: '20px', fontFamily: '"Noto Serif TC", serif', fontWeight: 200, letterSpacing: '0.15em', color: '#1E1C1A' }}>
            重設密碼
          </div>
        </div>
      )}

      {/* 錯誤訊息 */}
      {errorMsg && (
        <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '16px', textAlign: 'center', padding: '10px', background: '#fef0f0', border: '1px solid #f5c6c6' }}>
          {errorMsg}
        </div>
      )}

      {/* 成功訊息 */}
      {successMsg && (
        <div style={{ fontSize: '12px', color: '#2ab85a', marginBottom: '16px', textAlign: 'center', padding: '10px', background: '#f0faf4', border: '1px solid #b2dfdb' }}>
          {successMsg}
        </div>
      )}

      {/* ════ 登入 ════ */}
      {view === 'login' && (
        <div>
          <div style={{ fontSize: '20px', fontFamily: '"Noto Serif TC", serif', fontWeight: 200, letterSpacing: '0.15em', color: '#1E1C1A', marginBottom: '28px' }}>
            歡迎回來
          </div>

          {/* Google 登入 */}
          <button onClick={handleGoogleLogin} style={{ width: '100%', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', border: '1px solid #E8E4DC', background: 'transparent', fontFamily: '"Noto Sans TC", sans-serif', fontSize: '13px', color: '#1E1C1A', cursor: 'pointer', marginBottom: '24px' }}>
            <GoogleLogo /> 使用 Google 帳號登入
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <div style={{ flex: 1, height: '1px', background: '#E8E4DC' }} />
            <span style={{ fontSize: '11px', color: '#888580', letterSpacing: '0.15em' }}>或</span>
            <div style={{ flex: 1, height: '1px', background: '#E8E4DC' }} />
          </div>

          {/* Email 登入 */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>電子信箱</label>
            <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="your@email.com" style={inputStyle} />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>密碼</label>
            <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="請輸入密碼" style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>

          <button onClick={handleLogin} disabled={loading} style={{ ...primaryBtnStyle, opacity: loading ? 0.6 : 1 }}>
            {loading ? '登入中...' : '登入'}
          </button>

          <div style={{ marginTop: '16px', fontSize: '12px', color: '#888580', textAlign: 'center', lineHeight: 2.4 }}>
            <span
              onClick={() => switchView('forgot')}
              style={{ color: '#1E1C1A', cursor: 'pointer', textDecoration: 'underline' }}
            >
              忘記密碼？
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#888580', textAlign: 'center' }}>
            還沒有帳號？{' '}
            <span onClick={() => switchView('register')} style={{ color: '#1E1C1A', cursor: 'pointer', textDecoration: 'underline' }}>立即註冊</span>
          </div>
        </div>
      )}

      {/* ════ 註冊 ════ */}
      {view === 'register' && (
        <div>
          <div style={{ fontSize: '20px', fontFamily: '"Noto Serif TC", serif', fontWeight: 200, letterSpacing: '0.15em', color: '#1E1C1A', marginBottom: '16px' }}>
            建立帳號
          </div>

          <div style={{ fontSize: '12px', color: '#888580', lineHeight: 2, padding: '12px 16px', background: '#EDE9E2', marginBottom: '24px', letterSpacing: '0.05em' }}>
            註冊即可累積集章、管理訂單、儲存收件資訊。
          </div>

          {/* Google 快速註冊 */}
          <button onClick={handleGoogleLogin} style={{ width: '100%', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', border: '1px solid #E8E4DC', background: 'transparent', fontFamily: '"Noto Sans TC", sans-serif', fontSize: '13px', color: '#1E1C1A', cursor: 'pointer', marginBottom: '24px' }}>
            <GoogleLogo /> 使用 Google 帳號快速註冊
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <div style={{ flex: 1, height: '1px', background: '#E8E4DC' }} />
            <span style={{ fontSize: '11px', color: '#888580', letterSpacing: '0.15em' }}>或使用 Email 註冊</span>
            <div style={{ flex: 1, height: '1px', background: '#E8E4DC' }} />
          </div>

          {[
            { label: '姓名 *',    type: 'text',     val: regName,      set: setRegName,      ph: '請輸入姓名' },
            { label: '電子信箱 *',type: 'email',    val: regEmail,     set: setRegEmail,     ph: 'your@email.com' },
            { label: '手機號碼 *',type: 'tel',      val: regPhone,     set: setRegPhone,     ph: '09XXXXXXXX' },
            { label: '生日',      type: 'date',     val: regBirthday,  set: setRegBirthday,  ph: '' },
            { label: '密碼 *',    type: 'password', val: regPassword,  set: setRegPassword,  ph: '至少 8 個字元' },
            { label: '確認密碼 *',type: 'password', val: regPassword2, set: setRegPassword2, ph: '再輸入一次密碼' },
          ].map(({ label, type, val, set, ph }) => (
            <div key={label} style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>{label}</label>
              <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} style={inputStyle} />
            </div>
          ))}

          <button onClick={handleRegister} disabled={loading} style={{ ...primaryBtnStyle, opacity: loading ? 0.6 : 1 }}>
            {loading ? '建立中...' : '建立帳號'}
          </button>

          <div style={{ marginTop: '16px', fontSize: '12px', color: '#888580', textAlign: 'center' }}>
            已有帳號？{' '}
            <span onClick={() => switchView('login')} style={{ color: '#1E1C1A', cursor: 'pointer', textDecoration: 'underline' }}>立即登入</span>
          </div>
        </div>
      )}

      {/* ════ 忘記密碼 ════ */}
      {view === 'forgot' && (
        <div>
          <p style={{ fontSize: '13px', color: '#555250', lineHeight: 2, marginBottom: '28px' }}>
            請輸入您的電子信箱，我們將寄送密碼重設連結給您。
          </p>

          <div style={{ marginBottom: '28px' }}>
            <label style={labelStyle}>電子信箱</label>
            <input
              type="email"
              value={forgotEmail}
              onChange={e => setForgotEmail(e.target.value)}
              placeholder="your@email.com"
              style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && handleForgotPassword()}
            />
          </div>

          <button onClick={handleForgotPassword} disabled={loading} style={{ ...primaryBtnStyle, opacity: loading ? 0.6 : 1 }}>
            {loading ? '發送中...' : '發送重設連結'}
          </button>
        </div>
      )}
    </div>
  );
}
