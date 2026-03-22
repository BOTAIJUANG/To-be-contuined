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

// ── 細線條 SVG icon（韓系極簡風格）──────────────────
// 每個 icon 都用 currentColor 讓顏色自動跟隨文字
const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// 有些 icon 需要多條 path
const MultiIcon = ({ paths, size = 16 }: { paths: string[]; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {paths.map((d, i) => <path key={i} d={d} />)}
  </svg>
);

const NAV_SECTIONS = [
  {
    title: 'OVERVIEW',
    items: [
      { label: '儀表板',   href: '/admin',           icon: <MultiIcon paths={['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z', 'M9 22V12h6v10']} /> },
      { label: '關鍵數據', href: '/admin/analytics',  icon: <MultiIcon paths={['M18 20V10', 'M12 20V4', 'M6 20v-6']} /> },
      { label: '當日總覽', href: '/admin/daily',      icon: <MultiIcon paths={['M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18']} /> },
    ],
  },
  {
    title: 'SHOP',
    items: [
      { label: '訂單管理', href: '/admin/orders',     icon: <MultiIcon paths={['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8']} /> },
      { label: '商品管理', href: '/admin/products',    icon: <MultiIcon paths={['M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', 'M3.27 6.96L12 12.01l8.73-5.05', 'M12 22.08V12']} /> },
      { label: '庫存管理', href: '/admin/inventory',   icon: <MultiIcon paths={['M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2', 'M9 5a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2z', 'M9 14l2 2 4-4']} /> },
      { label: '預購系統', href: '/admin/preorder',    icon: <MultiIcon paths={['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M12 6v6l4 2']} /> },
      { label: '分類管理', href: '/admin/categories',  icon: <MultiIcon paths={['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z']} /> },
      { label: '折扣碼',   href: '/admin/coupons',     icon: <MultiIcon paths={['M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z', 'M7 7h.01']} /> },
      { label: '會員管理', href: '/admin/members',     icon: <MultiIcon paths={['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M9 11a4 4 0 100-8 4 4 0 000 8z', 'M23 21v-2a4 4 0 00-3-3.87', 'M16 3.13a4 4 0 010 7.75']} /> },
      { label: '兌換核銷', href: '/admin/redeem',      icon: <MultiIcon paths={['M15 5l-1 1', 'M2 12h6l3-9 4 18 3-9h6']} /> },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { label: '公告管理', href: '/admin/announcements',  icon: <MultiIcon paths={['M22 17H2a3 3 0 006 0h8a3 3 0 006 0z', 'M9.4 1h5.2L16 4H8l1.4-3z', 'M12 4v13']} /> },
      { label: '通知系統', href: '/admin/notifications',   icon: <MultiIcon paths={['M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 01-3.46 0']} /> },
      { label: '商店設定', href: '/admin/store-settings',  icon: <MultiIcon paths={['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6']} /> },
      { label: '物流狀態', href: '/admin/logistics',       icon: <MultiIcon paths={['M1 3h15v13H1z', 'M16 8h4l3 3v5h-7V8z', 'M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z', 'M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z']} /> },
      { label: '金流狀態', href: '/admin/payment',         icon: <MultiIcon paths={['M21 4H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2z', 'M1 10h22']} /> },
      { label: '購物說明', href: '/admin/faqs',            icon: <MultiIcon paths={['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3', 'M12 17h.01']} /> },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [userName, setUserName] = useState('');

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
      setUserName(session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? '');
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

        <nav style={{ flex: 1, padding: '0 12px', overflowY: 'auto' }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} style={{ marginBottom: '8px' }}>
              <div style={{
                fontFamily: '"Montserrat", sans-serif', fontSize: '9px', fontWeight: 600,
                letterSpacing: '0.25em', color: '#555250',
                padding: '16px 16px 8px', userSelect: 'none',
              }}>
                {section.title}
              </div>
              {section.items.map((item) => {
                const isActive = item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '9px 16px', borderRadius: '4px', marginBottom: '2px',
                    background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: isActive ? '#F7F4EF' : '#888580',
                    textDecoration: 'none', fontSize: '13px', letterSpacing: '0.05em',
                    fontFamily: '"Noto Sans TC", sans-serif', transition: 'all 0.15s',
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '16px' }}>
          <Link href="/" style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '10px 16px', color: '#888580', textDecoration: 'none',
            fontSize: '12px', letterSpacing: '0.1em', fontFamily: '"Noto Sans TC", sans-serif',
          }}>
            返回前台
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
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 右上角 header */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '16px', padding: '14px 48px', borderBottom: '1px solid #E8E4DC', background: '#fff' }}>
          <Link href="/" style={{ fontSize: '12px', color: '#888580', textDecoration: 'none', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.15em' }}>
            前台
          </Link>
          <span style={{ fontSize: '12px', color: '#1E1C1A', fontFamily: '"Noto Sans TC", sans-serif', letterSpacing: '0.1em' }}>{userName}</span>
        </div>
        <main style={{ padding: '40px 48px', overflowY: 'auto', flex: 1 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
