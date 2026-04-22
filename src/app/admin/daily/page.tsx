'use client';

// app/admin/daily/page.tsx  ──  當日儀表板

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import s from '../_shared/admin-shared.module.css';
import p from './daily.module.css';

const STATUS_LABEL: Record<string, string> = { processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消' };
const STATUS_COLOR: Record<string, string> = { processing: '#b87a2a', shipped: '#2a7ab8', done: '#2ab85a', cancelled: '#888580' };
const SHIP_LABEL: Record<string, string> = {
  home_ambient: '宅配（常溫）', home_refrigerated: '宅配（冷藏）', home_frozen: '宅配（冷凍）',
  cvs_ambient: '7-11取貨（常溫）', cvs_frozen: '7-11取貨（冷凍）', store: '門市自取',
  home: '宅配', cvs_711: '7-11取貨',
};

export default function AdminDailyPage() {
  const router = useRouter();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());

  const [orders,         setOrders]         = useState<any[]>([]);
  const [expandedOrder,  setExpandedOrder]  = useState<number | null>(null);
  const [lowStockItems,  setLowStockItems]  = useState<any[]>([]);
  const [lowIngredients, setLowIngredients] = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: todayOrders }, { data: invData }, { data: ingData }] = await Promise.all([
        supabase
          .from('orders')
          .select('*, order_items(name, qty, price, variant_name_snapshot, product_name_snapshot)')
          .eq('ship_date', today)
          .eq('pay_status', 'paid')
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false }),
        supabase.from('inventory').select('*, products(name, is_preorder)').gt('safety_stock', 0),
        supabase.from('ingredients').select('id, name, stock, safety_stock, unit').gt('safety_stock', 0),
      ]);

      setOrders(todayOrders ?? []);

      // 排除預購商品與預購模式；兩者皆由預購系統管理
      const low = (invData ?? []).filter((i: any) => {
        if (i.inventory_mode !== 'stock') return false;
        if (i.products?.is_preorder) return false;
        return (i.stock - i.reserved) <= i.safety_stock;
      });
      setLowStockItems(low);

      const lowIng = (ingData ?? []).filter((i: any) => Number(i.stock) <= Number(i.safety_stock));
      setLowIngredients(lowIng);

      setLoading(false);
    };
    load();
  }, []);

  // 統計
  const totalQty    = orders.reduce((sum, o) => sum + (o.order_items?.reduce((q: number, i: any) => q + i.qty, 0) ?? 0), 0);
  const totalRevenue = orders.filter(o => o.pay_status === 'paid').reduce((sum, o) => sum + o.total, 0);
  const pendingShip  = orders.filter(o => o.status === 'processing' && o.pay_status === 'paid').length;

  // 各商品小計
  const productSummary: Record<string, number> = {};
  orders.forEach(o => {
    (o.order_items ?? []).forEach((item: any) => {
      const name = item.product_name_snapshot ?? item.name;
      const key  = item.variant_name_snapshot ? `${name} · ${item.variant_name_snapshot}` : name;
      productSummary[key] = (productSummary[key] ?? 0) + item.qty;
    });
  });

  if (loading) return <p className={s.loadingText}>載入中...</p>;

  return (
    <div>
      <h1 className={s.pageTitle}>當日儀表板</h1>
      <p className={p.dateLabel}>{today}</p>

      {/* ── 低庫存警示 ── */}
      {lowStockItems.length > 0 && (
        <div className={s.warningBar}>
          <div className={p.warningTitle}>商品庫存警示</div>
          {lowStockItems.map((item: any) => {
            const available = item.stock - item.reserved;
            return (
              <div key={item.id} className={p.warningItem}>
                <span onClick={() => router.push('/admin/inventory')} className={p.warningLink}>
                  {item.products?.name}
                </span>
                已低於安全庫存（剩餘 {available} 件，安全庫存 {item.safety_stock} 件）
              </div>
            );
          })}
        </div>
      )}

      {lowIngredients.length > 0 && (
        <div className={s.warningBar}>
          <div className={p.warningTitle}>原料庫存警示</div>
          {lowIngredients.map((ing: any) => (
            <div key={ing.id} className={p.warningItem}>
              <span onClick={() => router.push('/admin/inventory?tab=ingredient')} className={p.warningLink}>
                {ing.name}
              </span>
              已低於安全庫存（剩餘 {ing.stock} {ing.unit}，安全庫存 {ing.safety_stock} {ing.unit}）
            </div>
          ))}
        </div>
      )}

      {/* ── 統計卡片 ── */}
      <div className={s.statGrid}>
        {[
          { label: '今日出貨單數', value: orders.length, onClick: undefined },
          { label: '待出貨（已付款）', value: pendingShip, alert: pendingShip > 0, onClick: () => router.push('/admin/orders') },
          { label: '今日總件數',   value: totalQty, onClick: undefined },
          { label: '今日營收',     value: `NT$ ${totalRevenue.toLocaleString()}`, onClick: undefined },
        ].map(({ label, value, alert, onClick }) => (
          <div key={label} className={`${s.statCard} ${alert ? p.statCardAlert : ''}`} onClick={onClick}>
            <div className={s.statLabel}>
              {label} {onClick && <span className={p.statArrow}>→</span>}
            </div>
            <div className={`${s.statValue} ${alert ? p.statValueAlert : ''}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── 商品小計 ── */}
      {Object.keys(productSummary).length > 0 && (
        <>
          <div className={s.sectionTitle}>今日需備料</div>
          <div className={p.prepSection}>
            {Object.entries(productSummary).map(([name, qty]) => (
              <div key={name} className={p.prepItem}>
                <span className={p.prepName}>{name}</span>
                <span className={p.prepQty}>{qty}</span>
                <span className={p.prepUnit}>件</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── 今日訂單列表 ── */}
      <div className={s.sectionTitle}>今日出貨單明細</div>
      <div className={`${s.tableWrap} ${p.tableBlock}`}>
        {orders.length === 0 ? (
          <p className={p.emptyMsg}>今日無出貨訂單</p>
        ) : orders.map((order, i) => (
          <div key={order.id} className={i < orders.length - 1 ? p.orderBorder : undefined}>
            {/* 訂單標題列 */}
            <div
              onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
              className={p.orderHeader}
            >
              <div className={p.orderMeta}>
                <span className={p.orderNo}>{order.order_no}</span>
                <span className={p.buyerName}>{order.customer_name ?? order.buyer_name}</span>
                <span className={p.shipLabel}>{SHIP_LABEL[order.ship_method] ?? order.ship_method}</span>
                <span className={s.badge} style={{ color: STATUS_COLOR[order.status], border: `1px solid ${STATUS_COLOR[order.status]}` }}>
                  {STATUS_LABEL[order.status]}
                </span>
                {order.pay_status !== 'paid' && (
                  <span className={`${s.badge} ${p.badgeUnpaid}`}>未付款</span>
                )}
              </div>
              <div className={`${s.flex} ${s.itemsCenter} ${s.gap16}`}>
                <span className={p.orderTotal}>NT$ {order.total.toLocaleString()}</span>
                <span className={p.toggleIcon}>{expandedOrder === order.id ? '▲' : '▼'}</span>
              </div>
            </div>
            {/* 展開明細 */}
            {expandedOrder === order.id && (
              <div className={p.orderExpanded}>
                <div className={p.orderDetail}>
                  <div><span className={p.detailLabel}>收件人：</span>{order.customer_name ?? order.buyer_name}</div>
                  <div><span className={p.detailLabel}>收件電話：</span>{order.customer_phone ?? order.buyer_phone}</div>
                  <div><span className={p.detailLabel}>收件 Email：</span>{order.customer_email ?? order.buyer_email}</div>
                  {order.customer_name && order.customer_name !== order.buyer_name && (
                    <div><span className={p.detailLabel}>購買人：</span>{order.buyer_name}（{order.buyer_phone}）</div>
                  )}
                  {order.address && <div className={p.detailFullWidth}><span className={p.detailLabel}>地址：</span>{order.address}</div>}
                  {order.note    && <div className={p.detailFullWidth}><span className={p.detailLabel}>備註：</span>{order.note}</div>}
                </div>
                <div className={p.itemListGrid}>
                  {order.order_items?.map((item: any, j: number) => (
                    <div key={j} className={p.orderItem}>
                      <span>{item.product_name_snapshot ?? item.name}{item.variant_name_snapshot ? ` · ${item.variant_name_snapshot}` : ''} × {item.qty}</span>
                      <span>NT$ {((item.unit_price ?? item.price) * item.qty).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className={p.orderFooter}>
                  <span onClick={() => router.push('/admin/orders')} className={p.orderLink}>
                    前往訂單管理 →
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
