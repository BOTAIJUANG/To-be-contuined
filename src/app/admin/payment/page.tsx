'use client';

// app/admin/payment/page.tsx  ──  金流狀態（含退款）

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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
    const todayPaid = list.filter(o => o.pay_status === 'paid' && o.created_at?.startsWith(today)).reduce((s, o) => s + o.total, 0);
    setStats({
      pending:   list.filter(o => o.pay_status === 'pending').length,
      paid:      list.filter(o => o.pay_status === 'paid').length,
      failed:    list.filter(o => o.pay_status === 'failed').length,
      totalPaid: list.filter(o => o.pay_status === 'paid').reduce((s, o) => s + o.total, 0),
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

  const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #E8E4DC', background: '#fff', fontFamily: 'inherit', fontSize: '13px', color: '#1E1C1A', outline: 'none' };
  const thStyle: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC', whiteSpace: 'nowrap' };

  if (loading) return <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p>;

  return (
    <div>
      <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: '0 0 24px' }}>金流狀態</h1>

      <div style={{ background: '#EDE9E2', border: '1px solid #E8E4DC', padding: '12px 16px', marginBottom: '24px', fontSize: '13px', color: '#555250' }}>
        串接綠界 ECPay 後，付款狀態將自動更新。目前可手動調整。
      </div>

      {/* 統計卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: '今日收款',   value: `NT$ ${stats.todayPaid.toLocaleString()}`, color: '#2ab85a' },
          { label: '待入帳（待付款）', value: stats.pending,   color: '#b87a2a' },
          { label: '已付款',     value: stats.paid,     color: '#2ab85a' },
          { label: '付款失敗',   value: stats.failed,   color: '#c0392b' },
          { label: '退款處理中', value: stats.refunding, color: '#b87a2a' },
          { label: '已收款總額', value: `NT$ ${stats.totalPaid.toLocaleString()}`, color: '#1E1C1A' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '20px 24px' }}>
            <div style={{ fontSize: '10px', color: '#888580', letterSpacing: '0.2em', marginBottom: '10px', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* 搜尋篩選 */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋訂單編號或姓名..." style={{ ...inputStyle, minWidth: '240px' }} />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...inputStyle }}>
          <option value="">全部狀態</option>
          {PAY_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          <option value="pending_refund" disabled>── 退款 ──</option>
          {REFUND_STATUS.map(s => <option key={`r_${s.value}`} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* 訂單列表 */}
      <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['訂單編號', '買家', '金額', '付款方式', '綠界交易號', '付款狀態', '退款', '下單時間'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>沒有符合條件的訂單</td></tr>
            ) : filtered.map(order => (
              <tr key={order.id} style={{ borderBottom: '1px solid #E8E4DC' }}>
                <td style={{ padding: '12px 16px', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', color: '#1E1C1A', whiteSpace: 'nowrap' }}>{order.order_no}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: '13px', color: '#1E1C1A' }}>{order.buyer_name}</div>
                  <div style={{ fontSize: '11px', color: '#888580' }}>{order.buyer_email}</div>
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A', whiteSpace: 'nowrap' }}>NT$ {order.total.toLocaleString()}</td>
                <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250' }}>{PAY_METHOD[order.pay_method] ?? order.pay_method ?? '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: '11px', color: '#888580', fontFamily: '"Montserrat", sans-serif' }}>{order.ecpay_trade_no ?? '—'}</td>

                {/* 付款狀態 */}
                <td style={{ padding: '12px 16px' }}>
                  <select value={order.pay_status} onChange={e => updatePayStatus(order.id, e.target.value)} style={{ padding: '4px 8px', border: '1px solid #E8E4DC', background: '#fff', fontSize: '11px', color: PAY_STATUS.find(s => s.value === order.pay_status)?.color ?? '#888580', outline: 'none', cursor: 'pointer' }}>
                    {PAY_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>

                {/* 退款狀態 */}
                <td style={{ padding: '12px 16px' }}>
                  {order.refund_status ? (
                    <div>
                      <select value={order.refund_status} onChange={e => updateRefundStatus(order.id, e.target.value)} style={{ padding: '4px 8px', border: '1px solid #E8E4DC', background: '#fff', fontSize: '11px', color: REFUND_STATUS.find(s => s.value === order.refund_status)?.color ?? '#888580', outline: 'none', cursor: 'pointer', marginBottom: '4px', display: 'block' }}>
                        {REFUND_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      {order.refund_amount > 0 && <div style={{ fontSize: '10px', color: '#888580' }}>NT$ {order.refund_amount.toLocaleString()}</div>}
                    </div>
                  ) : (
                    order.pay_status === 'paid' && (
                      <button onClick={() => openRefund(order)} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#c0392b', cursor: 'pointer' }}>申請退款</button>
                    )
                  )}
                </td>

                <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580', whiteSpace: 'nowrap' }}>{new Date(order.created_at).toLocaleDateString('zh-TW')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 退款 Modal */}
      {showRefund && refundOrder && (
        <>
          <div onClick={() => setShowRefund(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '480px', maxWidth: '90vw', zIndex: 201 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '15px', color: '#1E1C1A' }}>申請退款</span>
              <button onClick={() => setShowRefund(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888580' }}>×</button>
            </div>
            <div style={{ padding: '24px', display: 'grid', gap: '16px' }}>
              <div style={{ background: '#EDE9E2', padding: '12px 16px', fontSize: '13px', color: '#555250' }}>
                訂單 {refundOrder.order_no}｜{refundOrder.buyer_name}｜NT$ {refundOrder.total.toLocaleString()}
              </div>
              <div>
                <label style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>退款金額（NT$）</label>
                <input type="number" value={refundAmount} onChange={e => setRefundAmount(Number(e.target.value))} max={refundOrder.total} style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <label style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>退款原因</label>
                <textarea value={refundReason} onChange={e => setRefundReason(e.target.value)} rows={3} placeholder="例：商品破損、顧客取消訂單" style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
              </div>
              <div style={{ background: '#fef0f0', border: '1px solid #f5c6c6', padding: '12px 16px', fontSize: '12px', color: '#c0392b' }}>
                實際退款需透過綠界後台操作，此處僅記錄退款申請狀態。
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={saveRefund} disabled={savingRefund} style={{ padding: '10px 32px', background: '#c0392b', color: '#fff', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: savingRefund ? 0.6 : 1 }}>
                  {savingRefund ? '處理中...' : '確認退款申請'}
                </button>
                <button onClick={() => setShowRefund(false)} style={{ padding: '10px 32px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
