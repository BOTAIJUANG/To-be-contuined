'use client';

// app/admin/orders/page.tsx  ──  訂單管理（含詳細抽屜）

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchApi } from '@/lib/api';
import OrderDrawer from '@/components/OrderDrawer';
import s from './orders.module.css';

type OrderTab = 'list' | 'shiplist' | 'report';
type ReportPeriod = 'today' | 'week' | 'month' | 'custom';

const STATUS_OPTIONS = [
  { value: '', label: '全部配送狀態' }, { value: 'processing', label: '處理中' },
  { value: 'shipped', label: '已出貨' }, { value: 'done', label: '已完成' }, { value: 'cancelled', label: '已取消' },
];
// 配送狀態下拉選項（不含已取消，取消走獨立按鈕）
const SHIP_STATUS_OPTIONS = [
  { value: 'processing', label: '處理中' },
  { value: 'shipped', label: '已出貨' },
  { value: 'done', label: '已完成' },
];
const PAY_OPTIONS = [
  { value: '', label: '全部' }, { value: 'pending', label: '待付款' },
  { value: 'paid', label: '已付款' }, { value: 'failed', label: '付款失敗' },
];
const SHIP_OPTIONS = [
  { value: '', label: '全部' }, { value: 'home_normal', label: '一般宅配' },
  { value: 'home_cold', label: '低溫宅配' }, { value: 'cvs_711', label: '7-11取貨' },
  { value: 'cvs_family', label: '全家取貨' }, { value: 'store', label: '門市自取' },
];
const STATUS_COLOR: Record<string, string> = { processing: '#b87a2a', shipped: '#2a7ab8', done: '#2ab85a', cancelled: '#888580' };
const STATUS_LABEL: Record<string, string> = { processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消' };
const PAY_COLOR: Record<string, string>    = { pending: '#b87a2a', paid: '#2ab85a', failed: '#c0392b' };
const PAY_LABEL: Record<string, string>    = { pending: '待付款', paid: '已付款', failed: '失敗' };
const SHIP_LABEL: Record<string, string>   = { home_normal: '一般宅配', home_cold: '低溫宅配', cvs_711: '7-11', cvs_family: '全家', store: '門市自取' };

function getPeriodRange(period: ReportPeriod, cs: string, ce: string) {
  const now = new Date(); const today = now.toISOString().split('T')[0];
  if (period === 'today') return { start: today, end: today };
  if (period === 'week') { const d = new Date(now); d.setDate(d.getDate()-7); return { start: d.toISOString().split('T')[0], end: today }; }
  if (period === 'month') return { start: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, end: today };
  return { start: cs, end: ce };
}

export default function AdminOrdersPage() {
  const [tab, setTab] = useState<OrderTab>('list');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  // 取消訂單 modal
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // 搜尋條件
  const [keyword, setKeyword] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [osStatus, setOsStatus] = useState('');
  const [osPay, setOsPay] = useState('');
  const [osShip, setOsShip] = useState('');
  const [osMin, setOsMin] = useState('');
  const [osMax, setOsMax] = useState('');

  // 報表
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('month');
  const [reportCustomStart, setReportCustomStart] = useState('');
  const [reportCustomEnd, setReportCustomEnd] = useState('');
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportStats, setReportStats] = useState({ orders: 0, revenue: 0, qty: 0, avg: 0 });
  const [reportDaily, setReportDaily] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    let q = supabase.from('orders').select('*, order_items(name, qty, price)').order('created_at', { ascending: false });
    if (osStatus)  q = q.eq('status', osStatus);
    if (osPay)     q = q.eq('pay_status', osPay);
    if (osShip)    q = q.eq('ship_method', osShip);
    if (dateStart) q = q.gte('created_at', dateStart);
    if (dateEnd)   q = q.lte('created_at', dateEnd + 'T23:59:59');
    if (osMin)     q = q.gte('total', Number(osMin));
    if (osMax)     q = q.lte('total', Number(osMax));
    const { data } = await q;
    let list = data ?? [];
    if (keyword) {
      const kw = keyword.toLowerCase();
      list = list.filter((o: any) => o.order_no.toLowerCase().includes(kw) || (o.buyer_name ?? '').includes(kw) || (o.buyer_phone ?? '').includes(kw));
    }
    setOrders(list);
    setLoading(false);
  };

  useEffect(() => { loadOrders(); }, []);

  const loadReport = async () => {
    setReportLoading(true);
    const { start, end } = getPeriodRange(reportPeriod, reportCustomStart, reportCustomEnd);
    const { data } = await supabase.from('orders').select('total, pay_status, created_at, order_items(name, qty, price)').gte('created_at', start).lte('created_at', end + 'T23:59:59').neq('status', 'cancelled');
    const list = data ?? []; const paid = list.filter((o: any) => o.pay_status === 'paid');
    const revenue = paid.reduce((s: number, o: any) => s + o.total, 0);
    const totalQty = paid.reduce((s: number, o: any) => s + (o.order_items?.reduce((q: number, i: any) => q + i.qty, 0) ?? 0), 0);
    const productMap: Record<string, { name: string; qty: number; amount: number }> = {};
    paid.forEach((o: any) => { o.order_items?.forEach((item: any) => { if (!productMap[item.name]) productMap[item.name] = { name: item.name, qty: 0, amount: 0 }; productMap[item.name].qty += item.qty; productMap[item.name].amount += item.price * item.qty; }); });
    const dailyMap: Record<string, { orders: number; qty: number; revenue: number }> = {};
    paid.forEach((o: any) => { const d = o.created_at.split('T')[0]; if (!dailyMap[d]) dailyMap[d] = { orders: 0, qty: 0, revenue: 0 }; dailyMap[d].orders++; dailyMap[d].revenue += o.total; dailyMap[d].qty += o.order_items?.reduce((q: number, i: any) => q + i.qty, 0) ?? 0; });
    setReportStats({ orders: paid.length, revenue, qty: totalQty, avg: paid.length > 0 ? Math.round(revenue / paid.length) : 0 });
    setReportData(Object.values(productMap).sort((a, b) => b.amount - a.amount));
    setReportDaily(Object.entries(dailyMap).map(([date, v]) => ({ date, ...v })).sort((a, b) => b.date.localeCompare(a.date)));
    setReportLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'report') loadReport(); }, [tab, reportPeriod, reportCustomStart, reportCustomEnd]);

  const updateStatus = async (orderId: number, field: string, value: string) => {
    try {
      const upd: any = { [field]: value };
      if (field === 'status' && value === 'shipped') upd.shipped_at = new Date().toISOString();

      // 取得訂單明細（出貨或取消時需要）
      if (field === 'status' && (value === 'shipped' || value === 'cancelled')) {
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('product_id, variant_id, qty')
          .eq('order_id', orderId);

        if (orderItems && orderItems.length > 0) {
          const action = value === 'shipped' ? 'ship' : 'cancel';
          const res = await fetchApi(`/api/inventory?action=${action}`, {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId, items: orderItems }),
          });
          if (!res.ok) console.error('庫存操作失敗:', await res.text());
        }
      }

      // 訂單狀態改為「已完成」→ 自動加章
      if (field === 'status' && value === 'done') {
        const res = await fetchApi('/api/stamps?action=add', {
          method: 'POST',
          body: JSON.stringify({ order_id: orderId }),
        });
        if (!res.ok) console.error('集章失敗:', await res.text());
      }

      // 訂單狀態改為「已取消」→ 扣章（若之前已完成並加過章）
      if (field === 'status' && value === 'cancelled') {
        const prevOrder = orders.find(o => o.id === orderId);
        if (prevOrder?.status === 'done') {
          await fetchApi('/api/stamps?action=deduct', {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId }),
          });
        }
      }

      // 退款申請通過時也扣章（若訂單已完成）
      if (field === 'refund_status' && value === 'approved') {
        const prevOrder = orders.find(o => o.id === orderId);
        if (prevOrder?.status === 'done') {
          await fetchApi('/api/stamps?action=deduct', {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId }),
          });
        }
      }

      const { error } = await supabase.from('orders').update(upd).eq('id', orderId);
      if (error) { alert('更新失敗：' + error.message); return; }
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...upd } : o));
      if (selectedOrder?.id === orderId) setSelectedOrder((prev: any) => ({ ...prev, ...upd }));
    } catch (err) {
      console.error('updateStatus 錯誤:', err);
      alert('操作失敗，請稍後再試');
    }
  };

  const handleCancelOrder = async (order: any) => {
    setCancelLoading(true);
    try {
      // 信用卡已付款 → 呼叫綠界退款 API
      if (order.pay_method === 'credit' && order.pay_status === 'paid') {
        const res = await fetchApi('/api/payment/refund', {
          method: 'POST',
          body: JSON.stringify({ order_id: order.id }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert('退款失敗：' + (data.error ?? '未知錯誤'));
          setCancelLoading(false);
          return;
        }
        if (data.message) alert(data.message);
      }

      // ATM 已付款 → 提示需手動退款
      if (order.pay_method === 'atm' && order.pay_status === 'paid') {
        alert('此訂單為 ATM虛擬帳號付款，退款將以銀行轉帳方式另行辦理，請手動處理退款。');
      }

      // 更新訂單狀態為已取消（會觸發庫存回補、扣章等邏輯）
      await updateStatus(order.id, 'status', 'cancelled');
      setCancelTarget(null);
    } catch (err) {
      console.error('取消訂單失敗:', err);
      alert('取消訂單失敗，請稍後再試');
    }
    setCancelLoading(false);
  };

  return (
    <div>
      <h1 className={s.title}>訂單管理</h1>

      <div className={s.tabs}>
        <div className={tab === 'list' ? s.tabActive : s.tab}     onClick={() => setTab('list')}>訂單列表</div>
        <div className={tab === 'shiplist' ? s.tabActive : s.tab} onClick={() => setTab('shiplist')}>出貨單列表</div>
        <div className={tab === 'report' ? s.tabActive : s.tab}   onClick={() => setTab('report')}>銷售庫存報表</div>
      </div>

      {/* ════ 訂單列表 ════ */}
      {tab === 'list' && (
        <>
          <div className={s.filterPanel}>
            <div className={s.filterRow}>
              <input value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadOrders()} placeholder="訂單編號、姓名、電話" className={s.input} />
              <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className={s.dateInput} />
              <span className={s.dateSep}>～</span>
              <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className={s.dateInput} />
            </div>
            <div className={s.filterRowBottom}>
              <select value={osStatus} onChange={e => setOsStatus(e.target.value)} className={s.select}>{STATUS_OPTIONS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}</select>
              <select value={osPay}    onChange={e => setOsPay(e.target.value)}    className={s.select}>{PAY_OPTIONS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}</select>
              <select value={osShip}   onChange={e => setOsShip(e.target.value)}   className={s.select}>{SHIP_OPTIONS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}</select>
              <input type="number" value={osMin} onChange={e => setOsMin(e.target.value)} placeholder="最低金額" className={s.amountInput} />
              <input type="number" value={osMax} onChange={e => setOsMax(e.target.value)} placeholder="最高金額" className={s.amountInput} />
              <div className={s.filterActions}>
                <button onClick={() => { setKeyword(''); setDateStart(''); setDateEnd(''); setOsStatus(''); setOsPay(''); setOsShip(''); setOsMin(''); setOsMax(''); }} className={s.btnClear}>清除</button>
                <button onClick={loadOrders} className={s.btnSearch}>搜尋</button>
              </div>
            </div>
            <div className={s.orderCount}>共 <strong className={s.orderCountNum}>{orders.length}</strong> 筆訂單</div>
          </div>

          {loading ? <p className={s.loading}>載入中...</p> : (
            <div className={s.tableWrap}>
              {/* Desktop table */}
              <table className={s.table}>
                <thead>
                  <tr>{['訂單編號', '日期', '買家', '商品', '金額', '付款狀態', '配送', '配送狀態', '操作'].map(h => <th key={h} className={s.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr><td colSpan={9} className={s.tdEmpty}>沒有符合條件的訂單</td></tr>
                  ) : orders.map(o => (
                    <tr key={o.id} className={s.tr} onClick={() => setSelectedOrder(o)}>
                      <td className={s.tdOrderNo}>{o.order_no}</td>
                      <td className={s.tdDate}>{new Date(o.created_at).toLocaleDateString('zh-TW')}</td>
                      <td className={s.tdBuyer}>
                        <div className={s.buyerName}>
                          {o.buyer_name}
                          <span className={s.buyerBadge} style={{ borderColor: o.member_id ? '#2ab85a' : '#b87a2a', color: o.member_id ? '#2ab85a' : '#b87a2a' }}>
                            {o.member_id ? '會員' : '訪客'}
                          </span>
                        </div>
                        <div className={s.buyerPhone}>{o.buyer_phone}</div>
                      </td>
                      <td className={s.tdItems}>{o.order_items?.map((i: any) => `${i.name}×${i.qty}`).join('、')}</td>
                      <td className={s.tdAmount}>NT$ {o.total.toLocaleString()}</td>
                      <td className={s.tdPayStatus} onClick={e => e.stopPropagation()}>
                        {/* 付款狀態由綠界 webhook 自動更新，不給手動改 */}
                        <span className={s.payBadge} style={{
                          color: PAY_COLOR[o.pay_status] ?? '#888580',
                          border: `1px solid ${PAY_COLOR[o.pay_status] ?? '#E8E4DC'}`,
                        }}>
                          {PAY_LABEL[o.pay_status] ?? o.pay_status}
                        </span>
                      </td>
                      <td className={s.tdShipMethod}>{SHIP_LABEL[o.ship_method] ?? o.ship_method}</td>
                      <td className={s.tdShipStatus} onClick={e => e.stopPropagation()}>
                        {o.status === 'cancelled' ? (
                          <span className={s.cancelledBadge}>已取消</span>
                        ) : (
                          <select value={o.status} onChange={e => updateStatus(o.id, 'status', e.target.value)} className={s.statusSelect} style={{ color: STATUS_COLOR[o.status] }}>
                            {SHIP_STATUS_OPTIONS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                          </select>
                        )}
                      </td>
                      <td className={s.tdActions}>
                        <button onClick={e => { e.stopPropagation(); setSelectedOrder(o); }} className={s.btnDetail}>詳細</button>
                        {o.status !== 'cancelled' && (
                          <button onClick={e => { e.stopPropagation(); setCancelTarget(o); }} className={s.btnCancel}>取消</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile card list */}
              <div className={s.cardList}>
                {orders.length === 0 ? (
                  <div className={s.tdEmpty}>沒有符合條件的訂單</div>
                ) : orders.map(o => (
                  <div key={o.id} className={s.card} onClick={() => setSelectedOrder(o)}>
                    <div className={s.cardTop}>
                      <span className={s.cardOrderNo}>{o.order_no}</span>
                      <span className={s.cardDate}>{new Date(o.created_at).toLocaleDateString('zh-TW')}</span>
                    </div>
                    <div className={s.cardMid}>
                      <div className={s.cardBuyer}>
                        {o.buyer_name}
                        <span className={s.buyerBadge} style={{ borderColor: o.member_id ? '#2ab85a' : '#b87a2a', color: o.member_id ? '#2ab85a' : '#b87a2a' }}>
                          {o.member_id ? '會員' : '訪客'}
                        </span>
                      </div>
                      <span className={s.cardAmount}>NT$ {o.total.toLocaleString()}</span>
                    </div>
                    <div className={s.cardBottom}>
                      <span className={s.payBadge} style={{
                        color: PAY_COLOR[o.pay_status] ?? '#888580',
                        border: `1px solid ${PAY_COLOR[o.pay_status] ?? '#E8E4DC'}`,
                      }}>
                        {PAY_LABEL[o.pay_status] ?? o.pay_status}
                      </span>
                      {o.status === 'cancelled' ? (
                        <span className={s.cancelledBadge}>已取消</span>
                      ) : (
                        <span className={s.payBadge} style={{ color: STATUS_COLOR[o.status], border: `1px solid ${STATUS_COLOR[o.status]}` }}>
                          {STATUS_LABEL[o.status]}
                        </span>
                      )}
                      <span className={s.cardShip}>{SHIP_LABEL[o.ship_method] ?? o.ship_method}</span>
                    </div>
                    <div className={s.cardItems}>{o.order_items?.map((i: any) => `${i.name}×${i.qty}`).join('、')}</div>
                    <div className={s.cardActions} onClick={e => e.stopPropagation()}>
                      <button onClick={() => setSelectedOrder(o)} className={s.btnDetail}>詳細</button>
                      {o.status !== 'cancelled' && (
                        <>
                          <select value={o.status} onChange={e => updateStatus(o.id, 'status', e.target.value)} className={s.statusSelect} style={{ color: STATUS_COLOR[o.status] }}>
                            {SHIP_STATUS_OPTIONS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                          </select>
                          <button onClick={() => setCancelTarget(o)} className={s.btnCancel}>取消</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ════ 出貨單列表 ════ */}
      {tab === 'shiplist' && (
        <>
          <div className={s.shipNotice}>顯示所有待出貨和已出貨的訂單。</div>
          <div className={s.tableWrap}>
            {/* Desktop table */}
            <table className={s.table}>
              <thead><tr>{['訂單編號', '收件人', '地址', '配送方式', '指定出貨日', '配送狀態'].map(h => <th key={h} className={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {orders.filter(o => o.status !== 'cancelled').map(o => (
                  <tr key={o.id} className={s.tr} onClick={() => setSelectedOrder(o)}>
                    <td className={s.tdOrderNo}>{o.order_no}</td>
                    <td className={s.tdBuyer}><div className={s.buyerName}>{o.buyer_name}</div><div className={s.buyerPhone}>{o.buyer_phone}</div></td>
                    <td className={s.tdAddress}>{o.address || '門市自取'}</td>
                    <td className={s.tdShipMethodCell}>{SHIP_LABEL[o.ship_method] ?? o.ship_method}</td>
                    <td className={s.tdShipDate}>{o.ship_date ?? '—'}</td>
                    <td className={s.tdShipStatus} onClick={e => e.stopPropagation()}>
                      <select value={o.status} onChange={e => updateStatus(o.id, 'status', e.target.value)} className={s.statusSelect} style={{ color: STATUS_COLOR[o.status] }}>
                        {SHIP_STATUS_OPTIONS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile card list */}
            <div className={s.cardList}>
              {orders.filter(o => o.status !== 'cancelled').map(o => (
                <div key={o.id} className={s.shipCard} onClick={() => setSelectedOrder(o)}>
                  <div className={s.shipCardTop}>
                    <span className={s.shipCardOrderNo}>{o.order_no}</span>
                    <span className={s.shipCardMethod}>{SHIP_LABEL[o.ship_method] ?? o.ship_method}</span>
                  </div>
                  <div className={s.shipCardRecipient}>{o.buyer_name}</div>
                  <div className={s.shipCardPhone}>{o.buyer_phone}</div>
                  <div className={s.shipCardAddress}>{o.address || '門市自取'}</div>
                  <div className={s.shipCardRow}>
                    <span className={s.shipCardDate}>出貨日：{o.ship_date ?? '—'}</span>
                    <span onClick={e => e.stopPropagation()}>
                      <select value={o.status} onChange={e => updateStatus(o.id, 'status', e.target.value)} className={s.statusSelect} style={{ color: STATUS_COLOR[o.status] }}>
                        {SHIP_STATUS_OPTIONS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                      </select>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ════ 銷售庫存報表 ════ */}
      {tab === 'report' && (
        <>
          <div className={s.reportFilters}>
            {[{ key: 'today', label: '今日' }, { key: 'week', label: '本週' }, { key: 'month', label: '本月' }, { key: 'custom', label: '自訂' }].map(({ key, label }) => (
              <button key={key} onClick={() => setReportPeriod(key as ReportPeriod)} className={reportPeriod === key ? s.btnPeriodActive : s.btnPeriod}>{label}</button>
            ))}
            {reportPeriod === 'custom' && (
              <>
                <input type="date" value={reportCustomStart} onChange={e => setReportCustomStart(e.target.value)} className={s.dateInput} />
                <span className={s.dateSep}>～</span>
                <input type="date" value={reportCustomEnd} onChange={e => setReportCustomEnd(e.target.value)} className={s.dateInput} />
                <button onClick={loadReport} className={s.btnApply}>套用</button>
              </>
            )}
          </div>

          {reportLoading ? <p className={s.loading}>計算中...</p> : (
            <>
              <div className={s.reportStatGrid}>
                {[{ label: '訂單數', value: reportStats.orders }, { label: '銷售件數', value: `${reportStats.qty} 件` }, { label: '總營收', value: `NT$ ${reportStats.revenue.toLocaleString()}` }, { label: '平均客單', value: `NT$ ${reportStats.avg.toLocaleString()}` }].map(({ label, value }) => (
                  <div key={label} className={s.reportStatCard}>
                    <div className={s.reportStatLabel}>{label}</div>
                    <div className={s.reportStatValue}>{value}</div>
                  </div>
                ))}
              </div>

              <div className={s.sectionLabel}>商品銷售排行</div>
              <div className={`${s.tableWrap} ${s.tableWrapMb}`}>
                {/* Desktop table */}
                <table className={s.table}>
                  <thead><tr>{['排名', '商品名稱', '銷售數量', '銷售金額', '佔總營收'].map((h, i) => <th key={h} className={i > 1 ? s.thRight : s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {reportData.length === 0 ? (
                      <tr><td colSpan={5} className={s.tdEmpty}>此期間無資料</td></tr>
                    ) : reportData.map((p, i) => (
                      <tr key={p.name} className={s.tr}>
                        <td className={`${s.tdRank} ${i < 3 ? s.rankTop : s.rankNormal}`}>#{i+1}</td>
                        <td className={s.tdProductName}>{p.name}</td>
                        <td className={s.tdQty}>{p.qty} 件</td>
                        <td className={s.tdSalesAmount}>NT$ {p.amount.toLocaleString()}</td>
                        <td className={s.tdPercent}>
                          <div className={s.percentBar}>
                            <div className={s.barTrack}>
                              <div className={s.barFill} style={{ width: `${reportStats.revenue > 0 ? Math.round(p.amount/reportStats.revenue*100) : 0}%` }} />
                            </div>
                            <span className={s.percentText}>{reportStats.revenue > 0 ? Math.round(p.amount/reportStats.revenue*100) : 0}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile card list */}
                <div className={s.cardList}>
                  {reportData.length === 0 ? (
                    <div className={s.tdEmpty}>此期間無資料</div>
                  ) : reportData.map((p, i) => (
                    <div key={p.name} className={s.reportCard}>
                      <div className={`${s.reportCardRank} ${i < 3 ? s.rankTop : s.rankNormal}`}>#{i+1}</div>
                      <div className={s.reportCardName}>{p.name}</div>
                      <div className={s.reportCardRow}>
                        <span className={s.reportCardQty}>{p.qty} 件 ・ {reportStats.revenue > 0 ? Math.round(p.amount/reportStats.revenue*100) : 0}%</span>
                        <span className={s.reportCardAmount}>NT$ {p.amount.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={s.sectionLabel}>每日銷售趨勢</div>
              <div className={s.tableWrap}>
                {/* Desktop table */}
                <table className={s.table}>
                  <thead><tr>{['日期', '訂單數', '銷售件數', '當日營收'].map((h, i) => <th key={h} className={i > 0 ? s.thRight : s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {reportDaily.length === 0 ? (
                      <tr><td colSpan={4} className={s.tdEmpty}>此期間無資料</td></tr>
                    ) : reportDaily.map(d => (
                      <tr key={d.date} className={s.tr}>
                        <td className={s.tdTrendDate}>{d.date}</td>
                        <td className={s.tdTrendNum}>{d.orders}</td>
                        <td className={s.tdTrendNum}>{d.qty} 件</td>
                        <td className={`${s.tdTrendRevenue} ${d.revenue > 0 ? s.revenuePositive : s.revenueMuted}`}>{d.revenue > 0 ? `NT$ ${d.revenue.toLocaleString()}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile card list */}
                <div className={s.cardList}>
                  {reportDaily.length === 0 ? (
                    <div className={s.tdEmpty}>此期間無資料</div>
                  ) : reportDaily.map(d => (
                    <div key={d.date} className={s.dailyCard}>
                      <div className={s.dailyCardDate}>{d.date}</div>
                      <div className={s.dailyCardRow}>
                        <span className={s.dailyCardStat}>{d.orders} 筆 ・ {d.qty} 件</span>
                        <span className={`${s.dailyCardStat} ${d.revenue > 0 ? s.dailyRevenuePositive : s.dailyRevenueMuted}`}>
                          {d.revenue > 0 ? `NT$ ${d.revenue.toLocaleString()}` : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* 訂單詳細抽屜 */}
      <OrderDrawer
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onStatusChange={updateStatus}
      />

      {/* 取消訂單確認 Modal */}
      {cancelTarget && (
        <div className={s.modalOverlay} onClick={() => !cancelLoading && setCancelTarget(null)}>
          <div className={s.modalBox} onClick={e => e.stopPropagation()}>
            <div className={s.modalTitle}>確認取消訂單</div>
            <div className={s.modalBody}>
              確定要取消這筆訂單嗎？
            </div>
            <div className={s.modalOrderNo}>
              {cancelTarget.order_no}
            </div>
            <div className={s.modalOrderInfo}>
              {cancelTarget.buyer_name} ・ NT$ {cancelTarget.total?.toLocaleString()}
            </div>

            {/* 信用卡已付款 → 自動退款提示 */}
            {cancelTarget.pay_method === 'credit' && cancelTarget.pay_status === 'paid' && (
              <div className={s.modalWarnCredit}>
                此訂單為信用卡付款（已付款），取消後將自動進行信用卡刷退。
              </div>
            )}

            {/* ATM 已付款 → 手動退款提示 */}
            {cancelTarget.pay_method === 'atm' && cancelTarget.pay_status === 'paid' && (
              <div className={s.modalWarnATM}>
                此訂單為 ATM虛擬帳號付款，退款將以銀行轉帳方式另行辦理，無法原路退回。請取消後手動處理退款。
              </div>
            )}

            <div className={s.modalActions}>
              <button
                onClick={() => setCancelTarget(null)}
                disabled={cancelLoading}
                className={s.btnModalBack}
              >
                返回
              </button>
              <button
                onClick={() => handleCancelOrder(cancelTarget)}
                disabled={cancelLoading}
                className={s.btnModalConfirm}
              >
                {cancelLoading ? '處理中...' : '確認取消'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
