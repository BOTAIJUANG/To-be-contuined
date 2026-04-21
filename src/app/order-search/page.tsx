'use client';

// app/order-search/page.tsx  ──  訂單查詢（含追蹤號碼）

import { useState } from 'react';
import Footer from '@/components/Footer';
import { useSettings } from '@/lib/useSettings';
import s from './order-search.module.css';

const STATUS_LABEL = (status: string, payStatus: string): string => {
  if (status === 'processing') return payStatus === 'paid' ? '處理中' : '尚未付款';
  return { shipped: '已出貨', done: '已完成', cancelled: '已取消' }[status] ?? status;
};
const PAY_STATUS_LABEL: Record<string, string> = { paid: '已付款', pending: '待付款' };

const getStatusClass = (s: any, status: string, payStatus: string) => {
  if (status === 'processing') return payStatus === 'paid' ? s.orderBadgeProcessing : s.orderBadgeUnpaid;
  if (status === 'shipped')   return s.orderBadgeShipped;
  if (status === 'done')      return s.orderBadgeDone;
  return s.orderBadgeCancelled;
};
const getPayClass = (s: any, payStatus: string) =>
  payStatus === 'paid' ? s.orderBadgePaid : s.orderBadgePending;
const SHIP_LABEL: Record<string, string> = {
  home_ambient: '宅配（常溫）', home_refrigerated: '宅配（冷藏）', home_frozen: '宅配（冷凍）',
  cvs_ambient: '7-11取貨（常溫）', cvs_frozen: '7-11取貨（冷凍）', store: '門市自取',
  home: '宅配', cvs_711: '7-11取貨', // 舊格式相容
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
                  {/* Header：訂單編號 + 下單日期 + 狀態 badges */}
                  <div className={s.orderHeader}>
                    <div className={s.orderHeaderLeft}>
                      <span className={s.orderNumber}>{result.order_no}</span>
                      <span className={s.orderDate}>{new Date(result.created_at).toLocaleDateString('zh-TW')} 下單</span>
                    </div>
                    <div className={s.orderStatusGroup}>
                      <span className={`${s.orderBadge} ${getStatusClass(s, result.status, result.pay_status)}`}>
                        {STATUS_LABEL(result.status, result.pay_status)}
                      </span>
                      {result.pay_status && (
                        <span className={`${s.orderBadge} ${getPayClass(s, result.pay_status)}`}>
                          {PAY_STATUS_LABEL[result.pay_status] ?? result.pay_status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 商品摘要 */}
                  <div className={s.orderSummary}>
                    {result.order_items?.map((item: any, i: number) => (
                      <div key={i} className={s.orderSummaryRow}>
                        <span className={s.orderItemName}>{item.name} × {item.qty}</span>
                        <span className={s.orderItemPrice}>NT$ {(item.price * item.qty).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  {/* 配送資訊 */}
                  <div className={s.orderInfoList}>
                    {[
                      { label: '配送方式', value: SHIP_LABEL[result.ship_method] ?? result.ship_method },
                      ...(result.cvs_store_name ? [{ label: '取貨門市', value: `${result.cvs_store_brand ? result.cvs_store_brand + ' ' : ''}${result.cvs_store_name}` }] : []),
                      ...(result.cvs_store_address ? [{ label: '門市地址', value: result.cvs_store_address }] : []),
                    ].map(({ label, value }) => (
                      <div key={label} className={s.orderInfoRow}>
                        <span className={s.orderInfoLabel}>{label}</span>
                        <span className={s.orderInfoValue}>{value}</span>
                      </div>
                    ))}
                  </div>

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

                  {/* 合計 */}
                  <div className={s.orderTotalRow}>
                    <span className={s.orderTotalLabel}>合計</span>
                    <span className={s.orderTotalValue}>NT$ {result.total.toLocaleString()}</span>
                  </div>
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
