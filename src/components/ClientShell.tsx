'use client';

// components/ClientShell.tsx
// 判斷是否在後台，決定是否顯示 Nav 和 AnnouncementBar

import { usePathname } from 'next/navigation';
import Nav from '@/components/Nav';
import CartDrawer from '@/components/CartDrawer';
import AnnouncementBar from '@/components/AnnouncementBar';

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin  = pathname?.startsWith('/admin');

  return (
    <>
      {!isAdmin && <AnnouncementBar />}
      {!isAdmin && <Nav />}
      {children}
      {!isAdmin && <CartDrawer />}
    </>
  );
}
