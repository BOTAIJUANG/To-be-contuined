'use client';

// app/admin/payment/page.tsx  ──  金流狀態（含退款）

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import s from '../_shared/admin-shared.module.css';
import p from './payment.module.css';

export default function AdminPaymentPage() {
  const [orders,  setOrders]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('');
  const [search,  setSearch]  = useState('');
  const [stats,   setStats]   = useState({ pending: 0, paid: 0, failed: 0, totalPaid: 0, todayPaid: 0, refunding: 0 });

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
      .select('id, order_no, buyer_name, buyer_email, total, pay_method, pay_status, refund_status, refund_amount, refund_reason, ecpay_trade_no, created_at')
      .order('created_at', { ascending: false });
    const list = data ?? [];
    const today = new Date().toISOString().split('T')[0];
    const todayPaid = list.filter(o => o.pay_status === 'paid' && o.created_at?.startsWith(today)).reduce((sum, o) => sum + o.total, 0);
    setStats({
      pending:   list.filter(o => o.pay_status === 'pending').length,
      paid:      list.filter(o => o.pay_status === 'paid').length,
      failed:    list.filter(o => o.pay_status === 'failed').length,
      totalPaid: list.filter(o => o.pay_status === 'paid').reduce((sum, o) => sum + o.total, 0),
      todayPaid,
      refunding: list.filter(o => o.refund_status === 'pending').length,
    });
    setOrders(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updatePayStatus = async (orderId: number, pay_status: string) => {
    await supabase.from('orders').update({ pay_status }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, pay_status } : o));
  };

  const openRefund = (order: any) => {
    setRefundOrder(order);
    setRefundAmount(order.total);
    setRefundReason('');
    setShowRefund(true);
  };

  const saveRefund = async () => {
    if (!refundOrder) return;
    setSavingRefund(true);
    await supabase.from('orders').update({
      refund_status: 'pending',
      refund_amount: refundAmount,
      refund_reason: refundReason,
    }).eq('id', refundOrder.id);
    setSavingRefund(false);
    setShowRefund(false);
    load();
  };

  const updateRefundStatus = async (orderId: number, refund_status: string) => {
    await supabase.from('orders').update({ refund_status }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, refund_status } : o));
  };

  const PAY_STATUS = [
    { value: 'pending', label: '待付款', color: '#b87a2a' },
    { value: 'paid',    label: '已付款', color: '#2ab85a' },
    { value: 'failed',  label: '付款失敗', color: '#c0392b' },
  ];
  const REFUND_STATUS = [
    { value: 'pending',  label: '退款申請中', color: '#b87a2a' },
    { value: 'approved', label: '退款已核准', color: '#2a7ab8' },
    { value: 'done',     label: '退款完成',   color: '#2ab85a' },
  ];
  const PAY_METHOD: Record<string, string> = { credit: '信用卡', atm: 'ATM 轉帳' };

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.order_no.includes(search.toUpperCase()) || (o.buyer_name ?? '').includes(search);
    const matchFilter = !filter || o.pay_status === filter || o.refund_status === filter;
    return matchSearch && matchFilter;
  });

  if (loading) return <p className={s.loadingText}>載入中...</p>;

  return (
    <div>
      <h1 className={`${s.pageTitle} ${p.pageTitleMb}`}>金流狀態</h1>

      <div className={s.infoBar}>
        串接綠界 ECPay 後，付款狀態將自動更新。目前可手動調整。
      </div>

      {/* 統計卡片 */}
      <div className={s.statGrid}>
        {[
          { label: '今日收款',   value: `NT$ ${stats.todayPaid.toLocaleString()}`, color: '#2ab85a' },
          { label: '待入帳（待付款）', value: stats.pending,   color: '#b87a2a' },
          { label: '已付款',     value: stats.paid,     color: '#2ab85a' },
          { label: '付款失敗',   value: stats.failed,   color: '#c0392b' },
          { label: '退款處理中', value: stats.refunding, color: '#b87a2a' },
          { label: '已收款總額', value: `NT$ ${stats.totalPaid.toLocaleString()}`, color: 'var(--text-dark)' },
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
          {PAY_STATUS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
          <option value="pending_refund" disabled>── 退款 ──</option>
          {REFUND_STATUS.map(st => <option key={`r_${st.value}`} value={st.value}>{st.label}</option>)}
        </select>
      </div>

      {/* 訂單列表 */}
      <div className={s.tableWrap}>
        {/* Desktop table */}
        <table className={s.table}>
          <thead>
            <tr>{['訂單編號', '買家', '金額', '付款方式', '綠界交易號', '付款狀態', '退款', '下單時間'].map(h => <th key={h} className={s.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className={s.emptyRow}>沒有符合條件的訂單</td></tr>
            ) : filtered.map(order => (
              <tr key={order.id} className={s.tr}>
                <td className={`${s.td} ${p.tdOrderNo}`}>{order.order_no}</td>
                <td className={s.td}>
                  <div className={p.buyerName}>{order.buyer_name}</div>
                  <div className={p.buyerEmail}>{order.buyer_email}</div>
                </td>
                <td className={`${s.td} ${p.tdNoWrap}`}>NT$ {order.total.toLocaleString()}</td>
                <td className={`${s.td} ${p.tdPayMethod}`}>{PAY_METHOD[order.pay_method] ?? order.pay_method ?? '—'}</td>
                <td className={`${s.td} ${p.tdEcpay}`}>{order.ecpay_trade_no ?? '—'}</td>

                {/* 付款狀態 */}
                <td className={s.td}>
                  <select value={order.pay_status} onChange={e => updatePayStatus(order.id, e.target.value)} className={p.inlineSelect} style={{ color: PAY_STATUS.find(st => st.value === order.pay_status)?.color ?? 'var(--text-light)' }}>
                    {PAY_STATUS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                  </select>
                </td>

                {/* 退款狀態 */}
                <td className={s.td}>
                  {order.refund_status ? (
                    <div>
                      <select value={order.refund_status} onChange={e => updateRefundStatus(order.id, e.target.value)} className={`${p.inlineSelect} ${p.refundSelectBlock}`} style={{ color: REFUND_STATUS.find(st => st.value === order.refund_status)?.color ?? 'var(--text-light)' }}>
                        {REFUND_STATUS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                      </select>
                      {order.refund_amount > 0 && <div className={p.refundAmount}>NT$ {order.refund_amount.toLocaleString()}</div>}
                    </div>
                  ) : (
                    order.pay_status === 'paid' && (
                      <button onClick={() => openRefund(order)} className={p.refundBtn}>申請退款</button>
                    )
                  )}
                </td>

                <td className={`${s.td} ${p.tdDateLight}`}>{new Date(order.created_at).toLocaleDateString('zh-TW')}</td>
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
                <span className={s.cardLabel}>買家</span>
                <span className={s.cardValue}>{order.buyer_name}</span>
              </div>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>金額</span>
                <span className={s.cardValue}>NT$ {order.total.toLocaleString()}</span>
              </div>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>付款</span>
                <select value={order.pay_status} onChange={e => updatePayStatus(order.id, e.target.value)} className={p.inlineSelect} style={{ color: PAY_STATUS.find(st => st.value === order.pay_status)?.color }}>
                  {PAY_STATUS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                </select>
              </div>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>退款</span>
                {order.refund_status ? (
                  <select value={order.refund_status} onChange={e => updateRefundStatus(order.id, e.target.value)} className={p.inlineSelect} style={{ color: REFUND_STATUS.find(st => st.value === order.refund_status)?.color }}>
                    {REFUND_STATUS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                  </select>
                ) : order.pay_status === 'paid' ? (
                  <button onClick={() => openRefund(order)} className={p.refundBtn}>申請退款</button>
                ) : <span className={p.cardDash}>—</span>}
              </div>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>日期</span>
                <span className={`${s.cardValue} ${p.cardDateLight}`}>{new Date(order.created_at).toLocaleDateString('zh-TW')}</span>
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
              <span className={s.modalTitle}>申請退款</span>
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
              <div className={p.refundWarning}>
                實際退款需透過綠界後台操作，此處僅記錄退款申請狀態。
              </div>
              <div className={s.btnActions}>
                <button onClick={saveRefund} disabled={savingRefund} className={p.btnRefundConfirm}>
                  {savingRefund ? '處理中...' : '確認退款申請'}
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
