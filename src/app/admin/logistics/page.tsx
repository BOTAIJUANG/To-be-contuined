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

const SHIP_LABEL: Record<string, string> = {
  home_normal: '一般宅配', home_cold: '低溫宅配',
  cvs_711: '7-11取貨', cvs_family: '全家取貨', store: '門市自取',
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
      .select('id, order_no, buyer_name, buyer_phone, ship_method, address, ship_date, status, pay_status, tracking_no, carrier, shipped_at, created_at, order_items(name, qty)')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    const list = data ?? [];

    // 統計卡片
    setStats({
      pending:  list.filter(o => o.status === 'processing' && o.pay_status === 'paid').length,
      shipped:  list.filter(o => o.status === 'shipped').length,
      done:     list.filter(o => o.status === 'done').length,
      abnormal: 0, // 串接物流 API 後才有
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

  // 更新訂單狀態
  const updateStatus = async (orderId: number, status: string) => {
    const updateData: any = { status };
    // 改為已出貨時，自動記錄出貨時間
    if (status === 'shipped') updateData.shipped_at = new Date().toISOString();
    await supabase.from('orders').update(updateData).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
  };

  // 儲存追蹤號碼
  const saveTracking = async (orderId: number) => {
    const { tracking_no, carrier } = editing[orderId] ?? {};
    await supabase.from('orders').update({ tracking_no, carrier }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, tracking_no, carrier } : o));
    alert('追蹤資訊已儲存');
  };

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.order_no.includes(search.toUpperCase()) || (o.buyer_name ?? '').includes(search);
    const matchFilter = !filter || o.status === filter;
    return matchSearch && matchFilter;
  });

  const thStyle: React.CSSProperties = {
    padding: '12px 16px', textAlign: 'left',
    fontFamily: '"Montserrat", sans-serif', fontSize: '10px',
    letterSpacing: '0.25em', color: '#888580',
    textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC', whiteSpace: 'nowrap',
  };
  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', border: '1px solid #E8E4DC',
    background: '#fff', fontFamily: 'inherit',
    fontSize: '12px', color: '#1E1C1A', outline: 'none',
  };

  if (loading) return <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p>;

  return (
    <div>
      <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: '0 0 24px' }}>物流狀態</h1>

      {/* 統計卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: '待出貨（已付款）', value: stats.pending,  color: '#b87a2a' },
          { label: '配送中',           value: stats.shipped,  color: '#2a7ab8' },
          { label: '已送達',           value: stats.done,     color: '#2ab85a' },
          { label: '配送異常',         value: stats.abnormal, color: '#c0392b' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '20px 24px' }}>
            <div style={{ fontSize: '10px', color: '#888580', letterSpacing: '0.2em', marginBottom: '10px', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* 搜尋 + 篩選 */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋訂單編號或姓名..." style={{ ...inputStyle, padding: '10px 16px', minWidth: '240px' }} />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...inputStyle, padding: '10px 12px' }}>
          <option value="">全部狀態</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <span style={{ fontSize: '13px', color: '#888580', alignSelf: 'center' }}>共 {filtered.length} 筆</span>
      </div>

      {/* 訂單列表 */}
      <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['訂單編號', '買家', '配送方式', '商品', '出貨日', '物流業者', '追蹤號碼', '狀態', '操作'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>沒有符合條件的訂單</td></tr>
            ) : filtered.map((order) => (
              <tr key={order.id} style={{ borderBottom: '1px solid #E8E4DC' }}>
                {/* 訂單編號 */}
                <td style={{ padding: '12px 16px', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', color: '#1E1C1A', whiteSpace: 'nowrap' }}>
                  {order.order_no}
                  {order.shipped_at && (
                    <div style={{ fontSize: '10px', color: '#888580', marginTop: '2px' }}>
                      出貨：{new Date(order.shipped_at).toLocaleDateString('zh-TW')}
                    </div>
                  )}
                </td>

                {/* 買家 */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: '13px', color: '#1E1C1A' }}>{order.buyer_name}</div>
                  <div style={{ fontSize: '11px', color: '#888580' }}>{order.buyer_phone}</div>
                </td>

                {/* 配送方式 */}
                <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250', whiteSpace: 'nowrap' }}>
                  {SHIP_LABEL[order.ship_method] ?? order.ship_method}
                  {order.address && <div style={{ fontSize: '11px', color: '#888580', marginTop: '2px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.address}</div>}
                </td>

                {/* 商品 */}
                <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250', maxWidth: '150px' }}>
                  {order.order_items?.map((i: any) => `${i.name}×${i.qty}`).join('、')}
                </td>

                {/* 指定出貨日 */}
                <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580', whiteSpace: 'nowrap' }}>
                  {order.ship_date ?? '—'}
                </td>

                {/* 物流業者（可編輯）*/}
                <td style={{ padding: '12px 16px' }}>
                  <select
                    value={editing[order.id]?.carrier ?? ''}
                    onChange={e => setEditing(prev => ({ ...prev, [order.id]: { ...prev[order.id], carrier: e.target.value } }))}
                    style={{ ...inputStyle, minWidth: '100px' }}
                  >
                    <option value="">— 選擇 —</option>
                    {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>

                {/* 追蹤號碼（可編輯）*/}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      value={editing[order.id]?.tracking_no ?? ''}
                      onChange={e => setEditing(prev => ({ ...prev, [order.id]: { ...prev[order.id], tracking_no: e.target.value } }))}
                      placeholder="輸入追蹤號碼"
                      style={{ ...inputStyle, width: '130px', fontFamily: '"Montserrat", sans-serif' }}
                      onKeyDown={e => e.key === 'Enter' && saveTracking(order.id)}
                    />
                    <button
                      onClick={() => saveTracking(order.id)}
                      style={{ padding: '7px 10px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      儲存
                    </button>
                  </div>
                  {/* 顯示已儲存的追蹤號 */}
                  {order.tracking_no && (
                    <div style={{ fontSize: '10px', color: '#2ab85a', marginTop: '4px', fontFamily: '"Montserrat", sans-serif' }}>
                      ✓ {order.tracking_no}
                    </div>
                  )}
                </td>

                {/* 訂單狀態（可切換）*/}
                <td style={{ padding: '12px 16px' }}>
                  <select
                    value={order.status}
                    onChange={e => updateStatus(order.id, e.target.value)}
                    style={{ ...inputStyle, color: STATUS_OPTIONS.find(s => s.value === order.status)?.color ?? '#888580' }}
                  >
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>

                {/* 操作 */}
                <td style={{ padding: '12px 16px' }}>
                  {order.tracking_no && (
                    <button
                      onClick={() => navigator.clipboard.writeText(order.tracking_no).then(() => alert('已複製追蹤號碼'))}
                      style={{ padding: '5px 10px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer' }}
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
      </div>
    </div>
  );
}
