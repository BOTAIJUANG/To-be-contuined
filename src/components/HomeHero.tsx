'use client';

// components/HomeHero.tsx  ──  首頁 Hero 按鈕（responsive）

import { useRouter } from 'next/navigation';
import s from './HomeHero.module.css';

export default function HomeHero({ btnText = '立即選購' }: { btnText?: string }) {
  const router = useRouter();
  return (
    <button className={s.btn} onClick={() => router.push('/shop')}>
      {btnText}
    </button>
  );
}
