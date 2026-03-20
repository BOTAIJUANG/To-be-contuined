'use client';

// components/HomeHero.tsx  ──  首頁 Hero 按鈕（Client Component）
// 因為需要 router，所以拆成獨立 Client Component

import { useRouter } from 'next/navigation';

export default function HomeHero({ btnText = '立即選購' }: { btnText?: string }) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push('/shop')}
      style={{
        padding: '12px 44px',
        border: '1px solid rgba(0,0,0,0.18)',
        background: 'transparent',
        fontFamily: '"Montserrat", sans-serif',
        fontSize: '12px', fontWeight: 600,
        letterSpacing: '0.35em', textTransform: 'uppercase',
        color: '#1E1C1A', cursor: 'pointer',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#1E1C1A'; (e.currentTarget as HTMLButtonElement).style.color = '#F7F4EF'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#1E1C1A'; }}
    >
      {btnText}
    </button>
  );
}
