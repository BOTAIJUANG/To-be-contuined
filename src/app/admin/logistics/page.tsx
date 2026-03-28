'use client';

// ════════════════════════════════════════════════
// app/admin/logistics/page.tsx  ──  物流狀態
//
// 顯示所有訂單的配送進度
// 可以填入物流業者和追蹤號碼
// 可以更新訂單狀態
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchApi } from '@/lib/api';
import s from '../_shared/admin-shared.module.css';
import p from './logistics.module.css';

const SHIP_LABEL: Record<string, string> = {
  home: '一般宅配', cvs_711: '7-11取貨', store: '門市自取',
  home_normal: '一般宅配', home_cold: '低溫宅配', cvs_family: '全家取貨',
};

const CARRIERS = ['黑貓宅急便', '新竹貨運', '大榮貨運', '7-11 超商', '全家超商', '郵局', '其他'];

const STATUS_OPTIONS = [
  { value: 'processing', label: '處理中',  color: '#b87a2a' },
  { value: 'shipped',    label: '已出貨',  color: '#2a7ab8' },
  { value: 'done',       label: '已完成',  color: '#2ab85a' },
  { value: 'cancelled',  label: '已取消',  color: '#888580' },
];

export default function AdminLogisticsPage() {
  const [orders,  setOrders]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('');
  const [stats,   setStats]   = useState({ pending: 0, shipped: 0, done: 0, abnormal: 0 });

  // 編輯中的追蹤資訊（orderId → { tracking_no, carrier }）
  const [editing, setEditing] = useState<Record<number, { tracking_no: string; carrier: string }>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('id, order_no, buyer_name, buyer_phone, customer_name, customer_phone, ship_method, address, ship_date, status, pay_status, tracking_no, carrier, shipped_at, created_at, order_items(name, qty)')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    const list = data ?? [];

    // 統計卡片
    setStats({
      pending:  list.filter(o => o.status === 'processing' && o.pay_status === 'paid').length,
      shipped:  list.filter(o => o.status === 'shipped').length,
      done:     list.filter(o => o.status === 'done').length,
      abnormal: 0,
    });

    setOrders(list);

    // 初始化編輯狀態
    const initEditing: Record<number, { tracking_no: string; carrier: string }> = {};
    list.forEach((o: any) => {
      initEditing[o.id] = { tracking_no: o.tracking_no ?? '', carrier: o.carrier ?? '' };
    });
    setEditing(initEditing);

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // 更新訂單狀態（含庫存扣除/回補、集章/扣章等副作用）
  const updateStatus = async (orderId: number, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'shipped') updateData.shipped_at = new Date().toISOString();

      const order = orders.find(o => o.id === orderId);

      // 出貨或取消 → 庫存操作（API 自動查 order_items）
      if (newStatus === 'shipped' || newStatus === 'cancelled') {
        const action = newStatus === 'shipped' ? 'ship' : 'cancel';
        const res = await fetchApi(`/api/inventory?action=${action}`, {
          method: 'POST',
          body: JSON.stringify({ order_id: orderId }),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error('庫存操作失敗:', err);
          alert('庫存操作失敗：' + err);
        }
      }

      // 完成 → 自動加章
      if (newStatus === 'done') {
        const res = await fetchApi('/api/stamps?action=add', {
          method: 'POST',
          body: JSON.stringify({ order_id: orderId }),
        });
        if (!res.ok) console.error('集章失敗:', await res.text());
      }

      // 取消（且原本是已完成）→ 扣章
      if (newStatus === 'cancelled' && order?.status === 'done') {
        await fetchApi('/api/stamps?action=deduct', {
          method: 'POST',
          body: JSON.stringify({ order_id: orderId }),
        });
      }

      const { error } = await supabase.from('orders').update(updateData).eq('id', orderId);
      if (error) { alert('更新失敗：' + error.message); return; }
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updateData } : o));
    } catch (err) {
      console.error('updateStatus 錯誤:', err);
      alert('操作失敗，請稍後再試');
    }
  };

  // 儲存追蹤號碼
  const saveTracking = async (orderId: number) => {
    const { tracking_no, carrier } = editing[orderId] ?? {};
    await supabase.from('orders').update({ tracking_no, carrier }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, tracking_no, carrier } : o));
    alert('追蹤資訊已儲存');
  };

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.order_no.includes(search.toUpperCase()) || (o.buyer_name ?? '').includes(search) || (o.customer_name ?? '').includes(search);
    const matchFilter = !filter || o.status === filter;
    return matchSearch && matchFilter;
  });

  if (loading) return <p className={s.loadingText}>載入中...</p>;

  return (
    <div>
      <h1 className={`${s.pageTitle} ${p.pageTitleMb}`}>物流狀態</h1>

      {/* 統計卡片 */}
      <div className={s.statGrid}>
        {[
          { label: '待出貨（已付款）', value: stats.pending,  color: '#b87a2a' },
          { label: '配送中',           value: stats.shipped,  color: '#2a7ab8' },
          { label: '已送達',           value: stats.done,     color: '#2ab85a' },
          { label: '配送異常',         value: stats.abnormal, color: '#c0392b' },
        ].map(({ label, value, color }) => (
          <div key={label} className={s.statCard}>
            <div className={s.statLabel}>{label}</div>
            <div className={s.statValue} style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* 搜尋 + 篩選 */}
      <div className={s.filterRow}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋訂單編號或姓名..." className={s.searchInput} />
        <select value={filter} onChange={e => setFilter(e.target.value)} className={s.filterSelect}>
          <option value="">全部狀態</option>
          {STATUS_OPTIONS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
        </select>
        <span className={p.filterCount}>共 {filtered.length} 筆</span>
      </div>

      {/* 訂單列表 */}
      <div className={s.tableWrap}>
        {/* Desktop table */}
        <table className={s.table}>
          <thead>
            <tr>
              {['訂單編號', '買家', '配送方式', '商品', '出貨日', '物流業者', '追蹤號碼', '狀態', '操作'].map(h => (
                <th key={h} className={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className={s.emptyRow}>沒有符合條件的訂單</td></tr>
            ) : filtered.map((order) => (
              <tr key={order.id} className={s.tr}>
                {/* 訂單編號 */}
                <td className={`${s.td} ${p.tdOrderNo}`}>
                  {order.order_no}
                  {order.shipped_at && (
                    <div className={p.shippedDate}>
                      出貨：{new Date(order.shipped_at).toLocaleDateString('zh-TW')}
                    </div>
                  )}
                </td>

                {/* 收件人 */}
                <td className={s.td}>
                  <div className={p.buyerName}>{order.customer_name ?? order.buyer_name}</div>
                  <div className={p.buyerPhone}>{order.customer_phone ?? order.buyer_phone}</div>
                </td>

                {/* 配送方式 */}
                <td className={`${s.td} ${p.tdShipMethod}`}>
                  {SHIP_LABEL[order.ship_method] ?? order.ship_method}
                  {order.address && <div className={p.addressTrunc}>{order.address}</div>}
                </td>

                {/* 商品 */}
                <td className={`${s.td} ${p.tdItems}`}>
                  {order.order_items?.map((i: any) => `${i.name}×${i.qty}`).join('、')}
                </td>

                {/* 指定出貨日 */}
                <td className={`${s.td} ${p.tdShipDate}`}>
                  {order.ship_date ?? '—'}
                </td>

                {/* 物流業者（可編輯）*/}
                <td className={s.td}>
                  <select
                    value={editing[order.id]?.carrier ?? ''}
                    onChange={e => setEditing(prev => ({ ...prev, [order.id]: { ...prev[order.id], carrier: e.target.value } }))}
                    className={p.inlineSelect}
                  >
                    <option value="">— 選擇 —</option>
                    {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>

                {/* 追蹤號碼（可編輯）*/}
                <td className={s.td}>
                  <div className={`${s.flex} ${s.gap8} ${s.itemsCenter}`}>
                    <input
                      value={editing[order.id]?.tracking_no ?? ''}
                      onChange={e => setEditing(prev => ({ ...prev, [order.id]: { ...prev[order.id], tracking_no: e.target.value } }))}
                      placeholder="輸入追蹤號碼"
                      className={p.trackingInput}
                      onKeyDown={e => e.key === 'Enter' && saveTracking(order.id)}
                    />
                    <button onClick={() => saveTracking(order.id)} className={p.saveSmallBtn}>儲存</button>
                  </div>
                  {order.tracking_no && (
                    <div className={p.trackingSaved}>{order.tracking_no}</div>
                  )}
                </td>

                {/* 訂單狀態（可切換）*/}
                <td className={s.td}>
                  <select
                    value={order.status}
                    onChange={e => updateStatus(order.id, e.target.value)}
                    className={p.inlineSelect}
                    style={{ color: STATUS_OPTIONS.find(st => st.value === order.status)?.color ?? 'var(--text-light)' }}
                  >
                    {STATUS_OPTIONS.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                  </select>
                </td>

                {/* 操作 */}
                <td className={s.td}>
                  {order.tracking_no && (
                    <button
                      onClick={() => navigator.clipboard.writeText(order.tracking_no).then(() => alert('已複製追蹤號碼'))}
                      className={s.btnSmall}
                      title="複製追蹤號碼"
                    >
                      複製
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile card list */}
        <div className={s.cardList}>
          {filtered.length === 0 ? (
            <div className={s.emptyRow}>沒有符合條件的訂單</div>
          ) : filtered.map((order) => (
            <div key={order.id} className={s.card}>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>訂單</span>
                <span className={`${s.cardValue} ${p.cardOrderNo}`}>{order.order_no}</span>
              </div>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>收件人</span>
                <span className={s.cardValue}>{order.customer_name ?? order.buyer_name}</span>
              </div>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>配送</span>
                <span className={`${s.cardValue} ${p.cardShipMethod}`}>{SHIP_LABEL[order.ship_method] ?? order.ship_method}</span>
              </div>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>出貨日</span>
                <span className={`${s.cardValue} ${p.cardShipDate}`}>{order.ship_date ?? '—'}</span>
              </div>
              <div className={s.cardRow}>
                <span className={s.cardLabel}>狀態</span>
                <span className={s.badge} style={{ color: STATUS_OPTIONS.find(st => st.value === order.status)?.color, border: `1px solid ${STATUS_OPTIONS.find(st => st.value === order.status)?.color}` }}>
                  {STATUS_OPTIONS.find(st => st.value === order.status)?.label}
                </span>
              </div>
              <div className={s.mb8}>
                <div className={`${s.cardLabel} ${p.cardLabelMb}`}>物流業者</div>
                <select
                  value={editing[order.id]?.carrier ?? ''}
                  onChange={e => setEditing(prev => ({ ...prev, [order.id]: { ...prev[order.id], carrier: e.target.value } }))}
                  className={`${p.inlineSelect} ${p.selectFull}`}
                >
                  <option value="">— 選擇 —</option>
                  {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className={s.mb8}>
                <div className={`${s.cardLabel} ${p.cardLabelMb}`}>追蹤號碼</div>
                <div className={`${s.flex} ${s.gap8}`}>
                  <input
                    value={editing[order.id]?.tracking_no ?? ''}
                    onChange={e => setEditing(prev => ({ ...prev, [order.id]: { ...prev[order.id], tracking_no: e.target.value } }))}
                    placeholder="追蹤號碼"
                    className={`${p.trackingInput} ${p.trackingFlex}`}
                    onKeyDown={e => e.key === 'Enter' && saveTracking(order.id)}
                  />
                  <button onClick={() => saveTracking(order.id)} className={p.saveSmallBtn}>儲存</button>
                </div>
                {order.tracking_no && <div className={p.trackingSaved}>{order.tracking_no}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
