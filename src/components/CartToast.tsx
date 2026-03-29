'use client';

// components/CartToast.tsx  ──  加入購物車 toast 通知

import { useEffect, useState } from 'react';
import { useCart } from '@/context/CartContext';
import s from './CartToast.module.css';

function ToastItem({ message, onDone }: { message: string; onDone: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 2000);
    const doneTimer = setTimeout(onDone, 2500);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div className={`${s.toast} ${fading ? s.fadeOut : ''}`}>
      <div className={s.accent} />
      <div className={s.content}>{message}</div>
    </div>
  );
}

export default function CartToast() {
  const { toast, clearToast } = useCart();
  if (!toast) return null;

  return (
    <div className={s.wrapper}>
      <ToastItem key={toast.id} message={toast.message} onDone={clearToast} />
    </div>
  );
}
