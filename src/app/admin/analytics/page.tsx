'use client';

// ════════════════════════════════════════════════
// app/admin/analytics/page.tsx  ──  關鍵數據
//
// 顯示營業額、訂單量、會員等關鍵指標
// 資料從 Supabase orders / members 即時計算
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type Period = '7' | '30' | 'month' | 'last_month';

const PERIODS: { key: Period; label: string }[] = [
  { key: '30',         label: '近30天' },
  { key: '7',          label: '近7天' },
  { key: 'month',      label: '本月' },
  { key: 'last_month', label: '上月' },
];

// 取得期間的起始和結束日期
function getPeriodRange(period: Period): { start: string; end: string } {
  const now   = new Date();
  const today = now.toISOString().split('T')[0];

  if (period === '7') {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    return { start: d.toISOString().split('T')[0], end: today };
  }
  if (period === '30') {
    const d = new Date(now); d.setDate(d.getDate() - 30);
    return { start: d.toISOString().split('T')[0], end: today };
  }
  if (period === 'month') {
    return { start: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, end: today };
  }
  if (period === 'last_month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: d.toISOString().split('T')[0], end: e.toISOString().split('T')[0] };
  }
  return { start: today, end: today };
}

export default function AdminAnalyticsPage() {
  const [period,  setPeriod]  = useState<Period>('30');
  const [loading, setLoading] = useState(true);
  const [stats,   setStats]   = useState({
    totalRevenue:    0,
    paidRevenue:     0,
    totalOrders:     0,
    paidOrders:      0,
    uniqueCustomers: 0,
    newMembers:      0,
    avgOrderValue:   0,
    repeatRate:      0,
  });
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number; amount: number }[]>([]);
  const [dailyData,   setDailyData]   = useState<{ date: string; orders: number; revenue: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { start, end } = getPeriodRange(period);

      // 取得期間內的訂單
      const { data: orders } = await supabase
        .from('orders')
        .select('total, pay_status, buyer_email, created_at, order_items(name, qty, price)')
        .gte('created_at', start)
        .lte('created_at', end + 'T23:59:59');

      // 取得期間內新增會員
      const { count: newMembers } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', start);

      const list = orders ?? [];
      const paid = list.filter((o: any) => o.pay_status === 'paid');

      // 計算各種統計
      const totalRevenue  = list.reduce((s: number, o: any) => s + o.total, 0);
      const paidRevenue   = paid.reduce((s: number, o: any) => s + o.total, 0);
      const emails        = [...new Set(list.map((o: any) => o.buyer_email))];
      const avgOrderValue = paid.length > 0 ? Math.round(paidRevenue / paid.length) : 0;

      // 回購率：有多筆訂單的 email 比例
      const emailCount: Record<string, number> = {};
      list.forEach((o: any) => { emailCount[o.buyer_email] = (emailCount[o.buyer_email] ?? 0) + 1; });
      const repeatCustomers = Object.values(emailCount).filter(c => c > 1).length;
      const repeatRate = emails.length > 0 ? Math.round(repeatCustomers / emails.length * 100) : 0;

      // 商品銷售排行
      const productMap: Record<string, { name: string; qty: number; amount: number }> = {};
      list.forEach((order: any) => {
        order.order_items?.forEach((item: any) => {
          if (!productMap[item.name]) productMap[item.name] = { name: item.name, qty: 0, amount: 0 };
          productMap[item.name].qty    += item.qty;
          productMap[item.name].amount += item.price * item.qty;
        });
      });
      const sortedProducts = Object.values(productMap).sort((a, b) => b.amount - a.amount);

      // 每日趨勢
      const dailyMap: Record<string, { orders: number; revenue: number }> = {};
      list.forEach((o: any) => {
        const d = o.created_at.split('T')[0];
        if (!dailyMap[d]) dailyMap[d] = { orders: 0, revenue: 0 };
        dailyMap[d].orders++;
        if (o.pay_status === 'paid') dailyMap[d].revenue += o.total;
      });
      const daily = Object.entries(dailyMap).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));

      setStats({ totalRevenue, paidRevenue, totalOrders: list.length, paidOrders: paid.length, uniqueCustomers: emails.length, newMembers: newMembers ?? 0, avgOrderValue, repeatRate });
      setTopProducts(sortedProducts);
      setDailyData(daily);
      setLoading(false);
    };
    load();
  }, [period]);

  const StatCard = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '20px 24px' }}>
      <div style={{ fontSize: '10px', color: '#888580', letterSpacing: '0.2em', marginBottom: '10px', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#1E1C1A' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: '#888580', marginTop: '4px' }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: 0 }}>關鍵數據</h1>
        {/* 期間切換 */}
        <div style={{ display: 'flex', border: '1px solid #E8E4DC', overflow: 'hidden' }}>
          {PERIODS.map(({ key, label }) => (
            <button key={key} onClick={() => setPeriod(key)} style={{
              padding: '8px 16px', background: period === key ? '#1E1C1A' : '#fff',
              color: period === key ? '#F7F4EF' : '#555250',
              border: 'none', borderRight: '1px solid #E8E4DC',
              fontFamily: '"Noto Sans TC", sans-serif', fontSize: '12px',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? <p style={{ color: '#888580', fontSize: '13px' }}>計算中...</p> : (
        <>
          {/* 統計卡片 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
            <StatCard label="總成交金額"   value={`NT$ ${stats.totalRevenue.toLocaleString()}`}  sub="含未付款" />
            <StatCard label="已付款營收"   value={`NT$ ${stats.paidRevenue.toLocaleString()}`}   sub={`${stats.paidOrders} 筆`} />
            <StatCard label="總訂單量"     value={stats.totalOrders}                             sub={`已付 ${stats.paidOrders} 筆`} />
            <StatCard label="總消費顧客數" value={stats.uniqueCustomers}                         sub="不重複 Email" />
            <StatCard label="平均訂單金額" value={`NT$ ${stats.avgOrderValue.toLocaleString()}`} />
            <StatCard label="回購率"       value={`${stats.repeatRate}%`}                        sub="有多筆訂單的顧客比例" />
            <StatCard label="新增會員"     value={stats.newMembers}                              sub="期間內註冊" />
          </div>

          {/* 商品銷售排行 */}
          <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#555250', marginBottom: '12px', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif' }}>
            商品銷售排行
          </div>
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', marginBottom: '28px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['排名', '商品名稱', '銷售數量', '銷售金額', '佔總營收'].map((h, i) => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: i > 1 ? 'right' : 'left', fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topProducts.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>此期間無銷售資料</td></tr>
                ) : topProducts.map((p, i) => (
                  <tr key={p.name} style={{ borderBottom: '1px solid #E8E4DC' }}>
                    <td style={{ padding: '12px 16px', fontFamily: '"Montserrat", sans-serif', fontWeight: 700, fontSize: '14px', color: i < 3 ? '#b35252' : '#888580' }}>#{i+1}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A' }}>{p.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#555250', textAlign: 'right' }}>{p.qty} 件</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A', textAlign: 'right' }}>NT$ {p.amount.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                        <div style={{ width: '80px', height: '6px', background: '#EDE9E2', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${stats.totalRevenue > 0 ? Math.round(p.amount / stats.totalRevenue * 100) : 0}%`, height: '100%', background: '#1E1C1A', borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '12px', color: '#555250', minWidth: '32px' }}>
                          {stats.totalRevenue > 0 ? Math.round(p.amount / stats.totalRevenue * 100) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 每日趨勢 */}
          <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#555250', marginBottom: '12px', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif' }}>
            每日銷售趨勢
          </div>
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['日期', '訂單數', '當日營收'].map((h, i) => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: i > 0 ? 'right' : 'left', fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dailyData.length === 0 ? (
                  <tr><td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>此期間無資料</td></tr>
                ) : [...dailyData].reverse().map((d) => (
                  <tr key={d.date} style={{ borderBottom: '1px solid #E8E4DC' }}>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A', fontFamily: '"Montserrat", sans-serif' }}>{d.date}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#555250', textAlign: 'right' }}>{d.orders}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: d.revenue > 0 ? '#3d7a55' : '#888580', textAlign: 'right' }}>
                      {d.revenue > 0 ? `NT$ ${d.revenue.toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
