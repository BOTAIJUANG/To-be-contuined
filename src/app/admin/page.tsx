'use client';

// app/admin/dashboard/page.tsx  ──  儀表板

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import s from './dashboard.module.css';

const STATUS_LABEL: Record<string, string> = { processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消' };
const STATUS_COLOR: Record<string, string> = { processing: '#b87a2a', shipped: '#2a7ab8', done: '#2ab85a', cancelled: '#888580' };

// 可點擊的數字元件
const ClickableNum = ({ value, onClick }: { value: number; onClick: () => void }) => (
  <span onClick={onClick} className={`${s.clickNum} ${s.alertHighlight}`}>{value}</span>
);

// 統計卡片
const StatCard = ({ label, value, alert = false, onClick }: { label: string; value: number | string; alert?: boolean; onClick?: () => void }) => (
  <div
    onClick={onClick}
    className={`${onClick ? s.statCardClickable : s.statCard} ${alert ? s.statCardAlert : ''}`}
  >
    <div className={s.statLabel}>{label} {onClick && <span className={s.statLabelArrow}>→</span>}</div>
    <div className={`${s.statValue} ${alert ? s.statValueAlert : ''}`}>{value}</div>
  </div>
);

export default function AdminDashboardPage() {
  const router = useRouter();
  const [dashTab, setDashTab] = useState<'today' | 'tomorrow'>('today');

  // 共用（今日 + 隔日都需要）
  const [pendingPayment,  setPendingPayment]  = useState(0);
  const [paidNotShipped,  setPaidNotShipped]  = useState(0);
  const [totalOrders,     setTotalOrders]     = useState(0);
  const [totalRevenue,    setTotalRevenue]    = useState(0);
  const [totalMembers,    setTotalMembers]    = useState(0);
  const [lowStockItems,   setLowStockItems]   = useState<any[]>([]);
  const [lowIngredients,  setLowIngredients]  = useState<any[]>([]);

  // 當日
  const [todayStats,   setTodayStats]   = useState({ orders: 0, cancelled: 0, revenue: 0 });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  // 隔日
  const [tomorrowStats,   setTomorrowStats]   = useState({ orders: 0, cancelled: 0, revenue: 0 });
  const [tomorrowOrders,  setTomorrowOrders]  = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const twFmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d);
      const todayTW    = twFmt(new Date());
      const tomorrowTW = twFmt(new Date(Date.now() + 86400000));
      const todayStart = `${todayTW}T00:00:00+08:00`;

      const [
        { count: todayOrdersCount },
        { count: pendingPay },
        { count: paidNotShip },
        { count: todayCancelledCount },
        { data: todayRevData },
        { count: totOrders },
        { data: totRevData },
        { count: totMembers },
        { data: recent },
        { data: invData },
        { data: ingData },
        // 隔日
        { count: tomorrowOrdersCount },
        { count: tomorrowCancelledCount },
        { data: tomorrowRevData },
        { data: tmrOrders },
      ] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayStart).neq('status', 'cancelled'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('pay_status', 'pending').neq('status', 'cancelled'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('pay_status', 'paid').eq('status', 'processing'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'cancelled').gte('created_at', todayStart),
        supabase.from('orders').select('total').gte('created_at', todayStart).eq('pay_status', 'paid'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).neq('status', 'cancelled'),
        supabase.from('orders').select('total').eq('pay_status', 'paid'),
        supabase.from('members').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('order_no, buyer_name, customer_name, total, status, pay_status, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('inventory').select('*, products(name, is_preorder)').filter('safety_stock', 'gt', 0),
        supabase.from('ingredients').select('id, name, stock, safety_stock, unit').gt('safety_stock', 0),
        // 隔日：以 ship_date = tomorrow 篩選
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('ship_date', tomorrowTW).neq('status', 'cancelled'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('ship_date', tomorrowTW).eq('status', 'cancelled'),
        supabase.from('orders').select('total').eq('ship_date', tomorrowTW).eq('pay_status', 'paid'),
        supabase.from('orders').select('order_no, buyer_name, customer_name, total, status, pay_status, ship_date, created_at').eq('ship_date', tomorrowTW).order('created_at', { ascending: false }).limit(20),
      ]);

      setPendingPayment(pendingPay ?? 0);
      setPaidNotShipped(paidNotShip ?? 0);
      setTotalOrders(totOrders ?? 0);
      setTotalRevenue((totRevData ?? []).reduce((acc: number, o: any) => acc + o.total, 0));
      setTotalMembers(totMembers ?? 0);
      setTodayStats({
        orders:    todayOrdersCount ?? 0,
        cancelled: todayCancelledCount ?? 0,
        revenue:   (todayRevData ?? []).reduce((acc: number, o: any) => acc + o.total, 0),
      });
      setTomorrowStats({
        orders:    tomorrowOrdersCount ?? 0,
        cancelled: tomorrowCancelledCount ?? 0,
        revenue:   (tomorrowRevData ?? []).reduce((acc: number, o: any) => acc + o.total, 0),
      });
      setRecentOrders(recent ?? []);
      setTomorrowOrders(tmrOrders ?? []);

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

  if (loading) return <p className={s.loading}>載入中...</p>;

  const isToday = dashTab === 'today';

  return (
    <div>
      <h1 className={s.title}>儀表板</h1>

      {/* ── Tab 切換 ── */}
      <div className={s.dashTabs}>
        <button className={isToday ? s.dashTabActive : s.dashTab} onClick={() => setDashTab('today')}>當日總覽</button>
        <button className={!isToday ? s.dashTabActive : s.dashTab} onClick={() => setDashTab('tomorrow')}>隔日總覽</button>
      </div>

      {/* ── 訂單待處理提醒（共用） ── */}
      {(pendingPayment > 0 || paidNotShipped > 0) && (
        <div className={s.alertOrder}>
          <div className={s.alertTitle}>待處理訂單</div>
          <div className={s.alertText}>
            待核款{' '}
            <ClickableNum value={pendingPayment} onClick={() => router.push('/admin/orders?pay=pending')} />{' '}
            筆，未出貨{' '}
            <ClickableNum value={paidNotShipped} onClick={() => router.push('/admin/orders?pay=paid&status=processing')} />{' '}
            筆
          </div>
        </div>
      )}

      {/* ── 低庫存商品警示（共用） ── */}
      {lowStockItems.length > 0 && (
        <div className={s.alertStock}>
          <div className={s.alertTitle}>商品庫存警示</div>
          <div className={s.alertList}>
            {lowStockItems.map((item: any) => {
              const available = item.stock - item.reserved;
              return (
                <div key={item.id} className={s.alertItem}>
                  <span onClick={() => router.push('/admin/inventory')} className={s.alertLink}>
                    {item.products?.name}{item.variant_name ? ` · ${item.variant_name}` : ''}
                  </span>
                  <span>：剩餘 <span className={s.alertHighlight}>{available}</span> 件，安全庫存 {item.safety_stock} 件</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 低庫存原料警示（共用） ── */}
      {lowIngredients.length > 0 && (
        <div className={s.alertStock}>
          <div className={s.alertTitle}>原料庫存警示</div>
          <div className={s.alertList}>
            {lowIngredients.map((ing: any) => (
              <div key={ing.id} className={s.alertItem}>
                <span onClick={() => router.push('/admin/inventory?tab=ingredient')} className={s.alertLink}>{ing.name}</span>
                <span>：剩餘 <span className={s.alertHighlight}>{ing.stock}</span> {ing.unit}，安全庫存 {ing.safety_stock} {ing.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 訂單統計卡片 ── */}
      <div className={s.sectionLabel}>{isToday ? '當日訂單' : '隔日出貨'}</div>
      <div className={s.statGrid3}>
        {isToday ? (
          <>
            <StatCard label="今日新增訂單"   value={todayStats.orders}    onClick={() => { const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()); router.push(`/admin/orders?dateStart=${t}&dateEnd=${t}`); }} />
            <StatCard label="待核款"         value={pendingPayment} alert={pendingPayment > 0} onClick={() => router.push('/admin/orders?pay=pending')} />
            <StatCard label="完成付款未出貨" value={paidNotShipped} alert={paidNotShipped > 0} onClick={() => router.push('/admin/orders?pay=paid&status=processing')} />
            <StatCard label="今日取消訂單"   value={todayStats.cancelled} onClick={() => router.push('/admin/orders')} />
            <StatCard label="今日營收"       value={`NT$ ${todayStats.revenue.toLocaleString()}`} />
            <StatCard label="總會員數"       value={totalMembers} onClick={() => router.push('/admin/members')} />
          </>
        ) : (
          <>
            <StatCard label="明日出貨訂單"   value={tomorrowStats.orders}    onClick={() => router.push('/admin/orders')} />
            <StatCard label="待核款"         value={pendingPayment} alert={pendingPayment > 0} onClick={() => router.push('/admin/orders?pay=pending')} />
            <StatCard label="完成付款未出貨" value={paidNotShipped} alert={paidNotShipped > 0} onClick={() => router.push('/admin/orders?pay=paid&status=processing')} />
            <StatCard label="明日取消訂單"   value={tomorrowStats.cancelled} onClick={() => router.push('/admin/orders')} />
            <StatCard label="明日出貨金額"   value={`NT$ ${tomorrowStats.revenue.toLocaleString()}`} />
            <StatCard label="總會員數"       value={totalMembers} onClick={() => router.push('/admin/members')} />
          </>
        )}
      </div>

      {/* ── 庫存警示卡片（共用） ── */}
      {(lowStockItems.length > 0 || lowIngredients.length > 0) && (
        <>
          <div className={s.sectionLabel}>庫存警示</div>
          <div className={s.statGrid2}>
            <StatCard label="低庫存商品" value={lowStockItems.length}  alert={lowStockItems.length > 0}  onClick={() => router.push('/admin/inventory')} />
            <StatCard label="低庫存原料" value={lowIngredients.length} alert={lowIngredients.length > 0} onClick={() => router.push('/admin/inventory')} />
          </div>
        </>
      )}

      {/* ── 累積數據（共用） ── */}
      <div className={s.sectionLabel}>累積數據</div>
      <div className={s.statGrid2}>
        <StatCard label="總訂單數"         value={totalOrders} />
        <StatCard label="總營收（已付款）" value={`NT$ ${totalRevenue.toLocaleString()}`} />
      </div>

      {/* ── 最近訂單 / 明日訂單 ── */}
      <div className={s.recentHeader}>
        <div className={s.sectionLabel}>{isToday ? '最近訂單' : '明日出貨訂單'}</div>
        <span onClick={() => router.push('/admin/orders')} className={s.viewAll}>查看全部 →</span>
      </div>
      <div className={s.recentTable}>
        {(() => {
          const orders = isToday ? recentOrders : tomorrowOrders;
          if (orders.length === 0) return <p className={s.emptyMsg}>{isToday ? '尚無訂單' : '明日暫無出貨訂單'}</p>;
          return (
            <>
              <table className={s.table}>
                <thead>
                  <tr>{['訂單編號','買家','金額','付款','狀態','時間'].map(h => (
                    <th key={h} className={s.th}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {orders.map((order: any) => (
                    <tr key={order.order_no} className={s.tr} onClick={() => router.push('/admin/orders')}>
                      <td className={s.tdOrderNo}>{order.order_no}</td>
                      <td className={s.tdName}>{order.customer_name ?? order.buyer_name}</td>
                      <td className={s.tdAmount}>NT$ {order.total.toLocaleString()}</td>
                      <td className={s.tdPay} style={{ color: order.pay_status === 'paid' ? '#2ab85a' : '#b87a2a' }}>
                        {order.pay_status === 'paid' ? '已付款' : (order.status === 'cancelled' && order.pay_status === 'failed') ? '已取消' : order.pay_status === 'failed' ? '失敗' : '待付款'}
                      </td>
                      <td className={s.tdStatus}>
                        <span className={s.statusBadge} style={{ color: STATUS_COLOR[order.status], border: `1px solid ${STATUS_COLOR[order.status]}` }}>
                          {STATUS_LABEL[order.status]}
                        </span>
                      </td>
                      <td className={s.tdDate}>{new Date(order.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={s.cardList}>
                {orders.map((order: any) => (
                  <div key={order.order_no} className={s.card} onClick={() => router.push('/admin/orders')}>
                    <div className={s.cardTop}>
                      <span className={s.cardOrderNo}>{order.order_no}</span>
                      <span className={s.cardDate}>{new Date(order.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}</span>
                    </div>
                    <div className={s.cardMid}>
                      <span className={s.cardName}>{order.customer_name ?? order.buyer_name}</span>
                      <span className={s.cardAmount}>NT$ {order.total.toLocaleString()}</span>
                    </div>
                    <div className={s.cardBottom}>
                      <span className={s.cardPay} style={{ color: order.pay_status === 'paid' ? '#2ab85a' : '#b87a2a' }}>
                        {order.pay_status === 'paid' ? '已付款' : (order.status === 'cancelled' && order.pay_status === 'failed') ? '已取消' : order.pay_status === 'failed' ? '失敗' : '待付款'}
                      </span>
                      <span className={s.statusBadge} style={{ color: STATUS_COLOR[order.status], border: `1px solid ${STATUS_COLOR[order.status]}` }}>
                        {STATUS_LABEL[order.status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
