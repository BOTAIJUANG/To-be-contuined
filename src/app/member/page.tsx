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
import AuthPanel from '@/components/AuthPanel';
import MemberDashboard from '@/components/MemberDashboard';
import Footer from '@/components/Footer';

export default function MemberPage() {
  // 登入的使用者資料（null = 未登入）
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true); // 初始載入中
  const [storeSettings, setStoreSettings] = useState<any>(null);

  // ── 頁面載入時檢查是否已登入 ──────────────────────
  useEffect(() => {
    // 取得目前的登入 session
    Promise.all([
      supabase.auth.getSession(),
      supabase.from('store_settings').select('phone, email, address').eq('id', 1).single(),
    ]).then(([{ data: { session } }, { data: settings }]) => {
      if (session?.user) {
        setUser({
          id:   session.user.id,
          name: session.user.user_metadata?.name ?? session.user.email ?? '會員',
        });
      }
      if (settings) setStoreSettings(settings);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // 監聽登入狀態變化（登入/登出時自動更新）
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id:   session.user.id,
          name: session.user.user_metadata?.name ?? session.user.email ?? '會員',
        });
      } else {
        setUser(null);
      }
    });

    // 元件卸載時取消監聽
    return () => subscription.unsubscribe();
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

  // 初始載入中
  if (loading) {
    return (
      <div style={{ padding: '120px 0', textAlign: 'center', color: '#888580', fontSize: '13px', letterSpacing: '0.15em' }}>
        載入中...
      </div>
    );
  }

  return (
    <>
      <div style={{
        width: 'min(calc(100% - 60px), 1100px)',
        margin: 'auto', padding: '72px 0 40px',
      }}>
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
