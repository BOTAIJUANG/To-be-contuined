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
import s from '../_shared/admin-shared.module.css';
import p from './promotions.module.css';

type PromoTab = 'volume' | 'bundle' | 'gift';

interface Promotion {
  id: number;
  name: string;
  type: string;
  is_active: boolean;
  stackable: boolean;
  coupon_stackable: boolean;
  start_at: string | null;
  end_at: string | null;
  bundle_price: number | null;
  bundle_repeatable: boolean;
  gift_product_id: number | null;
  gift_variant_id: number | null;
  gift_qty: number;
  gift_condition_qty: number;
  created_at: string;
  promotion_products?: { product_id: number }[];
  promotion_volume_tiers?: { id: number; min_qty: number; price: number; sort_order: number }[];
  promotion_bundle_items?: { id: number; product_id: number; variant_id: number | null; qty: number }[];
}

interface Product {
  id: number;
  name: string;
  price: number;
}

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
  const [formCouponStackable, setFormCouponStackable] = useState(false);
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
  const [formGiftVariantId, setFormGiftVariantId] = useState<number | null>(null);
  const [formGiftQty, setFormGiftQty] = useState(1);
  const [formGiftConditionQty, setFormGiftConditionQty] = useState(1);
  const [giftVariants, setGiftVariants] = useState<{ id: number; name: string }[]>([]);

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

  // 贈品商品變更 → 載入該商品的規格
  useEffect(() => {
    if (!formGiftProductId) { setGiftVariants([]); setFormGiftVariantId(null); return; }
    supabase.from('product_variants').select('id, name').eq('product_id', formGiftProductId).order('sort_order').then(({ data }) => {
      setGiftVariants(data ?? []);
      // 如果沒有規格就清空
      if (!data?.length) setFormGiftVariantId(null);
    });
  }, [formGiftProductId]);

  // ── 重置表單 ────────────────────────────────────
  const resetForm = () => {
    setEditing(null);
    setFormName(''); setFormActive(true); setFormStackable(false); setFormCouponStackable(false);
    setFormStartAt(''); setFormEndAt('');
    setFormVolumeProducts([]); setFormTiers([{ min_qty: 1, price: 0 }]);
    setFormBundlePrice(0); setFormBundleRepeatable(false); setFormBundleItems([{ product_id: 0, qty: 1 }]);
    setFormGiftProducts([]); setFormGiftProductId(0); setFormGiftVariantId(null); setFormGiftQty(1); setFormGiftConditionQty(1); setGiftVariants([]);
    setShowForm(false);
  };

  // ── 編輯：載入資料到表單 ─────────────────────────
  const startEdit = (promo: Promotion) => {
    setEditing(promo);
    setFormName(promo.name);
    setFormActive(promo.is_active);
    setFormStackable(promo.stackable);
    setFormCouponStackable(promo.coupon_stackable ?? false);
    setFormStartAt(promo.start_at?.slice(0, 16) ?? '');
    setFormEndAt(promo.end_at?.slice(0, 16) ?? '');

    if (promo.type === 'volume') {
      setFormVolumeProducts(promo.promotion_products?.map(pp => pp.product_id).filter(productExists) ?? []);
      setFormTiers(
        promo.promotion_volume_tiers?.sort((a, b) => a.sort_order - b.sort_order).map(t => ({ min_qty: t.min_qty, price: t.price }))
        ?? [{ min_qty: 1, price: 0 }]
      );
    }
    if (promo.type === 'bundle') {
      setFormBundlePrice(promo.bundle_price ?? 0);
      setFormBundleRepeatable(promo.bundle_repeatable);
      setFormBundleItems(
        promo.promotion_bundle_items?.filter(bi => productExists(bi.product_id)).map(bi => ({ product_id: bi.product_id, qty: bi.qty }))
        ?? [{ product_id: 0, qty: 1 }]
      );
    }
    if (promo.type === 'gift') {
      setFormGiftProducts(promo.promotion_products?.map(pp => pp.product_id).filter(productExists) ?? []);
      setFormGiftProductId(promo.gift_product_id ?? 0);
      setFormGiftVariantId(promo.gift_variant_id ?? null);
      setFormGiftQty(promo.gift_qty ?? 1);
      setFormGiftConditionQty(promo.gift_condition_qty ?? 1);
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
      coupon_stackable: formCouponStackable,
      start_at: formStartAt || null,
      end_at: formEndAt || null,
    };

    if (tab === 'bundle') {
      base.bundle_price = formBundlePrice;
      base.bundle_repeatable = formBundleRepeatable;
    }
    if (tab === 'gift') {
      base.gift_product_id = formGiftProductId || null;
      base.gift_variant_id = formGiftVariantId || null;
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
    setPromotions(prev => prev.map(promo => promo.id === id ? { ...promo, is_active: !current } : promo));
  };

  // ── 刪除 ───────────────────────────────────────
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`確定刪除活動「${name}」？此操作無法復原。`)) return;
    await supabase.from('promotion_products').delete().eq('promotion_id', id);
    await supabase.from('promotion_volume_tiers').delete().eq('promotion_id', id);
    await supabase.from('promotion_bundle_items').delete().eq('promotion_id', id);
    await supabase.from('promotions').delete().eq('id', id);
    loadData();
  };

  // ── 取得商品名稱（找不到代表已刪除）────────────────
  const getProductName = (id: number) => products.find(prod => prod.id === id)?.name ?? null;
  const productExists = (id: number) => products.some(prod => prod.id === id);

  // ── 判斷活動時效 ────────────────────────────────
  const getTimeStatus = (promo: Promotion) => {
    const now = new Date();
    if (promo.start_at && new Date(promo.start_at) > now) return '未開始';
    if (promo.end_at && new Date(promo.end_at) < now) return '已結束';
    return '進行中';
  };
  const TIME_CLASS: Record<string, string> = { '進行中': p.timeActive, '未開始': p.timePending, '已結束': p.timeExpired };

  // ── 商品多選元件 ────────────────────────────────
  const ProductMultiSelect = ({ selected, onChange }: { selected: number[]; onChange: (ids: number[]) => void }) => (
    <div className={p.multiSelect}>
      {products.map(prod => (
        <label key={prod.id} className={p.multiSelectLabel}>
          <input
            type="checkbox"
            checked={selected.includes(prod.id)}
            onChange={() => onChange(selected.includes(prod.id) ? selected.filter(id => id !== prod.id) : [...selected, prod.id])}
            className={s.checkbox}
          />
          {prod.name} <span className={p.productPriceHint}>NT${prod.price}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div>
      <h1 className={`${s.pageTitle} ${p.pageTitleMb}`}>優惠活動</h1>

      {/* Tab */}
      <div className={s.tabBar}>
        <div className={tab === 'volume' ? s.tabActive : s.tab} onClick={() => { setTab('volume'); resetForm(); }}>商品優惠</div>
        <div className={tab === 'bundle' ? s.tabActive : s.tab} onClick={() => { setTab('bundle'); resetForm(); }}>組合優惠</div>
        <div className={tab === 'gift'   ? s.tabActive : s.tab} onClick={() => { setTab('gift');   resetForm(); }}>贈品活動</div>
      </div>

      {/* 新增按鈕 */}
      {!showForm && (
        <button onClick={() => { resetForm(); setShowForm(true); }} className={`${s.btnPrimary} ${p.addBtnMb}`}>
          + 新增{tab === 'volume' ? '商品優惠' : tab === 'bundle' ? '組合優惠' : '贈品活動'}
        </button>
      )}

      {/* ════ 表單 ════ */}
      {showForm && (
        <div className={s.formPanel}>
          <div className={`${s.formTitle} ${p.formTitleCustom}`}>
            {editing ? '編輯活動' : '新增活動'}
          </div>

          {/* 共用欄位 */}
          <div className={`${s.formGrid} ${s.mb20}`}>
            <div className={s.formGridFull}>
              <label className={s.label}>活動名稱</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="例：蛋塔多件優惠" className={s.input} />
            </div>
            <div>
              <label className={s.label}>生效時間</label>
              <input type="datetime-local" value={formStartAt} onChange={e => setFormStartAt(e.target.value)} className={s.input} />
            </div>
            <div>
              <label className={s.label}>結束時間</label>
              <input type="datetime-local" value={formEndAt} onChange={e => setFormEndAt(e.target.value)} className={s.input} />
            </div>
          </div>

          <div className={`${s.flex} ${s.gap24} ${s.mb20}`}>
            <label className={s.checkLabel}>
              <input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} className={s.checkbox} />
              啟用
            </label>
            <label className={s.checkLabel}>
              <input type="checkbox" checked={formStackable} onChange={e => setFormStackable(e.target.checked)} className={s.checkbox} />
              可與其他活動併用
            </label>
            <label className={s.checkLabel}>
              <input type="checkbox" checked={formCouponStackable} onChange={e => setFormCouponStackable(e.target.checked)} className={s.checkbox} />
              可與折扣碼併用
            </label>
          </div>

          {/* ── Volume 專用欄位 ── */}
          {tab === 'volume' && (
            <>
              <div className={s.mb16}>
                <label className={s.label}>適用商品</label>
                <ProductMultiSelect selected={formVolumeProducts} onChange={setFormVolumeProducts} />
              </div>
              <div className={s.mb16}>
                <label className={s.label}>階梯定價</label>
                {formTiers.map((tier, i) => (
                  <div key={i} className={p.tierRow}>
                    <input type="number" min={1} value={tier.min_qty} onChange={e => { const t = [...formTiers]; t[i].min_qty = Number(e.target.value); setFormTiers(t); }} placeholder="數量" className={p.tierInput} />
                    <span className={p.tierUnit}>件 =</span>
                    <input type="number" min={0} value={tier.price} onChange={e => { const t = [...formTiers]; t[i].price = Number(e.target.value); setFormTiers(t); }} placeholder="價格" className={p.tierPriceInput} />
                    <span className={p.tierUnit}>元</span>
                    {formTiers.length > 1 && (
                      <button onClick={() => setFormTiers(formTiers.filter((_, j) => j !== i))} className={s.btnDanger}>×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setFormTiers([...formTiers, { min_qty: 1, price: 0 }])} className={`${s.btnOutline} ${p.addTierBtn}`}>+ 新增階梯</button>
              </div>
            </>
          )}

          {/* ── Bundle 專用欄位 ── */}
          {tab === 'bundle' && (
            <>
              <div className={s.mb16}>
                <label className={s.label}>組合商品</label>
                {formBundleItems.map((item, i) => (
                  <div key={i} className={p.bundleRow}>
                    <select value={item.product_id} onChange={e => { const items = [...formBundleItems]; items[i].product_id = Number(e.target.value); setFormBundleItems(items); }} className={`${s.select} ${p.selectFlex1}`}>
                      <option value={0}>選擇商品</option>
                      {products.map(prod => <option key={prod.id} value={prod.id}>{prod.name} (NT${prod.price})</option>)}
                    </select>
                    <span className={p.tierUnit}>×</span>
                    <input type="number" min={1} value={item.qty} onChange={e => { const items = [...formBundleItems]; items[i].qty = Number(e.target.value); setFormBundleItems(items); }} className={`${s.input} ${p.bundleQtyInput}`} />
                    {formBundleItems.length > 1 && (
                      <button onClick={() => setFormBundleItems(formBundleItems.filter((_, j) => j !== i))} className={s.btnDanger}>×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setFormBundleItems([...formBundleItems, { product_id: 0, qty: 1 }])} className={`${s.btnOutline} ${p.addTierBtn}`}>+ 新增商品</button>
              </div>
              <div className={`${s.formGrid} ${s.mb16}`}>
                <div>
                  <label className={s.label}>組合優惠價</label>
                  <input type="number" min={0} value={formBundlePrice} onChange={e => setFormBundlePrice(Number(e.target.value))} className={s.input} />
                </div>
                <div className={p.bundleCheckWrap}>
                  <label className={s.checkLabel}>
                    <input type="checkbox" checked={formBundleRepeatable} onChange={e => setFormBundleRepeatable(e.target.checked)} className={s.checkbox} />
                    可重複套用（買 2 組打 2 次折）
                  </label>
                </div>
              </div>
              {/* 顯示原價 vs 組合價 */}
              {formBundleItems.some(bi => bi.product_id > 0) && (
                <div className={p.bundlePreview}>
                  原價合計：NT$ {formBundleItems.reduce((sum, bi) => sum + (products.find(prod => prod.id === bi.product_id)?.price ?? 0) * bi.qty, 0).toLocaleString()}
                  　→　組合價：<strong className={p.bundlePriceHighlight}>NT$ {formBundlePrice.toLocaleString()}</strong>
                </div>
              )}
            </>
          )}

          {/* ── Gift 專用欄位 ── */}
          {tab === 'gift' && (
            <>
              <div className={s.mb16}>
                <label className={s.label}>條件商品（買這些商品才送）</label>
                <ProductMultiSelect selected={formGiftProducts} onChange={setFormGiftProducts} />
              </div>
              <div className={`${s.grid3} ${s.mb16}`}>
                <div>
                  <label className={s.label}>買幾個才送</label>
                  <input type="number" min={1} value={formGiftConditionQty} onChange={e => setFormGiftConditionQty(Number(e.target.value))} className={s.input} />
                </div>
                <div>
                  <label className={s.label}>贈品</label>
                  <select value={formGiftProductId} onChange={e => { setFormGiftProductId(Number(e.target.value)); setFormGiftVariantId(null); }} className={s.select}>
                    <option value={0}>選擇贈品</option>
                    {products.map(prod => <option key={prod.id} value={prod.id}>{prod.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={s.label}>贈送數量</label>
                  <input type="number" min={1} value={formGiftQty} onChange={e => setFormGiftQty(Number(e.target.value))} className={s.input} />
                </div>
              </div>
              {giftVariants.length > 0 && (
                <div className={s.mb16}>
                  <label className={s.label}>贈品規格</label>
                  <select value={formGiftVariantId ?? ''} onChange={e => setFormGiftVariantId(e.target.value ? Number(e.target.value) : null)} className={s.select}>
                    <option value="">選擇規格</option>
                    {giftVariants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          {/* 儲存 / 取消 */}
          <div className={`${s.btnActions} ${p.btnActionsMt20}`}>
            <button onClick={handleSave} className={s.btnSave}>{editing ? '更新' : '建立'}</button>
            <button onClick={resetForm} className={s.btnCancel}>取消</button>
          </div>
        </div>
      )}

      {/* ════ 列表 ════ */}
      {loading ? (
        <p className={s.loadingText}>載入中...</p>
      ) : (
        <div className={s.tableWrap}>
          {/* Desktop table */}
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>活動名稱</th>
                <th className={s.th}>適用商品</th>
                {tab === 'volume' && <th className={s.th}>階梯</th>}
                {tab === 'bundle' && <th className={s.th}>組合價</th>}
                {tab === 'gift' && <th className={s.th}>贈品</th>}
                <th className={s.th}>時效</th>
                <th className={s.th}>狀態</th>
                <th className={s.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {promotions.length === 0 ? (
                <tr><td colSpan={7} className={s.emptyRow}>尚無活動</td></tr>
              ) : promotions.map(promo => (
                <tr key={promo.id} className={s.tr}>
                  <td className={s.td}>{promo.name}</td>
                  <td className={`${s.td} ${p.tdProductList}`}>
                    {tab === 'bundle'
                      ? promo.promotion_bundle_items?.filter(bi => productExists(bi.product_id)).map(bi => `${getProductName(bi.product_id)}×${bi.qty}`).join(' + ') || '—'
                      : promo.promotion_products?.filter(pp => productExists(pp.product_id)).map(pp => getProductName(pp.product_id)).join('、') || '—'
                    }
                  </td>
                  {tab === 'volume' && (
                    <td className={`${s.td} ${p.tdSmallMuted}`}>
                      {promo.promotion_volume_tiers?.sort((a, b) => a.sort_order - b.sort_order).map(t => `${t.min_qty}件=$${t.price}`).join('、') || '—'}
                    </td>
                  )}
                  {tab === 'bundle' && (
                    <td className={`${s.td} ${p.tdBundlePrice}`}>
                      NT$ {promo.bundle_price?.toLocaleString() ?? '—'}
                    </td>
                  )}
                  {tab === 'gift' && (
                    <td className={`${s.td} ${p.tdSmallMuted}`}>
                      買 {promo.gift_condition_qty} 送 {getProductName(promo.gift_product_id ?? 0) ?? '（已刪除）'} ×{promo.gift_qty}
                    </td>
                  )}
                  <td className={`${s.td} ${p.tdTimeStatus}`}>
                    <span className={`${p.timeBadge} ${TIME_CLASS[getTimeStatus(promo)]}`}>
                      {getTimeStatus(promo)}
                    </span>
                  </td>
                  <td className={s.td}>
                    <button
                      onClick={() => toggleActive(promo.id, promo.is_active)}
                      className={`${p.statusBtnActive} ${promo.is_active ? p.statusOn : p.statusOff}`}
                    >
                      {promo.is_active ? '啟用中' : '已停用'}
                    </button>
                  </td>
                  <td className={`${s.td} ${p.tdActionsNowrap}`}>
                    <div className={`${s.flex} ${s.gap8}`}>
                      <button onClick={() => startEdit(promo)} className={s.btnSmall}>編輯</button>
                      <button onClick={() => handleDelete(promo.id, promo.name)} className={s.btnDanger}>刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile card list */}
          <div className={s.cardList}>
            {promotions.length === 0 ? (
              <div className={s.emptyRow}>尚無活動</div>
            ) : promotions.map(promo => (
              <div key={promo.id} className={s.card}>
                <div className={s.cardTitle}>{promo.name}</div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>時效</span>
                  <span className={`${p.timeBadge} ${TIME_CLASS[getTimeStatus(promo)]}`}>
                    {getTimeStatus(promo)}
                  </span>
                </div>
                <div className={s.cardRow}>
                  <span className={s.cardLabel}>狀態</span>
                  <button
                    onClick={() => toggleActive(promo.id, promo.is_active)}
                    className={`${p.statusBtnActive} ${promo.is_active ? p.statusOn : p.statusOff}`}
                  >
                    {promo.is_active ? '啟用中' : '已停用'}
                  </button>
                </div>
                {tab === 'volume' && (
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>階梯</span>
                    <span className={`${s.cardValue} ${p.cardValueSmall}`}>
                      {promo.promotion_volume_tiers?.sort((a, b) => a.sort_order - b.sort_order).map(t => `${t.min_qty}件=$${t.price}`).join('、') || '—'}
                    </span>
                  </div>
                )}
                {tab === 'bundle' && (
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>組合價</span>
                    <span className={p.tdBundlePrice}>NT$ {promo.bundle_price?.toLocaleString() ?? '—'}</span>
                  </div>
                )}
                {tab === 'gift' && (
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>贈品</span>
                    <span className={`${s.cardValue} ${p.cardValueSmall}`}>
                      買 {promo.gift_condition_qty} 送 {getProductName(promo.gift_product_id ?? 0) ?? '（已刪除）'} ×{promo.gift_qty}
                    </span>
                  </div>
                )}
                <div className={s.cardActions}>
                  <button onClick={() => startEdit(promo)} className={s.btnSmall}>編輯</button>
                  <button onClick={() => handleDelete(promo.id, promo.name)} className={s.btnDanger}>刪除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
