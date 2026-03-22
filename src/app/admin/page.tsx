'use client';

// app/admin/dashboard/page.tsx  ──  儀表板

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STATUS_LABEL: Record<string, string> = { processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消' };
const STATUS_COLOR: Record<string, string> = { processing: '#b87a2a', shipped: '#2a7ab8', done: '#2ab85a', cancelled: '#888580' };

// 可點擊的數字元件
const ClickableNum = ({ value, onClick, color }: { value: number; onClick: () => void; color?: string }) => (
  <span
    onClick={onClick}
    style={{ color: color ?? '#1E1C1A', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit' }}
  >
    {value}
  </span>
);

// 統計卡片
const StatCard = ({ label, value, alert = false, onClick }: { label: string; value: number | string; alert?: boolean; onClick?: () => void }) => (
  <div onClick={onClick} style={{ background: '#fff', border: `1px solid ${alert ? '#f0c040' : '#E8E4DC'}`, padding: '20px 24px', cursor: onClick ? 'pointer' : 'default', transition: 'border-color 0.2s' }}>
    <div style={{ fontSize: '11px', color: '#888580', letterSpacing: '0.15em', marginBottom: '10px', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase' }}>
      {label} {onClick && <span style={{ fontSize: '10px' }}>→</span>}
    </div>
    <div style={{ fontSize: '28px', fontWeight: 700, color: alert ? '#c0392b' : '#1E1C1A' }}>{value}</div>
  </div>
);

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState({ todayOrders: 0, pendingPayment: 0, paidNotShipped: 0, todayCancelled: 0, todayRevenue: 0, totalOrders: 0, totalRevenue: 0, totalMembers: 0 });
  const [recentOrders,   setRecentOrders]   = useState<any[]>([]);
  const [lowStockItems,  setLowStockItems]  = useState<any[]>([]);   // 低庫存商品
  const [lowIngredients, setLowIngredients] = useState<any[]>([]);   // 低庫存原料
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split('T')[0];
      const [
        { count: todayOrders },
        { count: pendingPayment },
        { count: paidNotShipped },
        { count: todayCancelled },
        { data: todayRevenueData },
        { count: totalOrders },
        { data: totalRevenueData },
        { count: totalMembers },
        { data: recent },
        { data: invData },
        { data: ingData },
      ] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', today),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('pay_status', 'pending'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('pay_status', 'paid').eq('status', 'processing'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'cancelled').gte('created_at', today),
        supabase.from('orders').select('total').gte('created_at', today).eq('pay_status', 'paid'),
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('total').eq('pay_status', 'paid'),
        supabase.from('members').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('order_no, buyer_name, total, status, pay_status, created_at').order('created_at', { ascending: false }).limit(5),
        // 低庫存商品（可售庫存 <= 安全庫存 且 安全庫存 > 0）
        supabase.from('inventory').select('*, products(name)').filter('safety_stock', 'gt', 0),
        // 低庫存原料（有設安全庫存的）
        supabase.from('ingredients').select('id, name, stock, safety_stock, unit').gt('safety_stock', 0),
      ]);

      setStats({
        todayOrders:    todayOrders ?? 0,
        pendingPayment: pendingPayment ?? 0,
        paidNotShipped: paidNotShipped ?? 0,
        todayCancelled: todayCancelled ?? 0,
        todayRevenue:   (todayRevenueData ?? []).reduce((s: number, o: any) => s + o.total, 0),
        totalOrders:    totalOrders ?? 0,
        totalRevenue:   (totalRevenueData ?? []).reduce((s: number, o: any) => s + o.total, 0),
        totalMembers:   totalMembers ?? 0,
      });
      setRecentOrders(recent ?? []);

      // 篩選真正低庫存的商品
      const low = (invData ?? []).filter((i: any) => {
        const available = i.inventory_mode === 'stock' ? i.stock - i.reserved : i.max_preorder - i.reserved_preorder;
        return available <= i.safety_stock;
      });
      setLowStockItems(low);

      // 篩選低庫存原料
      const lowIng = (ingData ?? []).filter((i: any) => Number(i.stock) <= Number(i.safety_stock));
      setLowIngredients(lowIng);

      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p>;

  return (
    <div>
      <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: '0 0 32px' }}>儀表板</h1>

      {/* ── 訂單待處理提醒 ── */}
      {(stats.pendingPayment > 0 || stats.paidNotShipped > 0) && (
        <div style={{ background: '#fff8e1', border: '1px solid #f0c040', padding: '14px 20px', marginBottom: '16px', fontSize: '13px', color: '#7a5c00', lineHeight: 2 }}>
          您有{' '}
          <ClickableNum value={stats.pendingPayment} onClick={() => router.push('/admin/orders')} color="#c0392b" />{' '}
          筆待核款訂單，{' '}
          <ClickableNum value={stats.paidNotShipped} onClick={() => router.push('/admin/orders')} color="#c0392b" />{' '}
          筆完成付款未出貨，請盡快處理。
        </div>
      )}

      {/* ── 低庫存商品警示 ── */}
      {lowStockItems.length > 0 && (
        <div style={{ background: '#fef0e8', border: '1px solid #e8a87c', padding: '14px 20px', marginBottom: '16px', fontSize: '13px', color: '#7a3c00' }}>
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>商品庫存警示</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {lowStockItems.map((item: any) => {
              const available = item.inventory_mode === 'stock' ? item.stock - item.reserved : item.max_preorder - item.reserved_preorder;
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    onClick={() => router.push('/admin/inventory')}
                    style={{ color: '#c0392b', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    {item.products?.name}{item.variant_name ? ` · ${item.variant_name}` : ''}
                  </span>
                  <span>已低於安全庫存（剩餘 {available} 件，安全庫存 {item.safety_stock} 件）</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 低庫存原料警示 ── */}
      {lowIngredients.length > 0 && (
        <div style={{ background: '#fef0e8', border: '1px solid #e8a87c', padding: '14px 20px', marginBottom: '16px', fontSize: '13px', color: '#7a3c00' }}>
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>原料庫存警示</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {lowIngredients.map((ing: any) => (
              <div key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  onClick={() => router.push('/admin/inventory?tab=ingredient')}
                  style={{ color: '#c0392b', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
                >
                  {ing.name}
                </span>
                <span>已低於安全庫存（剩餘 {ing.stock} {ing.unit}，安全庫存 {ing.safety_stock} {ing.unit}）</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 訂單統計卡片 ── */}
      <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#555250', marginBottom: '12px', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif' }}>訂單資訊</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '32px' }}>
        <StatCard label="今日新增訂單"   value={stats.todayOrders}    onClick={() => router.push('/admin/orders')} />
        <StatCard label="待核款"         value={stats.pendingPayment} alert={stats.pendingPayment > 0} onClick={() => router.push('/admin/orders')} />
        <StatCard label="完成付款未出貨" value={stats.paidNotShipped} alert={stats.paidNotShipped > 0} onClick={() => router.push('/admin/orders')} />
        <StatCard label="今日取消訂單"   value={stats.todayCancelled} onClick={() => router.push('/admin/orders')} />
        <StatCard label="今日營收"       value={`NT$ ${stats.todayRevenue.toLocaleString()}`} />
        <StatCard label="總會員數"       value={stats.totalMembers}   onClick={() => router.push('/admin/members')} />
      </div>

      {/* ── 庫存警示卡片 ── */}
      {(lowStockItems.length > 0 || lowIngredients.length > 0) && (
        <>
          <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#555250', marginBottom: '12px', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif' }}>庫存警示</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '32px' }}>
            <StatCard label="低庫存商品" value={lowStockItems.length}  alert={lowStockItems.length > 0}  onClick={() => router.push('/admin/inventory')} />
            <StatCard label="低庫存原料" value={lowIngredients.length} alert={lowIngredients.length > 0} onClick={() => router.push('/admin/inventory')} />
          </div>
        </>
      )}

      {/* ── 累積數據 ── */}
      <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#555250', marginBottom: '12px', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif' }}>累積數據</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '32px' }}>
        <StatCard label="總訂單數"       value={stats.totalOrders} />
        <StatCard label="總營收（已付款）" value={`NT$ ${stats.totalRevenue.toLocaleString()}`} />
      </div>

      {/* ── 最近訂單 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#555250', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif' }}>最近訂單</div>
        <span onClick={() => router.push('/admin/orders')} style={{ fontSize: '12px', color: '#1E1C1A', cursor: 'pointer', textDecoration: 'underline' }}>查看全部 →</span>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E8E4DC' }}>
        {recentOrders.length === 0 ? (
          <p style={{ padding: '24px', color: '#888580', fontSize: '13px' }}>尚無訂單</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['訂單編號','買家','金額','付款','狀態','時間'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {recentOrders.map(order => (
                <tr key={order.order_no} style={{ borderBottom: '1px solid #E8E4DC', cursor: 'pointer' }} onClick={() => router.push('/admin/orders')}>
                  <td style={{ padding: '12px 16px', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', color: '#1E1C1A' }}>{order.order_no}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A' }}>{order.buyer_name}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A' }}>NT$ {order.total.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: order.pay_status === 'paid' ? '#2ab85a' : '#b87a2a' }}>
                    {order.pay_status === 'paid' ? '已付款' : order.pay_status === 'failed' ? '失敗' : '待付款'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '11px', color: STATUS_COLOR[order.status], border: `1px solid ${STATUS_COLOR[order.status]}`, padding: '2px 8px', fontFamily: '"Montserrat", sans-serif' }}>
                      {STATUS_LABEL[order.status]}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580' }}>{new Date(order.created_at).toLocaleDateString('zh-TW')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
