'use client';

// ════════════════════════════════════════════════
// app/admin/notifications/page.tsx  ──  通知系統
//
// 分頁：後台提醒 / Email 範本 / 批次發送 / 發送記錄
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchApi } from '@/lib/api';
import s from '../_shared/admin-shared.module.css';
import p from './notifications.module.css';

type NotifTab = 'alerts' | 'templates' | 'batch' | 'log';

// Email 範本型別
interface EmailTemplate {
  key: string;
  name: string;
  subject: string;
  body: string;
  isDefault?: boolean; // 預設範本不可刪除
}

// Email 範本預設內容
const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    key:     'order_confirm',
    name:    '訂單確認信',
    subject: '【未半甜點】訂單確認 #{{訂單編號}}',
    body:    '親愛的 {{姓名}}，\n\n感謝您的訂購！您的訂單 #{{訂單編號}} 已成立。\n\n訂購商品：\n{{商品清單}}\n\n應付金額：{{總金額}}\n\n我們將盡快為您準備，出貨後會再次通知您。\n\n感謝您的支持！\n未半甜點',
    isDefault: true,
  },
  {
    key:     'ship_notify',
    name:    '出貨通知',
    subject: '【未半甜點】您的訂單 #{{訂單編號}} 已出貨',
    body:    '親愛的 {{姓名}}，\n\n您的訂單 #{{訂單編號}} 已出貨！\n\n物流追蹤號碼：{{追蹤號碼}}\n預計到貨：{{預計到貨}}\n\n感謝您的支持！\n未半甜點',
    isDefault: true,
  },
  {
    key:     'delay',
    name:    '出貨延遲通知',
    subject: '【未半甜點】關於您訂單 #{{訂單編號}} 的重要通知',
    body:    '親愛的 {{姓名}}，\n\n非常抱歉，您的訂單 #{{訂單編號}} 因原料備貨延遲，出貨時間將順延。\n\n我們將盡快處理並另行通知您新的出貨時間。造成不便，敬請見諒。\n\n未半甜點',
    isDefault: true,
  },
  {
    key:     'cvs_fail',
    name:    '超商取貨異常通知',
    subject: '【未半甜點】關於您訂單 #{{訂單編號}} 的配送通知',
    body:    '親愛的 {{姓名}}，您好，\n\n感謝您的訂購與支持。\n\n很抱歉通知您，您本次訂單 #{{訂單編號}} 所選擇的取貨門市目前無法收貨或配送異常，因此訂單暫時無法正常出貨。\n\n為了盡快為您安排出貨，煩請您回覆此信件，提供以下資訊：\n\n・新的取貨門市名稱\n・或門市代號（若有）\n\n我們將在收到您的回覆後，立即為您更新訂單並安排後續配送。\n\n若有任何問題，也歡迎隨時與我們聯繫。\n\n造成您的不便，敬請見諒，感謝您的配合與理解。\n\n祝您順心\n未半甜點',
    isDefault: true,
  },
];

const STORAGE_KEY = 'tbc_email_templates';

// 從 localStorage 載入範本（合併預設 + 自訂）
function loadTemplates(): EmailTemplate[] {
  if (typeof window === 'undefined') return DEFAULT_TEMPLATES;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_TEMPLATES;
    const custom: EmailTemplate[] = JSON.parse(saved);
    // 預設範本用最新程式碼版本，再接上自訂範本
    // 但如果預設範本被使用者編輯過，保留使用者的修改
    const savedMap = new Map(custom.map(t => [t.key, t]));
    const merged = DEFAULT_TEMPLATES.map(dt => {
      const saved = savedMap.get(dt.key);
      return saved ? { ...saved, isDefault: true } : dt;
    });
    // 加上自訂範本（非預設的）
    const defaultKeys = new Set(DEFAULT_TEMPLATES.map(t => t.key));
    const customs = custom.filter(t => !defaultKeys.has(t.key));
    return [...merged, ...customs];
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

function saveTemplates(templates: EmailTemplate[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(templates)); } catch {}
}

export default function AdminNotificationsPage() {
  const [tab,           setTab]           = useState<NotifTab>('alerts');
  const [alerts,        setAlerts]        = useState<any[]>([]);
  const [batchOrders,   setBatchOrders]   = useState<any[]>([]);
  const [selectedOrders,setSelectedOrders]= useState<Set<string>>(new Set());
  const [batchFilter,   setBatchFilter]   = useState('');
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templates,     setTemplates]     = useState<EmailTemplate[]>(DEFAULT_TEMPLATES);
  const [batchSubject,  setBatchSubject]  = useState('');
  const [batchBody,     setBatchBody]     = useState('');
  const [sending,            setSending]            = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
  const [log,                setLog]                = useState<any[]>([]);
  // 新增範本表單
  const [showNewForm,   setShowNewForm]   = useState(false);
  const [newName,       setNewName]       = useState('');
  const [newSubject,    setNewSubject]    = useState('');
  const [newBody,       setNewBody]       = useState('');

  // 初次載入：從 localStorage 讀取範本
  useEffect(() => { setTemplates(loadTemplates()); }, []);

  // ── 載入發送記錄 ──────────────────────────────
  useEffect(() => {
    if (tab !== 'log') return;
    const loadLog = async () => {
      const { data } = await supabase
        .from('email_logs')
        .select('id, type, subject, recipient_count, success_count, fail_count, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (data) {
        setLog(data.map(l => ({
          time: new Date(l.created_at).toLocaleString('zh-TW'),
          type: l.type === 'batch' ? '批次發送' : l.type === 'order_confirm' ? '訂單確認' : l.type === 'ship_notify' ? '出貨通知' : l.type === 'refund_notify' ? '退款通知' : l.type,
          recipients: l.recipient_count,
          subject: l.subject ?? '',
          status: l.fail_count > 0 ? `${l.success_count} 成功 / ${l.fail_count} 失敗` : '全部成功',
        })));
      }
    };
    loadLog();
  }, [tab]);

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

    // 組合收件人資料
    const recipients = batchOrders
      .filter(o => selectedOrders.has(o.order_no))
      .map(o => ({
        email: o.buyer_email,
        name: o.buyer_name,
        order_no: o.order_no,
        items: o.order_items?.map((i: any) => i.name).join('、') ?? '',
        total: '',
      }));

    try {
      const res = await fetchApi('/api/email', {
        method: 'POST',
        body: JSON.stringify({
          action: 'batch',
          recipients,
          subject: batchSubject,
          body: batchBody,
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        const failDetails = data.results?.filter((r: any) => !r.ok).map((r: any) => `${r.email}: ${r.error}`).join('\n');
        alert(`已發送給 ${data.sent} 位顧客` + (data.failed > 0 ? `（${data.failed} 封失敗）\n\n失敗原因：\n${failDetails}` : ''));
      } else {
        alert('發送失敗：' + (data.error ?? '未知錯誤'));
      }
    } catch (err) {
      console.error('批次發送錯誤:', err);
      alert('發送失敗，請稍後再試');
    }

    setSending(false);
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
                  <div className={p.templateTitle}>
                    {t.name}
                    {!t.isDefault && <span className={p.customBadge}>自訂</span>}
                  </div>
                  <div className={p.templateSubject}>{t.subject}</div>
                </div>
                <div className={p.templateActions}>
                  <button
                    onClick={() => setEditingTemplate(editingTemplate === t.key ? null : t.key)}
                    className={s.btnSmall}
                  >
                    {editingTemplate === t.key ? '收合' : '編輯'}
                  </button>
                  {!t.isDefault && (
                    <button
                      onClick={() => {
                        if (!confirm(`確定刪除範本「${t.name}」？`)) return;
                        const next = templates.filter(x => x.key !== t.key);
                        setTemplates(next);
                        saveTemplates(next);
                        if (editingTemplate === t.key) setEditingTemplate(null);
                      }}
                      className={s.btnDanger}
                    >
                      刪除
                    </button>
                  )}
                </div>
              </div>
              {editingTemplate === t.key && (
                <div className={p.templateBody}>
                  {!t.isDefault && (
                    <div className={s.mb12}>
                      <label className={s.label}>範本名稱</label>
                      <input value={t.name} onChange={e => setTemplates(prev => prev.map(x => x.key === t.key ? { ...x, name: e.target.value } : x))} className={s.input} />
                    </div>
                  )}
                  <div className={s.mb12}>
                    <label className={s.label}>主旨</label>
                    <input value={t.subject} onChange={e => setTemplates(prev => prev.map(x => x.key === t.key ? { ...x, subject: e.target.value } : x))} className={s.input} />
                  </div>
                  <div className={s.mb12}>
                    <label className={s.label}>內容</label>
                    <textarea value={t.body} onChange={e => setTemplates(prev => prev.map(x => x.key === t.key ? { ...x, body: e.target.value } : x))} rows={8} className={s.textarea} />
                  </div>
                  <button onClick={() => { saveTemplates(templates); alert('範本已儲存'); }} className={s.btnPrimary}>
                    儲存範本
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* 新增範本 */}
          {!showNewForm ? (
            <button onClick={() => setShowNewForm(true)} className={`${s.btnOutline} ${p.addTemplateBtn}`}>
              + 新增自訂範本
            </button>
          ) : (
            <div className={p.templateCard}>
              <div className={p.templateBody}>
                <div className={s.mb12}>
                  <label className={s.label}>範本名稱</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：門市自取提醒" className={s.input} />
                </div>
                <div className={s.mb12}>
                  <label className={s.label}>主旨</label>
                  <input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="例：【未半甜點】{{訂單編號}} 相關通知" className={s.input} />
                </div>
                <div className={s.mb12}>
                  <label className={s.label}>內容</label>
                  <textarea value={newBody} onChange={e => setNewBody(e.target.value)} rows={8} placeholder={'親愛的 {{姓名}}，...'} className={s.textarea} />
                </div>
                <div className={p.newFormActions}>
                  <button
                    onClick={() => {
                      if (!newName.trim() || !newSubject.trim()) { alert('請填寫範本名稱和主旨'); return; }
                      const key = `custom_${Date.now()}`;
                      const next = [...templates, { key, name: newName.trim(), subject: newSubject.trim(), body: newBody }];
                      setTemplates(next);
                      saveTemplates(next);
                      setNewName(''); setNewSubject(''); setNewBody('');
                      setShowNewForm(false);
                      alert('自訂範本已新增');
                    }}
                    className={s.btnPrimary}
                  >
                    新增範本
                  </button>
                  <button onClick={() => { setShowNewForm(false); setNewName(''); setNewSubject(''); setNewBody(''); }} className={s.btnSmall}>
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}
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
            <select value={selectedTemplateKey} onChange={e => { setSelectedTemplateKey(e.target.value); const t = templates.find(x => x.key === e.target.value); if (t) { setBatchSubject(t.subject); setBatchBody(t.body); } }} className={`${s.select} ${p.batchTemplateSelect}`}>
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
