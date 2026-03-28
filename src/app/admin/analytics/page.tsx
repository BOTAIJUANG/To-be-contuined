'use client';

// ════════════════════════════════════════════════
// app/admin/analytics/page.tsx  ──  關鍵數據
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import s from '../_shared/admin-shared.module.css';
import p from './analytics.module.css';

type Period = '7' | '30' | 'month' | 'last_month';

const PERIODS: { key: Period; label: string }[] = [
  { key: '30',         label: '近30天' },
  { key: '7',          label: '近7天' },
  { key: 'month',      label: '本月' },
  { key: 'last_month', label: '上月' },
];

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
    totalRevenue: 0, paidRevenue: 0, totalOrders: 0, paidOrders: 0,
    uniqueCustomers: 0, newMembers: 0, avgOrderValue: 0, repeatRate: 0,
  });
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number; amount: number }[]>([]);
  const [dailyData,   setDailyData]   = useState<{ date: string; orders: number; revenue: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { start, end } = getPeriodRange(period);

      const [{ data: orders }, { count: newMembers }] = await Promise.all([
        supabase
          .from('orders')
          .select('total, pay_status, status, buyer_email, created_at, order_items(name, qty, price)')
          .gte('created_at', start)
          .lte('created_at', end + 'T23:59:59')
          .neq('status', 'cancelled'),
        supabase
          .from('members')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', start),
      ]);

      const list = orders ?? [];
      const paid = list.filter((o: any) => o.pay_status === 'paid');
      const totalRevenue  = list.reduce((acc: number, o: any) => acc + o.total, 0);
      const paidRevenue   = paid.reduce((acc: number, o: any) => acc + o.total, 0);
      const paidEmails    = [...new Set(paid.map((o: any) => o.buyer_email))];
      const avgOrderValue = paid.length > 0 ? Math.round(paidRevenue / paid.length) : 0;

      // 回購率：只看已付款訂單的 email
      const emailCount: Record<string, number> = {};
      paid.forEach((o: any) => { emailCount[o.buyer_email] = (emailCount[o.buyer_email] ?? 0) + 1; });
      const repeatCustomers = Object.values(emailCount).filter(c => c > 1).length;
      const repeatRate = paidEmails.length > 0 ? Math.round(repeatCustomers / paidEmails.length * 100) : 0;

      // 商品排行：只看已付款訂單
      const productMap: Record<string, { name: string; qty: number; amount: number }> = {};
      paid.forEach((order: any) => {
        order.order_items?.forEach((item: any) => {
          if (!productMap[item.name]) productMap[item.name] = { name: item.name, qty: 0, amount: 0 };
          productMap[item.name].qty    += item.qty;
          productMap[item.name].amount += item.price * item.qty;
        });
      });
      const sortedProducts = Object.values(productMap).sort((a, b) => b.amount - a.amount);

      // 每日趨勢：訂單數算全部（不含取消），營收只算已付款
      const dailyMap: Record<string, { orders: number; revenue: number }> = {};
      list.forEach((o: any) => {
        const d = o.created_at.split('T')[0];
        if (!dailyMap[d]) dailyMap[d] = { orders: 0, revenue: 0 };
        dailyMap[d].orders++;
        if (o.pay_status === 'paid') dailyMap[d].revenue += o.total;
      });
      const daily = Object.entries(dailyMap).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));

      setStats({ totalRevenue, paidRevenue, totalOrders: list.length, paidOrders: paid.length, uniqueCustomers: paidEmails.length, newMembers: newMembers ?? 0, avgOrderValue, repeatRate });
      setTopProducts(sortedProducts);
      setDailyData(daily);
      setLoading(false);
    };
    load();
  }, [period]);

  return (
    <div>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>關鍵數據</h1>
        <div className={p.periodBar}>
          {PERIODS.map(({ key, label }) => (
            <button key={key} onClick={() => setPeriod(key)} className={`${p.periodBtn} ${period === key ? p.periodBtnActive : p.periodBtnDefault}`}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? <p className={s.loadingText}>計算中...</p> : (
        <>
          {/* 統計卡片 */}
          <div className={`${s.statGrid} ${p.statGridMb}`}>
            <div className={s.statCard}>
              <div className={s.statLabel}>總成交金額</div>
              <div className={s.statValue}>{`NT$ ${stats.totalRevenue.toLocaleString()}`}</div>
              <div className={s.statSub}>含未付款</div>
            </div>
            <div className={s.statCard}>
              <div className={s.statLabel}>已付款營收</div>
              <div className={s.statValue}>{`NT$ ${stats.paidRevenue.toLocaleString()}`}</div>
              <div className={s.statSub}>{stats.paidOrders} 筆</div>
            </div>
            <div className={s.statCard}>
              <div className={s.statLabel}>總訂單量</div>
              <div className={s.statValue}>{stats.totalOrders}</div>
              <div className={s.statSub}>已付 {stats.paidOrders} 筆</div>
            </div>
            <div className={s.statCard}>
              <div className={s.statLabel}>總消費顧客數</div>
              <div className={s.statValue}>{stats.uniqueCustomers}</div>
              <div className={s.statSub}>不重複 Email</div>
            </div>
            <div className={s.statCard}>
              <div className={s.statLabel}>平均訂單金額</div>
              <div className={s.statValue}>{`NT$ ${stats.avgOrderValue.toLocaleString()}`}</div>
            </div>
            <div className={s.statCard}>
              <div className={s.statLabel}>回購率</div>
              <div className={s.statValue}>{`${stats.repeatRate}%`}</div>
              <div className={s.statSub}>有多筆訂單的顧客比例</div>
            </div>
            <div className={s.statCard}>
              <div className={s.statLabel}>新增會員</div>
              <div className={s.statValue}>{stats.newMembers}</div>
              <div className={s.statSub}>期間內註冊</div>
            </div>
          </div>

          {/* 商品銷售排行 */}
          <div className={s.sectionTitle}>商品銷售排行</div>
          <div className={`${s.tableWrap} ${p.tableWrapMb}`}>
            {/* Mobile cards */}
            <div className={s.cardList}>
              {topProducts.length === 0 ? (
                <div className={s.emptyRow}>此期間無銷售資料</div>
              ) : topProducts.map((prod, i) => (
                <div key={prod.name} className={s.card}>
                  <div className={s.cardRow}>
                    <span className={`${p.rankNum} ${i < 3 ? p.rankTop : p.rankNormal}`}>#{i+1}</span>
                    <span className={s.cardValue}>{prod.name}</span>
                  </div>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>數量</span>
                    <span className={s.cardValue}>{prod.qty} 件</span>
                  </div>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>金額</span>
                    <span className={s.cardValue}>NT$ {prod.amount.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <table className={s.table}>
              <thead>
                <tr>
                  {['排名', '商品名稱', '銷售數量', '銷售金額', '佔總營收'].map((h, i) => (
                    <th key={h} className={i > 1 ? s.thRight : s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topProducts.length === 0 ? (
                  <tr><td colSpan={5} className={s.emptyRow}>此期間無銷售資料</td></tr>
                ) : topProducts.map((prod, i) => (
                  <tr key={prod.name} className={s.tr}>
                    <td className={s.td}><span className={p.rankNum} style={{ color: i < 3 ? '#b35252' : 'var(--text-light)' }}>#{i+1}</span></td>
                    <td className={s.td}>{prod.name}</td>
                    <td className={`${s.td} ${p.tdRight}`}>{prod.qty} 件</td>
                    <td className={`${s.td} ${p.tdRightDark}`}>NT$ {prod.amount.toLocaleString()}</td>
                    <td className={`${s.td} ${p.tdRightEnd}`}>
                      <div className={`${s.flex} ${s.itemsCenter} ${s.gap8} ${p.justifyEnd}`}>
                        <div className={p.progressBarWrap}>
                          <div className={p.progressBarFill} style={{ width: `${stats.paidRevenue > 0 ? Math.round(prod.amount / stats.paidRevenue * 100) : 0}%` }} />
                        </div>
                        <span className={p.percentLabel}>
                          {stats.paidRevenue > 0 ? Math.round(prod.amount / stats.paidRevenue * 100) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 每日趨勢 */}
          <div className={s.sectionTitle}>每日銷售趨勢</div>
          <div className={s.tableWrap}>
            {/* Mobile cards */}
            <div className={s.cardList}>
              {dailyData.length === 0 ? (
                <div className={s.emptyRow}>此期間無資料</div>
              ) : [...dailyData].reverse().map((d) => (
                <div key={d.date} className={s.card}>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>{d.date}</span>
                    <span className={s.cardValue}>{d.orders} 單</span>
                  </div>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>營收</span>
                    <span className={s.cardValue} style={{ color: d.revenue > 0 ? '#3d7a55' : 'var(--text-light)' }}>
                      {d.revenue > 0 ? `NT$ ${d.revenue.toLocaleString()}` : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <table className={s.table}>
              <thead>
                <tr>
                  {['日期', '訂單數', '當日營收'].map((h, i) => (
                    <th key={h} className={i > 0 ? s.thRight : s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dailyData.length === 0 ? (
                  <tr><td colSpan={3} className={s.emptyRow}>此期間無資料</td></tr>
                ) : [...dailyData].reverse().map((d) => (
                  <tr key={d.date} className={s.tr}>
                    <td className={`${s.td} ${p.dateTd}`}>{d.date}</td>
                    <td className={`${s.td} ${p.tdRight}`}>{d.orders}</td>
                    <td className={`${s.td} ${p.tdRightDark}`} style={{ color: d.revenue > 0 ? '#3d7a55' : 'var(--text-light)' }}>
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
