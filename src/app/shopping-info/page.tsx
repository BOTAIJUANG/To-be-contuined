'use client';

// app/shopping-info/page.tsx  ──  購物說明（從 Supabase faqs 表讀取）

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/lib/useSettings';
import Footer from '@/components/Footer';

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
      <div style={{ width: 'min(calc(100% - 60px), 1100px)', margin: 'auto', padding: '72px 0' }}>
        <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.28em', color: '#1E1C1A', margin: '0 0 48px' }}>
          SHOPPING INFO
        </h2>

        {loading ? (
          <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p>
        ) : (
          <div>
            {faqs.map((faq, i) => (
              <div key={faq.id} style={{ padding: '28px 0', borderBottom: '1px solid #E8E4DC' }}>
                <h4 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 500, fontSize: '14px', letterSpacing: '0.15em', color: '#1E1C1A', margin: '0 0 12px' }}>
                  {faq.question}
                </h4>
                <p style={{ fontSize: '13px', color: '#555250', lineHeight: 2.2, fontWeight: 300, whiteSpace: 'pre-line' }}>
                  {faq.answer}
                </p>
              </div>
            ))}
            {faqs.length === 0 && (
              <p style={{ color: '#888580', fontSize: '13px' }}>暫無購物說明內容。</p>
            )}
          </div>
        )}
      </div>
      <Footer tel={settings.phone} email={settings.email} address={settings.address} />
    </>
  );
}
