'use client';

// ════════════════════════════════════════════════
// components/OrderDrawer.tsx  ──  訂單詳細抽屜
//
// 點擊訂單後從右側滑出，顯示完整訂單資訊
// ════════════════════════════════════════════════

import { useEffect } from 'react';
import s from './OrderDrawer.module.css';

const STATUS_LABEL: Record<string, string> = { processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消' };
const STATUS_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  processing: { bg: '#f5ede7', border: '#e4d2c4', color: '#7a5846' },
  shipped:    { bg: '#edf3f5', border: '#c8d8e0', color: '#5a7a8a' },
  done:       { bg: '#ebf5ef', border: '#cfe4d4', color: '#4a7a56' },
  cancelled:  { bg: '#f5f0ea', border: '#e7ddd0', color: '#8b7d70' },
};
const PAY_LABEL: Record<string, string>    = { pending: '待付款', paid: '已付款', failed: '付款失敗' };
const PAY_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  pending: { bg: '#f8f1e2', border: '#ead8aa', color: '#8b6722' },
  paid:    { bg: '#ebf5ef', border: '#cfe4d4', color: '#4a7a56' },
  failed:  { bg: '#fcf1ef', border: '#e8b5a8', color: '#b55245' },
};
const SHIP_LABEL: Record<string, string>   = { home: '一般宅配', cvs_711: '7-11取貨', store: '門市自取', home_normal: '一般宅配', home_cold: '低溫宅配', cvs_family: '全家取貨' };

const FALLBACK_STYLE = { bg: '#f5f0ea', border: '#e7ddd0', color: '#8b7d70' };

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

  const ss = STATUS_STYLE[order?.status] ?? FALLBACK_STYLE;
  const ps = PAY_STYLE[order?.pay_status] ?? FALLBACK_STYLE;

  return (
    <>
      {/* 遮罩 */}
      <div
        onClick={onClose}
        className={`${s.overlay} ${order ? s.overlayOpen : ''}`}
      />

      {/* 抽屜 */}
      <div className={`${s.drawer} ${order ? s.drawerOpen : ''}`}>
        {order && (
          <>
            {/* 頂部摘要區 */}
            <div className={s.header}>
              <div>
                <div className={s.headerOrderNo}>{order.order_no}</div>
                <div className={s.headerBadges}>
                  <span className={s.badge} style={{ background: ss.bg, borderColor: ss.border, color: ss.color }}>
                    {STATUS_LABEL[order.status]}
                  </span>
                  <span className={s.badge} style={{ background: ps.bg, borderColor: ps.border, color: ps.color }}>
                    {PAY_LABEL[order.pay_status] ?? order.pay_status}
                  </span>
                </div>
                <div className={s.headerTotal}>NT$ {order.total.toLocaleString()}</div>
              </div>
              <button onClick={onClose} className={s.closeBtn}>×</button>
            </div>

            {/* 抽屜內容（可捲動）*/}
            <div className={s.body}>

              {/* 買家資訊 */}
              <div className={s.section}>
                <div className={s.sectionTitle}>買家資訊</div>
                {[
                  { label: '姓名', value: order.buyer_name },
                  { label: '電話', value: order.buyer_phone },
                  { label: 'Email', value: order.buyer_email },
                ].map(({ label, value }) => (
                  <div key={label} className={s.row}>
                    <span className={s.rowLabel}>{label}</span>
                    <span className={s.rowValue}>{value ?? '—'}</span>
                  </div>
                ))}
              </div>

              {/* 配送資訊 */}
              <div className={s.section}>
                <div className={s.sectionTitle}>配送資訊</div>
                {[
                  { label: '配送方式', value: SHIP_LABEL[order.ship_method] ?? order.ship_method },
                  { label: '收件地址', value: order.address || '—' },
                  { label: order.ship_method === 'store' ? '指定到店日' : '指定出貨日', value: order.ship_date || '—' },
                  { label: '物流業者', value: order.carrier || '—' },
                  { label: '追蹤號碼', value: order.tracking_no || '—' },
                  { label: '實際出貨', value: order.shipped_at ? new Date(order.shipped_at).toLocaleDateString('zh-TW') : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className={s.row}>
                    <span className={s.rowLabel}>{label}</span>
                    <span className={s.rowValue}>{value}</span>
                  </div>
                ))}
              </div>

              {/* 商品明細 */}
              <div className={s.section}>
                <div className={s.sectionTitle}>商品明細</div>
                {order.order_items?.map((item: any, i: number) => (
                  <div key={i} className={s.productRow}>
                    <span className={s.productName}>{item.name} × {item.qty}</span>
                    <span className={s.productPrice}>NT$ {(item.price * item.qty).toLocaleString()}</span>
                  </div>
                ))}
                {[
                  { label: '小計', value: `NT$ ${order.subtotal?.toLocaleString() ?? order.total.toLocaleString()}` },
                  ...(order.discount > 0 ? [{ label: '折扣', value: `− NT$ ${order.discount.toLocaleString()}` }] : []),
                  { label: '運費', value: '依配送方式計算' },
                ].map(({ label, value }) => (
                  <div key={label} className={s.subtotalRow}>
                    <span>{label}</span><span>{value}</span>
                  </div>
                ))}
                <div className={s.totalRow}>
                  <span className={s.totalLabel}>應付金額</span>
                  <span className={s.totalPrice}>NT$ {order.total.toLocaleString()}</span>
                </div>
              </div>

              {/* 其他資訊 */}
              <div className={s.section}>
                <div className={s.sectionTitle}>其他資訊</div>
                {[
                  { label: '下單時間', value: new Date(order.created_at).toLocaleString('zh-TW') },
                  { label: '折扣碼', value: order.coupon_code || '—' },
                  { label: '備註', value: order.note || '—' },
                ].map(({ label, value }) => (
                  <div key={label} className={s.row}>
                    <span className={s.rowLabel}>{label}</span>
                    <span className={s.rowValue}>{value}</span>
                  </div>
                ))}
              </div>

              {/* 快速操作 */}
              <div className={s.section}>
                <div className={s.sectionTitle}>快速操作</div>
                <div className={s.actionsWrap}>
                  <div className={s.actionGroup}>
                    <label className={s.actionLabel}>配送狀態</label>
                    {order.status === 'cancelled' ? (
                      <span className={s.statusFixed}>已取消</span>
                    ) : (
                      <select value={order.status} onChange={e => onStatusChange(order.id, 'status', e.target.value)} className={s.select} style={{ color: ss.color }}>
                        {[{ value: 'processing', label: '處理中' }, { value: 'shipped', label: '已出貨' }, { value: 'done', label: '已完成' }].map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className={s.actionGroup}>
                    <label className={s.actionLabel}>付款狀態（由金流系統自動更新）</label>
                    <span
                      className={s.payStatusBadge}
                      style={{ background: ps.bg, borderColor: ps.border, color: ps.color, border: `1px solid ${ps.border}` }}
                    >
                      {PAY_LABEL[order.pay_status] ?? order.pay_status}
                    </span>
                    {order.ecpay_trade_no && (
                      <div className={s.tradeInfo}>
                        綠界交易號：{order.ecpay_trade_no}
                      </div>
                    )}
                    {order.paid_at && (
                      <div className={s.tradeInfoSub}>
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
