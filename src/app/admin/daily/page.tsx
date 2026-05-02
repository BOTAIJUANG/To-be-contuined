'use client';

// app/admin/daily/page.tsx  ──  當日 / 隔日 / 任意日期儀表板

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import s from '../_shared/admin-shared.module.css';
import p from './daily.module.css';
import AdminDatePicker from '../_shared/AdminDatePicker';

const STATUS_LABEL: Record<string, string> = { processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消' };
const STATUS_COLOR: Record<string, string> = { processing: '#b87a2a', shipped: '#2a7ab8', done: '#2ab85a', cancelled: '#888580' };
const SHIP_LABEL: Record<string, string> = {
  home_ambient: '宅配（常溫）', home_refrigerated: '宅配（冷藏）', home_frozen: '宅配（冷凍）',
  cvs_ambient: '7-11取貨（常溫）', cvs_frozen: '7-11取貨（冷凍）', store: '門市自取',
  home: '宅配', cvs_711: '7-11取貨',
};

interface PrepRow { total: number; variants: { name: string; qty: number }[] }

function buildPrepList(orders: any[]) {
  const prepMap: Record<string, PrepRow> = {};
  orders.forEach(o => {
    (o.order_items ?? []).forEach((item: any) => {
      const name = item.product_name_snapshot ?? item.name;
      if (!prepMap[name]) prepMap[name] = { total: 0, variants: [] };
      prepMap[name].total += item.qty;
      if (item.variant_name_snapshot) {
        const vn = item.variant_name_snapshot;
        const existing = prepMap[name].variants.find(v => v.name === vn);
        if (existing) existing.qty += item.qty;
        else prepMap[name].variants.push({ name: vn, qty: item.qty });
      }
    });
  });
  return Object.entries(prepMap).sort(([a], [b]) => a.localeCompare(b, 'zh-TW'));
}

export default function AdminDailyPage() {
  const router  = useRouter();
  const twFmt   = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d);
  const today   = twFmt(new Date());
  const tomorrow = twFmt(new Date(Date.now() + 86400000));

  const [tab, setTab] = useState<'today' | 'tomorrow' | 'custom'>('today');
  const [customDate,    setCustomDate]    = useState(today);
  const [customLoading, setCustomLoading] = useState(false);

  const [todayOrders,    setTodayOrders]    = useState<any[]>([]);
  const [tomorrowOrders, setTomorrowOrders] = useState<any[]>([]);
  const [customOrders,   setCustomOrders]   = useState<any[]>([]);
  const [lowStockItems,  setLowStockItems]  = useState<any[]>([]);
  const [lowIngredients, setLowIngredients] = useState<any[]>([]);
  const [expandedOrder,  setExpandedOrder]  = useState<number | null>(null);
  const [loading,        setLoading]        = useState(true);

  const orderQuery = (date: string) =>
    supabase
      .from('orders')
      .select('*, order_items(name, qty, price, variant_name_snapshot, product_name_snapshot)')
      .eq('ship_date', date)
      .eq('pay_status', 'paid')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

  useEffect(() => {
    const load = async () => {
      const [{ data: tod }, { data: tmr }, { data: invData }, { data: ingData }] = await Promise.all([
        orderQuery(today),
        orderQuery(tomorrow),
        supabase.from('inventory').select('*, products(name, is_preorder)').gt('safety_stock', 0),
        supabase.from('ingredients').select('id, name, stock, safety_stock, unit').gt('safety_stock', 0),
      ]);

      setTodayOrders(tod ?? []);
      setTomorrowOrders(tmr ?? []);

      const low = (invData ?? []).filter((i: any) => {
        if (i.inventory_mode !== 'stock') return false;
        if (i.products?.is_preorder) return false;
        return (i.stock - i.reserved) <= i.safety_stock;
      });
      setLowStockItems(low);
      setLowIngredients((ingData ?? []).filter((i: any) => Number(i.stock) <= Number(i.safety_stock)));
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (tab !== 'custom' || !customDate) return;
    const load = async () => {
      setCustomLoading(true);
      const { data } = await orderQuery(customDate);
      setCustomOrders(data ?? []);
      setCustomLoading(false);
    };
    load();
  }, [tab, customDate]);

  const orders   = tab === 'today' ? todayOrders : tab === 'tomorrow' ? tomorrowOrders : customOrders;
  const dateStr  = tab === 'today' ? today : tab === 'tomorrow' ? tomorrow : customDate;
  const dayLabel = tab === 'today' ? '今日' : tab === 'tomorrow' ? '明日' : customDate;

  const totalQty     = orders.reduce((sum, o) => sum + (o.order_items?.reduce((q: number, i: any) => q + i.qty, 0) ?? 0), 0);
  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const pendingShip  = orders.filter(o => o.status === 'processing').length;
  const prepList     = buildPrepList(orders);

  if (loading) return <p className={s.loadingText}>載入中...</p>;

  return (
    <div>
      <h1 className={s.pageTitle}>當日儀表板</h1>

      {/* ── Tab 切換 ── */}
      <div className={s.tabBar}>
        <div className={tab === 'today'    ? s.tabActive : s.tab} onClick={() => { setTab('today');    setExpandedOrder(null); }}>當日總覽</div>
        <div className={tab === 'tomorrow' ? s.tabActive : s.tab} onClick={() => { setTab('tomorrow'); setExpandedOrder(null); }}>隔日總覽</div>
        <div className={tab === 'custom'   ? s.tabActive : s.tab} onClick={() => { setTab('custom');   setExpandedOrder(null); }}>任意日期</div>
      </div>

      {tab === 'custom' ? (
        <div className={p.customDateRow}>
          <span className={p.customDateLabel}>查詢出貨日期</span>
          <AdminDatePicker value={customDate} onChange={val => { setCustomDate(val); setExpandedOrder(null); }} />
        </div>
      ) : (
        <p className={p.dateLabel}>{dateStr}</p>
      )}

      {customLoading && <p className={s.loadingText}>載入中...</p>}
      {!customLoading && tab === 'custom' && <p className={p.dateLabel}>{customDate}</p>}

      {/* ── 低庫存警示（共用） ── */}
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
          { label: `${dayLabel}出貨單數`,    value: orders.length,   alert: false, onClick: undefined },
          { label: '待出貨（已付款）',        value: pendingShip,     alert: pendingShip > 0, onClick: () => router.push('/admin/orders?pay=paid&status=processing') },
          { label: `${dayLabel}總件數`,      value: totalQty,        alert: false, onClick: undefined },
          { label: `${dayLabel}營收`,        value: `NT$ ${totalRevenue.toLocaleString()}`, alert: false, onClick: undefined },
        ].map(({ label, value, alert, onClick }) => (
          <div key={label} className={`${s.statCard} ${alert ? p.statCardAlert : ''}`} onClick={onClick ?? undefined}>
            <div className={s.statLabel}>
              {label} {onClick && <span className={p.statArrow}>→</span>}
            </div>
            <div className={`${s.statValue} ${alert ? p.statValueAlert : ''}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── 商品小計 ── */}
      {prepList.length > 0 && (
        <>
          <div className={s.sectionTitle}>{dayLabel}需備料</div>
          <div className={p.prepSection}>
            {prepList.map(([name, row]) => (
              <div key={name} className={p.prepRow}>
                <span className={p.prepName}>{name}</span>
                {row.variants.length > 0 && (
                  <span className={p.prepVariants}>
                    {row.variants.map(v => `${v.name} × ${v.qty}`).join('、')}
                  </span>
                )}
                <span className={p.prepTotal}>
                  <span className={p.prepQty}>{row.total}</span>
                  <span className={p.prepUnit}>件</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── 訂單列表 ── */}
      <div className={s.sectionTitle}>{dayLabel}出貨單明細</div>
      <div className={`${s.tableWrap} ${p.tableBlock}`}>
        {orders.length === 0 ? (
          <p className={p.emptyMsg}>{dayLabel}無出貨訂單</p>
        ) : orders.map((order, i) => (
          <div key={order.id} className={i < orders.length - 1 ? p.orderBorder : undefined}>
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
