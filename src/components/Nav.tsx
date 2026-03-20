'use client';

// ════════════════════════════════════════════════
// components/Nav.tsx  ──  導覽列
//
// - 商店名稱從 store_settings 讀取
// - 登入狀態從 Supabase Auth 讀取
// - 購物車件數從 CartContext 取得
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';

const CartIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

  // 載入商店名稱
  useEffect(() => {
    const loadName = async () => {
      const { data } = await supabase
        .from('store_settings')
        .select('name')
        .eq('id', 1)
        .single();
      if (data?.name) setStoreName(data.name);
    };
    loadName();
  }, []);

  // 監聽登入狀態
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserName(session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserName(session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? null);
      } else {
        setUserName(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <nav style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '22px 50px', position: 'sticky', top: 0,
      background: 'rgba(247,244,239,0.95)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 2px 20px rgba(0,0,0,0.04)', zIndex: 100,
    }}>

      {/* 左：品牌名稱 */}
      <Link href="/" style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '13px', letterSpacing: '0.3em', color: '#1E1C1A', textDecoration: 'none' }}>
        {storeName}
      </Link>

      {/* 中：導覽連結 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
        {NAV_LINKS.map(({ label, href }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} style={{
              fontFamily: '"Noto Sans TC", sans-serif',
              fontSize: '12px', fontWeight: 400,
              letterSpacing: '0.2em', color: isActive ? '#1E1C1A' : '#888580',
              textDecoration: 'none', transition: 'color 0.3s',
              borderBottom: isActive ? '1px solid #1E1C1A' : 'none',
              paddingBottom: isActive ? '2px' : '0',
            }}>
              {label}
            </Link>
          );
        })}
      </div>

      {/* 右：登入 + 購物車 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* 登入/會員按鈕 */}
        <button
          onClick={() => router.push('/member')}
          style={{
            padding: '8px 20px',
            border: '1px solid rgba(0,0,0,0.15)',
            background: 'transparent',
            fontFamily: '"Noto Sans TC", sans-serif',
            fontSize: '12px', letterSpacing: '0.2em',
            color: '#1E1C1A', cursor: 'pointer',
          }}
        >
          {userName ? userName : '登入 / 註冊'}
        </button>

        {/* 購物車按鈕 */}
        <button
          onClick={openCart}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px',
            border: '1px solid rgba(0,0,0,0.15)',
            background: '#1E1C1A', color: '#F7F4EF',
            fontFamily: '"Montserrat", sans-serif',
            fontSize: '12px', letterSpacing: '0.2em',
            cursor: 'pointer',
          }}
        >
          <CartIcon />
          購物車
          {totalCount > 0 && (
            <span style={{
              background: '#b35252', color: '#fff',
              borderRadius: '50%', width: '18px', height: '18px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', fontWeight: 700,
            }}>
              {totalCount}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}
