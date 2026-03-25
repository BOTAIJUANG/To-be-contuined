'use client';

// ════════════════════════════════════════════════
// app/admin/coupons/page.tsx  ──  折扣碼管理
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import s from '../_shared/admin-shared.module.css';
import cx from './coupons.module.css';

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

  return (
    <div>
      <div className={`${s.pageHeader} ${s.mb32}`}>
        <h1 className={s.pageTitle}>折扣碼管理</h1>
        <button onClick={openAdd} className={s.btnPrimary}>＋ 新增折扣碼</button>
      </div>

      {/* 表單 */}
      {showForm && (
        <div className={`${s.formPanel} ${s.mb32}`}>
          <h3 className={s.formTitle}>
            {editingId ? '編輯折扣碼' : '新增折扣碼'}
          </h3>
          <div className={`${s.grid3} ${s.mb20}`}>
            <div>
              <label className={s.label}>折扣碼 *</label>
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="例：WEIBAN10" className={s.input} />
            </div>
            <div>
              <label className={s.label}>折扣類型</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={s.select}>
                <option value="percent">百分比折扣（% off）</option>
                <option value="fixed">固定金額折扣（NT$）</option>
              </select>
            </div>
            <div>
              <label className={s.label}>
                {form.type === 'percent' ? '折扣 %（10 = 九折）' : '折扣金額（NT$）'}
              </label>
              <input type="number" value={form.value} onChange={e => setForm({ ...form, value: Number(e.target.value) })} className={s.input} />
            </div>
            <div>
              <label className={s.label}>最低消費門檻（0 = 無）</label>
              <input type="number" value={form.min_amount} onChange={e => setForm({ ...form, min_amount: Number(e.target.value) })} className={s.input} />
            </div>
            <div>
              <label className={s.label}>最多使用次數（0 = 無限）</label>
              <input type="number" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: Number(e.target.value) })} className={s.input} />
            </div>
            <div>
              <label className={s.label}>到期日（留空 = 永不過期）</label>
              <input type="date" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} className={s.input} />
            </div>
          </div>
          <label className={`${s.checkLabel} ${s.mb20}`}>
            <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className={s.checkbox} />
            啟用此折扣碼
          </label>
          <div className={s.btnActions}>
            <button onClick={handleSave} disabled={saving} className={s.btnSave}>
              {saving ? '儲存中...' : '儲存'}
            </button>
            <button onClick={() => setShowForm(false)} className={s.btnCancel}>取消</button>
          </div>
        </div>
      )}

      {/* 折扣碼列表 */}
      {loading ? (
        <p className={s.loadingText}>載入中...</p>
      ) : coupons.length === 0 ? (
        <p className={s.loadingText}>尚未建立折扣碼。</p>
      ) : (
        <div className={s.tableWrap}>
          {/* Mobile cards */}
          <div className={s.cardList}>
            {coupons.map((c) => (
              <div key={c.id} className={s.card} style={{ opacity: c.is_active ? 1 : 0.5 }}>
                <div className={`${s.cardTitle} ${cx.cardTitleMontserrat}`}>{c.code}</div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>類型</span>
                  <span className={s.cardValue}>{c.type === 'percent' ? '百分比' : '固定金額'}</span>
                </div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>折扣</span>
                  <span className={s.cardValue}>{c.type === 'percent' ? `${c.value}% off` : `NT$ ${c.value}`}</span>
                </div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>使用次數</span>
                  <span className={s.cardValue}>{c.used_count} / {c.max_uses > 0 ? c.max_uses : '∞'}</span>
                </div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>到期日</span>
                  <span className={s.cardValue}>{c.expires_at ? new Date(c.expires_at).toLocaleDateString('zh-TW') : '永不過期'}</span>
                </div>
                <div className={s.cardActions}>
                  <input type="checkbox" checked={c.is_active} onChange={() => toggleActive(c)} className={s.checkbox} />
                  <button onClick={() => openEdit(c)} className={s.btnSmall}>編輯</button>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <table className={s.table}>
            <thead>
              <tr>
                {['折扣碼', '類型', '折扣', '門檻', '使用次數', '到期日', '啟用', '操作'].map(h => (
                  <th key={h} className={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className={s.tr} style={{ opacity: c.is_active ? 1 : 0.5 }}>
                  <td className={`${s.td} ${cx.tdCode}`}>{c.code}</td>
                  <td className={`${s.td} ${cx.tdMuted}`}>{c.type === 'percent' ? '百分比' : '固定金額'}</td>
                  <td className={s.td}>{c.type === 'percent' ? `${c.value}% off` : `NT$ ${c.value}`}</td>
                  <td className={`${s.td} ${cx.tdMuted}`}>{c.min_amount > 0 ? `NT$ ${c.min_amount}` : '無'}</td>
                  <td className={`${s.td} ${cx.tdMuted}`}>{c.used_count} / {c.max_uses > 0 ? c.max_uses : '∞'}</td>
                  <td className={`${s.td} ${cx.tdLight}`}>{c.expires_at ? new Date(c.expires_at).toLocaleDateString('zh-TW') : '永不過期'}</td>
                  <td className={s.td}>
                    <input type="checkbox" checked={c.is_active} onChange={() => toggleActive(c)} className={s.checkbox} />
                  </td>
                  <td className={s.td}>
                    <button onClick={() => openEdit(c)} className={s.btnSmall}>編輯</button>
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
