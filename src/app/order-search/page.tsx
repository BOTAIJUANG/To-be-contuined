'use client';

// app/order-search/page.tsx  ──  訂單查詢（含追蹤號碼）

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Footer from '@/components/Footer';
import { useSettings } from '@/lib/useSettings';

const STATUS_LABEL: Record<string, string> = {
  processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消',
};
const STATUS_COLOR: Record<string, string> = {
  processing: '#b87a2a', shipped: '#2a7ab8', done: '#2ab85a', cancelled: '#888580',
};
const SHIP_LABEL: Record<string, string> = {
  home_normal: '一般宅配', home_cold: '低溫宅配',
  cvs_711: '7-11取貨', cvs_family: '全家取貨', store: '門市自取',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '14px 0',
  border: 'none', borderBottom: '1px solid #E8E4DC',
  marginBottom: '22px', fontFamily: 'inherit',
  fontSize: '13px', background: 'transparent',
  color: '#1E1C1A', letterSpacing: '0.05em', outline: 'none',
};

export default function OrderSearchPage() {
  const { settings } = useSettings();
  const [orderNum, setOrderNum] = useState('');
  const [contact,  setContact]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<null | 'not_found' | any>(null);

  const handleSearch = async () => {
    if (!orderNum.trim() || !contact.trim()) { alert('請填寫訂單編號與聯絡資訊'); return; }
    setLoading(true);
    setResult(null);

    const { data, error } = await supabase
      .from('orders')
      .select(`
        order_no, status, created_at, total,
        buyer_name, buyer_email, buyer_phone,
        ship_method, address, ship_date,
        tracking_no, carrier, shipped_at,
        order_items ( name, price, qty )
      `)
      .eq('order_no', orderNum.trim().toUpperCase())
      .or(`buyer_email.eq.${contact.trim()},buyer_phone.eq.${contact.trim()}`)
      .single();

    setLoading(false);
    if (error || !data) setResult('not_found');
    else setResult(data);
  };

  return (
    <>
      <div style={{ width: 'min(calc(100% - 60px), 1100px)', margin: 'auto', padding: '72px 0' }}>
        <div style={{ maxWidth: '520px', margin: 'auto', textAlign: 'center' }}>

          <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.28em', color: '#1E1C1A', margin: '0 0 20px' }}>
            ORDER 查詢
          </h2>
          <p style={{ fontSize: '13px', lineHeight: 2.4, fontWeight: 300, color: '#555250', marginBottom: '36px' }}>
            請輸入訂單編號與聯絡資訊查詢訂單狀態。
          </p>

          <input value={orderNum} onChange={e => setOrderNum(e.target.value)} placeholder="ORDER NUMBER" style={{ ...inputStyle, textAlign: 'left', textTransform: 'uppercase' }} />
          <input value={contact}  onChange={e => setContact(e.target.value)}  placeholder="PHONE / EMAIL"  style={{ ...inputStyle, textAlign: 'left' }} onKeyDown={e => e.key === 'Enter' && handleSearch()} />

          <button onClick={handleSearch} disabled={loading} style={{ width: '100%', marginTop: '10px', padding: '12px 44px', border: '1px solid rgba(0,0,0,0.18)', background: 'transparent', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.35em', textTransform: 'uppercase', color: '#1E1C1A', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
            {loading ? '查詢中...' : '查詢'}
          </button>

          {/* 查詢結果 */}
          {result !== null && (
            <div style={{ marginTop: '40px', textAlign: 'left' }}>
              {result === 'not_found' ? (
                <p style={{ padding: '32px 0', color: '#888580', fontSize: '13px', textAlign: 'center' }}>
                  查無此訂單，請確認編號與聯絡資訊是否正確。
                </p>
              ) : (
                <div style={{ border: '1px solid #E8E4DC', padding: '32px' }}>
                  {/* 訂單編號 + 狀態 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <span style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '13px', fontWeight: 600, letterSpacing: '0.1em', color: '#1E1C1A' }}>
                      {result.order_no}
                    </span>
                    <span style={{ fontSize: '11px', letterSpacing: '0.15em', color: STATUS_COLOR[result.status] ?? '#888580', border: `1px solid ${STATUS_COLOR[result.status] ?? '#E8E4DC'}`, padding: '3px 10px', fontFamily: '"Montserrat", sans-serif' }}>
                      {STATUS_LABEL[result.status] ?? result.status}
                    </span>
                  </div>

                  {/* 訂購商品 */}
                  {result.order_items?.map((item: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '8px 0', borderBottom: '1px solid #E8E4DC', color: '#555250' }}>
                      <span>{item.name} × {item.qty}</span>
                      <span>NT$ {(item.price * item.qty).toLocaleString()}</span>
                    </div>
                  ))}

                  {/* 訂單資訊 */}
                  {[
                    { label: '下單日期', value: new Date(result.created_at).toLocaleDateString('zh-TW') },
                    { label: '配送方式', value: SHIP_LABEL[result.ship_method] ?? result.ship_method },
                    { label: '合計',     value: `NT$ ${result.total.toLocaleString()}` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '10px 0', borderBottom: '1px solid #E8E4DC' }}>
                      <span style={{ color: '#888580' }}>{label}</span>
                      <span style={{ color: '#1E1C1A' }}>{value}</span>
                    </div>
                  ))}

                  {/* 追蹤號碼（有才顯示）*/}
                  {result.tracking_no && (
                    <div style={{ marginTop: '20px', padding: '16px 20px', background: '#EDE9E2', border: '1px solid #E8E4DC' }}>
                      <div style={{ fontSize: '10px', color: '#888580', letterSpacing: '0.25em', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase', marginBottom: '8px' }}>
                        物流追蹤
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          {result.carrier && <div style={{ fontSize: '13px', color: '#1E1C1A', marginBottom: '4px' }}>{result.carrier}</div>}
                          <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '14px', fontWeight: 600, color: '#1E1C1A', letterSpacing: '0.1em' }}>
                            {result.tracking_no}
                          </div>
                          {result.shipped_at && <div style={{ fontSize: '11px', color: '#888580', marginTop: '4px' }}>出貨時間：{new Date(result.shipped_at).toLocaleDateString('zh-TW')}</div>}
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(result.tracking_no).then(() => alert('已複製追蹤號碼'))}
                          style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer', fontFamily: '"Montserrat", sans-serif' }}
                        >
                          複製
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 已出貨但無追蹤號 */}
                  {result.status === 'shipped' && !result.tracking_no && (
                    <div style={{ marginTop: '20px', padding: '12px 16px', background: '#fff8e1', border: '1px solid #f0c040', fontSize: '12px', color: '#7a5c00' }}>
                      訂單已出貨，追蹤號碼將由店家盡快更新。
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <Footer tel={settings.phone} email={settings.email} address={settings.address} />
    </>
  );
}
