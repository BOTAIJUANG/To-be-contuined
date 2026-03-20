'use client';

// ════════════════════════════════════════════════
// app/admin/coupons/page.tsx  ──  折扣碼管理
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Coupon {
  id: number; code: string; type: string;
  value: number; min_amount: number;
  max_uses: number; used_count: number;
  expires_at: string | null; is_active: boolean;
}

const EMPTY_FORM = {
  code: '', type: 'percent', value: 10,
  min_amount: 0, max_uses: 0,
  expires_at: '', is_active: true,
};

export default function AdminCouponsPage() {
  const [coupons,   setCoupons]   = useState<Coupon[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form,      setForm]      = useState({ ...EMPTY_FORM });
  const [saving,    setSaving]    = useState(false);

  const loadCoupons = async () => {
    setLoading(true);
    const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    setCoupons(data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadCoupons(); }, []);

  const openAdd = () => { setForm({ ...EMPTY_FORM }); setEditingId(null); setShowForm(true); };
  const openEdit = (c: Coupon) => {
    setForm({
      code: c.code, type: c.type, value: c.value,
      min_amount: c.min_amount, max_uses: c.max_uses,
      expires_at: c.expires_at ? c.expires_at.split('T')[0] : '',
      is_active: c.is_active,
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.code) { alert('請填寫折扣碼'); return; }
    setSaving(true);

    const data = {
      ...form,
      code:       form.code.toUpperCase(),
      expires_at: form.expires_at || null,
    };

    if (editingId) {
      await supabase.from('coupons').update(data).eq('id', editingId);
    } else {
      await supabase.from('coupons').insert(data);
    }

    setSaving(false);
    setShowForm(false);
    loadCoupons();
  };

  const toggleActive = async (coupon: Coupon) => {
    await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id);
    setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, is_active: !c.is_active } : c));
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
          折扣碼管理
        </h1>
        <button onClick={openAdd} style={{
          padding: '10px 24px', background: '#1E1C1A', color: '#F7F4EF',
          border: 'none', fontFamily: '"Montserrat", sans-serif',
          fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em',
          textTransform: 'uppercase', cursor: 'pointer',
        }}>
          ＋ 新增折扣碼
        </button>
      </div>

      {/* 表單 */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '32px', marginBottom: '32px' }}>
          <h3 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '16px', color: '#1E1C1A', margin: '0 0 24px' }}>
            {editingId ? '編輯折扣碼' : '新增折扣碼'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>折扣碼 *</label>
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="例：WEIBAN10" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>折扣類型</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inputStyle}>
                <option value="percent">百分比折扣（% off）</option>
                <option value="fixed">固定金額折扣（NT$）</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>
                {form.type === 'percent' ? '折扣 %（10 = 九折）' : '折扣金額（NT$）'}
              </label>
              <input type="number" value={form.value} onChange={e => setForm({ ...form, value: Number(e.target.value) })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>最低消費門檻（0 = 無）</label>
              <input type="number" value={form.min_amount} onChange={e => setForm({ ...form, min_amount: Number(e.target.value) })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>最多使用次數（0 = 無限）</label>
              <input type="number" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: Number(e.target.value) })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>到期日（留空 = 永不過期）</label>
              <input type="date" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#555250', cursor: 'pointer', marginBottom: '20px' }}>
            <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} style={{ accentColor: '#1E1C1A' }} />
            啟用此折扣碼
          </label>
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

      {/* 折扣碼列表 */}
      {loading ? (
        <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p>
      ) : coupons.length === 0 ? (
        <p style={{ color: '#888580', fontSize: '13px' }}>尚未建立折扣碼。</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['折扣碼', '類型', '折扣', '門檻', '使用次數', '到期日', '啟用', '操作'].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px', textAlign: 'left',
                    fontFamily: '"Montserrat", sans-serif', fontSize: '10px',
                    letterSpacing: '0.25em', color: '#888580',
                    textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #E8E4DC', opacity: c.is_active ? 1 : 0.5 }}>
                  <td style={{ padding: '14px 16px', fontFamily: '"Montserrat", sans-serif', fontSize: '13px', fontWeight: 600, color: '#1E1C1A' }}>{c.code}</td>
                  <td style={{ padding: '14px 16px', fontSize: '12px', color: '#555250' }}>{c.type === 'percent' ? '百分比' : '固定金額'}</td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1E1C1A' }}>
                    {c.type === 'percent' ? `${c.value}% off` : `NT$ ${c.value}`}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '12px', color: '#555250' }}>{c.min_amount > 0 ? `NT$ ${c.min_amount}` : '無'}</td>
                  <td style={{ padding: '14px 16px', fontSize: '12px', color: '#555250' }}>{c.used_count} / {c.max_uses > 0 ? c.max_uses : '∞'}</td>
                  <td style={{ padding: '14px 16px', fontSize: '12px', color: '#888580' }}>{c.expires_at ? new Date(c.expires_at).toLocaleDateString('zh-TW') : '永不過期'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <input type="checkbox" checked={c.is_active} onChange={() => toggleActive(c)} style={{ accentColor: '#1E1C1A', cursor: 'pointer' }} />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <button onClick={() => openEdit(c)} style={{
                      padding: '6px 14px', background: 'transparent',
                      border: '1px solid #E8E4DC', fontSize: '11px',
                      color: '#555250', cursor: 'pointer',
                      fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.1em',
                    }}>
                      編輯
                    </button>
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
