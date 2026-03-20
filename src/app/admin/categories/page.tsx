'use client';

// ════════════════════════════════════════════════
// app/admin/categories/page.tsx  ──  分類管理
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    border: '1px solid #E8E4DC', background: '#fff',
    fontFamily: 'inherit', fontSize: '13px', color: '#1E1C1A', outline: 'none', marginTop: '6px',
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: '"Montserrat", sans-serif', fontSize: '10px',
    letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', display: 'block',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: 0 }}>
          分類管理
        </h1>
        <button onClick={openAdd} style={{
          padding: '10px 24px', background: '#1E1C1A', color: '#F7F4EF',
          border: 'none', fontFamily: '"Montserrat", sans-serif',
          fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em',
          textTransform: 'uppercase', cursor: 'pointer',
        }}>
          ＋ 新增分類
        </button>
      </div>

      {/* 表單 */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '32px', marginBottom: '32px' }}>
          <h3 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '16px', color: '#1E1C1A', margin: '0 0 24px' }}>
            {editingId ? '編輯分類' : '新增分類'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>分類名稱 *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例：Q餅系列" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>網址（slug）* 只能英文和 -</label>
              <input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="例：q-bing" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>排序</label>
              <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF',
              border: 'none', fontFamily: '"Montserrat", sans-serif',
              fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em',
              textTransform: 'uppercase', cursor: 'pointer', opacity: saving ? 0.6 : 1,
            }}>
              {saving ? '儲存中...' : '儲存'}
            </button>
            <button onClick={() => setShowForm(false)} style={{
              padding: '10px 32px', background: 'transparent', color: '#888580',
              border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif',
              fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer',
            }}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* 分類列表 */}
      {loading ? (
        <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC' }}>
          {categories.map((cat) => (
            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #E8E4DC' }}>
              <div>
                <div style={{ fontSize: '13px', color: '#1E1C1A', marginBottom: '2px' }}>{cat.name}</div>
                <div style={{ fontSize: '11px', color: '#888580', fontFamily: '"Montserrat", sans-serif' }}>/shop/{cat.slug}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '12px', color: '#888580' }}>排序 {cat.sort_order}</span>
                <button onClick={() => openEdit(cat)} style={{
                  padding: '6px 14px', background: 'transparent',
                  border: '1px solid #E8E4DC', fontSize: '11px',
                  color: '#555250', cursor: 'pointer',
                  fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.1em',
                }}>
                  編輯
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
