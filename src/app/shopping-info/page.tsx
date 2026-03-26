'use client';

// app/shopping-info/page.tsx  ──  購物說明（從 Supabase faqs 表讀取）

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/lib/useSettings';
import Footer from '@/components/Footer';
import s from './shopping-info.module.css';

interface Faq { id: number; question: string; answer: string; }

export default function ShoppingInfoPage() {
  const { settings } = useSettings();
  const [faqs,    setFaqs]    = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('faqs')
        .select('id, question, answer')
        .eq('is_active', true)
        .order('sort_order');
      setFaqs(data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <>
      <div className={s.container}>
        <h2 className={s.title}>購物說明</h2>
        <p className={s.subtitle}>Shopping Info</p>

        {loading ? (
          <p className={s.loading}>載入中...</p>
        ) : (
          <div>
            {faqs.map((faq, i) => (
              <div key={faq.id} className={s.faqItem}>
                <h4 className={s.question}>{faq.question}</h4>
                <p className={s.answer}>{faq.answer}</p>
              </div>
            ))}
            {faqs.length === 0 && (
              <p className={s.empty}>暫無購物說明內容。</p>
            )}
          </div>
        )}
      </div>
      <Footer tel={settings.phone} email={settings.email} address={settings.address} />
    </>
  );
}
