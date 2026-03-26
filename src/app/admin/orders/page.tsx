'use client';

// app/admin/orders/page.tsx  ──  訂單管理（含詳細抽屜）

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchApi } from '@/lib/api';
import OrderDrawer from '@/components/OrderDrawer';
import s from './orders.module.css';

type OrderTab = 'list' | 'shiplist' | 'shipped' | 'report';
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
  { value: '', label: '全部付款狀態' }, { value: 'pending', label: '待付款' },
  { value: 'paid', label: '已付款' }, { value: 'failed', label: '付款失敗' },
];
const SHIP_OPTIONS = [
  { value: '', label: '全部配送方式' }, { value: 'home_normal', label: '一般宅配' },
  { value: 'home_cold', label: '低溫宅配' }, { value: 'cvs_711', label: '7-11取貨' },
  { value: 'cvs_family', label: '全家取貨' }, { value: 'store', label: '門市自取' },
];
const STATUS_COLOR: Record<string, string> = { processing: '#7a5846', shipped: '#5a7a8a', done: '#4a7a56', cancelled: '#8b7d70' };
const STATUS_LABEL: Record<string, string> = { processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消' };
const PAY_COLOR: Record<string, string>    = { pending: '#8b6722', paid: '#4a7a56', failed: '#b55245' };
const PAY_LABEL: Record<string, string>    = { pending: '待付款', paid: '已付款', failed: '失敗' };
const SHIP_LABEL: Record<string, string>   = { home: '宅配', cvs_711: '7-11', store: '門市自取', home_normal: '一般宅配', home_cold: '低溫宅配', cvs_family: '全家' };
const SORT_OPTIONS = [
  { value: 'newest', label: '最新優先' }, { value: 'oldest', label: '最舊優先' },
  { value: 'amount_desc', label: '金額高到低' }, { value: 'amount_asc', label: '金額低到高' },
];
const SHIP_SORT_OPTIONS = [
  { value: 'oldest', label: '最舊訂單優先' }, { value: 'newest', label: '最新訂單優先' },
  { value: 'ship_date_asc', label: '指定日期最早' }, { value: 'ship_date_desc', label: '指定日期最晚' },
];
const SHIPPED_SORT_OPTIONS = [
  { value: 'shipped_newest', label: '最新出貨優先' }, { value: 'shipped_oldest', label: '最舊出貨優先' },
];

function productSummary(items: any[]) {
  if (!items || items.length === 0) return '—';
  const first = items[0];
  const rest = items.length - 1;
  return rest > 0 ? `${first.name} ×${first.qty}，另有 ${rest} 項` : `${first.name} ×${first.qty}`;
}
function totalQty(items: any[]) { return items?.reduce((s: number, i: any) => s + i.qty, 0) ?? 0; }

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
  const [osSort, setOsSort] = useState('newest');
  const [showFilters, setShowFilters] = useState(false);

  // 出貨列表（待出貨）
  const [shipOrders, setShipOrders] = useState<any[]>([]);
  const [shipLoading, setShipLoading] = useState(false);
  const [shipSelected, setShipSelected] = useState<Set<number>>(new Set());
  const [shipKeyword, setShipKeyword] = useState('');
  const [shipSort, setShipSort] = useState('oldest');
  const [shipConfirmModal, setShipConfirmModal] = useState(false);
  const [shipProcessing, setShipProcessing] = useState(false);

  // 已出貨訂單
  const [shippedOrders, setShippedOrders] = useState<any[]>([]);
  const [shippedLoading, setShippedLoading] = useState(false);
  const [shippedKeyword, setShippedKeyword] = useState('');
  const [shippedSort, setShippedSort] = useState('shipped_newest');

  // 報表
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('month');
  const [reportCustomStart, setReportCustomStart] = useState('');
  const [reportCustomEnd, setReportCustomEnd] = useState('');
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportStats, setReportStats] = useState({ orders: 0, revenue: 0, qty: 0, avg: 0 });
  const [reportDaily, setReportDaily] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const loadOrders = async (overrides: Record<string, string> = {}) => {
    setLoading(true);
    const kw = 'keyword' in overrides ? overrides.keyword : keyword;
    const ds = 'dateStart' in overrides ? overrides.dateStart : dateStart;
    const de = 'dateEnd' in overrides ? overrides.dateEnd : dateEnd;
    const st = 'osStatus' in overrides ? overrides.osStatus : osStatus;
    const py = 'osPay' in overrides ? overrides.osPay : osPay;
    const sh = 'osShip' in overrides ? overrides.osShip : osShip;
    const mn = 'osMin' in overrides ? overrides.osMin : osMin;
    const mx = 'osMax' in overrides ? overrides.osMax : osMax;
    const sort = 'osSort' in overrides ? overrides.osSort : osSort;

    let orderBy = 'created_at';
    let ascending = false;
    if (sort === 'oldest') ascending = true;
    if (sort === 'amount_desc') { orderBy = 'total'; }
    if (sort === 'amount_asc') { orderBy = 'total'; ascending = true; }

    let q = supabase.from('orders').select('*, order_items(name, qty, price)').order(orderBy, { ascending });
    if (st)  q = q.eq('status', st);
    if (py)  q = q.eq('pay_status', py);
    if (sh)  q = q.eq('ship_method', sh);
    if (ds)  q = q.gte('created_at', ds);
    if (de)  q = q.lte('created_at', de + 'T23:59:59');
    if (mn)  q = q.gte('total', Number(mn));
    if (mx)  q = q.lte('total', Number(mx));
    const { data } = await q;
    let list = data ?? [];
    if (kw) {
      const kwl = kw.toLowerCase();
      list = list.filter((o: any) => o.order_no.toLowerCase().includes(kwl) || (o.buyer_name ?? '').includes(kwl) || (o.buyer_phone ?? '').includes(kwl));
    }
    setOrders(list);
    setLoading(false);
  };

  const removeChip = (overrides: Record<string, string>) => {
    if ('osStatus' in overrides) setOsStatus(overrides.osStatus);
    if ('osPay' in overrides) setOsPay(overrides.osPay);
    if ('osShip' in overrides) setOsShip(overrides.osShip);
    if ('dateStart' in overrides) setDateStart(overrides.dateStart);
    if ('dateEnd' in overrides) setDateEnd(overrides.dateEnd);
    if ('osMin' in overrides) setOsMin(overrides.osMin);
    if ('osMax' in overrides) setOsMax(overrides.osMax);
    loadOrders(overrides);
  };

  const clearAll = () => {
    setKeyword(''); setDateStart(''); setDateEnd('');
    setOsStatus(''); setOsPay(''); setOsShip('');
    setOsMin(''); setOsMax(''); setOsSort('newest');
    loadOrders({ keyword: '', dateStart: '', dateEnd: '', osStatus: '', osPay: '', osShip: '', osMin: '', osMax: '', osSort: 'newest' });
  };

  // ── 出貨列表（待出貨）──
  const loadShipOrders = async () => {
    setShipLoading(true);
    let orderBy = 'created_at';
    let ascending = true;
    if (shipSort === 'newest') ascending = false;
    if (shipSort === 'ship_date_asc') { orderBy = 'ship_date'; }
    if (shipSort === 'ship_date_desc') { orderBy = 'ship_date'; ascending = false; }

    const { data } = await supabase.from('orders')
      .select('*, order_items(name, qty, price, product_id, variant_id)')
      .eq('pay_status', 'paid').eq('status', 'processing')
      .order(orderBy, { ascending });
    let list = data ?? [];
    if (shipKeyword) {
      const kw = shipKeyword.toLowerCase();
      list = list.filter((o: any) => o.order_no.toLowerCase().includes(kw) || (o.buyer_name ?? '').includes(kw) || (o.buyer_phone ?? '').includes(kw));
    }
    setShipOrders(list);
    setShipSelected(new Set());
    setShipLoading(false);
  };

  const toggleShipSelect = (id: number) => {
    setShipSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleShipSelectAll = () => {
    setShipSelected(prev => prev.size === shipOrders.length ? new Set() : new Set(shipOrders.map(o => o.id)));
  };

  const batchMarkShipped = async () => {
    setShipProcessing(true);
    const ids = Array.from(shipSelected);
    for (const id of ids) { await updateStatus(id, 'status', 'shipped'); }
    setShipConfirmModal(false);
    setShipProcessing(false);
    loadShipOrders();
  };

  // ── 已出貨訂單 ──
  const loadShippedOrders = async () => {
    setShippedLoading(true);
    const ascending = shippedSort === 'shipped_oldest';
    const { data } = await supabase.from('orders')
      .select('*, order_items(name, qty, price)')
      .in('status', ['shipped', 'done'])
      .order('shipped_at', { ascending });
    let list = data ?? [];
    if (shippedKeyword) {
      const kw = shippedKeyword.toLowerCase();
      list = list.filter((o: any) => o.order_no.toLowerCase().includes(kw) || (o.buyer_name ?? '').includes(kw) || (o.buyer_phone ?? '').includes(kw));
    }
    setShippedOrders(list);
    setShippedLoading(false);
  };

  // ── CSV 匯出 ──
  const exportCSV = (list: any[], filename: string) => {
    const BOM = '\uFEFF';
    const headers = ['訂單編號', '下單日期', '收件人', '電話', '地址', '配送方式', '指定出貨日', '指定到店日', '商品名稱', '數量', '單價', '小計', '備註'];
    const rows = list.flatMap(o => (o.order_items ?? []).map((item: any) => [
      o.order_no, new Date(o.created_at).toLocaleDateString('zh-TW'), o.buyer_name, o.buyer_phone,
      o.address || (o.ship_method === 'store' ? '門市自取' : '—'), SHIP_LABEL[o.ship_method] ?? o.ship_method,
      o.ship_method !== 'store' ? (o.ship_date ?? '') : '',
      o.ship_method === 'store' ? (o.ship_date ?? '') : '',
      item.name, item.qty, item.price, item.price * item.qty, o.note ?? '',
    ]));
    const csv = BOM + [headers, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => { loadOrders(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'shiplist') loadShipOrders(); }, [tab, shipSort]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'shipped') loadShippedOrders(); }, [tab, shippedSort]);

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
        <div className={tab === 'shiplist' ? s.tabActive : s.tab} onClick={() => setTab('shiplist')}>出貨列表</div>
        <div className={tab === 'shipped' ? s.tabActive : s.tab}  onClick={() => setTab('shipped')}>已出貨訂單</div>
        <div className={tab === 'report' ? s.tabActive : s.tab}   onClick={() => setTab('report')}>銷售庫存報表</div>
      </div>

      {/* ════ 訂單列表 ════ */}
      {tab === 'list' && (
        <>
          <div className={s.filterPanel}>
            {/* Row 1: Search Bar */}
            <div className={s.searchBar}>
              <input value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadOrders()} placeholder="搜尋訂單編號 / 姓名 / 電話" className={s.input} />
              <div className={s.searchDates}>
                <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className={s.searchDateInput} />
                <span className={s.dateSep}>～</span>
                <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className={s.searchDateInput} />
              </div>
              <div className={s.searchActions}>
                <button onClick={() => loadOrders()} className={s.btnSearch}>搜尋</button>
                <button onClick={clearAll} className={s.btnClear}>清除</button>
              </div>
            </div>

            {/* Mobile: expand filters toggle */}
            <button className={s.filterExpandBtn} onClick={() => setShowFilters(v => !v)}>
              {showFilters ? '收起篩選條件' : '展開更多條件'}
            </button>

            {/* Row 2: Filter Bar */}
            <div className={`${s.filterBar} ${showFilters ? s.filterBarOpen : ''}`}>
              <select value={osStatus} onChange={e => setOsStatus(e.target.value)} className={s.select}>{STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              <select value={osPay} onChange={e => setOsPay(e.target.value)} className={s.select}>{PAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              <select value={osShip} onChange={e => setOsShip(e.target.value)} className={s.select}>{SHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              <input type="number" value={osMin} onChange={e => setOsMin(e.target.value)} placeholder="最低金額" className={s.amountInput} />
              <input type="number" value={osMax} onChange={e => setOsMax(e.target.value)} placeholder="最高金額" className={s.amountInput} />
              <select value={osSort} onChange={e => setOsSort(e.target.value)} className={s.sortSelect}>{SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            </div>

            {/* Row 3: Result Bar */}
            <div className={s.resultBar}>
              <span className={s.resultCount}>共 <strong className={s.resultCountNum}>{orders.length}</strong> 筆訂單</span>
              {(osStatus || osPay || osShip || dateStart || dateEnd || osMin || osMax) && (
                <div className={s.filterChips}>
                  {osStatus && <span className={s.filterChip}>{STATUS_OPTIONS.find(o => o.value === osStatus)?.label}<button onClick={() => removeChip({ osStatus: '' })} className={s.chipRemove}>×</button></span>}
                  {osPay && <span className={s.filterChip}>{PAY_OPTIONS.find(o => o.value === osPay)?.label}<button onClick={() => removeChip({ osPay: '' })} className={s.chipRemove}>×</button></span>}
                  {osShip && <span className={s.filterChip}>{SHIP_OPTIONS.find(o => o.value === osShip)?.label}<button onClick={() => removeChip({ osShip: '' })} className={s.chipRemove}>×</button></span>}
                  {(dateStart || dateEnd) && (
                    <span className={s.filterChip}>
                      {dateStart && dateEnd ? `${dateStart.slice(5).replace('-', '/')} - ${dateEnd.slice(5).replace('-', '/')}` : dateStart ? `${dateStart.slice(5).replace('-', '/')} 起` : `至 ${dateEnd!.slice(5).replace('-', '/')}`}
                      <button onClick={() => removeChip({ dateStart: '', dateEnd: '' })} className={s.chipRemove}>×</button>
                    </span>
                  )}
                  {(osMin || osMax) && (
                    <span className={s.filterChip}>
                      {osMin && osMax ? `$${osMin}-$${osMax}` : osMin ? `$${osMin} 以上` : `$${osMax} 以下`}
                      <button onClick={() => removeChip({ osMin: '', osMax: '' })} className={s.chipRemove}>×</button>
                    </span>
                  )}
                </div>
              )}
            </div>
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
                          <span className={s.buyerBadge} style={{ background: o.member_id ? '#ebf5ef' : '#f7f0e7', borderColor: o.member_id ? '#cfe4d4' : '#e9d9c6', color: o.member_id ? '#4a7a56' : '#8a6b4d' }}>
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
                          color: PAY_COLOR[o.pay_status] ?? '#8b7d70',
                          background: o.pay_status === 'paid' ? '#ebf5ef' : o.pay_status === 'pending' ? '#f8f1e2' : o.pay_status === 'failed' ? '#fcf1ef' : '#f5f0ea',
                          border: `1px solid ${o.pay_status === 'paid' ? '#cfe4d4' : o.pay_status === 'pending' ? '#ead8aa' : o.pay_status === 'failed' ? '#e8b5a8' : '#e7ddd0'}`,
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
                        <span className={s.buyerBadge} style={{ background: o.member_id ? '#ebf5ef' : '#f7f0e7', borderColor: o.member_id ? '#cfe4d4' : '#e9d9c6', color: o.member_id ? '#4a7a56' : '#8a6b4d' }}>
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
                        <span className={s.payBadge} style={{
                            color: STATUS_COLOR[o.status],
                            background: o.status === 'processing' ? '#f5ede7' : o.status === 'shipped' ? '#edf3f5' : o.status === 'done' ? '#ebf5ef' : '#f5f0ea',
                            border: `1px solid ${o.status === 'processing' ? '#e4d2c4' : o.status === 'shipped' ? '#c8d8e0' : o.status === 'done' ? '#cfe4d4' : '#e7ddd0'}`,
                          }}>
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

      {/* ════ 出貨列表（待出貨作業）════ */}
      {tab === 'shiplist' && (
        <>
          {/* 搜尋 + 排序 */}
          <div className={s.shipToolbar}>
            <input value={shipKeyword} onChange={e => setShipKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadShipOrders()} placeholder="搜尋訂單編號 / 姓名 / 電話" className={s.shipSearchInput} />
            <select value={shipSort} onChange={e => setShipSort(e.target.value)} className={s.shipSortSelect}>{SHIP_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            <button onClick={() => loadShipOrders()} className={s.btnSearch}>搜尋</button>
          </div>

          {/* 批次操作列 */}
          <div className={s.batchBar}>
            <label className={s.batchCheck}>
              <input type="checkbox" className={s.checkbox} checked={shipOrders.length > 0 && shipSelected.size === shipOrders.length} onChange={toggleShipSelectAll} />
              全選
            </label>
            <span className={s.batchCount}>已選 {shipSelected.size} 筆</span>
            <div className={s.batchActions}>
              <button className={s.btnExport} onClick={() => { const list = shipSelected.size > 0 ? shipOrders.filter(o => shipSelected.has(o.id)) : shipOrders; exportCSV(list, `待出貨_${new Date().toISOString().split('T')[0]}.csv`); }}>匯出 Excel</button>
              <button className={s.btnShipBatch} disabled={shipSelected.size === 0} onClick={() => setShipConfirmModal(true)}>標記出貨</button>
            </div>
          </div>

          {shipLoading ? <p className={s.loading}>載入中...</p> : (
            <div className={s.tableWrap}>
              {/* Desktop table */}
              <table className={s.table}>
                <thead><tr>
                  <th className={s.thCheck}><input type="checkbox" className={s.checkbox} checked={shipOrders.length > 0 && shipSelected.size === shipOrders.length} onChange={toggleShipSelectAll} /></th>
                  {['訂單編號', '日期', '收件人', '地址', '商品摘要', '數量', '備註', '配送', '指定日期', ''].map(h => <th key={h} className={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {shipOrders.length === 0 ? (
                    <tr><td colSpan={11} className={s.tdEmpty}>目前沒有待出貨訂單</td></tr>
                  ) : shipOrders.map(o => (
                    <tr key={o.id} className={s.tr} onClick={() => setSelectedOrder(o)}>
                      <td className={s.tdCheck} onClick={e => e.stopPropagation()}><input type="checkbox" className={s.checkbox} checked={shipSelected.has(o.id)} onChange={() => toggleShipSelect(o.id)} /></td>
                      <td className={s.tdOrderNo}>{o.order_no}</td>
                      <td className={s.tdDate}>{new Date(o.created_at).toLocaleDateString('zh-TW')}</td>
                      <td className={s.tdBuyer}><div className={s.buyerName}>{o.buyer_name}</div><div className={s.buyerPhone}>{o.buyer_phone}</div></td>
                      <td className={s.tdAddress}>{o.address || (o.ship_method === 'store' ? '門市自取' : '—')}</td>
                      <td className={s.tdProduct}>{productSummary(o.order_items)}</td>
                      <td className={s.tdQtyCell}>{totalQty(o.order_items)}</td>
                      <td className={s.tdNote} title={o.note ?? ''}>{o.note || '—'}</td>
                      <td className={s.tdShipMethodCell}>{SHIP_LABEL[o.ship_method] ?? o.ship_method}</td>
                      <td className={s.tdShipDate}>{o.ship_date ? `${o.ship_method === 'store' ? '到店' : '出貨'} ${o.ship_date}` : '—'}</td>
                      <td className={s.tdActions}><button onClick={e => { e.stopPropagation(); setSelectedOrder(o); }} className={s.btnDetail}>詳細</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile card list */}
              <div className={s.cardList}>
                {shipOrders.length === 0 ? (
                  <div className={s.tdEmpty}>目前沒有待出貨訂單</div>
                ) : shipOrders.map(o => (
                  <div key={o.id} className={s.shipCard} onClick={() => setSelectedOrder(o)}>
                    <div className={s.shipCardTop}>
                      <span className={s.shipCardOrderNo}>{o.order_no}</span>
                      <span className={s.shipCardDate}>{new Date(o.created_at).toLocaleDateString('zh-TW')}</span>
                    </div>
                    <div className={s.shipCardRecipient}>{o.buyer_name} ・ {o.buyer_phone}</div>
                    <div className={s.shipCardAddress}>{o.address || (o.ship_method === 'store' ? '門市自取' : '—')}</div>
                    <div className={s.shipCardProduct}>{productSummary(o.order_items)}（共 {totalQty(o.order_items)} 件）</div>
                    {o.note && <div className={s.shipCardNote}>備註：{o.note}</div>}
                    <div className={s.shipCardRow}>
                      <span className={s.shipCardMethod}>{SHIP_LABEL[o.ship_method] ?? o.ship_method}</span>
                      <span className={s.shipCardDate}>{o.ship_method === 'store' ? '到店日' : '出貨日'}：{o.ship_date ?? '—'}</span>
                    </div>
                    <div className={s.shipCardActions} onClick={e => e.stopPropagation()}>
                      <div className={s.shipCardCheckWrap}>
                        <input type="checkbox" className={s.checkbox} checked={shipSelected.has(o.id)} onChange={() => toggleShipSelect(o.id)} />
                        <button onClick={() => setSelectedOrder(o)} className={s.btnDetail}>詳細</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ════ 已出貨訂單 ════ */}
      {tab === 'shipped' && (
        <>
          <div className={s.shipToolbar}>
            <input value={shippedKeyword} onChange={e => setShippedKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadShippedOrders()} placeholder="搜尋訂單編號 / 姓名 / 電話" className={s.shipSearchInput} />
            <select value={shippedSort} onChange={e => setShippedSort(e.target.value)} className={s.shipSortSelect}>{SHIPPED_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            <button onClick={() => loadShippedOrders()} className={s.btnSearch}>搜尋</button>
            <button className={s.btnExport} onClick={() => exportCSV(shippedOrders, `已出貨_${new Date().toISOString().split('T')[0]}.csv`)}>匯出 Excel</button>
          </div>

          {shippedLoading ? <p className={s.loading}>載入中...</p> : (
            <div className={s.tableWrap}>
              {/* Desktop table */}
              <table className={s.table}>
                <thead><tr>{['訂單編號', '出貨日', '下單日', '收件人', '地址', '商品摘要', '備註', '配送', ''].map(h => <th key={h} className={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {shippedOrders.length === 0 ? (
                    <tr><td colSpan={9} className={s.tdEmpty}>沒有已出貨訂單</td></tr>
                  ) : shippedOrders.map(o => (
                    <tr key={o.id} className={s.tr} onClick={() => setSelectedOrder(o)}>
                      <td className={s.tdOrderNo}>{o.order_no}</td>
                      <td className={s.tdShippedDate}>{o.shipped_at ? new Date(o.shipped_at).toLocaleDateString('zh-TW') : '—'}</td>
                      <td className={s.tdDate}>{new Date(o.created_at).toLocaleDateString('zh-TW')}</td>
                      <td className={s.tdBuyer}><div className={s.buyerName}>{o.buyer_name}</div><div className={s.buyerPhone}>{o.buyer_phone}</div></td>
                      <td className={s.tdAddress}>{o.address || (o.ship_method === 'store' ? '門市自取' : '—')}</td>
                      <td className={s.tdProduct}>{productSummary(o.order_items)}</td>
                      <td className={s.tdNote} title={o.note ?? ''}>{o.note || '—'}</td>
                      <td className={s.tdShipMethodCell}>{SHIP_LABEL[o.ship_method] ?? o.ship_method}</td>
                      <td className={s.tdActions}><button onClick={e => { e.stopPropagation(); setSelectedOrder(o); }} className={s.btnDetail}>詳細</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile card list */}
              <div className={s.cardList}>
                {shippedOrders.length === 0 ? (
                  <div className={s.tdEmpty}>沒有已出貨訂單</div>
                ) : shippedOrders.map(o => (
                  <div key={o.id} className={s.shipCard} onClick={() => setSelectedOrder(o)}>
                    <div className={s.shipCardTop}>
                      <span className={s.shipCardOrderNo}>{o.order_no}</span>
                      <span className={s.shipCardDate}>{o.shipped_at ? new Date(o.shipped_at).toLocaleDateString('zh-TW') : '—'}</span>
                    </div>
                    <div className={s.shipCardRecipient}>{o.buyer_name} ・ {o.buyer_phone}</div>
                    <div className={s.shipCardAddress}>{o.address || (o.ship_method === 'store' ? '門市自取' : '—')}</div>
                    <div className={s.shipCardProduct}>{productSummary(o.order_items)}</div>
                    {o.note && <div className={s.shipCardNote}>備註：{o.note}</div>}
                    <div className={s.shipCardRow}>
                      <span className={s.shipCardMethod}>{SHIP_LABEL[o.ship_method] ?? o.ship_method}</span>
                      <button onClick={e => { e.stopPropagation(); setSelectedOrder(o); }} className={s.btnDetail}>詳細</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
      {/* 批次出貨確認 Modal */}
      {shipConfirmModal && (
        <div className={s.modalOverlay} onClick={() => !shipProcessing && setShipConfirmModal(false)}>
          <div className={s.modalBox} onClick={e => e.stopPropagation()}>
            <div className={s.modalTitle}>確認批次出貨</div>
            <div className={s.modalBody}>
              即將標記以下 <strong>{shipSelected.size}</strong> 筆訂單為「已出貨」，系統將自動扣除庫存。
            </div>
            <div className={s.shipModalBody}>
              {shipOrders.filter(o => shipSelected.has(o.id)).map(o => (
                <div key={o.id} className={s.shipModalItem}>
                  <span className={s.shipModalOrderNo}>{o.order_no}</span>
                  <span className={s.shipModalBuyer}>{o.buyer_name}</span>
                </div>
              ))}
            </div>
            <div className={s.modalActions}>
              <button onClick={() => setShipConfirmModal(false)} disabled={shipProcessing} className={s.btnModalBack}>返回</button>
              <button onClick={batchMarkShipped} disabled={shipProcessing} className={s.btnModalShip}>
                {shipProcessing ? '處理中...' : '確認出貨'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
