'use client';

// ════════════════════════════════════════════════
// app/admin/faqs/page.tsx  ──  購物說明管理
//
// 管理前台「購物說明」頁的 FAQ 項目
// 可以新增、編輯、排序、停用
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Faq { id: number; question: string; answer: string; sort_order: number; is_active: boolean; }

const EMPTY_FORM = { question: '', answer: '', sort_order: 0, is_active: true };
const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #E8E4DC', background: '#fff', fontFamily: 'inherit', fontSize: '13px', color: '#1E1C1A', outline: 'none' };
const labelStyle: React.CSSProperties = { fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', display: 'block', marginBottom: '6px' };

export default function AdminFaqsPage() {
  const [faqs,      setFaqs]      = useState<Faq[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form,      setForm]      = useState({ ...EMPTY_FORM });
  const [saving,    setSaving]    = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('faqs').select('*').order('sort_order');
    setFaqs(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd  = () => { setForm({ ...EMPTY_FORM, sort_order: faqs.length + 1 }); setEditingId(null); setShowModal(true); };
  const openEdit = (f: Faq) => { setForm({ question: f.question, answer: f.answer, sort_order: f.sort_order, is_active: f.is_active }); setEditingId(f.id); setShowModal(true); };

  const handleSave = async () => {
    if (!form.question || !form.answer) { alert('請填寫問題和答案'); return; }
    setSaving(true);
    if (editingId) await supabase.from('faqs').update(form).eq('id', editingId);
    else           await supabase.from('faqs').insert(form);
    setSaving(false);
    setShowModal(false);
    load();
  };

  const toggleActive = async (f: Faq) => {
    await supabase.from('faqs').update({ is_active: !f.is_active }).eq('id', f.id);
    setFaqs(prev => prev.map(x => x.id === f.id ? { ...x, is_active: !x.is_active } : x));
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除？')) return;
    await supabase.from('faqs').delete().eq('id', id);
    load();
  };

  // 快速調整排序
  const moveItem = async (id: number, dir: -1 | 1) => {
    const idx  = faqs.findIndex(f => f.id === id);
    const swap = faqs[idx + dir];
    if (!swap) return;
    await Promise.all([
      supabase.from('faqs').update({ sort_order: swap.sort_order }).eq('id', id),
      supabase.from('faqs').update({ sort_order: faqs[idx].sort_order }).eq('id', swap.id),
    ]);
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: 0 }}>購物說明管理</h1>
        <button onClick={openAdd} style={{ padding: '10px 24px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' }}>
          ＋ 新增項目
        </button>
      </div>

      <div style={{ background: '#EDE9E2', border: '1px solid #E8E4DC', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#555250' }}>
        這裡的內容會顯示在前台「購物說明」頁面，可以自由新增、編輯和排序。
      </div>

      {loading ? <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p> : (
        <div>
          {faqs.map((f, i) => (
            <div key={f.id} style={{ background: '#fff', border: '1px solid #E8E4DC', marginBottom: '8px', opacity: f.is_active ? 1 : 0.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
                <div style={{ flex: 1, marginRight: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1E1C1A', marginBottom: '6px', letterSpacing: '0.1em' }}>{f.question}</div>
                  <div style={{ fontSize: '12px', color: '#888580', lineHeight: 1.8 }}>{f.answer}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                  {/* 上下排序 */}
                  <button onClick={() => moveItem(f.id, -1)} disabled={i === 0} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '12px', color: '#888580', cursor: i === 0 ? 'not-allowed' : 'pointer', opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                  <button onClick={() => moveItem(f.id, 1)}  disabled={i === faqs.length - 1} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '12px', color: '#888580', cursor: i === faqs.length - 1 ? 'not-allowed' : 'pointer', opacity: i === faqs.length - 1 ? 0.3 : 1 }}>↓</button>
                  <input type="checkbox" checked={f.is_active} onChange={() => toggleActive(f)} style={{ accentColor: '#1E1C1A', cursor: 'pointer' }} title="啟用/停用" />
                  <button onClick={() => openEdit(f)} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer', fontFamily: '"Montserrat", sans-serif' }}>編輯</button>
                  <button onClick={() => handleDelete(f.id)} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#c0392b', cursor: 'pointer', fontFamily: '"Montserrat", sans-serif' }}>刪除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <>
          <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '560px', maxWidth: '90vw', zIndex: 201 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '15px', color: '#1E1C1A' }}>{editingId ? '編輯項目' : '新增項目'}</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888580' }}>×</button>
            </div>
            <div style={{ padding: '24px', display: 'grid', gap: '16px' }}>
              <div>
                <label style={labelStyle}>問題標題 *</label>
                <input value={form.question} onChange={e => setForm({...form, question: e.target.value})} placeholder="例：付款方式" style={{...inputStyle, width: '100%'}} />
              </div>
              <div>
                <label style={labelStyle}>答案內容 *</label>
                <textarea value={form.answer} onChange={e => setForm({...form, answer: e.target.value})} rows={4} placeholder="詳細說明..." style={{...inputStyle, width: '100%', resize: 'vertical'}} />
              </div>
              <div>
                <label style={labelStyle}>排序（數字小的排前面）</label>
                <input type="number" value={form.sort_order} onChange={e => setForm({...form, sort_order: Number(e.target.value)})} style={{...inputStyle, width: '100px'}} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#555250', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} style={{ accentColor: '#1E1C1A' }} />
                在前台顯示此項目
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={handleSave} disabled={saving} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? '儲存中...' : '儲存'}
                </button>
                <button onClick={() => setShowModal(false)} style={{ padding: '10px 32px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
