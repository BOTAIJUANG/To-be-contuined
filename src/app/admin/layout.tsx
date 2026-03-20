'use client';

// ════════════════════════════════════════════════
// app/admin/layout.tsx  ──  後台共用版型
//
// 所有 /admin/* 頁面都套用這個 layout
// 驗證 admin 權限，非 admin 帳號擋回首頁
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const NAV_ITEMS = [
  // 概覽
  { label: '儀表板',   href: '/admin',                icon: '📊' },
  { label: '關鍵數據', href: '/admin/analytics',      icon: '📈' },
  { label: '當日總覽', href: '/admin/daily',           icon: '📅' },
  // 商店管理
  { label: '訂單管理', href: '/admin/orders',          icon: '📦' },
  { label: '商品管理', href: '/admin/products',        icon: '🍰' },
  { label: '庫存管理', href: '/admin/inventory',       icon: '📋' },
  { label: '預購系統', href: '/admin/preorder',        icon: '⏳' },
  { label: '分類管理', href: '/admin/categories',      icon: '📁' },
  { label: '折扣碼',   href: '/admin/coupons',         icon: '🎟️' },
  { label: '會員管理', href: '/admin/members',         icon: '👤' },
  { label: '兌換核銷', href: '/admin/redeem',          icon: '🎫' },
  // 設定
  { label: '公告管理', href: '/admin/announcements',   icon: '📢' },
  { label: '通知系統', href: '/admin/notifications',   icon: '✉️' },
  { label: '商店設定', href: '/admin/store-settings',  icon: '⚙️' },
  { label: '物流狀態', href: '/admin/logistics',       icon: '🚚' },
  { label: '金流狀態', href: '/admin/payment',         icon: '💳' },
  { label: '購物說明', href: '/admin/faqs',            icon: '❓' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/member'); return; }

      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (member?.role !== 'admin') { router.replace('/'); return; }
      setChecking(false);
    };
    checkAdmin();
  }, []);

  if (checking) {
    return (
      <div style={{ padding: '120px 0', textAlign: 'center', color: '#888580', fontSize: '13px', letterSpacing: '0.15em' }}>
        驗證權限中...
      </div>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: '100vh', background: '#F7F4EF' }}>

      {/* 左側導覽欄 */}
      <aside style={{ background: '#1E1C1A', padding: '32px 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0 24px 32px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px' }}>
          <div style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '13px', letterSpacing: '0.3em', color: '#F7F4EF' }}>
            未半甜點
          </div>
          <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.3em', color: '#888580', textTransform: 'uppercase', marginTop: '4px' }}>
            Admin Panel
          </div>
        </div>

        <nav style={{ flex: 1, padding: '0 12px' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px', borderRadius: '6px', marginBottom: '4px',
                background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: isActive ? '#F7F4EF' : '#888580',
                textDecoration: 'none', fontSize: '13px', letterSpacing: '0.1em',
                fontFamily: '"Noto Sans TC", sans-serif', transition: 'all 0.2s',
              }}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '16px' }}>
          <Link href="/" style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '10px 16px', color: '#888580', textDecoration: 'none',
            fontSize: '12px', letterSpacing: '0.1em', fontFamily: '"Noto Sans TC", sans-serif',
          }}>
            ← 返回前台
          </Link>
          <button onClick={handleLogout} style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '10px 16px', width: '100%',
            background: 'none', border: 'none', color: '#888580',
            fontSize: '12px', letterSpacing: '0.1em',
            fontFamily: '"Noto Sans TC", sans-serif',
            cursor: 'pointer', textAlign: 'left',
          }}>
            登出
          </button>
        </div>
      </aside>

      {/* 右側內容 */}
      <main style={{ padding: '40px 48px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
