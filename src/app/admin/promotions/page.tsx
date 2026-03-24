'use client';

// ════════════════════════════════════════════════
// app/admin/promotions/page.tsx  ──  優惠活動管理
//
// 三個 tab：
// - 商品優惠（volume）：階梯定價，如 1 件 70、3 件 200
// - 組合優惠（bundle）：買 A + B = 優惠價
// - 贈品活動（gift）：買 A 送 B
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type PromoTab = 'volume' | 'bundle' | 'gift';

interface Promotion {
  id: number;
  name: string;
  type: string;
  is_active: boolean;
  stackable: boolean;
  start_at: string | null;
  end_at: string | null;
  bundle_price: number | null;
  bundle_repeatable: boolean;
  gift_product_id: number | null;
  gift_qty: number;
  gift_condition_qty: number;
  created_at: string;
  // 關聯資料
  promotion_products?: { product_id: number }[];
  promotion_volume_tiers?: { id: number; min_qty: number; price: number; sort_order: number }[];
  promotion_bundle_items?: { id: number; product_id: number; variant_id: number | null; qty: number }[];
}

interface Product {
  id: number;
  name: string;
  price: number;
}

// ── 共用樣式 ──────────────────────────────────────
const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #E8E4DC', background: '#fff', fontFamily: 'inherit', fontSize: '13px', color: '#1E1C1A', outline: 'none', width: '100%' };
const labelStyle: React.CSSProperties = { fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', display: 'block', marginBottom: '6px' };
const thStyle: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC', whiteSpace: 'nowrap' };
const btnPrimary: React.CSSProperties = { padding: '10px 24px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.1em' };
const btnOutline: React.CSSProperties = { padding: '8px 16px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '12px', color: '#555250', cursor: 'pointer' };
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'auto' as any };
const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 20px', cursor: 'pointer', fontSize: '13px',
  borderBottom: active ? '2px solid #1E1C1A' : '2px solid transparent',
  color: active ? '#1E1C1A' : '#888580',
  fontFamily: '"Noto Sans TC", sans-serif', whiteSpace: 'nowrap',
});

export default function AdminPromotionsPage() {
  const [tab, setTab] = useState<PromoTab>('volume');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // 表單狀態
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [showForm, setShowForm] = useState(false);

  // 共用表單欄位
  const [formName, setFormName] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formStackable, setFormStackable] = useState(false);
  const [formStartAt, setFormStartAt] = useState('');
  const [formEndAt, setFormEndAt] = useState('');

  // Volume 專用
  const [formVolumeProducts, setFormVolumeProducts] = useState<number[]>([]);
  const [formTiers, setFormTiers] = useState<{ min_qty: number; price: number }[]>([{ min_qty: 1, price: 0 }]);

  // Bundle 專用
  const [formBundlePrice, setFormBundlePrice] = useState(0);
  const [formBundleRepeatable, setFormBundleRepeatable] = useState(false);
  const [formBundleItems, setFormBundleItems] = useState<{ product_id: number; qty: number }[]>([{ product_id: 0, qty: 1 }]);

  // Gift 專用
  const [formGiftProducts, setFormGiftProducts] = useState<number[]>([]);
  const [formGiftProductId, setFormGiftProductId] = useState(0);
  const [formGiftQty, setFormGiftQty] = useState(1);
  const [formGiftConditionQty, setFormGiftConditionQty] = useState(1);

  // ── 載入資料 ────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    const [{ data: promos }, { data: prods }] = await Promise.all([
      supabase.from('promotions')
        .select('*, promotion_products(product_id), promotion_volume_tiers(*), promotion_bundle_items(*)')
        .eq('type', tab)
        .order('created_at', { ascending: false }),
      supabase.from('products').select('id, name, price').order('name'),
    ]);
    setPromotions(promos ?? []);
    setProducts(prods ?? []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [tab]);

  // ── 重置表單 ────────────────────────────────────
  const resetForm = () => {
    setEditing(null);
    setFormName(''); setFormActive(true); setFormStackable(false);
    setFormStartAt(''); setFormEndAt('');
    setFormVolumeProducts([]); setFormTiers([{ min_qty: 1, price: 0 }]);
    setFormBundlePrice(0); setFormBundleRepeatable(false); setFormBundleItems([{ product_id: 0, qty: 1 }]);
    setFormGiftProducts([]); setFormGiftProductId(0); setFormGiftQty(1); setFormGiftConditionQty(1);
    setShowForm(false);
  };

  // ── 編輯：載入資料到表單 ─────────────────────────
  const startEdit = (p: Promotion) => {
    setEditing(p);
    setFormName(p.name);
    setFormActive(p.is_active);
    setFormStackable(p.stackable);
    setFormStartAt(p.start_at?.slice(0, 16) ?? '');
    setFormEndAt(p.end_at?.slice(0, 16) ?? '');

    if (p.type === 'volume') {
      setFormVolumeProducts(p.promotion_products?.map(pp => pp.product_id) ?? []);
      setFormTiers(
        p.promotion_volume_tiers?.sort((a, b) => a.sort_order - b.sort_order).map(t => ({ min_qty: t.min_qty, price: t.price }))
        ?? [{ min_qty: 1, price: 0 }]
      );
    }
    if (p.type === 'bundle') {
      setFormBundlePrice(p.bundle_price ?? 0);
      setFormBundleRepeatable(p.bundle_repeatable);
      setFormBundleItems(
        p.promotion_bundle_items?.map(bi => ({ product_id: bi.product_id, qty: bi.qty }))
        ?? [{ product_id: 0, qty: 1 }]
      );
    }
    if (p.type === 'gift') {
      setFormGiftProducts(p.promotion_products?.map(pp => pp.product_id) ?? []);
      setFormGiftProductId(p.gift_product_id ?? 0);
      setFormGiftQty(p.gift_qty ?? 1);
      setFormGiftConditionQty(p.gift_condition_qty ?? 1);
    }
    setShowForm(true);
  };

  // ── 儲存（新增 or 更新）─────────────────────────
  const handleSave = async () => {
    if (!formName.trim()) { alert('請填寫活動名稱'); return; }

    const base: any = {
      name: formName.trim(),
      type: tab,
      is_active: formActive,
      stackable: formStackable,
      start_at: formStartAt || null,
      end_at: formEndAt || null,
    };

    if (tab === 'bundle') {
      base.bundle_price = formBundlePrice;
      base.bundle_repeatable = formBundleRepeatable;
    }
    if (tab === 'gift') {
      base.gift_product_id = formGiftProductId || null;
      base.gift_qty = formGiftQty;
      base.gift_condition_qty = formGiftConditionQty;
    }

    let promoId: number;

    if (editing) {
      const { error } = await supabase.from('promotions').update({ ...base, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { alert('更新失敗：' + error.message); return; }
      promoId = editing.id;
    } else {
      const { data, error } = await supabase.from('promotions').insert(base).select('id').single();
      if (error || !data) { alert('新增失敗：' + (error?.message ?? '未知錯誤')); return; }
      promoId = data.id;
    }

    // 儲存關聯資料（先刪後插）
    if (tab === 'volume') {
      await supabase.from('promotion_products').delete().eq('promotion_id', promoId);
      if (formVolumeProducts.length > 0) {
        await supabase.from('promotion_products').insert(
          formVolumeProducts.map(pid => ({ promotion_id: promoId, product_id: pid }))
        );
      }
      await supabase.from('promotion_volume_tiers').delete().eq('promotion_id', promoId);
      if (formTiers.length > 0) {
        await supabase.from('promotion_volume_tiers').insert(
          formTiers.map((t, i) => ({ promotion_id: promoId, min_qty: t.min_qty, price: t.price, sort_order: i }))
        );
      }
    }

    if (tab === 'bundle') {
      await supabase.from('promotion_bundle_items').delete().eq('promotion_id', promoId);
      if (formBundleItems.length > 0) {
        await supabase.from('promotion_bundle_items').insert(
          formBundleItems.filter(bi => bi.product_id > 0).map(bi => ({ promotion_id: promoId, product_id: bi.product_id, qty: bi.qty }))
        );
      }
    }

    if (tab === 'gift') {
      await supabase.from('promotion_products').delete().eq('promotion_id', promoId);
      if (formGiftProducts.length > 0) {
        await supabase.from('promotion_products').insert(
          formGiftProducts.map(pid => ({ promotion_id: promoId, product_id: pid }))
        );
      }
    }

    resetForm();
    loadData();
  };

  // ── 切換啟用狀態 ────────────────────────────────
  const toggleActive = async (id: number, current: boolean) => {
    await supabase.from('promotions').update({ is_active: !current }).eq('id', id);
    setPromotions(prev => prev.map(p => p.id === id ? { ...p, is_active: !current } : p));
  };

  // ── 刪除 ───────────────────────────────────────
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`確定刪除活動「${name}」？此操作無法復原。`)) return;
    await supabase.from('promotions').delete().eq('id', id);
    loadData();
  };

  // ── 取得商品名稱 ────────────────────────────────
  const getProductName = (id: number) => products.find(p => p.id === id)?.name ?? `ID:${id}`;

  // ── 判斷活動時效 ────────────────────────────────
  const getTimeStatus = (p: Promotion) => {
    const now = new Date();
    if (p.start_at && new Date(p.start_at) > now) return '未開始';
    if (p.end_at && new Date(p.end_at) < now) return '已結束';
    return '進行中';
  };

  // ── 商品多選元件 ────────────────────────────────
  const ProductMultiSelect = ({ selected, onChange }: { selected: number[]; onChange: (ids: number[]) => void }) => (
    <div style={{ border: '1px solid #E8E4DC', padding: '8px', maxHeight: '200px', overflowY: 'auto', background: '#fff' }}>
      {products.map(p => (
        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', fontSize: '13px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={selected.includes(p.id)}
            onChange={() => onChange(selected.includes(p.id) ? selected.filter(id => id !== p.id) : [...selected, p.id])}
            style={{ accentColor: '#1E1C1A' }}
          />
          {p.name} <span style={{ color: '#888580', fontSize: '11px' }}>NT${p.price}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div>
      <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: '0 0 24px' }}>
        優惠活動
      </h1>

      {/* Tab */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E8E4DC', marginBottom: '24px' }}>
        <div style={tabStyle(tab === 'volume')} onClick={() => { setTab('volume'); resetForm(); }}>商品優惠</div>
        <div style={tabStyle(tab === 'bundle')} onClick={() => { setTab('bundle'); resetForm(); }}>組合優惠</div>
        <div style={tabStyle(tab === 'gift')}   onClick={() => { setTab('gift');   resetForm(); }}>贈品活動</div>
      </div>

      {/* 新增按鈕 */}
      {!showForm && (
        <button onClick={() => { resetForm(); setShowForm(true); }} style={{ ...btnPrimary, marginBottom: '20px' }}>
          + 新增{tab === 'volume' ? '商品優惠' : tab === 'bundle' ? '組合優惠' : '贈品活動'}
        </button>
      )}

      {/* ════ 表單 ════ */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1E1C1A', marginBottom: '20px', letterSpacing: '0.1em' }}>
            {editing ? '編輯活動' : '新增活動'}
          </div>

          {/* 共用欄位 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>活動名稱</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="例：蛋塔多件優惠" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>生效時間</label>
              <input type="datetime-local" value={formStartAt} onChange={e => setFormStartAt(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>結束時間</label>
              <input type="datetime-local" value={formEndAt} onChange={e => setFormEndAt(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} style={{ accentColor: '#1E1C1A' }} />
              啟用
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={formStackable} onChange={e => setFormStackable(e.target.checked)} style={{ accentColor: '#1E1C1A' }} />
              可與其他活動併用
            </label>
          </div>

          {/* ── Volume 專用欄位 ── */}
          {tab === 'volume' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>適用商品</label>
                <ProductMultiSelect selected={formVolumeProducts} onChange={setFormVolumeProducts} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>階梯定價</label>
                {formTiers.map((tier, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <input type="number" min={1} value={tier.min_qty} onChange={e => { const t = [...formTiers]; t[i].min_qty = Number(e.target.value); setFormTiers(t); }} placeholder="數量" style={{ ...inputStyle, width: '100px' }} />
                    <span style={{ fontSize: '13px', color: '#888580' }}>件 =</span>
                    <input type="number" min={0} value={tier.price} onChange={e => { const t = [...formTiers]; t[i].price = Number(e.target.value); setFormTiers(t); }} placeholder="價格" style={{ ...inputStyle, width: '120px' }} />
                    <span style={{ fontSize: '13px', color: '#888580' }}>元</span>
                    {formTiers.length > 1 && (
                      <button onClick={() => setFormTiers(formTiers.filter((_, j) => j !== i))} style={{ ...btnOutline, padding: '6px 10px', color: '#c0392b' }}>×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setFormTiers([...formTiers, { min_qty: 1, price: 0 }])} style={{ ...btnOutline, marginTop: '4px' }}>+ 新增階梯</button>
              </div>
            </>
          )}

          {/* ── Bundle 專用欄位 ── */}
          {tab === 'bundle' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>組合商品</label>
                {formBundleItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <select value={item.product_id} onChange={e => { const items = [...formBundleItems]; items[i].product_id = Number(e.target.value); setFormBundleItems(items); }} style={{ ...selectStyle, flex: 1 }}>
                      <option value={0}>選擇商品</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} (NT${p.price})</option>)}
                    </select>
                    <span style={{ fontSize: '13px', color: '#888580' }}>×</span>
                    <input type="number" min={1} value={item.qty} onChange={e => { const items = [...formBundleItems]; items[i].qty = Number(e.target.value); setFormBundleItems(items); }} style={{ ...inputStyle, width: '60px' }} />
                    {formBundleItems.length > 1 && (
                      <button onClick={() => setFormBundleItems(formBundleItems.filter((_, j) => j !== i))} style={{ ...btnOutline, padding: '6px 10px', color: '#c0392b' }}>×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setFormBundleItems([...formBundleItems, { product_id: 0, qty: 1 }])} style={{ ...btnOutline, marginTop: '4px' }}>+ 新增商品</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>組合優惠價</label>
                  <input type="number" min={0} value={formBundlePrice} onChange={e => setFormBundlePrice(Number(e.target.value))} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formBundleRepeatable} onChange={e => setFormBundleRepeatable(e.target.checked)} style={{ accentColor: '#1E1C1A' }} />
                    可重複套用（買 2 組打 2 次折）
                  </label>
                </div>
              </div>
              {/* 顯示原價 vs 組合價 */}
              {formBundleItems.some(bi => bi.product_id > 0) && (
                <div style={{ padding: '12px 16px', background: '#EDE9E2', fontSize: '13px', marginBottom: '16px' }}>
                  原價合計：NT$ {formBundleItems.reduce((s, bi) => s + (products.find(p => p.id === bi.product_id)?.price ?? 0) * bi.qty, 0).toLocaleString()}
                  　→　組合價：<strong style={{ color: '#b35252' }}>NT$ {formBundlePrice.toLocaleString()}</strong>
                </div>
              )}
            </>
          )}

          {/* ── Gift 專用欄位 ── */}
          {tab === 'gift' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>條件商品（買這些商品才送）</label>
                <ProductMultiSelect selected={formGiftProducts} onChange={setFormGiftProducts} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>買幾個才送</label>
                  <input type="number" min={1} value={formGiftConditionQty} onChange={e => setFormGiftConditionQty(Number(e.target.value))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>贈品</label>
                  <select value={formGiftProductId} onChange={e => setFormGiftProductId(Number(e.target.value))} style={selectStyle}>
                    <option value={0}>選擇贈品</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>贈送數量</label>
                  <input type="number" min={1} value={formGiftQty} onChange={e => setFormGiftQty(Number(e.target.value))} style={inputStyle} />
                </div>
              </div>
            </>
          )}

          {/* 儲存 / 取消 */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button onClick={handleSave} style={btnPrimary}>{editing ? '更新' : '建立'}</button>
            <button onClick={resetForm} style={btnOutline}>取消</button>
          </div>
        </div>
      )}

      {/* ════ 列表 ════ */}
      {loading ? (
        <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>活動名稱</th>
                <th style={thStyle}>適用商品</th>
                {tab === 'volume' && <th style={thStyle}>階梯</th>}
                {tab === 'bundle' && <th style={thStyle}>組合價</th>}
                {tab === 'gift' && <th style={thStyle}>贈品</th>}
                <th style={thStyle}>時效</th>
                <th style={thStyle}>狀態</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {promotions.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>尚無活動</td></tr>
              ) : promotions.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #E8E4DC' }}>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A' }}>{p.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250', maxWidth: '200px' }}>
                    {tab === 'bundle'
                      ? p.promotion_bundle_items?.map(bi => `${getProductName(bi.product_id)}×${bi.qty}`).join(' + ')
                      : p.promotion_products?.map(pp => getProductName(pp.product_id)).join('、') || '—'
                    }
                  </td>
                  {tab === 'volume' && (
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250' }}>
                      {p.promotion_volume_tiers?.sort((a, b) => a.sort_order - b.sort_order).map(t => `${t.min_qty}件=$${t.price}`).join('、') || '—'}
                    </td>
                  )}
                  {tab === 'bundle' && (
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#b35252', fontWeight: 600 }}>
                      NT$ {p.bundle_price?.toLocaleString() ?? '—'}
                    </td>
                  )}
                  {tab === 'gift' && (
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250' }}>
                      買 {p.gift_condition_qty} 送 {getProductName(p.gift_product_id ?? 0)} ×{p.gift_qty}
                    </td>
                  )}
                  <td style={{ padding: '12px 16px', fontSize: '11px' }}>
                    <span style={{ color: getTimeStatus(p) === '進行中' ? '#2ab85a' : getTimeStatus(p) === '未開始' ? '#b87a2a' : '#888580' }}>
                      {getTimeStatus(p)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button
                      onClick={() => toggleActive(p.id, p.is_active)}
                      style={{
                        padding: '4px 12px', fontSize: '11px', border: '1px solid',
                        background: 'transparent', cursor: 'pointer',
                        color: p.is_active ? '#2ab85a' : '#888580',
                        borderColor: p.is_active ? '#2ab85a' : '#E8E4DC',
                      }}
                    >
                      {p.is_active ? '啟用中' : '已停用'}
                    </button>
                  </td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(p)} style={{ ...btnOutline, padding: '5px 10px', marginRight: '6px' }}>編輯</button>
                    <button onClick={() => handleDelete(p.id, p.name)} style={{ ...btnOutline, padding: '5px 10px', color: '#c0392b', borderColor: '#e8b4b4' }}>刪除</button>
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
