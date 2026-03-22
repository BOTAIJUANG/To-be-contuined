'use client';

// ════════════════════════════════════════════════
// components/OrderDrawer.tsx  ──  訂單詳細抽屜
//
// 點擊訂單後從右側滑出，顯示完整訂單資訊
// ════════════════════════════════════════════════

import { useEffect } from 'react';

const STATUS_LABEL: Record<string, string> = { processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消' };
const STATUS_COLOR: Record<string, string> = { processing: '#b87a2a', shipped: '#2a7ab8', done: '#2ab85a', cancelled: '#888580' };
const PAY_LABEL: Record<string, string>    = { pending: '待付款', paid: '已付款', failed: '付款失敗' };
const PAY_COLOR: Record<string, string>    = { pending: '#b87a2a', paid: '#2ab85a', failed: '#c0392b' };
const SHIP_LABEL: Record<string, string>   = { home_normal: '一般宅配', home_cold: '低溫宅配', cvs_711: '7-11取貨', cvs_family: '全家取貨', store: '門市自取' };

interface OrderDrawerProps {
  order: any | null;
  onClose: () => void;
  onStatusChange: (orderId: number, field: string, value: string) => void;
}

export default function OrderDrawer({ order, onClose, onStatusChange }: OrderDrawerProps) {
  // 按 ESC 關閉
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #E8E4DC', fontSize: '13px' };
  const selectStyle: React.CSSProperties = { padding: '5px 8px', border: '1px solid #E8E4DC', background: '#fff', fontSize: '12px', outline: 'none', cursor: 'pointer' };

  return (
    <>
      {/* 遮罩 */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300, opacity: order ? 1 : 0, pointerEvents: order ? 'auto' : 'none', transition: 'opacity 0.3s' }}
      />

      {/* 抽屜 */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '480px', maxWidth: '90vw',
        background: '#F7F4EF', zIndex: 301,
        transform: order ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
      }}>
        {order && (
          <>
            {/* 抽屜標題 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC', background: '#fff' }}>
              <div>
                <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '9px', letterSpacing: '0.3em', color: '#888580', textTransform: 'uppercase', marginBottom: '4px' }}>訂單詳細</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1E1C1A', fontFamily: '"Montserrat", sans-serif' }}>{order.order_no}</div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888580', padding: '4px 8px' }}>×</button>
            </div>

            {/* 抽屜內容（可捲動）*/}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

              {/* 狀態徽章 */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
                <span style={{ fontSize: '11px', color: STATUS_COLOR[order.status], border: `1px solid ${STATUS_COLOR[order.status]}`, padding: '4px 12px', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.1em' }}>
                  {STATUS_LABEL[order.status]}
                </span>
                <span style={{ fontSize: '11px', color: PAY_COLOR[order.pay_status], border: `1px solid ${PAY_COLOR[order.pay_status]}`, padding: '4px 12px', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.1em' }}>
                  {PAY_LABEL[order.pay_status]}
                </span>
              </div>

              {/* 買家資訊 */}
              <div style={{ background: '#fff', padding: '16px 20px', marginBottom: '16px' }}>
                <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', marginBottom: '12px' }}>買家資訊</div>
                {[
                  { label: '姓名', value: order.buyer_name },
                  { label: '電話', value: order.buyer_phone },
                  { label: 'Email', value: order.buyer_email },
                ].map(({ label, value }) => (
                  <div key={label} style={rowStyle}>
                    <span style={{ color: '#888580' }}>{label}</span>
                    <span style={{ color: '#1E1C1A' }}>{value ?? '—'}</span>
                  </div>
                ))}
              </div>

              {/* 配送資訊 */}
              <div style={{ background: '#fff', padding: '16px 20px', marginBottom: '16px' }}>
                <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', marginBottom: '12px' }}>配送資訊</div>
                {[
                  { label: '配送方式', value: SHIP_LABEL[order.ship_method] ?? order.ship_method },
                  { label: '收件地址', value: order.address || '—' },
                  { label: '指定出貨日', value: order.ship_date || '—' },
                  { label: '物流業者', value: order.carrier || '—' },
                  { label: '追蹤號碼', value: order.tracking_no || '—' },
                  { label: '實際出貨', value: order.shipped_at ? new Date(order.shipped_at).toLocaleDateString('zh-TW') : '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={rowStyle}>
                    <span style={{ color: '#888580' }}>{label}</span>
                    <span style={{ color: '#1E1C1A', textAlign: 'right', maxWidth: '240px' }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* 商品明細 */}
              <div style={{ background: '#fff', padding: '16px 20px', marginBottom: '16px' }}>
                <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', marginBottom: '12px' }}>商品明細</div>
                {order.order_items?.map((item: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #E8E4DC', fontSize: '13px' }}>
                    <span style={{ color: '#1E1C1A' }}>{item.name} × {item.qty}</span>
                    <span style={{ color: '#555250' }}>NT$ {(item.price * item.qty).toLocaleString()}</span>
                  </div>
                ))}
                {[
                  { label: '小計', value: `NT$ ${order.subtotal?.toLocaleString() ?? order.total.toLocaleString()}` },
                  ...(order.discount > 0 ? [{ label: '折扣', value: `− NT$ ${order.discount.toLocaleString()}` }] : []),
                  { label: '運費', value: '依配送方式計算' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '12px', color: '#888580' }}>
                    <span>{label}</span><span>{value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: '15px', fontWeight: 700, color: '#1E1C1A', borderTop: '2px solid #E8E4DC', marginTop: '4px' }}>
                  <span>應付金額</span>
                  <span style={{ color: '#b35252' }}>NT$ {order.total.toLocaleString()}</span>
                </div>
              </div>

              {/* 其他資訊 */}
              <div style={{ background: '#fff', padding: '16px 20px', marginBottom: '16px' }}>
                <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', marginBottom: '12px' }}>其他資訊</div>
                {[
                  { label: '下單時間', value: new Date(order.created_at).toLocaleString('zh-TW') },
                  { label: '折扣碼', value: order.coupon_code || '—' },
                  { label: '備註', value: order.note || '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={rowStyle}>
                    <span style={{ color: '#888580' }}>{label}</span>
                    <span style={{ color: '#1E1C1A', textAlign: 'right', maxWidth: '240px' }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* 快速操作 */}
              <div style={{ background: '#fff', padding: '16px 20px' }}>
                <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', marginBottom: '12px' }}>快速操作</div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#888580', display: 'block', marginBottom: '6px' }}>配送狀態</label>
                    {order.status === 'cancelled' ? (
                      <span style={{ display: 'inline-block', padding: '6px 14px', fontSize: '12px', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif' }}>已取消</span>
                    ) : (
                      <select value={order.status} onChange={e => onStatusChange(order.id, 'status', e.target.value)} style={{ ...selectStyle, color: STATUS_COLOR[order.status] }}>
                        {[{ value: 'processing', label: '處理中' }, { value: 'shipped', label: '已出貨' }, { value: 'done', label: '已完成' }].map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#888580', display: 'block', marginBottom: '6px' }}>付款狀態（由金流系統自動更新）</label>
                    {/* 付款狀態由綠界 ECPay webhook 自動更新，不給手動改 */}
                    <span style={{
                      display: 'inline-block',
                      padding: '6px 14px',
                      fontSize: '12px',
                      color: PAY_COLOR[order.pay_status] ?? '#888580',
                      border: `1px solid ${PAY_COLOR[order.pay_status] ?? '#E8E4DC'}`,
                      fontFamily: '"Montserrat", sans-serif',
                      letterSpacing: '0.1em',
                    }}>
                      {PAY_LABEL[order.pay_status] ?? order.pay_status}
                    </span>
                    {order.ecpay_trade_no && (
                      <div style={{ fontSize: '11px', color: '#888580', marginTop: '6px' }}>
                        綠界交易號：{order.ecpay_trade_no}
                      </div>
                    )}
                    {order.paid_at && (
                      <div style={{ fontSize: '11px', color: '#888580', marginTop: '2px' }}>
                        付款時間：{new Date(order.paid_at).toLocaleString('zh-TW')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
