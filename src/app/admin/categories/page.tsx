'use client';

// ════════════════════════════════════════════════
// app/admin/categories/page.tsx  ──  分類管理
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import s from '../_shared/admin-shared.module.css';

interface Category { id: number; name: string; slug: string; sort_order: number; }

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [editingId,  setEditingId]  = useState<number | null>(null);
  const [form,       setForm]       = useState({ name: '', slug: '', sort_order: 0 });
  const [saving,     setSaving]     = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    const { data } = await supabase.from('categories').select('*').order('sort_order');
    setCategories(data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadCategories(); }, []);

  const openAdd = () => {
    setForm({ name: '', slug: '', sort_order: 0 });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (cat: Category) => {
    setForm({ name: cat.name, slug: cat.slug, sort_order: cat.sort_order });
    setEditingId(cat.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.slug) { alert('請填寫分類名稱和網址'); return; }
    setSaving(true);

    if (editingId) {
      await supabase.from('categories').update(form).eq('id', editingId);
    } else {
      await supabase.from('categories').insert(form);
    }

    setSaving(false);
    setShowForm(false);
    loadCategories();
  };

  return (
    <div>
      <div className={`${s.pageHeader} ${s.mb32}`}>
        <h1 className={s.pageTitle}>分類管理</h1>
        <button onClick={openAdd} className={s.btnPrimary}>＋ 新增分類</button>
      </div>

      {/* 表單 */}
      {showForm && (
        <div className={`${s.formPanel} ${s.mb32}`}>
          <h3 className={s.formTitle}>
            {editingId ? '編輯分類' : '新增分類'}
          </h3>
          <div className={`${s.grid3} ${s.mb20}`}>
            <div>
              <label className={s.label}>分類名稱 *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例：Q餅系列" className={s.input} />
            </div>
            <div>
              <label className={s.label}>網址（slug）* 只能英文和 -</label>
              <input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="例：q-bing" className={s.input} />
            </div>
            <div>
              <label className={s.label}>排序</label>
              <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} className={s.input} />
            </div>
          </div>
          <div className={s.btnActions}>
            <button onClick={handleSave} disabled={saving} className={s.btnSave}>
              {saving ? '儲存中...' : '儲存'}
            </button>
            <button onClick={() => setShowForm(false)} className={s.btnCancel}>取消</button>
          </div>
        </div>
      )}

      {/* 分類列表 */}
      {loading ? (
        <p className={s.loadingText}>載入中...</p>
      ) : (
        <div className={s.tableWrap}>
          {categories.map((cat) => (
            <div key={cat.id} className={s.itemCardInner}>
              <div className={s.itemContent}>
                <div className={s.catName}>{cat.name}</div>
                <div className={s.catSlug}>/shop/{cat.slug}</div>
              </div>
              <div className={s.itemActions}>
                <span className={s.catSort}>排序 {cat.sort_order}</span>
                <button onClick={() => openEdit(cat)} className={s.btnSmall}>編輯</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
