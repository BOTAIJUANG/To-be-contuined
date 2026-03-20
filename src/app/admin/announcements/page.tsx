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

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #E8E4DC', background: '#fff', fontFamily: 'inherit', fontSize: '13px', color: '#1E1C1A', outline: 'none', marginTop: '6px' };
  const labelStyle: React.CSSProperties = { fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', display: 'block' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: 0 }}>公告管理</h1>
        <button onClick={openAdd} style={{ padding: '10px 24px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' }}>
          ＋ 新增公告
        </button>
      </div>

      {/* 前台預覽 */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: '#888580', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif', marginBottom: '8px' }}>前台顯示預覽</div>
        <div style={{ background: activeAnn ? TYPE_COLOR[activeAnn.type] : '#E8E4DC', padding: '10px 20px', overflow: 'hidden' }}>
          <span style={{ color: activeAnn ? '#fff' : '#888580', fontSize: '12px', letterSpacing: '0.08em', fontFamily: '"Noto Sans TC", sans-serif', whiteSpace: 'nowrap' }}>
            {activeAnn ? activeAnn.content : '（無啟用中的公告）'}
          </span>
        </div>
      </div>

      {/* 公告列表 */}
      {loading ? <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p> : (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['公告內容', '類型', '速度', '開始', '結束', '啟用', '操作'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {announcements.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>尚無公告</td></tr>
              ) : announcements.map((ann) => (
                <tr key={ann.id} style={{ borderBottom: '1px solid #E8E4DC', opacity: ann.is_active ? 1 : 0.5 }}>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1E1C1A', maxWidth: '300px' }}>{ann.content}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: '11px', color: TYPE_COLOR[ann.type], border: `1px solid ${TYPE_COLOR[ann.type]}`, padding: '2px 8px', fontFamily: '"Montserrat", sans-serif', whiteSpace: 'nowrap' }}>
                      {TYPE_LABEL[ann.type]}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '12px', color: '#555250' }}>{SPEED_LABEL[ann.speed]}</td>
                  <td style={{ padding: '14px 16px', fontSize: '12px', color: '#888580' }}>{ann.starts_at ?? '立即'}</td>
                  <td style={{ padding: '14px 16px', fontSize: '12px', color: '#888580' }}>{ann.ends_at ?? '永久'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <input type="checkbox" checked={ann.is_active} onChange={() => toggleActive(ann)} style={{ accentColor: '#1E1C1A', cursor: 'pointer' }} />
                  </td>
                  <td style={{ padding: '14px 16px', display: 'flex', gap: '8px' }}>
                    <button onClick={() => openEdit(ann)} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer', fontFamily: '"Montserrat", sans-serif' }}>編輯</button>
                    <button onClick={() => handleDelete(ann.id)} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#c0392b', cursor: 'pointer', fontFamily: '"Montserrat", sans-serif' }}>刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <>
          <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '520px', maxWidth: '90vw', zIndex: 201, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '15px', color: '#1E1C1A' }}>{editingId ? '編輯公告' : '新增公告'}</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888580' }}>×</button>
            </div>
            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>公告內容 *</label>
                <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={3} placeholder="例：本週五暫停出貨，造成不便敬請見諒。" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>類型</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inputStyle}>
                    <option value="normal">一般（深色）</option>
                    <option value="promo">活動（暖橘）</option>
                    <option value="urgent">重要（紅色）</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>捲動速度</label>
                  <select value={form.speed} onChange={e => setForm({ ...form, speed: e.target.value })} style={inputStyle}>
                    <option value="slow">慢速</option>
                    <option value="normal">正常</option>
                    <option value="fast">快速</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>開始日期（空白 = 立即）</label>
                  <input type="date" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>結束日期（空白 = 永久）</label>
                  <input type="date" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#555250', cursor: 'pointer', marginBottom: '24px' }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} style={{ accentColor: '#1E1C1A' }} />
                立即啟用
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={handleSave} disabled={saving} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? '儲存中...' : '儲存'}
                </button>
                <button onClick={() => setShowModal(false)} style={{ padding: '10px 32px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>
                  取消
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
