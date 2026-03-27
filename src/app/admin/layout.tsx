'use client';

// app/admin/layout.tsx  ──  後台共用版型（responsive）

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import s from './admin.module.css';

const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
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
      { label: '訂單管理', href: '/admin/orders',      icon: <MultiIcon paths={['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8']} /> },
      { label: '商品管理', href: '/admin/products',     icon: <MultiIcon paths={['M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', 'M3.27 6.96L12 12.01l8.73-5.05', 'M12 22.08V12']} /> },
      { label: '庫存管理', href: '/admin/inventory',    icon: <MultiIcon paths={['M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2', 'M9 5a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2z', 'M9 14l2 2 4-4']} /> },
      { label: '預購系統', href: '/admin/preorder',     icon: <MultiIcon paths={['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M12 6v6l4 2']} /> },
      { label: '分類管理', href: '/admin/categories',   icon: <MultiIcon paths={['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z']} /> },
      { label: '折扣碼',   href: '/admin/coupons',      icon: <MultiIcon paths={['M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z', 'M7 7h.01']} /> },
      { label: '優惠活動', href: '/admin/promotions',   icon: <MultiIcon paths={['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z']} /> },
      { label: '會員管理', href: '/admin/members',      icon: <MultiIcon paths={['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M9 11a4 4 0 100-8 4 4 0 000 8z', 'M23 21v-2a4 4 0 00-3-3.87', 'M16 3.13a4 4 0 010 7.75']} /> },
      { label: '兌換核銷', href: '/admin/redeem',       icon: <MultiIcon paths={['M15 5l-1 1', 'M2 12h6l3-9 4 18 3-9h6']} /> },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { label: '公告管理', href: '/admin/announcements',  icon: <MultiIcon paths={['M22 17H2a3 3 0 006 0h8a3 3 0 006 0z', 'M9.4 1h5.2L16 4H8l1.4-3z', 'M12 4v13']} /> },
      { label: '通知系統', href: '/admin/notifications',   icon: <MultiIcon paths={['M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 01-3.46 0']} /> },
      { label: '商店設定', href: '/admin/store-settings',  icon: <MultiIcon paths={['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6']} /> },
      // { label: '物流狀態', href: '/admin/logistics', icon: <MultiIcon paths={['M1 3h15v13H1z', 'M16 8h4l3 3v5h-7V8z', 'M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z', 'M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z']} /> },  // 暫時隱藏，未來擴充用
      { label: '金流狀態', href: '/admin/payment',         icon: <MultiIcon paths={['M21 4H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2z', 'M1 10h22']} /> },
      { label: '購物說明', href: '/admin/faqs',            icon: <MultiIcon paths={['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3', 'M12 17h.01']} /> },
    ],
  },
];

// Sidebar 內容（桌機和手機共用）
function SidebarContent({ pathname, handleLogout, userName, onNavClick }: { pathname: string; handleLogout: () => void; userName: string; onNavClick?: () => void }) {
  return (
    <>
      <div className={s.sidebarBrand}>
        <div className={s.brandName}>未半甜點</div>
        <div className={s.brandSub}>Admin Panel</div>
      </div>

      <nav className={s.sidebarNav}>
        {NAV_SECTIONS.map(section => (
          <div key={section.title} className={s.navSection}>
            <div className={s.navSectionTitle}>{section.title}</div>
            {section.items.map(item => {
              const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${s.navItem} ${isActive ? s.active : ''}`}
                  onClick={onNavClick}
                >
                  <span className={s.navIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={s.sidebarFooter}>
        <Link href="/" className={s.sidebarLink} onClick={onNavClick}>返回前台</Link>
        <button className={s.logoutBtn} onClick={handleLogout}>登出</button>
      </div>
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [userName, setUserName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/member'); return; }
      const { data: member } = await supabase.from('members').select('role').eq('id', session.user.id).single();
      if (member?.role !== 'admin') { router.replace('/'); return; }
      setUserName(session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? '');
      setChecking(false);
    };
    checkAdmin();
  }, []);

  if (checking) return <div className={s.loading}>驗證權限中...</div>;

  const handleLogout = async () => { await supabase.auth.signOut(); router.replace('/'); };

  return (
    <div className={s.root}>
      {/* 桌機側邊欄 */}
      <aside className={s.sidebar}>
        <SidebarContent pathname={pathname} handleLogout={handleLogout} userName={userName} />
      </aside>

      {/* 手機頂部欄 */}
      <div className={s.mobileHeader}>
        <button className={s.hamburger} onClick={() => setMenuOpen(true)}>☰</button>
        <span className={s.mobileTitle}>Admin</span>
        <Link href="/" className={s.topLink} style={{ color: 'var(--bg)' }}>前台</Link>
      </div>

      {/* 手機側邊欄覆蓋 */}
      <div className={`${s.mobileOverlay} ${menuOpen ? s.open : ''}`} onClick={() => setMenuOpen(false)} />
      <div className={`${s.mobileSidebar} ${menuOpen ? s.open : ''}`}>
        <SidebarContent pathname={pathname} handleLogout={handleLogout} userName={userName} onNavClick={() => setMenuOpen(false)} />
      </div>

      {/* 右側內容 */}
      <div className={s.content}>
        <div className={s.topBar}>
          <Link href="/" className={s.topLink}>前台</Link>
          <span className={s.topUser}>{userName}</span>
        </div>
        <main className={s.main}>{children}</main>
      </div>
      <div id="datepicker-portal" />
    </div>
  );
}
