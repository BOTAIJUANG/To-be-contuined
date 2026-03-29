'use client';

// app/order-search/page.tsx  ──  訂單查詢（含追蹤號碼）

import { useState } from 'react';
import Footer from '@/components/Footer';
import { useSettings } from '@/lib/useSettings';
import s from './order-search.module.css';

const STATUS_LABEL: Record<string, string> = {
  processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消',
};
const STATUS_COLOR: Record<string, string> = {
  processing: '#b87a2a', shipped: '#2a7ab8', done: '#2ab85a', cancelled: '#888580',
};
const SHIP_LABEL: Record<string, string> = { home: '宅配', cvs_711: '7-11取貨', store: '門市自取' };

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

    try {
      const res = await fetch(`/api/orders/search?no=${encodeURIComponent(orderNum.trim())}&contact=${encodeURIComponent(contact.trim())}`);
      if (!res.ok) { setLoading(false); setResult('not_found'); return; }
      const json = await res.json();
      setLoading(false);
      if (!json.data) setResult('not_found');
      else setResult(json.data);
    } catch {
      setLoading(false);
      setResult('not_found');
    }
  };

  return (
    <>
      <div className={s.container}>
        <div className={s.inner}>

          <h2 className={s.title}>ORDER 查詢</h2>
          <p className={s.subtitle}>
            請輸入訂單編號與聯絡資訊查詢訂單狀態。
          </p>

          <input
            value={orderNum}
            onChange={e => setOrderNum(e.target.value)}
            placeholder="ORDER NUMBER"
            className={s.inputUpper}
          />
          <input
            value={contact}
            onChange={e => setContact(e.target.value)}
            placeholder="PHONE / EMAIL"
            className={s.input}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />

          <button
            onClick={handleSearch}
            disabled={loading}
            className={s.searchBtn}
          >
            {loading ? '查詢中...' : '查詢'}
          </button>

          {/* 查詢結果 */}
          {result !== null && (
            <div className={s.resultArea}>
              {result === 'not_found' ? (
                <p className={s.notFound}>
                  查無此訂單，請確認編號與聯絡資訊是否正確。
                </p>
              ) : (
                <div className={s.orderCard}>
                  {/* 訂單編號 + 狀態 */}
                  <div className={s.orderHeader}>
                    <span className={s.orderNo}>{result.order_no}</span>
                    <span
                      className={s.statusBadge}
                      style={{
                        color: STATUS_COLOR[result.status] ?? '#888580',
                        border: `1px solid ${STATUS_COLOR[result.status] ?? '#E8E4DC'}`,
                      }}
                    >
                      {STATUS_LABEL[result.status] ?? result.status}
                    </span>
                  </div>

                  {/* 訂購商品 */}
                  {result.order_items?.map((item: any, i: number) => (
                    <div key={i} className={s.orderItem}>
                      <span>{item.name} × {item.qty}</span>
                      <span>NT$ {(item.price * item.qty).toLocaleString()}</span>
                    </div>
                  ))}

                  {/* 訂單資訊 */}
                  {[
                    { label: '下單日期', value: new Date(result.created_at).toLocaleDateString('zh-TW') },
                    { label: '配送方式', value: SHIP_LABEL[result.ship_method] ?? result.ship_method },
                    ...(result.cvs_store_name ? [{ label: '取貨門市', value: `${result.cvs_store_brand ? result.cvs_store_brand + ' ' : ''}${result.cvs_store_name}` }] : []),
                    ...(result.cvs_store_address ? [{ label: '門市地址', value: result.cvs_store_address }] : []),
                    { label: '合計',     value: `NT$ ${result.total.toLocaleString()}` },
                  ].map(({ label, value }) => (
                    <div key={label} className={s.infoRow}>
                      <span className={s.infoLabel}>{label}</span>
                      <span className={s.infoValue}>{value}</span>
                    </div>
                  ))}

                  {/* ATM 轉帳資訊（有才顯示）*/}
                  {result.pay_method === 'atm' && result.atm_vaccount && result.pay_status !== 'paid' && (
                    <div className={s.trackingBox}>
                      <div className={s.trackingLabel}>ATM 轉帳資訊</div>
                      <div style={{ padding: '8px 0', fontSize: '14px', lineHeight: '1.8' }}>
                        {result.atm_bank_code && <div>銀行代碼：<strong>{result.atm_bank_code}</strong></div>}
                        <div>虛擬帳號：<strong>{result.atm_vaccount}</strong></div>
                        {result.atm_expire_date && <div>繳費期限：{result.atm_expire_date}</div>}
                      </div>
                    </div>
                  )}

                  {/* 追蹤號碼（有才顯示）*/}
                  {result.tracking_no && (
                    <div className={s.trackingBox}>
                      <div className={s.trackingLabel}>物流追蹤</div>
                      <div className={s.trackingContent}>
                        <div>
                          {result.carrier && <div className={s.carrier}>{result.carrier}</div>}
                          <div className={s.trackingNo}>{result.tracking_no}</div>
                          {result.shipped_at && (
                            <div className={s.shippedAt}>
                              出貨時間：{new Date(result.shipped_at).toLocaleDateString('zh-TW')}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(result.tracking_no).then(() => alert('已複製追蹤號碼'))}
                          className={s.copyBtn}
                        >
                          複製
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 已出貨但無追蹤號 */}
                  {result.status === 'shipped' && !result.tracking_no && (
                    <div className={s.shippedNotice}>
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
