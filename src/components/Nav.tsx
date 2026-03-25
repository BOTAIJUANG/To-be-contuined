'use client';

// components/Nav.tsx  ──  導覽列（responsive）

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { fetchApi } from '@/lib/api';
import s from './Nav.module.css';

const CartIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 01-8 0"/>
  </svg>
);

const NAV_LINKS = [
  { label: '首頁',     href: '/'              },
  { label: '品牌故事', href: '/about'         },
  { label: '線上選購', href: '/shop'          },
  { label: '購物說明', href: '/shopping-info' },
  { label: '聯絡資訊', href: '/contact'       },
  { label: '訂單查詢', href: '/order-search'  },
  { label: '會員專區', href: '/member'        },
];

export default function Nav() {
  const router   = useRouter();
  const pathname = usePathname();
  const { totalCount, openCart } = useCart();

  const [storeName, setStoreName] = useState('未半甜點');
  const [userName,  setUserName]  = useState<string | null>(null);
  const [isAdmin,   setIsAdmin]   = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);

  // 關閉 menu 當路由改變
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // body scroll lock
  useEffect(() => {
    document.body.classList.toggle('no-scroll', menuOpen);
    return () => { document.body.classList.remove('no-scroll'); };
  }, [menuOpen]);

  const isActive = useCallback((href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }, [pathname]);

  // 載入商店名稱
  useEffect(() => {
    supabase.from('store_settings').select('name').eq('id', 1).single()
      .then(({ data }) => { if (data?.name) setStoreName(data.name); });
  }, []);

  // 驗證角色
  const verifyRole = async (): Promise<{ name: string | null; role: string } | null> => {
    const res = await fetchApi('/api/auth/me');
    if (res.ok) return res.json();
    if (res.status === 401) {
      const { error } = await supabase.auth.refreshSession();
      if (!error) {
        const retry = await fetchApi('/api/auth/me');
        if (retry.ok) return retry.json();
      }
    }
    return null;
  };

  // 監聽登入狀態
  useEffect(() => {
    const checkSession = async () => {
      const cachedName = localStorage.getItem('cached_user_name');
      const cachedId   = localStorage.getItem('cached_user_id');
      if (cachedName) setUserName(cachedName);
      if (cachedId && localStorage.getItem(`role_${cachedId}`) === 'admin') setIsAdmin(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const name = session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? null;
        setUserName(name);
        if (name) localStorage.setItem('cached_user_name', name);
        localStorage.setItem('cached_user_id', session.user.id);
        const me = await verifyRole();
        if (me) {
          localStorage.setItem(`role_${session.user.id}`, me.role);
          setIsAdmin(me.role === 'admin');
        }
      } else {
        setUserName(null);
        setIsAdmin(false);
      }
      setAuthReady(true);
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const name = session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? null;
        setUserName(name);
        if (name) localStorage.setItem('cached_user_name', name);
        localStorage.setItem('cached_user_id', session.user.id);
        const me = await verifyRole();
        if (me) {
          localStorage.setItem(`role_${session.user.id}`, me.role);
          setIsAdmin(me.role === 'admin');
        }
      } else {
        Object.keys(localStorage).filter(k => k.startsWith('role_')).forEach(k => localStorage.removeItem(k));
        localStorage.removeItem('cached_user_name');
        localStorage.removeItem('cached_user_id');
        setUserName(null);
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <nav className={s.nav}>
        {/* Hamburger（手機/平板）*/}
        <button
          className={`${s.hamburger} ${menuOpen ? s.open : ''}`}
          onClick={() => setMenuOpen(v => !v)}
          aria-label="選單"
        >
          <span /><span /><span />
        </button>

        {/* 品牌名稱 */}
        <Link href="/" className={s.brand}>{storeName}</Link>

        {/* 桌機導覽連結 */}
        <div className={s.desktopLinks}>
          {NAV_LINKS.map(({ label, href }) => (
            <Link key={href} href={href} className={isActive(href) ? s.active : ''}>
              {label}
            </Link>
          ))}
        </div>

        {/* 右側：後台 + 登入 + 購物車 */}
        <div className={s.actions}>
          {authReady && isAdmin && (
            <button className={s.adminBtn} onClick={() => router.push('/admin')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
              <span className={s.adminBtnText}>後台</span>
            </button>
          )}

          <button className={s.authBtn} onClick={() => router.push('/member')}>
            {userName ? userName : '登入'}
          </button>

          <button className={s.cartBtn} onClick={openCart}>
            <CartIcon />
            <span className={s.cartLabel}>購物車</span>
            {totalCount > 0 && <span className={s.cartBadge}>{totalCount}</span>}
          </button>
        </div>
      </nav>

      {/* 手機側欄 Menu */}
      <div className={`${s.mobileOverlay} ${menuOpen ? s.open : ''}`} onClick={() => setMenuOpen(false)} />
      <div className={`${s.mobileMenu} ${menuOpen ? s.open : ''}`}>
        {NAV_LINKS.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className={isActive(href) ? s.active : ''}
            onClick={() => setMenuOpen(false)}
          >
            {label}
          </Link>
        ))}
      </div>
    </>
  );
}
