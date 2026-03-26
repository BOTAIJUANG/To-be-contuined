'use client';

// ════════════════════════════════════════════════
// app/member/page.tsx  ──  會員專區入口
//
// 判斷登入狀態：
// - 未登入 → 顯示 AuthPanel
// - 已登入 → 顯示 MemberDashboard
//
// 使用 Supabase Auth 管理登入狀態
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchApi } from '@/lib/api';
import AuthPanel from '@/components/AuthPanel';
import MemberDashboard from '@/components/MemberDashboard';
import Footer from '@/components/Footer';
import s from './member.module.css';

export default function MemberPage() {
  // 登入的使用者資料（null = 未登入）
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);  // 是否已確認 session 狀態
  const [authSlow, setAuthSlow] = useState(false);        // 是否載入較久
  const [storeSettings, setStoreSettings] = useState<any>(null);

  // ── 頁面載入時檢查是否已登入（經 server 驗證）──────────────────────
  useEffect(() => {
    let alive = true;

    // settings 獨立載入，不影響 auth
    supabase.from('store_settings').select('phone, email, address').eq('id', 1).single()
      .then(({ data }) => { if (data) setStoreSettings(data); }, () => {});

    // 3 秒後顯示「載入較久」提示；5 秒強制放行避免永遠卡住
    const slowTimer = setTimeout(() => setAuthSlow(true), 3000);
    const hardTimeout = setTimeout(() => { if (alive) setAuthChecked(true); }, 5000);

    // 共用的 async 驗證邏輯
    const syncAuth = async (session: any) => {
      if (!alive) return;
      if (!session?.user) { setUser(null); setAuthChecked(true); return; }

      const u = session.user;

      // Google OAuth 首次登入 → 自動建立 members 資料（非阻塞）
      if (u.app_metadata?.provider === 'google' || u.identities?.some((i: any) => i.provider === 'google')) {
        fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: u.id, name: u.user_metadata?.name ?? u.email }),
        }).catch(() => {});
      }

      try {
        const res = await fetchApi('/api/auth/me');
        if (!alive) return;
        if (res.ok) {
          const me = await res.json();
          setUser({ id: u.id, name: me.name ?? u.user_metadata?.name ?? u.email ?? '會員' });
        } else {
          setUser(null);
          await supabase.auth.signOut();
        }
      } catch {
        if (alive) setUser(null);
      } finally {
        if (alive) { clearTimeout(slowTimer); setAuthChecked(true); }
      }
    };

    // 初始檢查
    supabase.auth.getSession().then(({ data: { session } }) => {
      void syncAuth(session);
    }).catch(() => { if (alive) setAuthChecked(true); });

    // onAuthStateChange callback 不可 async，用 setTimeout 脫勾
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => { void syncAuth(session); }, 0);
    });

    return () => { alive = false; subscription.unsubscribe(); clearTimeout(slowTimer); clearTimeout(hardTimeout); };
  }, []);

  // 登入成功（AuthPanel 呼叫）
  const handleLoginSuccess = (name: string) => {
    // onAuthStateChange 會自動更新，這裡不需要額外處理
  };

  // 登出
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // auth 尚未確認完成 → 顯示載入狀態（不顯示 AuthPanel）
  if (!authChecked) {
    return (
      <div className={s.loading}>
        {authSlow ? '正在確認登入狀態，請稍候...' : '載入中...'}
      </div>
    );
  }

  return (
    <>
      <div className={s.container}>
        {/* 未登入：顯示登入/註冊表單 */}
        {!user && (
          <AuthPanel onLoginSuccess={handleLoginSuccess} />
        )}

        {/* 已登入：顯示會員主頁 */}
        {user && (
          <MemberDashboard
            userId={user.id}
            userName={user.name}
            onLogout={handleLogout}
          />
        )}
      </div>

      <Footer
        tel={storeSettings?.phone}
        email={storeSettings?.email}
        address={storeSettings?.address}
      />
    </>
  );
}
