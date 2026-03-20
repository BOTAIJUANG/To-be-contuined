'use client';

// app/admin/daily/page.tsx  ──  當日儀表板

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STATUS_LABEL: Record<string, string> = { processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消' };
const STATUS_COLOR: Record<string, string> = { processing: '#b87a2a', shipped: '#2a7ab8', done: '#2ab85a', cancelled: '#888580' };
const SHIP_LABEL: Record<string, string>   = { home_normal: '一般宅配', home_cold: '低溫宅配', cvs_711: '7-11', cvs_family: '全家', store: '門市自取' };

export default function AdminDailyPage() {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];

  const [orders,         setOrders]         = useState<any[]>([]);
  const [expandedOrder,  setExpandedOrder]  = useState<number | null>(null);
  const [lowStockItems,  setLowStockItems]  = useState<any[]>([]);
  const [lowIngredients, setLowIngredients] = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: todayOrders }, { data: invData }, { data: ingData }] = await Promise.all([
        // 今日出貨訂單（指定出貨日是今天，且未取消）
        supabase
          .from('orders')
          .select('*, order_items(name, qty, price, variant_name_snapshot, product_name_snapshot)')
          .eq('ship_date', today)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false }),
        // 低庫存商品
        supabase.from('inventory').select('*, products(name)').gt('safety_stock', 0),
        // 低庫存原料
        supabase.from('ingredients').select('id, name, stock, safety_stock, unit').gt('safety_stock', 0),
      ]);

      setOrders(todayOrders ?? []);

      const low = (invData ?? []).filter((i: any) => {
        const available = i.inventory_mode === 'stock' ? i.stock - i.reserved : i.max_preorder - i.reserved_preorder;
        return available <= i.safety_stock;
      });
      setLowStockItems(low);

      const lowIng = (ingData ?? []).filter((i: any) => Number(i.stock) <= Number(i.safety_stock));
      setLowIngredients(lowIng);

      setLoading(false);
    };
    load();
  }, []);

  // 統計
  const totalQty    = orders.reduce((s, o) => s + (o.order_items?.reduce((q: number, i: any) => q + i.qty, 0) ?? 0), 0);
  const totalRevenue = orders.filter(o => o.pay_status === 'paid').reduce((s, o) => s + o.total, 0);
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

  if (loading) return <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p>;

  return (
    <div>
      <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: '0 0 8px' }}>當日儀表板</h1>
      <p style={{ fontSize: '12px', color: '#888580', marginBottom: '28px', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.1em' }}>{today}</p>

      {/* ── 低庫存警示 ── */}
      {lowStockItems.length > 0 && (
        <div style={{ background: '#fef0e8', border: '1px solid #e8a87c', padding: '14px 20px', marginBottom: '16px', fontSize: '13px', color: '#7a3c00' }}>
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>⚠️ 商品庫存警示</div>
          {lowStockItems.map((item: any) => {
            const available = item.inventory_mode === 'stock' ? item.stock - item.reserved : item.max_preorder - item.reserved_preorder;
            return (
              <div key={item.id} style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span onClick={() => router.push('/admin/inventory')} style={{ color: '#c0392b', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>
                  {item.products?.name}
                </span>
                已低於安全庫存（剩餘 {available} 件，安全庫存 {item.safety_stock} 件）
              </div>
            );
          })}
        </div>
      )}

      {lowIngredients.length > 0 && (
        <div style={{ background: '#fef0e8', border: '1px solid #e8a87c', padding: '14px 20px', marginBottom: '16px', fontSize: '13px', color: '#7a3c00' }}>
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>⚠️ 原料庫存警示</div>
          {lowIngredients.map((ing: any) => (
            <div key={ing.id} style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span onClick={() => router.push('/admin/inventory?tab=ingredient')} style={{ color: '#c0392b', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>
                {ing.name}
              </span>
              已低於安全庫存（剩餘 {ing.stock} {ing.unit}，安全庫存 {ing.safety_stock} {ing.unit}）
            </div>
          ))}
        </div>
      )}

      {/* ── 統計卡片 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: '今日出貨單數', value: orders.length, onClick: undefined },
          { label: '待出貨（已付款）', value: pendingShip, alert: pendingShip > 0, onClick: () => router.push('/admin/orders') },
          { label: '今日總件數',   value: totalQty, onClick: undefined },
          { label: '今日營收',     value: `NT$ ${totalRevenue.toLocaleString()}`, onClick: undefined },
        ].map(({ label, value, alert, onClick }) => (
          <div key={label} onClick={onClick} style={{ background: '#fff', border: `1px solid ${alert ? '#f0c040' : '#E8E4DC'}`, padding: '20px 24px', cursor: onClick ? 'pointer' : 'default' }}>
            <div style={{ fontSize: '11px', color: '#888580', letterSpacing: '0.15em', marginBottom: '10px', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase' }}>
              {label} {onClick && <span style={{ fontSize: '10px' }}>→</span>}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: alert ? '#c0392b' : '#1E1C1A' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── 商品小計 ── */}
      {Object.keys(productSummary).length > 0 && (
        <>
          <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#555250', marginBottom: '12px', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif' }}>今日需備料</div>
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '16px 20px', marginBottom: '28px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {Object.entries(productSummary).map(([name, qty]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: '#1E1C1A' }}>{name}</span>
                <span style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '18px', fontWeight: 700, color: '#b35252' }}>{qty}</span>
                <span style={{ fontSize: '11px', color: '#888580' }}>件</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── 今日訂單列表 ── */}
      <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#555250', marginBottom: '12px', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif' }}>今日出貨單明細</div>
      <div style={{ background: '#fff', border: '1px solid #E8E4DC' }}>
        {orders.length === 0 ? (
          <p style={{ padding: '24px', color: '#888580', fontSize: '13px' }}>今日無出貨訂單</p>
        ) : orders.map((order, i) => (
          <div key={order.id} style={{ borderBottom: i < orders.length - 1 ? '1px solid #E8E4DC' : 'none' }}>
            {/* 訂單標題列 */}
            <div
              onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, color: '#1E1C1A' }}>{order.order_no}</span>
                <span style={{ fontSize: '13px', color: '#1E1C1A' }}>{order.buyer_name}</span>
                <span style={{ fontSize: '12px', color: '#888580' }}>{SHIP_LABEL[order.ship_method] ?? order.ship_method}</span>
                <span style={{ fontSize: '11px', color: STATUS_COLOR[order.status], border: `1px solid ${STATUS_COLOR[order.status]}`, padding: '2px 8px', fontFamily: '"Montserrat", sans-serif' }}>
                  {STATUS_LABEL[order.status]}
                </span>
                {order.pay_status !== 'paid' && (
                  <span style={{ fontSize: '11px', color: '#c0392b', border: '1px solid #c0392b', padding: '2px 8px', fontFamily: '"Montserrat", sans-serif' }}>未付款</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '13px', color: '#1E1C1A', fontWeight: 500 }}>NT$ {order.total.toLocaleString()}</span>
                <span style={{ fontSize: '12px', color: '#888580' }}>{expandedOrder === order.id ? '▲' : '▼'}</span>
              </div>
            </div>
            {/* 展開明細 */}
            {expandedOrder === order.id && (
              <div style={{ padding: '0 20px 16px', borderTop: '1px solid #E8E4DC', background: '#F7F4EF' }}>
                <div style={{ paddingTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 32px', fontSize: '12px', color: '#555250', marginBottom: '12px' }}>
                  <div><span style={{ color: '#888580' }}>電話：</span>{order.buyer_phone}</div>
                  <div><span style={{ color: '#888580' }}>Email：</span>{order.buyer_email}</div>
                  {order.address && <div style={{ gridColumn: '1/-1' }}><span style={{ color: '#888580' }}>地址：</span>{order.address}</div>}
                  {order.note    && <div style={{ gridColumn: '1/-1' }}><span style={{ color: '#888580' }}>備註：</span>{order.note}</div>}
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                  {order.order_items?.map((item: any, j: number) => (
                    <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1E1C1A', padding: '6px 0', borderBottom: '1px solid #E8E4DC' }}>
                      <span>{item.product_name_snapshot ?? item.name}{item.variant_name_snapshot ? ` · ${item.variant_name_snapshot}` : ''} × {item.qty}</span>
                      <span>NT$ {((item.unit_price ?? item.price) * item.qty).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '12px', textAlign: 'right' }}>
                  <span onClick={() => router.push('/admin/orders')} style={{ fontSize: '12px', color: '#1E1C1A', textDecoration: 'underline', cursor: 'pointer' }}>
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
