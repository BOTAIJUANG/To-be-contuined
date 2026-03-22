'use client';

// ════════════════════════════════════════════════
// app/admin/notifications/page.tsx  ──  通知系統
//
// 分頁：後台提醒 / Email 範本 / 批次發送 / 發送記錄
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type NotifTab = 'alerts' | 'templates' | 'batch' | 'log';

// Email 範本預設內容
const EMAIL_TEMPLATES = [
  {
    key:     'order_confirm',
    name:    '訂單確認信',
    subject: '【未半甜點】訂單確認 #{{訂單編號}}',
    body:    '親愛的 {{姓名}}，\n\n感謝您的訂購！您的訂單 #{{訂單編號}} 已成立。\n\n訂購商品：\n{{商品清單}}\n\n應付金額：{{總金額}}\n\n我們將盡快為您準備，出貨後會再次通知您。\n\n感謝您的支持！\n未半甜點',
  },
  {
    key:     'ship_notify',
    name:    '出貨通知',
    subject: '【未半甜點】您的訂單 #{{訂單編號}} 已出貨',
    body:    '親愛的 {{姓名}}，\n\n您的訂單 #{{訂單編號}} 已出貨！\n\n物流追蹤號碼：{{追蹤號碼}}\n預計到貨：{{預計到貨}}\n\n感謝您的支持！\n未半甜點',
  },
  {
    key:     'delay',
    name:    '出貨延遲通知',
    subject: '【未半甜點】關於您訂單 #{{訂單編號}} 的重要通知',
    body:    '親愛的 {{姓名}}，\n\n非常抱歉，您的訂單 #{{訂單編號}} 因原料備貨延遲，出貨時間將順延。\n\n我們將盡快處理並另行通知您新的出貨時間。造成不便，敬請見諒。\n\n未半甜點',
  },
];

export default function AdminNotificationsPage() {
  const [tab,           setTab]           = useState<NotifTab>('alerts');
  const [alerts,        setAlerts]        = useState<any[]>([]);
  const [batchOrders,   setBatchOrders]   = useState<any[]>([]);
  const [selectedOrders,setSelectedOrders]= useState<Set<string>>(new Set());
  const [batchFilter,   setBatchFilter]   = useState('');
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templates,     setTemplates]     = useState(EMAIL_TEMPLATES);
  const [batchSubject,  setBatchSubject]  = useState('');
  const [batchBody,     setBatchBody]     = useState('');
  const [sending,       setSending]       = useState(false);
  const [log,           setLog]           = useState<any[]>([]);

  // ── 載入後台提醒 ──────────────────────────────
  useEffect(() => {
    if (tab !== 'alerts') return;
    const loadAlerts = async () => {
      const [
        { count: pendingPay },
        { count: paidNotShipped },
      ] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('pay_status', 'pending'),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('pay_status', 'paid').eq('status', 'processing'),
      ]);
      const list = [];
      if ((pendingPay ?? 0) > 0)      list.push({ type: 'warn',  msg: `有 ${pendingPay} 筆訂單待核款` });
      if ((paidNotShipped ?? 0) > 0)  list.push({ type: 'warn',  msg: `有 ${paidNotShipped} 筆已付款訂單尚未出貨` });
      if (list.length === 0)          list.push({ type: 'ok',    msg: '目前沒有待處理事項' });
      setAlerts(list);
    };
    loadAlerts();
  }, [tab]);

  // ── 載入批次發送訂單 ──────────────────────────
  useEffect(() => {
    if (tab !== 'batch') return;
    const loadOrders = async () => {
      const q = supabase.from('orders').select('order_no, buyer_name, buyer_email, status, pay_status, order_items(name)').order('created_at', { ascending: false }).limit(50);
      if (batchFilter) q.eq('status', batchFilter);
      const { data } = await q;
      setBatchOrders(data ?? []);
    };
    loadOrders();
  }, [tab, batchFilter]);

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '10px 20px', cursor: 'pointer', fontSize: '13px',
    borderBottom: tab === t ? '2px solid #1E1C1A' : '2px solid transparent',
    color: tab === t ? '#1E1C1A' : '#888580',
    fontFamily: '"Noto Sans TC", sans-serif', whiteSpace: 'nowrap',
  });

  const handleSendBatch = async () => {
    if (selectedOrders.size === 0) { alert('請選擇訂單'); return; }
    if (!batchSubject || !batchBody) { alert('請填寫主旨和內容'); return; }
    setSending(true);
    // TODO: 串接 Email 發送 API（例如 Resend / SendGrid）
    await new Promise(r => setTimeout(r, 1000));
    setLog(prev => [{
      time: new Date().toLocaleString('zh-TW'),
      type: '批次發送',
      recipients: selectedOrders.size,
      subject: batchSubject,
      status: '已發送',
    }, ...prev]);
    setSending(false);
    alert(`已發送給 ${selectedOrders.size} 位顧客（目前為模擬，需串接 Email API）`);
    setSelectedOrders(new Set());
  };

  const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #E8E4DC', background: '#fff', fontFamily: 'inherit', fontSize: '13px', color: '#1E1C1A', outline: 'none', width: '100%' };

  return (
    <div>
      <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: '0 0 24px' }}>通知系統</h1>

      <div style={{ display: 'flex', borderBottom: '1px solid #E8E4DC', marginBottom: '24px' }}>
        <div style={tabStyle('alerts')}    onClick={() => setTab('alerts')}>後台提醒</div>
        <div style={tabStyle('templates')} onClick={() => setTab('templates')}>Email 範本</div>
        <div style={tabStyle('batch')}     onClick={() => setTab('batch')}>批次發送</div>
        <div style={tabStyle('log')}       onClick={() => setTab('log')}>發送記錄</div>
      </div>

      {/* ════ 後台提醒 ════ */}
      {tab === 'alerts' && (
        <div>
          <div style={{ fontSize: '11px', color: '#888580', marginBottom: '16px' }}>每次進入頁面自動更新</div>
          {alerts.map((a, i) => (
            <div key={i} style={{ padding: '14px 20px', background: a.type === 'ok' ? '#f0faf4' : '#fff8e1', border: `1px solid ${a.type === 'ok' ? '#b2dfdb' : '#f0c040'}`, marginBottom: '10px', fontSize: '13px', color: a.type === 'ok' ? '#2ab85a' : '#7a5c00', borderRadius: '2px' }}>
              {a.msg}
            </div>
          ))}
        </div>
      )}

      {/* ════ Email 範本 ════ */}
      {tab === 'templates' && (
        <div>
          <div style={{ background: '#EDE9E2', border: '1px solid #E8E4DC', padding: '12px 16px', marginBottom: '20px', fontSize: '12px', color: '#555250' }}>
            範本支援變數：<code style={{ background: '#fff', padding: '1px 6px' }}>{'{{姓名}}'}</code>
            <code style={{ background: '#fff', padding: '1px 6px', marginLeft: '6px' }}>{'{{訂單編號}}'}</code>
            <code style={{ background: '#fff', padding: '1px 6px', marginLeft: '6px' }}>{'{{商品清單}}'}</code>
            <code style={{ background: '#fff', padding: '1px 6px', marginLeft: '6px' }}>{'{{總金額}}'}</code>
            <code style={{ background: '#fff', padding: '1px 6px', marginLeft: '6px' }}>{'{{追蹤號碼}}'}</code>
          </div>
          {templates.map((t) => (
            <div key={t.key} style={{ background: '#fff', border: '1px solid #E8E4DC', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: editingTemplate === t.key ? '1px solid #E8E4DC' : 'none' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1E1C1A', marginBottom: '4px' }}>{t.name}</div>
                  <div style={{ fontSize: '12px', color: '#888580' }}>{t.subject}</div>
                </div>
                <button
                  onClick={() => setEditingTemplate(editingTemplate === t.key ? null : t.key)}
                  style={{ padding: '6px 16px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '12px', color: '#555250', cursor: 'pointer' }}
                >
                  {editingTemplate === t.key ? '收合' : '編輯'}
                </button>
              </div>
              {editingTemplate === t.key && (
                <div style={{ padding: '20px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif', display: 'block', marginBottom: '6px' }}>主旨</label>
                    <input value={t.subject} onChange={e => setTemplates(prev => prev.map(x => x.key === t.key ? { ...x, subject: e.target.value } : x))} style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif', display: 'block', marginBottom: '6px' }}>內容</label>
                    <textarea value={t.body} onChange={e => setTemplates(prev => prev.map(x => x.key === t.key ? { ...x, body: e.target.value } : x))} rows={8} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <button onClick={() => alert('範本已儲存（本地）')} style={{ padding: '8px 24px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', cursor: 'pointer' }}>
                    儲存範本
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ════ 批次發送 ════ */}
      {tab === 'batch' && (
        <div>
          <div style={{ background: '#fef0e8', border: '1px solid #e8a87c', padding: '12px 16px', marginBottom: '20px', fontSize: '12px', color: '#7a3c00' }}>
            批次 Email 將同時寄送給所有選取的訂單收件人，請確認內容後再送出。
          </div>

          {/* 篩選 */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
            <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #E8E4DC', background: '#fff', fontSize: '12px', color: '#555250', outline: 'none' }}>
              <option value="">全部狀態</option>
              <option value="processing">處理中</option>
              <option value="shipped">已出貨</option>
              <option value="done">已完成</option>
            </select>
            <button onClick={() => setSelectedOrders(new Set(batchOrders.map(o => o.order_no)))} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer' }}>全選</button>
            <button onClick={() => setSelectedOrders(new Set())} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer' }}>取消全選</button>
            <span style={{ fontSize: '12px', color: '#888580' }}>已選 {selectedOrders.size} 筆</span>
          </div>

          {/* 訂單列表 */}
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', marginBottom: '24px', maxHeight: '300px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {batchOrders.map((o) => (
                  <tr key={o.order_no} style={{ borderBottom: '1px solid #E8E4DC' }}>
                    <td style={{ padding: '10px 16px', width: '40px' }}>
                      <input type="checkbox" checked={selectedOrders.has(o.order_no)} onChange={e => setSelectedOrders(prev => { const s = new Set(prev); e.target.checked ? s.add(o.order_no) : s.delete(o.order_no); return s; })} style={{ accentColor: '#1E1C1A' }} />
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', color: '#1E1C1A' }}>{o.order_no}</td>
                    <td style={{ padding: '10px 16px', fontSize: '13px', color: '#1E1C1A' }}>{o.buyer_name}</td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#888580' }}>{o.buyer_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 發送內容 */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif', display: 'block', marginBottom: '6px' }}>使用範本</label>
            <select onChange={e => { const t = templates.find(x => x.key === e.target.value); if (t) { setBatchSubject(t.subject); setBatchBody(t.body); } }} style={{ padding: '10px 12px', border: '1px solid #E8E4DC', background: '#fff', fontSize: '13px', color: '#555250', outline: 'none', marginBottom: '16px', minWidth: '240px' }}>
              <option value="">自行輸入</option>
              {templates.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif', display: 'block', marginBottom: '6px' }}>主旨</label>
              <input value={batchSubject} onChange={e => setBatchSubject(e.target.value)} placeholder="例：關於您訂單的重要通知" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif', display: 'block', marginBottom: '6px' }}>內容</label>
              <textarea value={batchBody} onChange={e => setBatchBody(e.target.value)} rows={8} placeholder={'親愛的 {{姓名}}，...'} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <button onClick={handleSendBatch} disabled={sending} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
              {sending ? '發送中...' : `發送給 ${selectedOrders.size} 位顧客`}
            </button>
          </div>
        </div>
      )}

      {/* ════ 發送記錄 ════ */}
      {tab === 'log' && (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['發送時間', '類型', '收件人數', '主旨', '狀態'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>尚無發送記錄</td></tr>
              ) : log.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #E8E4DC' }}>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250' }}>{l.time}</td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#1E1C1A' }}>{l.type}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A' }}>{l.recipients}</td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250' }}>{l.subject}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '11px', color: '#2ab85a', border: '1px solid #2ab85a', padding: '2px 8px', fontFamily: '"Montserrat", sans-serif' }}>{l.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
