'use client';

// components/AnnouncementBar.tsx  ──  前台公告跑馬燈

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import s from './AnnouncementBar.module.css';

const BG_COLOR: Record<string, string> = {
  normal: '#1E1C1A',
  promo:  '#b87a2a',
  urgent: '#c0392b',
};

const SPEED_DURATION: Record<string, string> = {
  slow:   '30s',
  normal: '18s',
  fast:   '10s',
};

export default function AnnouncementBar() {
  const [content, setContent] = useState<string | null>(null);
  const [type,    setType]    = useState('normal');
  const [speed,   setSpeed]   = useState('normal');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('announcements')
        .select('content, type, speed')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      const item = data?.[0];
      if (item) {
        setContent(item.content);
        setType(item.type ?? 'normal');
        setSpeed(item.speed ?? 'normal');
      }
    };

    load();
  }, []);

  if (!content) return null;

  const duration = SPEED_DURATION[speed] ?? '18s';
  const bgColor  = BG_COLOR[type] ?? '#1E1C1A';

  return (
    <div
      className={s.bar}
      style={{
        background: bgColor,
        '--ann-duration': duration,
      } as React.CSSProperties}
    >
      <div className={s.marquee}>{content}</div>
    </div>
  );
}
