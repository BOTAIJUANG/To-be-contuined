'use client';

// app/admin/payment/page.tsx  ──  金流狀態（含退款）
//
// 付款狀態由綠界 ECPay 自動更新（透過 webhook / return），不可手動修改。
// 退款流程：申請退款 → 核准（信用卡自動呼叫綠界刷退 API）→ 完成

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
const REFUND_STATUS = [
  { value: 'pending',  label: '退款申請中', color: '#b87a2a' },
  { value: 'approved', label: '退款已核准', color: '#2a7ab8' },
  { value: 'done',     label: '退款完成',   color: '#2ab85a' },
];
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
      .select('id, order_no, buyer_name, buyer_email, customer_name, customer_email, total, pay_method, pay_status, refund_status, refund_amount, refund_reason, ecpay_trade_no, paid_at, created_at')
      .order('created_at', { ascending: false });
    const list = data ?? [];
    const today = new Date().toISOString().split('T')[0];
    const todayPaid = list.filter(o => o.pay_status === 'paid' && o.paid_at?.startsWith(today)).reduce((sum, o) => sum + o.total, 0);
    setStats({
      pending:   list.filter(o => o.pay_status === 'pending').length,
      paid:      list.filter(o => o.pay_status === 'paid').length,
      failed:    list.filter(o => o.pay_status === 'failed').length,
      refunded:  list.filter(o => o.pay_status === 'refunded').length,
      totalPaid: list.filter(o => o.pay_status === 'paid').reduce((sum, o) => sum + o.total, 0),
      todayPaid,
      refunding: list.filter(o => o.refund_status === 'pending').length,
    });
    setOrders(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── 申請退款（記錄到 DB，等待核准）──────────────────
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

  // ── 退款狀態變更（核准時呼叫綠界退款 + 副作用）──────
  const updateRefundStatus = async (orderId: number, refund_status: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    try {
      if (refund_status === 'approved') {
        // 信用卡已付款 → 呼叫綠界退款 API（跟訂單管理的取消邏輯一樣）
        if (order.pay_method === 'credit' && order.pay_status === 'paid') {
          const res = await fetchApi('/api/payment/refund', {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId }),
          });
          const data = await res.json();
          if (!res.ok) {
            alert('綠界退款失敗：' + (data.error ?? '未知錯誤'));
            return;
          }
          if (data.message) alert(data.message);
        }

        // ATM 已付款 → 提示需手動退款
        if (order.pay_method === 'atm' && order.pay_status === 'paid') {
          alert('此訂單為 ATM 付款，退款將以銀行轉帳方式另行辦理，請手動處理退款。');
        }

        // 副作用：扣章、回補庫存、取消兌換
        const { data: fullOrder } = await supabase
          .from('orders')
          .select('id, status, member_id, redemption_id')
          .eq('id', orderId)
          .single();

        if (fullOrder) {
          // 1. 扣章（如果訂單已完成且有加過章）
          if (fullOrder.status === 'done') {
            await fetchApi('/api/stamps?action=deduct', {
              method: 'POST',
              body: JSON.stringify({ order_id: orderId }),
            });
          }

          // 2. 回補庫存（API 自動查 order_items）
          await fetchApi('/api/inventory?action=cancel', {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId }),
          });

          // 3. 取消兌換紀錄
          if (fullOrder.redemption_id) {
            await supabase.from('redemptions').update({
              status: 'cancelled',
              updated_at: new Date().toISOString(),
            }).eq('id', fullOrder.redemption_id);
          }
        }
      }

      await supabase.from('orders').update({ refund_status }).eq('id', orderId);
      load(); // 重新載入以反映退款後的 pay_status 變化
    } catch (err) {
      console.error('退款狀態更新失敗:', err);
      alert('操作失敗，請稍後再試');
    }
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
          {REFUND_STATUS.map(st => <option key={`r_${st.value}`} value={st.value}>{st.label}</option>)}
        </select>
      </div>

      {/* 訂單列表 */}
      <div className={s.tableWrap}>
        {/* Desktop table */}
        <table className={s.table}>
          <thead>
            <tr>{['訂單編號', '買家', '金額', '付款方式', '綠界交易號', '付款狀態', '付款時間', '退款', '下單時間'].map(h => <th key={h} className={s.th}>{h}</th>)}</tr>
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
                <td className={`${s.td} ${p.tdEcpay}`}>{order.ecpay_trade_no ?? '—'}</td>

                {/* 付款狀態（唯讀 badge）*/}
                <td className={s.td}>
                  <PayBadge status={order.pay_status} />
                </td>

                {/* 付款時間 */}
                <td className={`${s.td} ${p.tdDateLight}`}>
                  {order.paid_at ? new Date(order.paid_at).toLocaleString('zh-TW') : '—'}
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
                  <span className={`${s.cardValue} ${p.cardDateLight}`}>{new Date(order.paid_at).toLocaleString('zh-TW')}</span>
                </div>
              )}
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

              {/* 依付款方式顯示不同提示 */}
              {refundOrder.pay_method === 'credit' && (
                <div className={p.refundWarning}>
                  核准退款後，系統將自動透過綠界進行信用卡刷退。
                </div>
              )}
              {refundOrder.pay_method === 'atm' && (
                <div className={p.refundWarning}>
                  ATM 付款無法自動退款，核准後請手動以銀行轉帳方式辦理退款。
                </div>
              )}

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
