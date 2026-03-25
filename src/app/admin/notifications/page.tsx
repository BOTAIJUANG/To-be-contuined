'use client';

// ════════════════════════════════════════════════
// app/admin/notifications/page.tsx  ──  通知系統
//
// 分頁：後台提醒 / Email 範本 / 批次發送 / 發送記錄
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import s from '../_shared/admin-shared.module.css';
import p from './notifications.module.css';

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

  return (
    <div>
      <h1 className={`${s.pageTitle} ${s.mb24}`}>通知系統</h1>

      <div className={s.tabBar}>
        <div className={tab === 'alerts'    ? s.tabActive : s.tab} onClick={() => setTab('alerts')}>後台提醒</div>
        <div className={tab === 'templates' ? s.tabActive : s.tab} onClick={() => setTab('templates')}>Email 範本</div>
        <div className={tab === 'batch'     ? s.tabActive : s.tab} onClick={() => setTab('batch')}>批次發送</div>
        <div className={tab === 'log'       ? s.tabActive : s.tab} onClick={() => setTab('log')}>發送記錄</div>
      </div>

      {/* ════ 後台提醒 ════ */}
      {tab === 'alerts' && (
        <div>
          <div className={p.alertHint}>每次進入頁面自動更新</div>
          {alerts.map((a, i) => (
            <div key={i} className={p.alertItem} style={{ background: a.type === 'ok' ? '#f0faf4' : '#fff8e1', border: `1px solid ${a.type === 'ok' ? '#b2dfdb' : '#f0c040'}`, color: a.type === 'ok' ? '#2ab85a' : '#7a5c00' }}>
              {a.msg}
            </div>
          ))}
        </div>
      )}

      {/* ════ Email 範本 ════ */}
      {tab === 'templates' && (
        <div>
          <div className={s.infoBar}>
            範本支援變數：<code className={p.codeTag}>{'{{姓名}}'}</code>
            <code className={`${p.codeTag} ${p.codeTagGap}`}>{'{{訂單編號}}'}</code>
            <code className={`${p.codeTag} ${p.codeTagGap}`}>{'{{商品清單}}'}</code>
            <code className={`${p.codeTag} ${p.codeTagGap}`}>{'{{總金額}}'}</code>
            <code className={`${p.codeTag} ${p.codeTagGap}`}>{'{{追蹤號碼}}'}</code>
          </div>
          {templates.map((t) => (
            <div key={t.key} className={p.templateCard}>
              <div className={p.templateHeader} style={{ borderBottom: editingTemplate === t.key ? '1px solid var(--line)' : 'none' }}>
                <div>
                  <div className={p.templateTitle}>{t.name}</div>
                  <div className={p.templateSubject}>{t.subject}</div>
                </div>
                <button
                  onClick={() => setEditingTemplate(editingTemplate === t.key ? null : t.key)}
                  className={s.btnSmall}
                >
                  {editingTemplate === t.key ? '收合' : '編輯'}
                </button>
              </div>
              {editingTemplate === t.key && (
                <div className={p.templateBody}>
                  <div className={s.mb12}>
                    <label className={s.label}>主旨</label>
                    <input value={t.subject} onChange={e => setTemplates(prev => prev.map(x => x.key === t.key ? { ...x, subject: e.target.value } : x))} className={s.input} />
                  </div>
                  <div className={s.mb12}>
                    <label className={s.label}>內容</label>
                    <textarea value={t.body} onChange={e => setTemplates(prev => prev.map(x => x.key === t.key ? { ...x, body: e.target.value } : x))} rows={8} className={s.textarea} />
                  </div>
                  <button onClick={() => alert('範本已儲存（本地）')} className={s.btnPrimary}>
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
          <div className={s.warningBar}>
            批次 Email 將同時寄送給所有選取的訂單收件人，請確認內容後再送出。
          </div>

          {/* 篩選 */}
          <div className={p.batchControls}>
            <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)} className={`${s.filterSelect} ${p.batchFilterSelect}`}>
              <option value="">全部狀態</option>
              <option value="processing">處理中</option>
              <option value="shipped">已出貨</option>
              <option value="done">已完成</option>
            </select>
            <button onClick={() => setSelectedOrders(new Set(batchOrders.map(o => o.order_no)))} className={s.btnSmall}>全選</button>
            <button onClick={() => setSelectedOrders(new Set())} className={s.btnSmall}>取消全選</button>
            <span className={p.selectionCount}>已選 {selectedOrders.size} 筆</span>
          </div>

          {/* 訂單列表 */}
          <div className={p.batchOrderList}>
            <table className={p.inlineTable}>
              <tbody>
                {batchOrders.map((o) => (
                  <tr key={o.order_no} className={s.tr}>
                    <td className={`${s.td} ${p.tdCheckbox}`}>
                      <input type="checkbox" checked={selectedOrders.has(o.order_no)} onChange={e => setSelectedOrders(prev => { const set = new Set(prev); e.target.checked ? set.add(o.order_no) : set.delete(o.order_no); return set; })} className={s.checkbox} />
                    </td>
                    <td className={`${s.td} ${p.tdOrderNo}`}>{o.order_no}</td>
                    <td className={s.td}>{o.buyer_name}</td>
                    <td className={`${s.td} ${p.tdSubtle}`}>{o.buyer_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 發送內容 */}
          <div className={s.mb16}>
            <label className={s.label}>使用範本</label>
            <select onChange={e => { const t = templates.find(x => x.key === e.target.value); if (t) { setBatchSubject(t.subject); setBatchBody(t.body); } }} className={`${s.select} ${p.batchTemplateSelect}`}>
              <option value="">自行輸入</option>
              {templates.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
            <div className={s.mb12}>
              <label className={s.label}>主旨</label>
              <input value={batchSubject} onChange={e => setBatchSubject(e.target.value)} placeholder="例：關於您訂單的重要通知" className={s.input} />
            </div>
            <div className={s.mb16}>
              <label className={s.label}>內容</label>
              <textarea value={batchBody} onChange={e => setBatchBody(e.target.value)} rows={8} placeholder={'親愛的 {{姓名}}，...'} className={s.textarea} />
            </div>
            <button onClick={handleSendBatch} disabled={sending} className={s.btnPrimary}>
              {sending ? '發送中...' : `發送給 ${selectedOrders.size} 位顧客`}
            </button>
          </div>
        </div>
      )}

      {/* ════ 發送記錄 ════ */}
      {tab === 'log' && (
        <div className={s.tableWrap}>
          <table className={`${s.table} ${p.logTable}`}>
            <thead>
              <tr>
                {['發送時間', '類型', '收件人數', '主旨', '狀態'].map(h => (
                  <th key={h} className={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.length === 0 ? (
                <tr><td colSpan={5} className={s.emptyRow}>尚無發送記錄</td></tr>
              ) : log.map((l, i) => (
                <tr key={i} className={s.tr}>
                  <td className={`${s.td} ${p.tdMeta}`}>{l.time}</td>
                  <td className={`${s.td} ${p.tdSmall}`}>{l.type}</td>
                  <td className={s.td}>{l.recipients}</td>
                  <td className={`${s.td} ${p.tdMeta}`}>{l.subject}</td>
                  <td className={s.td}>
                    <span className={`${s.badge} ${p.badgeSuccess}`}>{l.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile card list for log */}
          <div className={s.cardList}>
            {log.length === 0 ? (
              <div className={s.emptyRow}>尚無發送記錄</div>
            ) : log.map((l, i) => (
              <div key={i} className={s.card}>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>時間</span>
                  <span className={`${s.cardValue} ${p.cardValueSmall}`}>{l.time}</span>
                </div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>類型</span>
                  <span className={s.cardValue}>{l.type}</span>
                </div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>收件人</span>
                  <span className={s.cardValue}>{l.recipients}</span>
                </div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>主旨</span>
                  <span className={`${s.cardValue} ${p.cardValueSmall}`}>{l.subject}</span>
                </div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>狀態</span>
                  <span className={`${s.badge} ${p.badgeSuccess}`}>{l.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
