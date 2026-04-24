'use client';

// app/admin/payment/page.tsx  ──  金流狀態（含退款）
//
// 付款狀態由綠界 ECPay 自動更新（透過 webhook / return），不可手動修改。
// 退款流程：按「退款」→ 填金額/原因 → 確認 → API 一次完成所有操作

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchApi } from '@/lib/api';
import s from '../_shared/admin-shared.module.css';
import p from './payment.module.css';

const PAY_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:  { label: '待付款',   color: '#b87a2a' },
  paid:     { label: '已付款',   color: '#2ab85a' },
  failed:   { label: '付款失敗', color: '#c0392b' },
  refunded: { label: '已退款',   color: '#5a7a8a' },
};
const REFUND_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  processing:        { label: '退款處理中',       color: '#b87a2a' },
  done:              { label: '退款完成',         color: '#2ab85a' },
  done_with_warning: { label: '退款完成（同步異常）', color: '#b87a2a' },
  manual:            { label: '需人工退款',       color: '#2a7ab8' },
  manual_pending:    { label: '待確認退款',       color: '#2a7ab8' },
  manual_done:       { label: '人工退款完成',     color: '#2ab85a' },
  failed:            { label: '退款失敗',         color: '#c0392b' },
};
const PAY_METHOD: Record<string, string> = { credit: '信用卡', atm: 'ATM 轉帳' };

export default function AdminPaymentPage() {
  const [orders,  setOrders]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('');
  const [search,  setSearch]  = useState('');
  const [stats,   setStats]   = useState({ pending: 0, paid: 0, failed: 0, refunded: 0, totalPaid: 0, todayPaid: 0, refunding: 0 });

  // 退款處理 Modal
  const [showRefund,   setShowRefund]   = useState(false);
  const [refundOrder,  setRefundOrder]  = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState('');
  const [savingRefund, setSavingRefund] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('id, order_no, buyer_name, buyer_email, customer_name, customer_email, total, pay_method, pay_status, refund_status, refund_amount, refund_reason, ecpay_trade_no, ecpay_error_code, ecpay_error_msg, paid_at, created_at')
      .order('created_at', { ascending: false });
    const list = data ?? [];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
    const todayPaid = list.filter(o => o.pay_status === 'paid' && o.paid_at?.startsWith(today)).reduce((sum, o) => sum + o.total, 0);
    setStats({
      pending:   list.filter(o => o.pay_status === 'pending').length,
      paid:      list.filter(o => o.pay_status === 'paid').length,
      failed:    list.filter(o => o.pay_status === 'failed').length,
      refunded:  list.filter(o => o.pay_status === 'refunded').length,
      totalPaid: list.filter(o => o.pay_status === 'paid').reduce((sum, o) => sum + o.total, 0),
      todayPaid,
      refunding: list.filter(o => o.refund_status === 'processing' || o.refund_status === 'manual_pending').length,
    });
    setOrders(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── 開啟退款 Modal ──────────────────────────────
  const openRefund = (order: any) => {
    setRefundOrder(order);
    setRefundAmount(order.total);
    setRefundReason('');
    setShowRefund(true);
  };

  // ── 確認退款（一鍵完成：呼叫 API → 退款+取消+副作用）──
  const confirmRefund = async () => {
    if (!refundOrder) return;
    setSavingRefund(true);

    try {
      const res = await fetchApi('/api/payment/refund', {
        method: 'POST',
        body: JSON.stringify({
          order_id:      refundOrder.id,
          refund_amount: refundAmount,
          refund_reason: refundReason,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert('退款失敗：' + (data.error ?? '未知錯誤'));
        setSavingRefund(false);
        return;
      }

      alert(data.message ?? '退款完成');
      setShowRefund(false);
      load();
    } catch (err) {
      console.error('退款失敗:', err);
      alert('操作失敗，請稍後再試');
    }

    setSavingRefund(false);
  };

  // ── ATM 退款確認 ──────────────────────────────────
  const confirmManualRefund = async (orderId: number) => {
    if (!confirm('確認已完成銀行轉帳退款？')) return;
    try {
      const res = await fetchApi('/api/payment/refund/confirm', {
        method: 'POST',
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? '操作失敗'); return; }
      alert(data.message ?? '已確認退款');
      load();
    } catch { alert('操作失敗，請稍後再試'); }
  };

  // ── 篩選 ──────────────────────────────────────────
  const filtered = orders.filter(o => {
    const matchSearch = !search || o.order_no.includes(search.toUpperCase()) || (o.buyer_name ?? '').includes(search) || (o.customer_name ?? '').includes(search);
    const matchFilter = !filter || o.pay_status === filter || o.refund_status === filter;
    return matchSearch && matchFilter;
  });

  // ── 付款狀態 Badge（唯讀）────────────────────────
  const PayBadge = ({ status }: { status: string }) => {
    const info = PAY_STATUS_MAP[status] ?? { label: status, color: 'var(--text-light)' };
    return (
      <span className={p.payBadge} style={{ color: info.color, borderColor: info.color }}>
        {info.label}
      </span>
    );
  };

  if (loading) return <p className={s.loadingText}>載入中...</p>;

  return (
    <div>
      <h1 className={`${s.pageTitle} ${p.pageTitleMb}`}>金流狀態</h1>

      <div className={s.infoBar}>
        付款狀態由綠界 ECPay 自動更新，不可手動修改。退款請使用「申請退款」流程。
      </div>

      {/* 統計卡片 */}
      <div className={s.statGrid}>
        {[
          { label: '今日收款',        value: `NT$ ${stats.todayPaid.toLocaleString()}`, color: '#2ab85a' },
          { label: '待入帳（待付款）', value: stats.pending,   color: '#b87a2a' },
          { label: '已付款',           value: stats.paid,      color: '#2ab85a' },
          { label: '付款失敗',         value: stats.failed,    color: '#c0392b' },
          { label: '已退款',           value: stats.refunded,  color: '#5a7a8a' },
          { label: '退款處理中',       value: stats.refunding, color: '#b87a2a' },
          { label: '已收款總額',       value: `NT$ ${stats.totalPaid.toLocaleString()}`, color: 'var(--text-dark)' },
        ].map(({ label, value, color }) => (
          <div key={label} className={s.statCard}>
            <div className={s.statLabel}>{label}</div>
            <div className={s.statValue} style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* 搜尋篩選 */}
      <div className={s.filterRow}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋訂單編號或姓名..." className={s.searchInput} />
        <select value={filter} onChange={e => setFilter(e.target.value)} className={s.filterSelect}>
          <option value="">全部狀態</option>
          {Object.entries(PAY_STATUS_MAP).map(([value, { label }]) => (
            <option key={value} value={value}>{label}</option>
          ))}
          <option disabled>── 退款 ──</option>
          {Object.entries(REFUND_STATUS_LABEL).map(([value, { label }]) => <option key={`r_${value}`} value={value}>{label}</option>)}
        </select>
      </div>

      {/* 訂單列表 */}
      <div className={s.tableWrap}>
        {/* Desktop table */}
        <table className={s.table}>
          <thead>
            <tr>{['訂單編號', '買家', '金額', '付款方式', '綠界交易號', '付款狀態', '付款時間', '退款', '下單時間'].map(h => <th key={h} className={`${s.th}${(h === '下單時間' || h === '綠界交易號') ? ` ${p.colHideTablet}` : ''}`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className={s.emptyRow}>沒有符合條件的訂單</td></tr>
            ) : filtered.map(order => (
              <tr key={order.id} className={s.tr}>
                <td className={`${s.td} ${p.tdOrderNo}`}>{order.order_no}</td>
                <td className={s.td}>
                  <div className={p.buyerName}>{order.buyer_name}</div>
                  <div className={p.buyerEmail}>{order.buyer_email}</div>
                  {order.customer_name && order.customer_name !== order.buyer_name && (
                    <div className={p.buyerEmail} style={{ color: '#999' }}>收件人：{order.customer_name}</div>
                  )}
                </td>
                <td className={`${s.td} ${p.tdNoWrap}`}>NT$ {order.total.toLocaleString()}</td>
                <td className={`${s.td} ${p.tdPayMethod}`}>{PAY_METHOD[order.pay_method] ?? order.pay_method ?? '—'}</td>
                <td className={`${s.td} ${p.tdEcpay} ${p.colHideTablet}`}>
                  {order.ecpay_trade_no ?? '—'}
                  {order.pay_status === 'failed' && order.ecpay_error_msg && (
                    <div style={{ fontSize: '0.75rem', color: '#c0392b', marginTop: 2 }}>
                      {order.ecpay_error_code && `[${order.ecpay_error_code}] `}{order.ecpay_error_msg}
                    </div>
                  )}
                </td>

                {/* 付款狀態（唯讀 badge）*/}
                <td className={s.td}>
                  <PayBadge status={order.pay_status} />
                </td>

                {/* 付款時間 */}
                <td className={`${s.td} ${p.tdDateLight}`}>
                  {order.paid_at ? new Date(order.paid_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '—'}
                </td>

                {/* 退款狀態 */}
                <td className={s.td}>
                  {order.refund_status ? (() => {
                    const rs = REFUND_STATUS_LABEL[order.refund_status];
                    return (
                      <div>
                        <span className={p.refundBadge} style={{ color: rs?.color ?? '#888' }}>{rs?.label ?? order.refund_status}</span>
                        {order.refund_amount > 0 && <div className={p.refundAmount}>NT$ {order.refund_amount.toLocaleString()}</div>}
                        {order.refund_status === 'manual_pending' && (
                          <button onClick={() => confirmManualRefund(order.id)} className={p.refundBtn} style={{ marginTop: 4 }}>確認已退款</button>
                        )}
                      </div>
                    );
                  })() : (
                    order.pay_status === 'paid' && (
                      <button onClick={() => openRefund(order)} className={p.refundBtn}>退款</button>
                    )
                  )}
                </td>

                <td className={`${s.td} ${p.tdDateLight} ${p.colHideTablet}`}>{new Date(order.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile card list */}
        <div className={s.cardList}>
          {filtered.length === 0 ? (
            <div className={s.emptyRow}>沒有符合條件的訂單</div>
          ) : filtered.map(order => (
            <div key={order.id} className={s.card}>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>訂單</span>
                <span className={`${s.cardValue} ${p.cardOrderNo}`}>{order.order_no}</span>
              </div>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>購買人</span>
                <span className={s.cardValue}>{order.buyer_name}</span>
              </div>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>金額</span>
                <span className={s.cardValue}>NT$ {order.total.toLocaleString()}</span>
              </div>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>付款狀態</span>
                <PayBadge status={order.pay_status} />
              </div>
              {order.paid_at && (
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>付款時間</span>
                  <span className={`${s.cardValue} ${p.cardDateLight}`}>{new Date(order.paid_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</span>
                </div>
              )}
              <div className={s.cardRow}>
                <span className={s.cardLabel}>退款</span>
                {order.refund_status ? (() => {
                  const rs = REFUND_STATUS_LABEL[order.refund_status];
                  return (
                    <span>
                      <span className={p.refundBadge} style={{ color: rs?.color ?? '#888' }}>{rs?.label ?? order.refund_status}</span>
                      {order.refund_amount > 0 && <span className={p.refundAmountInline}> NT$ {order.refund_amount.toLocaleString()}</span>}
                      {order.refund_status === 'manual_pending' && (
                        <button onClick={() => confirmManualRefund(order.id)} className={p.refundBtn} style={{ marginLeft: 8 }}>確認已退款</button>
                      )}
                    </span>
                  );
                })() : order.pay_status === 'paid' ? (
                  <button onClick={() => openRefund(order)} className={p.refundBtn}>退款</button>
                ) : <span className={p.cardDash}>—</span>}
              </div>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>日期</span>
                <span className={`${s.cardValue} ${p.cardDateLight}`}>{new Date(order.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 退款 Modal */}
      {showRefund && refundOrder && (
        <>
          <div onClick={() => setShowRefund(false)} className={s.modalOverlay} />
          <div className={`${s.modal} ${p.modalWidth}`}>
            <div className={s.modalHeader}>
              <span className={s.modalTitle}>確認退款</span>
              <button onClick={() => setShowRefund(false)} className={s.modalClose}>×</button>
            </div>
            <div className={s.modalBody}>
              <div className={p.orderInfo}>
                訂單 {refundOrder.order_no}｜{refundOrder.buyer_name}｜NT$ {refundOrder.total.toLocaleString()}
              </div>
              <div>
                <label className={s.label}>退款金額（NT$）</label>
                <input type="number" value={refundAmount} onChange={e => setRefundAmount(Number(e.target.value))} max={refundOrder.total} className={s.input} />
              </div>
              <div>
                <label className={s.label}>退款原因</label>
                <textarea value={refundReason} onChange={e => setRefundReason(e.target.value)} rows={3} placeholder="例：商品破損、顧客取消訂單" className={s.textarea} />
              </div>

              {/* 依付款方式顯示不同提示 */}
              {refundOrder.pay_method === 'credit' && (
                <div className={p.refundWarning}>
                  確認後將立即透過綠界進行信用卡刷退，訂單將自動取消。
                </div>
              )}
              {refundOrder.pay_method === 'atm' && (
                <div className={p.refundWarning}>
                  ATM 付款無法自動退款，確認後訂單將取消並標記為「需人工退款」，請手動以銀行轉帳方式辦理。
                </div>
              )}

              <div className={s.btnActions}>
                <button onClick={confirmRefund} disabled={savingRefund} className={p.btnRefundConfirm}>
                  {savingRefund ? '退款處理中...' : '確認退款'}
                </button>
                <button onClick={() => setShowRefund(false)} className={s.btnCancel}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
