'use client';

// ════════════════════════════════════════════════
// app/admin/faqs/page.tsx  ──  購物說明管理
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import s from '../_shared/admin-shared.module.css';

interface Faq { id: number; question: string; answer: string; sort_order: number; is_active: boolean; }

const EMPTY_FORM = { question: '', answer: '', sort_order: 0, is_active: true };

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
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>購物說明管理</h1>
        <button onClick={openAdd} className={s.btnPrimary}>＋ 新增項目</button>
      </div>

      <div className={s.infoBar}>
        這裡的內容會顯示在前台「購物說明」頁面，可以自由新增、編輯和排序。
      </div>

      {loading ? <p className={s.loadingText}>載入中...</p> : (
        <div className={s.itemList}>
          {faqs.map((f, i) => (
            <div key={f.id} className={s.itemCard} style={{ opacity: f.is_active ? 1 : 0.5 }}>
              <div className={s.itemCardInner}>
                <div className={s.itemContent}>
                  <div className={s.faqQuestion}>{f.question}</div>
                  <div className={s.faqAnswer}>{f.answer}</div>
                </div>
                <div className={s.itemActions}>
                  <button onClick={() => moveItem(f.id, -1)} disabled={i === 0} className={s.btnSmall} style={{ cursor: i === 0 ? 'not-allowed' : 'pointer', opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                  <button onClick={() => moveItem(f.id, 1)}  disabled={i === faqs.length - 1} className={s.btnSmall} style={{ cursor: i === faqs.length - 1 ? 'not-allowed' : 'pointer', opacity: i === faqs.length - 1 ? 0.3 : 1 }}>↓</button>
                  <input type="checkbox" checked={f.is_active} onChange={() => toggleActive(f)} className={s.checkbox} title="啟用/停用" />
                  <button onClick={() => openEdit(f)} className={s.btnSmall}>編輯</button>
                  <button onClick={() => handleDelete(f.id)} className={s.btnDanger}>刪除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <>
          <div onClick={() => setShowModal(false)} className={s.modalOverlay} />
          <div className={s.modalWide}>
            <div className={s.modalHeader}>
              <span className={s.modalTitle}>{editingId ? '編輯項目' : '新增項目'}</span>
              <button onClick={() => setShowModal(false)} className={s.modalClose}>×</button>
            </div>
            <div className={s.modalBody}>
              <div>
                <label className={s.label}>問題標題 *</label>
                <input value={form.question} onChange={e => setForm({...form, question: e.target.value})} placeholder="例：付款方式" className={s.input} />
              </div>
              <div>
                <label className={s.label}>答案內容 *</label>
                <textarea value={form.answer} onChange={e => setForm({...form, answer: e.target.value})} rows={4} placeholder="詳細說明..." className={s.textarea} />
              </div>
              <div>
                <label className={s.label}>排序（數字小的排前面）</label>
                <input type="number" value={form.sort_order} onChange={e => setForm({...form, sort_order: Number(e.target.value)})} className={s.inputShort} />
              </div>
              <label className={s.checkLabel}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} className={s.checkbox} />
                在前台顯示此項目
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
