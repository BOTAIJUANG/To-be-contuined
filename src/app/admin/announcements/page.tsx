'use client';

// ════════════════════════════════════════════════
// app/admin/announcements/page.tsx  ──  公告管理
//
// 新增/編輯/啟用停用前台跑馬燈公告
// 資料存在 announcements 表
// 前台 AnnouncementBar 元件讀取啟用中的公告
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import s from '../_shared/admin-shared.module.css';
import p from './announcements.module.css';

interface Announcement {
  id: number; content: string; type: string;
  speed: string; starts_at: string | null;
  ends_at: string | null; is_active: boolean;
  created_at: string;
}

const EMPTY_FORM = { content: '', type: 'normal', speed: 'normal', starts_at: '', ends_at: '', is_active: true };

const TYPE_LABEL: Record<string, string> = { normal: '一般（深色）', promo: '活動（暖橘）', urgent: '重要（紅色）' };
const TYPE_COLOR: Record<string, string> = { normal: '#1E1C1A', promo: '#b87a2a', urgent: '#c0392b' };
const SPEED_LABEL: Record<string, string> = { slow: '慢速', normal: '正常', fast: '快速' };

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [editingId,  setEditingId]  = useState<number | null>(null);
  const [form,       setForm]       = useState({ ...EMPTY_FORM });
  const [saving,     setSaving]     = useState(false);

  // 目前啟用中的公告（前台預覽用）
  const activeAnn = announcements.find((a) => a.is_active);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    setAnnouncements(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd  = () => { setForm({ ...EMPTY_FORM }); setEditingId(null); setShowModal(true); };
  const openEdit = (a: Announcement) => {
    setForm({ content: a.content, type: a.type, speed: a.speed, starts_at: a.starts_at ?? '', ends_at: a.ends_at ?? '', is_active: a.is_active });
    setEditingId(a.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.content) { alert('請填寫公告內容'); return; }
    setSaving(true);
    const data = { ...form, starts_at: form.starts_at || null, ends_at: form.ends_at || null };
    if (editingId) await supabase.from('announcements').update(data).eq('id', editingId);
    else           await supabase.from('announcements').insert(data);
    setSaving(false);
    setShowModal(false);
    load();
  };

  const toggleActive = async (ann: Announcement) => {
    await supabase.from('announcements').update({ is_active: !ann.is_active }).eq('id', ann.id);
    setAnnouncements(prev => prev.map(a => a.id === ann.id ? { ...a, is_active: !a.is_active } : a));
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這筆公告？')) return;
    await supabase.from('announcements').delete().eq('id', id);
    load();
  };

  return (
    <div>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>公告管理</h1>
        <button onClick={openAdd} className={s.btnPrimary}>＋ 新增公告</button>
      </div>

      {/* 前台預覽 */}
      <div className={s.mb28}>
        <div className={p.previewLabel}>前台顯示預覽</div>
        <div className={p.previewBar} style={{ background: activeAnn ? TYPE_COLOR[activeAnn.type] : 'var(--line)' }}>
          <span className={p.previewText} style={{ color: activeAnn ? '#fff' : 'var(--text-light)' }}>
            {activeAnn ? activeAnn.content : '（無啟用中的公告）'}
          </span>
        </div>
      </div>

      {/* 公告列表 */}
      {loading ? <p className={s.loadingText}>載入中...</p> : (
        <div className={s.tableWrap}>
          {/* Desktop table */}
          <table className={s.table}>
            <thead>
              <tr>
                {['公告內容', '類型', '速度', '開始', '結束', '啟用', '操作'].map(h => (
                  <th key={h} className={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {announcements.length === 0 ? (
                <tr><td colSpan={7} className={s.emptyRow}>尚無公告</td></tr>
              ) : announcements.map((ann) => (
                <tr key={ann.id} className={s.tr} style={{ opacity: ann.is_active ? 1 : 0.5 }}>
                  <td className={`${s.td} ${p.tdContent}`}>{ann.content}</td>
                  <td className={s.td}>
                    <span className={s.badge} style={{ color: TYPE_COLOR[ann.type], border: `1px solid ${TYPE_COLOR[ann.type]}` }}>
                      {TYPE_LABEL[ann.type]}
                    </span>
                  </td>
                  <td className={`${s.td} ${p.tdSmallMid}`}>{SPEED_LABEL[ann.speed]}</td>
                  <td className={`${s.td} ${p.tdSmallLight}`}>{ann.starts_at ?? '立即'}</td>
                  <td className={`${s.td} ${p.tdSmallLight}`}>{ann.ends_at ?? '永久'}</td>
                  <td className={s.td}>
                    <input type="checkbox" checked={ann.is_active} onChange={() => toggleActive(ann)} className={s.checkbox} />
                  </td>
                  <td className={s.td}>
                    <div className={`${s.flex} ${s.gap8}`}>
                      <button onClick={() => openEdit(ann)} className={s.btnSmall}>編輯</button>
                      <button onClick={() => handleDelete(ann.id)} className={s.btnDanger}>刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile card list */}
          <div className={s.cardList}>
            {announcements.length === 0 ? (
              <div className={s.emptyRow}>尚無公告</div>
            ) : announcements.map((ann) => (
              <div key={ann.id} className={s.card} style={{ opacity: ann.is_active ? 1 : 0.5 }}>
                <div className={`${p.annContent}`}>{ann.content}</div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>類型</span>
                  <span className={s.badge} style={{ color: TYPE_COLOR[ann.type], border: `1px solid ${TYPE_COLOR[ann.type]}` }}>
                    {TYPE_LABEL[ann.type]}
                  </span>
                </div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>速度</span>
                  <span className={s.cardValue}>{SPEED_LABEL[ann.speed]}</span>
                </div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>期間</span>
                  <span className={`${s.cardValue} ${p.cardValueSmall}`}>{ann.starts_at ?? '立即'} ~ {ann.ends_at ?? '永久'}</span>
                </div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>啟用</span>
                  <input type="checkbox" checked={ann.is_active} onChange={() => toggleActive(ann)} className={s.checkbox} />
                </div>
                <div className={s.cardActions}>
                  <button onClick={() => openEdit(ann)} className={s.btnSmall}>編輯</button>
                  <button onClick={() => handleDelete(ann.id)} className={s.btnDanger}>刪除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <>
          <div onClick={() => setShowModal(false)} className={s.modalOverlay} />
          <div className={s.modal}>
            <div className={s.modalHeader}>
              <span className={s.modalTitle}>{editingId ? '編輯公告' : '新增公告'}</span>
              <button onClick={() => setShowModal(false)} className={s.modalClose}>×</button>
            </div>
            <div className={s.modalBody}>
              <div>
                <label className={s.label}>公告內容 *</label>
                <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={3} placeholder="例：本週五暫停出貨，造成不便敬請見諒。" className={s.textarea} />
              </div>
              <div className={`${s.grid2} ${p.modalFormGrid}`}>
                <div>
                  <label className={s.label}>類型</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={s.select}>
                    <option value="normal">一般（深色）</option>
                    <option value="promo">活動（暖橘）</option>
                    <option value="urgent">重要（紅色）</option>
                  </select>
                </div>
                <div>
                  <label className={s.label}>捲動速度</label>
                  <select value={form.speed} onChange={e => setForm({ ...form, speed: e.target.value })} className={s.select}>
                    <option value="slow">慢速</option>
                    <option value="normal">正常</option>
                    <option value="fast">快速</option>
                  </select>
                </div>
                <div>
                  <label className={s.label}>開始日期（空白 = 立即）</label>
                  <input type="date" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} className={s.input} />
                </div>
                <div>
                  <label className={s.label}>結束日期（空白 = 永久）</label>
                  <input type="date" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} className={s.input} />
                </div>
              </div>
              <label className={s.checkLabel}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className={s.checkbox} />
                立即啟用
              </label>
              <div className={s.btnActions}>
                <button onClick={handleSave} disabled={saving} className={s.btnSave}>
                  {saving ? '儲存中...' : '儲存'}
                </button>
                <button onClick={() => setShowModal(false)} className={s.btnCancel}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
