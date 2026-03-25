'use client';

// app/admin/orders/page.tsx  ──  訂單管理（含詳細抽屜）

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchApi } from '@/lib/api';
import OrderDrawer from '@/components/OrderDrawer';

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

  const tabStyle = (t: string): React.CSSProperties => ({ padding: '10px 20px', cursor: 'pointer', fontSize: '13px', borderBottom: tab === t ? '2px solid #1E1C1A' : '2px solid transparent', color: tab === t ? '#1E1C1A' : '#888580', fontFamily: '"Noto Sans TC", sans-serif', whiteSpace: 'nowrap' });
  const thStyle: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC', whiteSpace: 'nowrap' };
  const selectStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #E8E4DC', background: '#fff', fontSize: '12px', color: '#555250', outline: 'none' };

  return (
    <div>
      <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: '0 0 24px' }}>訂單管理</h1>

      <div style={{ display: 'flex', borderBottom: '1px solid #E8E4DC', marginBottom: '24px' }}>
        <div style={tabStyle('list')}     onClick={() => setTab('list')}>訂單列表</div>
        <div style={tabStyle('shiplist')} onClick={() => setTab('shiplist')}>出貨單列表</div>
        <div style={tabStyle('report')}   onClick={() => setTab('report')}>銷售庫存報表</div>
      </div>

      {/* ════ 訂單列表 ════ */}
      {tab === 'list' && (
        <>
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <input value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadOrders()} placeholder="訂單編號、姓名、電話" style={{ ...selectStyle, padding: '8px 12px', minWidth: '240px', fontSize: '13px', color: '#1E1C1A' }} />
              <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} style={selectStyle} />
              <span style={{ alignSelf: 'center', color: '#888580' }}>～</span>
              <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} style={selectStyle} />
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={osStatus} onChange={e => setOsStatus(e.target.value)} style={selectStyle}>{STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
              <select value={osPay}    onChange={e => setOsPay(e.target.value)}    style={selectStyle}>{PAY_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
              <select value={osShip}   onChange={e => setOsShip(e.target.value)}   style={selectStyle}>{SHIP_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
              <input type="number" value={osMin} onChange={e => setOsMin(e.target.value)} placeholder="最低金額" style={{ ...selectStyle, width: '100px' }} />
              <input type="number" value={osMax} onChange={e => setOsMax(e.target.value)} placeholder="最高金額" style={{ ...selectStyle, width: '100px' }} />
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button onClick={() => { setKeyword(''); setDateStart(''); setDateEnd(''); setOsStatus(''); setOsPay(''); setOsShip(''); setOsMin(''); setOsMax(''); }} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '12px', color: '#555250', cursor: 'pointer' }}>清除</button>
                <button onClick={loadOrders} style={{ padding: '8px 20px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.1em' }}>搜尋</button>
              </div>
            </div>
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#888580' }}>共 <strong style={{ color: '#1E1C1A' }}>{orders.length}</strong> 筆訂單</div>
          </div>

          {loading ? <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p> : (
            <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['訂單編號', '日期', '買家', '商品', '金額', '付款狀態', '配送', '配送狀態', '操作'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>沒有符合條件的訂單</td></tr>
                  ) : orders.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid #E8E4DC', cursor: 'pointer' }} onClick={() => setSelectedOrder(o)}>
                      <td style={{ padding: '12px 16px', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', color: '#1E1C1A', whiteSpace: 'nowrap' }}>{o.order_no}</td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580', whiteSpace: 'nowrap' }}>{new Date(o.created_at).toLocaleDateString('zh-TW')}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: '13px', color: '#1E1C1A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {o.buyer_name}
                          <span style={{ fontSize: '9px', padding: '1px 6px', border: '1px solid', borderColor: o.member_id ? '#2ab85a' : '#b87a2a', color: o.member_id ? '#2ab85a' : '#b87a2a', fontFamily: '"Montserrat", sans-serif', whiteSpace: 'nowrap' }}>
                            {o.member_id ? '會員' : '訪客'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#888580' }}>{o.buyer_phone}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250', maxWidth: '160px' }}>{o.order_items?.map((i: any) => `${i.name}×${i.qty}`).join('、')}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A', whiteSpace: 'nowrap' }}>NT$ {o.total.toLocaleString()}</td>
                      <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                        {/* 付款狀態由綠界 webhook 自動更新，不給手動改 */}
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          fontSize: '11px',
                          color: PAY_COLOR[o.pay_status] ?? '#888580',
                          border: `1px solid ${PAY_COLOR[o.pay_status] ?? '#E8E4DC'}`,
                          fontFamily: '"Montserrat", sans-serif',
                          letterSpacing: '0.1em',
                        }}>
                          {PAY_LABEL[o.pay_status] ?? o.pay_status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '11px', color: '#555250', whiteSpace: 'nowrap' }}>{SHIP_LABEL[o.ship_method] ?? o.ship_method}</td>
                      <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                        {o.status === 'cancelled' ? (
                          <span style={{ display: 'inline-block', padding: '4px 12px', fontSize: '11px', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.1em' }}>已取消</span>
                        ) : (
                          <select value={o.status} onChange={e => updateStatus(o.id, 'status', e.target.value)} style={{ ...selectStyle, fontSize: '11px', color: STATUS_COLOR[o.status] }}>
                            {SHIP_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <button onClick={e => { e.stopPropagation(); setSelectedOrder(o); }} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer', marginRight: '6px' }}>詳細</button>
                        {o.status !== 'cancelled' && (
                          <button onClick={e => { e.stopPropagation(); setCancelTarget(o); }} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid #c0392b', fontSize: '11px', color: '#c0392b', cursor: 'pointer' }}>取消</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ════ 出貨單列表 ════ */}
      {tab === 'shiplist' && (
        <>
          <div style={{ background: '#EDE9E2', border: '1px solid #E8E4DC', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#555250' }}>顯示所有待出貨和已出貨的訂單。</div>
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['訂單編號', '收件人', '地址', '配送方式', '指定出貨日', '配送狀態'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {orders.filter(o => o.status !== 'cancelled').map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid #E8E4DC', cursor: 'pointer' }} onClick={() => setSelectedOrder(o)}>
                    <td style={{ padding: '12px 16px', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', color: '#1E1C1A' }}>{o.order_no}</td>
                    <td style={{ padding: '12px 16px' }}><div style={{ fontSize: '13px', color: '#1E1C1A' }}>{o.buyer_name}</div><div style={{ fontSize: '11px', color: '#888580' }}>{o.buyer_phone}</div></td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250', maxWidth: '180px' }}>{o.address || '門市自取'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250' }}>{SHIP_LABEL[o.ship_method] ?? o.ship_method}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580' }}>{o.ship_date ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                      <select value={o.status} onChange={e => updateStatus(o.id, 'status', e.target.value)} style={{ ...selectStyle, fontSize: '11px', color: STATUS_COLOR[o.status] }}>
                        {SHIP_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ════ 銷售庫存報表 ════ */}
      {tab === 'report' && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            {[{ key: 'today', label: '今日' }, { key: 'week', label: '本週' }, { key: 'month', label: '本月' }, { key: 'custom', label: '自訂' }].map(({ key, label }) => (
              <button key={key} onClick={() => setReportPeriod(key as ReportPeriod)} style={{ padding: '7px 16px', background: reportPeriod === key ? '#1E1C1A' : 'transparent', color: reportPeriod === key ? '#F7F4EF' : '#555250', border: '1px solid #E8E4DC', fontSize: '12px', cursor: 'pointer' }}>{label}</button>
            ))}
            {reportPeriod === 'custom' && (
              <>
                <input type="date" value={reportCustomStart} onChange={e => setReportCustomStart(e.target.value)} style={selectStyle} />
                <span style={{ color: '#888580' }}>～</span>
                <input type="date" value={reportCustomEnd} onChange={e => setReportCustomEnd(e.target.value)} style={selectStyle} />
                <button onClick={loadReport} style={{ padding: '7px 16px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontSize: '12px', cursor: 'pointer' }}>套用</button>
              </>
            )}
          </div>

          {reportLoading ? <p style={{ color: '#888580', fontSize: '13px' }}>計算中...</p> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
                {[{ label: '訂單數', value: reportStats.orders }, { label: '銷售件數', value: `${reportStats.qty} 件` }, { label: '總營收', value: `NT$ ${reportStats.revenue.toLocaleString()}` }, { label: '平均客單', value: `NT$ ${reportStats.avg.toLocaleString()}` }].map(({ label, value }) => (
                  <div key={label} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '18px 20px' }}>
                    <div style={{ fontSize: '10px', color: '#888580', letterSpacing: '0.2em', marginBottom: '8px', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase' }}>{label}</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#1E1C1A' }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#555250', marginBottom: '12px', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif' }}>商品銷售排行</div>
              <div style={{ background: '#fff', border: '1px solid #E8E4DC', marginBottom: '24px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['排名', '商品名稱', '銷售數量', '銷售金額', '佔總營收'].map((h, i) => <th key={h} style={{ ...thStyle, textAlign: i > 1 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {reportData.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>此期間無資料</td></tr>
                    ) : reportData.map((p, i) => (
                      <tr key={p.name} style={{ borderBottom: '1px solid #E8E4DC' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: '14px', color: i < 3 ? '#b35252' : '#888580', fontFamily: '"Montserrat", sans-serif' }}>#{i+1}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A' }}>{p.name}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#555250', textAlign: 'right' }}>{p.qty} 件</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A', textAlign: 'right' }}>NT$ {p.amount.toLocaleString()}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                            <div style={{ width: '60px', height: '5px', background: '#EDE9E2', borderRadius: '3px' }}>
                              <div style={{ width: `${reportStats.revenue > 0 ? Math.round(p.amount/reportStats.revenue*100) : 0}%`, height: '100%', background: '#1E1C1A', borderRadius: '3px' }} />
                            </div>
                            <span style={{ fontSize: '12px', color: '#555250' }}>{reportStats.revenue > 0 ? Math.round(p.amount/reportStats.revenue*100) : 0}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#555250', marginBottom: '12px', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif' }}>每日銷售趨勢</div>
              <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['日期', '訂單數', '銷售件數', '當日營收'].map((h, i) => <th key={h} style={{ ...thStyle, textAlign: i > 0 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {reportDaily.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>此期間無資料</td></tr>
                    ) : reportDaily.map(d => (
                      <tr key={d.date} style={{ borderBottom: '1px solid #E8E4DC' }}>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A', fontFamily: '"Montserrat", sans-serif' }}>{d.date}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#555250', textAlign: 'right' }}>{d.orders}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#555250', textAlign: 'right' }}>{d.qty} 件</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: d.revenue > 0 ? '#3d7a55' : '#888580', textAlign: 'right' }}>{d.revenue > 0 ? `NT$ ${d.revenue.toLocaleString()}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => !cancelLoading && setCancelTarget(null)}>
          <div style={{ background: '#fff', padding: '32px 36px', maxWidth: '420px', width: '90%', boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1E1C1A', marginBottom: '16px', letterSpacing: '0.1em' }}>確認取消訂單</div>
            <div style={{ fontSize: '13px', color: '#555250', lineHeight: 1.8, marginBottom: '8px' }}>
              確定要取消這筆訂單嗎？
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1E1C1A', marginBottom: '4px', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.08em' }}>
              {cancelTarget.order_no}
            </div>
            <div style={{ fontSize: '13px', color: '#555250', marginBottom: '20px' }}>
              {cancelTarget.buyer_name} ・ NT$ {cancelTarget.total?.toLocaleString()}
            </div>

            {/* 信用卡已付款 → 自動退款提示 */}
            {cancelTarget.pay_method === 'credit' && cancelTarget.pay_status === 'paid' && (
              <div style={{ background: '#FFF8E7', border: '1px solid #E8D5A3', padding: '12px 14px', fontSize: '12px', color: '#8B6914', lineHeight: 1.7, marginBottom: '16px' }}>
                此訂單為信用卡付款（已付款），取消後將自動進行信用卡刷退。
              </div>
            )}

            {/* ATM 已付款 → 手動退款提示 */}
            {cancelTarget.pay_method === 'atm' && cancelTarget.pay_status === 'paid' && (
              <div style={{ background: '#FFF0F0', border: '1px solid #E8BFBF', padding: '12px 14px', fontSize: '12px', color: '#8B1414', lineHeight: 1.7, marginBottom: '16px' }}>
                此訂單為 ATM虛擬帳號付款，退款將以銀行轉帳方式另行辦理，無法原路退回。請取消後手動處理退款。
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setCancelTarget(null)}
                disabled={cancelLoading}
                style={{ padding: '9px 24px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '12px', color: '#555250', cursor: 'pointer' }}
              >
                返回
              </button>
              <button
                onClick={() => handleCancelOrder(cancelTarget)}
                disabled={cancelLoading}
                style={{ padding: '9px 24px', background: '#c0392b', border: 'none', fontSize: '12px', color: '#fff', cursor: 'pointer', fontWeight: 600, letterSpacing: '0.08em', opacity: cancelLoading ? 0.6 : 1 }}
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
