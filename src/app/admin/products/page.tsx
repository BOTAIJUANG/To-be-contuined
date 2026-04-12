'use client';

// ════════════════════════════════════════════════
// app/admin/products/page.tsx  ──  商品管理
//
// 分頁：
// - 商品列表（新增/編輯/上下架/規格/圖片）
// - 商品分類（在這裡管理分類）
// - 快速更新（批次更新價格/庫存）
// - 貨到通知列表
// ════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import s from '../_shared/admin-shared.module.css';
import p from './products.module.css';
import AdminDatePicker from '../_shared/AdminDatePicker';

type ProductTab = 'list' | 'category' | 'quickupdate' | 'notify';

interface Product { id: number; name: string; name_en: string; slug: string; price: number; description: string; image_url: string; is_available: boolean; is_sold_out: boolean; is_preorder: boolean; is_featured: boolean; sort_order: number; category_id: number; stock_mode: string; categories?: { name: string }; }
interface Category { id: number; name: string; slug: string; sort_order: number; }
interface Spec { id?: number; label: string; value: string; sort_order: number; }
interface ShipDate { id?: number; ship_date: string; capacity: number; reserved: number; is_open: boolean; cutoff_time?: string; note?: string; }

const EMPTY_FORM = { name: '', name_en: '', slug: '', price: 0, description: '', image_url: '', is_available: true, is_sold_out: false, is_preorder: false, is_featured: false, sort_order: 0, category_id: 0, stock_mode: 'stock_mode', ship_start_date: '', ship_end_date: '', ship_blocked_dates: '[]', allow_home_ambient: true, allow_home_refrigerated: false, allow_home_frozen: false, allow_cvs_ambient: true, allow_cvs_frozen: false, allow_store_pickup: true };
const EMPTY_CAT  = { name: '', slug: '', sort_order: 0 };
const EMPTY_SHIP_DATE: ShipDate = { ship_date: '', capacity: 0, reserved: 0, is_open: true, cutoff_time: '17:00', note: '' };

export default function AdminProductsPage() {
  const [tab,          setTab]         = useState<ProductTab>('list');
  const [products,     setProducts]    = useState<Product[]>([]);
  const [categories,   setCategories]  = useState<Category[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [filterCat,    setFilterCat]   = useState('');
  const [filterStatus, setFilterStatus]= useState('on');
  const [search,       setSearch]      = useState('');

  // 商品表單
  const [showForm,   setShowForm]   = useState(false);
  const [editingId,  setEditingId]  = useState<number | null>(null);
  const [form,       setForm]       = useState({ ...EMPTY_FORM });
  const [specs,      setSpecs]      = useState<Spec[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 規格選項
  const [hasVariants,   setHasVariants]   = useState(false);
  const [variantLabel,  setVariantLabel]  = useState('規格');
  const [variants,      setVariants]      = useState<{ id?: number; name: string; price: string; sku: string; is_available: boolean }[]>([]);

  const EMPTY_VARIANT = { name: '', price: '', sku: '', is_available: true };

  // 可出貨日設定
  const [shipDates,      setShipDates]      = useState<ShipDate[]>([]);
  const [showDateModal,  setShowDateModal]  = useState(false);
  const [editingDateIdx, setEditingDateIdx] = useState<number | null>(null);
  const [dateForm,       setDateForm]       = useState<ShipDate>({ ...EMPTY_SHIP_DATE });
  const [batchMode,      setBatchMode]      = useState(false);
  const [batchStart,     setBatchStart]     = useState('');
  const [batchEnd,       setBatchEnd]       = useState('');
  const [batchCapacity,  setBatchCapacity]  = useState(0);
  const [batchExclude,   setBatchExclude]   = useState('');
  const [batchSkipDays,  setBatchSkipDays]  = useState<number[]>([]);
  const [batchCutoff,    setBatchCutoff]    = useState('17:00');
  // 批量刪除
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const [deleteSelected,  setDeleteSelected]  = useState<Set<string>>(new Set());
  const [deleteCalMonth,  setDeleteCalMonth]  = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  // 展開/收合
  const [shipDatesExpanded, setShipDatesExpanded] = useState(false);

  // 分類表單
  const [showCatForm,  setShowCatForm]  = useState(false);
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [catForm,      setCatForm]      = useState({ ...EMPTY_CAT });
  const [savingCat,    setSavingCat]    = useState(false);

  // 快速更新
  const [quickData, setQuickData] = useState<{ id: number; name: string; price: number; newPrice: number; stock: number; newStock: number }[]>([]);

  const loadData = async () => {
    setLoading(true);
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from('products').select('*, categories(name)').order('category_id').order('sort_order'),
      supabase.from('categories').select('*').order('sort_order'),
    ]);
    setProducts(prods ?? []);
    setCategories(cats ?? []);
    setQuickData((prods ?? []).map(prod => ({ id: prod.id, name: prod.name, price: prod.price, newPrice: prod.price, stock: 0, newStock: 0 })));
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // ── 商品 CRUD ──────────────────────────────────
  const openAdd = () => {
    setForm({ ...EMPTY_FORM, category_id: categories[0]?.id ?? 0 });
    setSpecs([]);
    setHasVariants(false);
    setVariantLabel('規格');
    setVariants([]);
    setEditingId(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openEdit = async (prod: Product) => {
    setForm({ name: prod.name, name_en: prod.name_en ?? '', slug: prod.slug, price: prod.price, description: prod.description ?? '', image_url: prod.image_url ?? '', is_available: prod.is_available, is_sold_out: prod.is_sold_out, is_preorder: prod.is_preorder, is_featured: prod.is_featured, sort_order: prod.sort_order, category_id: prod.category_id, stock_mode: prod.stock_mode ?? 'stock_mode', ship_start_date: (prod as any).ship_start_date ?? '', ship_end_date: (prod as any).ship_end_date ?? '', ship_blocked_dates: (prod as any).ship_blocked_dates ?? '[]', allow_home_ambient: (prod as any).allow_home_ambient ?? true, allow_home_refrigerated: (prod as any).allow_home_refrigerated ?? false, allow_home_frozen: (prod as any).allow_home_frozen ?? false, allow_cvs_ambient: (prod as any).allow_cvs_ambient ?? true, allow_cvs_frozen: (prod as any).allow_cvs_frozen ?? false, allow_store_pickup: (prod as any).allow_store_pickup ?? true });
    const [{ data: specData }, { data: shipDateData }, { data: variantData }] = await Promise.all([
      supabase.from('product_specs').select('id, label, value, sort_order').eq('product_id', prod.id).order('sort_order'),
      supabase.from('product_ship_dates').select('id, ship_date, capacity, reserved, is_open, cutoff_time, note').eq('product_id', prod.id).is('variant_id', null).order('ship_date'),
      supabase.from('product_variants').select('*').eq('product_id', prod.id).order('sort_order'),
    ]);
    setSpecs(specData ?? []);
    setShipDates((shipDateData ?? []).map((d: any) => ({ id: d.id, ship_date: d.ship_date, capacity: d.capacity, reserved: d.reserved, is_open: d.is_open, cutoff_time: d.cutoff_time ?? '17:00', note: d.note ?? '' })));
    const vData = variantData ?? [];
    setHasVariants(vData.length > 0);
    setVariantLabel((prod as any).variant_label ?? '規格');
    setVariants(vData.map((v: any) => ({ id: v.id, name: v.name, price: String(v.price ?? (prod.price + (v.price_diff ?? 0))), sku: v.sku ?? '', is_available: v.is_available })));
    setEditingId(prod.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const fileName = `products/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('images').upload(fileName, file, { cacheControl: '3600', upsert: true, contentType: file.type });
    if (error) { alert('上傳失敗：' + error.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('images').getPublicUrl(fileName);
    setForm(prev => ({ ...prev, image_url: urlData.publicUrl }));
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.slug || !form.price) { alert('請填寫商品名稱、網址和價格'); return; }

    if (form.stock_mode === 'date_mode' && !form.is_preorder && shipDates.length === 0) {
      if (!confirm('您已選擇日期模式，但尚未設定任何可出貨日期，前台將無日期可選。確定要儲存嗎？')) return;
    }

    setSaving(true);
    let productId = editingId;

    const cleanForm = {
      ...form,
      variant_label:     hasVariants ? variantLabel : null,
      ship_start_date:   (form as any).ship_start_date   || null,
      ship_end_date:     (form as any).ship_end_date     || null,
      ship_blocked_dates:(form as any).ship_blocked_dates || '[]',
    };

    if (editingId) {
      const { error } = await supabase.from('products').update(cleanForm).eq('id', editingId);
      if (error) { alert('儲存失敗：' + error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('products').insert(cleanForm).select('id').single();
      if (error) { alert('新增失敗：' + error.message); setSaving(false); return; }
      productId = data?.id ?? null;
    }
    if (productId) {
      await supabase.from('product_specs').delete().eq('product_id', productId);
      const valid = specs.filter(sp => sp.label && sp.value);
      if (valid.length > 0) await supabase.from('product_specs').insert(valid.map((sp, i) => ({ product_id: productId, label: sp.label, value: sp.value, sort_order: i+1 })));

      // ── 規格：逐筆 update/insert/delete，保留 variant ID 不斷鏈 ──
      if (hasVariants && variants.length > 0) {
        const validVariants = variants.filter(v => v.name);
        const keepIds: number[] = [];
        for (let i = 0; i < validVariants.length; i++) {
          const v = validVariants[i];
          const row = {
            product_id:   productId,
            name:         v.name,
            price:        Number(v.price) || form.price,
            price_diff:   (Number(v.price) || form.price) - form.price,
            sku:          v.sku || null,
            is_available: v.is_available,
            sort_order:   i + 1,
          };
          if (v.id) {
            // 既有規格 → update
            await supabase.from('product_variants').update(row).eq('id', v.id);
            keepIds.push(v.id);
          } else {
            // 新規格 → insert
            const { data: inserted } = await supabase.from('product_variants').insert(row).select('id').single();
            if (inserted) keepIds.push(inserted.id);
          }
        }
        // 刪掉被移除的規格（表單裡已不存在的）
        const { data: existingVariants } = await supabase
          .from('product_variants').select('id').eq('product_id', productId);
        for (const ev of (existingVariants ?? [])) {
          if (!keepIds.includes(ev.id)) {
            await supabase.from('product_variants').delete().eq('id', ev.id);
            // 同步刪除對應的 inventory
            await supabase.from('inventory').delete().eq('product_id', productId).eq('variant_id', ev.id);
          }
        }
      } else {
        // 沒有規格了 → 刪除所有 variants
        await supabase.from('product_variants').delete().eq('product_id', productId);
      }

      if (form.stock_mode === 'date_mode' && !form.is_preorder) {
        for (const d of shipDates) {
          if (d.id) {
            // 更新既有日期
            const { error: sdErr } = await supabase.from('product_ship_dates').update({
              capacity: d.capacity, is_open: d.is_open,
              cutoff_time: d.cutoff_time ?? '17:00', note: d.note ?? '',
            }).eq('id', d.id);
            if (sdErr) {
              // fallback：不含 cutoff_time/note（欄位可能尚未建立）
              await supabase.from('product_ship_dates').update({
                capacity: d.capacity, is_open: d.is_open,
              }).eq('id', d.id);
            }
          } else {
            // 新增日期
            const { error: sdErr } = await supabase.from('product_ship_dates').insert({
              product_id: productId, variant_id: null,
              ship_date: d.ship_date, capacity: d.capacity, reserved: 0, is_open: d.is_open,
              cutoff_time: d.cutoff_time ?? '17:00', note: d.note ?? '',
            });
            if (sdErr) {
              // fallback：不含 cutoff_time/note
              const { error: sdErr2 } = await supabase.from('product_ship_dates').insert({
                product_id: productId, variant_id: null,
                ship_date: d.ship_date, capacity: d.capacity, reserved: 0, is_open: d.is_open,
              });
              if (sdErr2) alert(`日期 ${d.ship_date} 新增失敗：${sdErr2.message}`);
            }
          }
        }
      } else if (form.stock_mode !== 'date_mode' && productId) {
        // 切回總量模式：刪除沒有預約的 ship_dates 記錄
        await supabase.from('product_ship_dates')
          .delete()
          .eq('product_id', productId)
          .eq('reserved', 0);
        // 警告：如果還有未完成訂單預留的日期記錄
        const { data: remainingDates } = await supabase.from('product_ship_dates')
          .select('id')
          .eq('product_id', productId)
          .gt('reserved', 0);
        if (remainingDates && remainingDates.length > 0) {
          alert(`注意：有 ${remainingDates.length} 筆出貨日期仍有未完成訂單的預留量，這些記錄將保留到訂單完成或取消後再自動清除。`);
        }
      }

      // ── 自動建立 inventory row（新增商品 or 有新規格時）──
      if (!editingId) {
        // 新商品：依規格建庫存
        const mode = form.is_preorder ? 'preorder' : 'stock';
        if (hasVariants && variants.length > 0) {
          const { data: savedVariants } = await supabase
            .from('product_variants').select('id').eq('product_id', productId).order('sort_order');
          for (const sv of (savedVariants ?? [])) {
            const { data: exists } = await supabase.from('inventory')
              .select('id').eq('product_id', productId).eq('variant_id', sv.id).maybeSingle();
            if (!exists) {
              await supabase.from('inventory').insert({
                product_id: productId, variant_id: sv.id,
                inventory_mode: mode, stock: 0, reserved: 0,
                safety_stock: 0, max_preorder: 0, reserved_preorder: 0,
              });
            }
          }
        } else {
          const { data: exists } = await supabase.from('inventory')
            .select('id').eq('product_id', productId).is('variant_id', null).maybeSingle();
          if (!exists) {
            await supabase.from('inventory').insert({
              product_id: productId, variant_id: null,
              inventory_mode: mode, stock: 0, reserved: 0,
              safety_stock: 0, max_preorder: 0, reserved_preorder: 0,
            });
          }
        }
      } else {
        // 編輯商品：確保每個規格都有 inventory row
        if (hasVariants && variants.length > 0) {
          const { data: savedVariants } = await supabase
            .from('product_variants').select('id').eq('product_id', productId).order('sort_order');
          const mode = form.is_preorder ? 'preorder' : 'stock';
          for (const sv of (savedVariants ?? [])) {
            const { data: exists } = await supabase.from('inventory')
              .select('id').eq('product_id', productId).eq('variant_id', sv.id).maybeSingle();
            if (!exists) {
              await supabase.from('inventory').insert({
                product_id: productId, variant_id: sv.id,
                inventory_mode: mode, stock: 0, reserved: 0,
                safety_stock: 0, max_preorder: 0, reserved_preorder: 0,
              });
            }
          }
          // 清除不再存在的規格的庫存記錄
          const validVariantIds = (savedVariants ?? []).map(v => v.id);
          const { data: allInv } = await supabase.from('inventory')
            .select('id, variant_id').eq('product_id', productId).not('variant_id', 'is', null);
          for (const inv of (allInv ?? [])) {
            if (!validVariantIds.includes(inv.variant_id)) {
              await supabase.from('inventory').delete().eq('id', inv.id);
            }
          }
        } else {
          // 沒有規格 → 確保 base inventory (variant_id=null) 存在
          const mode = form.is_preorder ? 'preorder' : 'stock';
          const { data: exists } = await supabase.from('inventory')
            .select('id').eq('product_id', productId).is('variant_id', null).maybeSingle();
          if (!exists) {
            await supabase.from('inventory').insert({
              product_id: productId, variant_id: null,
              inventory_mode: mode, stock: 0, reserved: 0,
              safety_stock: 0, max_preorder: 0, reserved_preorder: 0,
            });
          }
        }
      }
    }
    setSaving(false);
    setShowForm(false);
    loadData();
  };

  const toggleField = async (prod: Product, field: 'is_available' | 'is_sold_out' | 'is_featured') => {
    await supabase.from('products').update({ [field]: !prod[field] }).eq('id', prod.id);
    setProducts(prev => prev.map(x => x.id === prod.id ? { ...x, [field]: !x[field] } : x));
  };

  const moveProduct = async (prod: Product, direction: 'up' | 'down', list?: Product[]) => {
    const sameCat = (list ?? filtered).filter(x => x.category_id === prod.category_id);
    const idx     = sameCat.findIndex(x => x.id === prod.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameCat.length) return;

    const target   = sameCat[swapIdx];
    const newOrder = target.sort_order;
    const oldOrder = prod.sort_order;

    await Promise.all([
      supabase.from('products').update({ sort_order: newOrder }).eq('id', prod.id),
      supabase.from('products').update({ sort_order: oldOrder }).eq('id', target.id),
    ]);
    setProducts(prev => prev.map(x => {
      if (x.id === prod.id)    return { ...x, sort_order: newOrder };
      if (x.id === target.id) return { ...x, sort_order: oldOrder };
      return x;
    }));
  };

  // ── 可出貨日 CRUD ──────────────────────────────
  const openAddDate = () => {
    setDateForm({ ...EMPTY_SHIP_DATE });
    setEditingDateIdx(null);
    setBatchMode(false);
    setShowDateModal(true);
  };

  const openBatchAdd = () => {
    setBatchStart('');
    setBatchEnd('');
    setBatchCapacity(0);
    setBatchExclude('');
    setBatchSkipDays([]);
    setBatchCutoff('17:00');
    setBatchMode(true);
    setShowDateModal(true);
  };

  const openEditDate = (idx: number) => {
    setDateForm({ ...shipDates[idx] });
    setEditingDateIdx(idx);
    setBatchMode(false);
    setShowDateModal(true);
  };

  const saveDate = () => {
    if (batchMode) {
      if (!batchStart || !batchEnd) { alert('請選擇起訖日期'); return; }
      if (batchCapacity <= 0) { alert('請填寫每日可接單數量（需大於 0）'); return; }
      const excludeSet = new Set(batchExclude.split(',').map(str => str.trim()).filter(Boolean));
      const result: ShipDate[] = [];
      const addDay = (d: string) => {
        const dt = new Date(d + 'T12:00:00');
        dt.setDate(dt.getDate() + 1);
        return dt.toLocaleDateString('sv-SE');
      };
      let cur = batchStart;
      while (cur <= batchEnd) {
        const dayOfWeek = new Date(cur + 'T12:00:00').getDay();
        if (!batchSkipDays.includes(dayOfWeek) && !excludeSet.has(cur) && !shipDates.find(x => x.ship_date === cur)) {
          result.push({ ship_date: cur, capacity: batchCapacity, reserved: 0, is_open: true, cutoff_time: batchCutoff, note: '' });
        }
        cur = addDay(cur);
      }
      if (result.length === 0) { alert('所選範圍內無可新增的日期'); return; }
      setShipDates(prev => [...prev, ...result].sort((a, b) => a.ship_date.localeCompare(b.ship_date)));
    } else {
      if (!dateForm.ship_date) { alert('請選擇日期'); return; }
      if (dateForm.capacity <= 0) { alert('請填寫可接單數量（需大於 0）'); return; }
      // 容量不得低於已預約數
      if (editingDateIdx !== null && dateForm.capacity < (dateForm.reserved ?? 0)) {
        alert(`此日期已有 ${dateForm.reserved} 筆預約，名額不得低於此數`); return;
      }
      if (editingDateIdx !== null) {
        setShipDates(prev => prev.map((d, i) => i === editingDateIdx
          ? { ...d, capacity: dateForm.capacity, is_open: dateForm.is_open, cutoff_time: dateForm.cutoff_time, note: dateForm.note }
          : d));
      } else {
        if (shipDates.find(x => x.ship_date === dateForm.ship_date)) { alert('此日期已存在'); return; }
        setShipDates(prev => [...prev, { ...dateForm, reserved: 0 }].sort((a, b) => a.ship_date.localeCompare(b.ship_date)));
      }
    }
    setShowDateModal(false);
  };

  // 批量刪除
  const doBatchDelete = async () => {
    if (deleteSelected.size === 0) { alert('請先在日曆上選擇要刪除的日期'); return; }
    const toDelete = shipDates.filter(d => deleteSelected.has(d.ship_date));
    const hasReserved = toDelete.filter(d => d.reserved > 0);
    if (hasReserved.length > 0) { alert(`有 ${hasReserved.length} 個日期已有預約，無法刪除`); return; }
    if (!confirm(`確定要刪除 ${toDelete.length} 個日期？此操作無法復原。`)) return;
    // DB 刪除已存在的
    const idsToDelete = toDelete.filter(d => d.id).map(d => d.id!);
    if (idsToDelete.length > 0) {
      await supabase.from('product_ship_dates').delete().in('id', idsToDelete);
    }
    setShipDates(prev => prev.filter(d => !deleteSelected.has(d.ship_date)));
    setDeleteSelected(new Set());
    setShowBatchDelete(false);
  };

  const deleteDate = async (idx: number) => {
    const d = shipDates[idx];
    if (d.reserved > 0) { alert(`此日期已有 ${d.reserved} 筆預約，無法刪除`); return; }
    if (!confirm('確定要刪除此出貨日期？')) return;
    if (d.id) await supabase.from('product_ship_dates').delete().eq('id', d.id);
    setShipDates(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleDateOpen = async (idx: number) => {
    const d = shipDates[idx];
    const newVal = !d.is_open;
    if (d.id) await supabase.from('product_ship_dates').update({ is_open: newVal }).eq('id', d.id);
    setShipDates(prev => prev.map((x, i) => i === idx ? { ...x, is_open: newVal } : x));
  };

  // 分類展開狀態
  const [expandedCats, setExpandedCats] = useState<number[]>([]);

  const toggleExpandCat = (id: number) => {
    setExpandedCats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const moveCategory = async (cat: Category, direction: 'up' | 'down') => {
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
    const idx    = sorted.findIndex(c => c.id === cat.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const target   = sorted[swapIdx];
    const newOrder = target.sort_order;
    const oldOrder = cat.sort_order;
    await Promise.all([
      supabase.from('categories').update({ sort_order: newOrder }).eq('id', cat.id),
      supabase.from('categories').update({ sort_order: oldOrder }).eq('id', target.id),
    ]);
    setCategories(prev => prev.map(c => {
      if (c.id === cat.id)    return { ...c, sort_order: newOrder };
      if (c.id === target.id) return { ...c, sort_order: oldOrder };
      return c;
    }));
  };
  const openCatEdit = (c: Category) => { setCatForm({ name: c.name, slug: c.slug, sort_order: c.sort_order }); setEditingCatId(c.id); setShowCatForm(true); };
  const handleCatSave = async () => {
    if (!catForm.name || !catForm.slug) { alert('請填寫分類名稱和網址'); return; }
    setSavingCat(true);
    if (editingCatId) await supabase.from('categories').update(catForm).eq('id', editingCatId);
    else              await supabase.from('categories').insert(catForm);
    setSavingCat(false);
    setShowCatForm(false);
    loadData();
  };
  const handleDeleteProduct = async (prod: Product) => {
    if (!confirm(`確定要刪除「${prod.name}」？此操作無法復原。`)) return;
    // 先確認是否有歷史訂單（order_items FK 會擋刪除）
    const { count } = await supabase
      .from('order_items').select('id', { count: 'exact', head: true }).eq('product_id', prod.id);
    if ((count ?? 0) > 0) {
      if (!confirm(`此商品有 ${count} 筆訂單記錄，無法直接刪除。\n是否改為「下架」（隱藏商品並保留歷史記錄）？`)) return;
      const { error } = await supabase.from('products').update({ is_available: false, is_sold_out: true }).eq('id', prod.id);
      if (error) { alert('下架失敗：' + error.message); return; }
      alert('已成功下架，商品已從前台隱藏。');
      setProducts(prev => prev.map(x => x.id === prod.id ? { ...x, is_available: false, is_sold_out: true } : x));
      return;
    }
    // 無訂單 → 正常刪除所有關聯資料
    await supabase.from('product_specs').delete().eq('product_id', prod.id);
    await supabase.from('product_ship_dates').delete().eq('product_id', prod.id);
    await supabase.from('product_variants').delete().eq('product_id', prod.id);
    await supabase.from('preorder_batches').delete().eq('product_id', prod.id);
    const { error } = await supabase.from('products').delete().eq('id', prod.id);
    if (error) { alert('刪除失敗：' + error.message); return; }
    setProducts(prev => prev.filter(x => x.id !== prod.id));
  };

  const handleCatDelete = async (id: number) => {
    if (!confirm('刪除分類後，底下的商品將失去分類連結，確定要刪除？')) return;
    await supabase.from('categories').delete().eq('id', id);
    loadData();
  };

  // ── 快速更新 ──────────────────────────────────
  const applyQuickUpdate = async () => {
    const changed = quickData.filter(d => d.newPrice !== d.price);
    for (const d of changed) await supabase.from('products').update({ price: d.newPrice }).eq('id', d.id);
    alert('已套用更新');
    loadData();
  };

  // 篩選商品
  const filtered = products.filter(prod => {
    const matchCat    = !filterCat    || String(prod.category_id) === filterCat;
    const matchStatus = !filterStatus || (filterStatus === 'on' ? prod.is_available : !prod.is_available);
    const matchSearch = !search       || prod.name.includes(search) || prod.slug.includes(search);
    return matchCat && matchStatus && matchSearch;
  });

  if (loading) return <p className={s.loadingText}>載入中...</p>;

  return (
    <div>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>商品管理</h1>
        {tab === 'list' && <button onClick={openAdd} className={s.btnPrimary}>＋ 新增商品</button>}
        {tab === 'category' && <button onClick={() => { setCatForm({ ...EMPTY_CAT }); setEditingCatId(null); setShowCatForm(true); }} className={s.btnPrimary}>＋ 新增分類</button>}
      </div>

      <div className={s.tabBar}>
        <div className={tab === 'list' ? s.tabActive : s.tab} onClick={() => setTab('list')}>商品列表</div>
        <div className={tab === 'category' ? s.tabActive : s.tab} onClick={() => setTab('category')}>商品分類</div>
        <div className={tab === 'quickupdate' ? s.tabActive : s.tab} onClick={() => setTab('quickupdate')}>快速更新</div>
        <div className={tab === 'notify' ? s.tabActive : s.tab} onClick={() => setTab('notify')}>貨到通知</div>
      </div>

      {/* ════ 商品列表 ════ */}
      {tab === 'list' && (
        <>
          {/* 商品表單 */}
          {showForm && (
            <div className={s.formPanel}>
              <h3 className={s.formTitle}>{editingId ? '編輯商品' : '新增商品'}</h3>
              <div className={s.formGrid}>
                <div><label className={s.label}>商品名稱（中文）*</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="例：杜拜Q餅" className={`${s.input} ${p.inputFull}`} /></div>
                <div><label className={s.label}>商品英文名</label><input value={form.name_en} onChange={e => setForm({...form, name_en: e.target.value})} placeholder="例：DUBAI Q-BING" className={`${s.input} ${p.inputFull}`} /></div>
                <div><label className={s.label}>網址 slug * （只能英文和 -）</label><input value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder="例：dubai-qbing" className={`${s.input} ${p.inputFull}`} /></div>
                <div><label className={s.label}>售價（NT$）*</label><input type="number" value={form.price} onChange={e => setForm({...form, price: Number(e.target.value)})} className={`${s.input} ${p.inputFull}`} /></div>
                <div><label className={s.label}>分類</label><select value={form.category_id} onChange={e => setForm({...form, category_id: Number(e.target.value)})} className={`${s.select} ${p.inputFull}`}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className={s.formGridFull}><label className={s.label}>商品描述</label><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} className={s.textarea} /></div>
              </div>

              {/* 圖片上傳 */}
              <div className={s.mb20}>
                <label className={s.label}>商品圖片</label>
                <div className={p.imgUploadWrap}>
                  {form.image_url && <img src={form.image_url} alt="預覽" className={p.imgPreview} />}
                  <div className={p.flex1}>
                    <input value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} placeholder="貼上圖片網址，或點下方按鈕上傳" className={`${s.input} ${p.inputFull}`} />
                    <div className={`${s.flex} ${p.uploadActions}`}>
                      <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className={s.btnSmall}>{uploading ? '上傳中...' : '從電腦上傳'}</button>
                      <span className={p.uploadHint}>建議尺寸 800×800px</span>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className={p.hidden} />
                  </div>
                </div>
              </div>

              {/* 開關 */}
              <div className={`${s.flex} ${s.flexWrap} ${s.gap24} ${s.mb24}`}>
                {[{ key: 'is_available', label: '前台顯示' }, { key: 'is_featured', label: '首頁熱銷' }, { key: 'is_preorder', label: '預購商品' }, { key: 'is_sold_out', label: '今日完售' }].map(({ key, label }) => (
                  <label key={key} className={s.checkLabel}>
                    <input type="checkbox" checked={(form as any)[key]} onChange={e => setForm({...form, [key]: e.target.checked})} className={s.checkbox} /> {label}
                  </label>
                ))}
              </div>

              {/* 可用運輸方式 */}
              <div className={s.mb24}>
                <label className={s.label}>可用運輸方式</label>
                <div className={`${s.flex} ${s.flexWrap} ${s.gap24}`}>
                  {[
                    { key: 'allow_home_ambient',      label: '宅配（常溫）' },
                    { key: 'allow_home_refrigerated', label: '宅配（冷藏）' },
                    { key: 'allow_home_frozen',       label: '宅配（冷凍）' },
                    { key: 'allow_cvs_ambient',       label: '7-11 取貨（常溫）' },
                    { key: 'allow_cvs_frozen',        label: '7-11 取貨（冷凍）' },
                    { key: 'allow_store_pickup',      label: '門市自取' },
                  ].map(({ key, label }) => (
                    <label key={key} className={s.checkLabel}>
                      <input type="checkbox" checked={(form as any)[key]} onChange={e => setForm({...form, [key]: e.target.checked})} className={s.checkbox} /> {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* 庫存模式（非預購商品才顯示）*/}
              {!form.is_preorder && (
                <div className={p.sectionDivider}>
                  <label className={`${s.label} ${p.stockModeLabel}`}>庫存控制模式</label>
                  <div className={`${s.flex} ${p.stockModeOptionsRow}`}>
                    {[
                      { val: 'stock_mode', title: '總量模式', desc: '統一管理總庫存量，顧客自由選出貨日期（依商店規則）' },
                      { val: 'date_mode',  title: '每日接單設定', desc: '設定每日可接單數量，可批量建立並個別管理' },
                    ].map(({ val, title, desc }) => (
                      <label key={val} className={form.stock_mode === val ? p.stockModeOptionActive : p.stockModeOption}>
                        <input type="radio" value={val} checked={form.stock_mode === val} onChange={() => {
                          if (val === 'stock_mode' && form.stock_mode === 'date_mode' && shipDates.some(d => d.reserved > 0)) {
                            if (!confirm('此商品有已預約的出貨日訂單，切換模式只影響新訂單，舊訂單不受影響。確定切換？')) return;
                          }
                          setForm({...form, stock_mode: val});
                        }} className={`${s.checkbox} ${p.radioCheckbox}`} />
                        <div>
                          <div className={p.stockModeTitle}>{title}</div>
                          <div className={p.stockModeDesc}>{desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* 總量模式：自訂出貨日期範圍 */}
                  {form.stock_mode === 'stock_mode' && (
                    <div className={p.dateRangePanel}>
                      <div className={p.dateRangePanelTitle}>
                        出貨日期範圍（選填，留空套用商店預設）
                      </div>

                      <div className={`${s.grid2} ${p.dateRangeMb}`}>
                        <div>
                          <label className={s.label}>最早可出貨日</label>
                          <AdminDatePicker value={(form as any).ship_start_date} onChange={val => setForm({...form, ship_start_date: val} as any)} className={`${s.input} ${p.inputFull}`} />
                        </div>
                        <div>
                          <label className={s.label}>最晚可出貨日</label>
                          <AdminDatePicker value={(form as any).ship_end_date} onChange={val => setForm({...form, ship_end_date: val} as any)} className={`${s.input} ${p.inputFull}`} />
                        </div>
                      </div>

                      {/* 不出貨日期選擇器 */}
                      <div>
                        <label className={s.label}>不出貨日期（點選加入排除清單）</label>
                        <BlockedDatesEditor
                          startDate={(form as any).ship_start_date}
                          endDate={(form as any).ship_end_date}
                          blocked={JSON.parse((form as any).ship_blocked_dates || '[]')}
                          onChange={dates => setForm({...form, ship_blocked_dates: JSON.stringify(dates)} as any)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 可出貨日設定（日期模式 + 非預購才顯示）*/}
              {form.stock_mode === 'date_mode' && !form.is_preorder && (() => {
                // 摘要計算
                const sdSummary = (() => {
                  if (shipDates.length === 0) return null;
                  const sorted = [...shipDates].sort((a, b) => a.ship_date.localeCompare(b.ship_date));
                  const fmt = (d: string) => { const [, m, day] = d.split('-'); return `${parseInt(m)}/${parseInt(day)}`; };
                  const range = `${fmt(sorted[0].ship_date)} ~ ${fmt(sorted[sorted.length - 1].ship_date)}`;
                  // 最常見容量
                  const capCounts: Record<number, number> = {};
                  shipDates.forEach(d => { capCounts[d.capacity] = (capCounts[d.capacity] ?? 0) + 1; });
                  const topCap = Object.entries(capCounts).sort((a, b) => b[1] - a[1])[0][0];
                  // 休息日（只在跨度 >= 7 天時偵測）
                  const daySpan = (new Date(sorted[sorted.length - 1].ship_date).getTime() - new Date(sorted[0].ship_date).getTime()) / 86400000;
                  let closedStr = '';
                  if (daySpan >= 7) {
                    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
                    const presentDays = new Set(shipDates.map(d => new Date(d.ship_date + 'T12:00:00').getDay()));
                    const closed = [0,1,2,3,4,5,6].filter(d => !presentDays.has(d));
                    if (closed.length > 0 && closed.length < 7) closedStr = `週${closed.map(d => dayNames[d]).join('、')}不開放`;
                  }
                  // 截單時間
                  const ctCounts: Record<string, number> = {};
                  shipDates.forEach(d => { const c = d.cutoff_time ?? '17:00'; ctCounts[c] = (ctCounts[c] ?? 0) + 1; });
                  const topCt = Object.entries(ctCounts).sort((a, b) => b[1] - a[1])[0][0];
                  // 開放 / 關閉數量
                  const openCount = shipDates.filter(d => d.is_open).length;
                  const closedCount = shipDates.length - openCount;
                  return { range, topCap, closedStr, topCt, total: shipDates.length, openCount, closedCount };
                })();

                return (
                <div className={p.sectionDivider24}>
                  <div className={`${s.flex} ${p.sectionHeader}`}>
                    <label className={`${s.label} ${p.specLabelNoMargin}`}>每日接單設定</label>
                    <div className={`${s.flex} ${p.gap8}`}>
                      {shipDates.length > 0 && (
                        <button onClick={() => { setDeleteSelected(new Set()); setShowBatchDelete(true); }} className={s.btnSmall} style={{ color: '#c0392b' }}>批量刪除</button>
                      )}
                      <button onClick={openBatchAdd} className={s.btnSmall}>批量新增</button>
                      <button onClick={openAddDate} className={`${s.btnPrimary} ${p.btnSmallCompact}`}>+ 新增日期</button>
                    </div>
                  </div>

                  {shipDates.length === 0 ? (
                    <div className={`${s.emptyState} ${p.emptyDashed}`}>
                      <div className={s.emptyDesc}>尚未設定可出貨日期，點「新增日期」或「批量新增」開始</div>
                    </div>
                  ) : (
                    <>
                      {/* 摘要列（可點擊展開） */}
                      <div
                        onClick={() => setShipDatesExpanded(!shipDatesExpanded)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#faf8f5', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', userSelect: 'none' }}
                      >
                        <span style={{ transform: shipDatesExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', fontSize: 14, color: 'var(--text-light)' }}>&#9654;</span>
                        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.9em', color: 'var(--text-dark)' }}>
                          <span>目前接單設定</span>
                          <span style={{ fontWeight: 600 }}>{sdSummary!.range}</span>
                          <span style={{ color: 'var(--text-light)' }}>/</span>
                          <span>每日 {sdSummary!.topCap} 份</span>
                          {sdSummary!.closedStr && <>
                            <span style={{ color: 'var(--text-light)' }}>/</span>
                            <span style={{ color: '#c0392b' }}>{sdSummary!.closedStr}</span>
                          </>}
                          <span style={{ color: 'var(--text-light)' }}>/</span>
                          <span>截單時間：{sdSummary!.topCt}</span>
                        </div>
                        <span style={{ fontSize: '0.8em', color: 'var(--text-light)', whiteSpace: 'nowrap' }}>
                          共 {sdSummary!.total} 天
                          {sdSummary!.closedCount > 0 && <span style={{ color: '#c0392b' }}>（{sdSummary!.closedCount} 天已關閉）</span>}
                        </span>
                      </div>

                      {/* 展開後的表格 */}
                      {shipDatesExpanded && (
                        <div className={s.tableWrap} style={{ marginTop: 8 }}>
                          <table className={s.table}>
                            <thead>
                              <tr>
                                {['出貨日', '可接單', '已預約', '剩餘', '截單', '備註', '狀態', '操作'].map(h => (
                                  <th key={h} className={s.th}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {shipDates.map((d, i) => {
                                const remaining = d.capacity - d.reserved;
                                const isFull    = remaining <= 0;
                                const isPast    = d.ship_date < new Date().toISOString().split('T')[0];
                                return (
                                  <tr key={d.ship_date} className={s.tr} style={{ opacity: isPast ? 0.5 : 1 }}>
                                    <td className={`${s.td} ${p.monoFont}`}>
                                      {d.ship_date}
                                      {isPast && <span className={p.pastHint}>已過</span>}
                                    </td>
                                    <td className={`${s.td} ${p.textRight}`}>{d.capacity}</td>
                                    <td className={`${s.td} ${p.textRight}`} style={{ color: d.reserved > 0 ? '#b87a2a' : 'var(--text-light)' }}>{d.reserved}</td>
                                    <td className={`${s.td} ${p.fw600} ${p.textRight}`} style={{ color: isFull ? '#c0392b' : '#2ab85a' }}>{remaining}</td>
                                    <td className={`${s.td} ${p.monoFont}`} style={{ fontSize: '0.85em', color: 'var(--text-light)' }}>{d.cutoff_time ?? '17:00'}</td>
                                    <td className={s.td} style={{ fontSize: '0.85em', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.note || '—'}</td>
                                    <td className={s.td}>
                                      <span className={s.badge} style={{ color: !d.is_open ? 'var(--text-light)' : isFull ? '#c0392b' : '#2ab85a', border: `1px solid ${!d.is_open ? 'var(--text-light)' : isFull ? '#c0392b' : '#2ab85a'}` }}>
                                        {!d.is_open ? '已關閉' : isFull ? '已滿' : '開放'}
                                      </span>
                                    </td>
                                    <td className={s.td}>
                                      <div className={`${s.flex} ${p.gap6}`}>
                                        <button onClick={() => openEditDate(i)} className={s.btnSmall}>編輯</button>
                                        <button onClick={() => toggleDateOpen(i)} className={s.btnSmall} style={{ color: d.is_open ? 'var(--text-light)' : '#2ab85a' }}>
                                          {d.is_open ? '關閉' : '開放'}
                                        </button>
                                        <button onClick={() => deleteDate(i)} className={s.btnDanger}>刪除</button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
                );
              })()}

              {/* 規格選項 */}
              <div className={p.sectionDivider24}>
                <div className={`${s.flex} ${p.sectionHeader16}`}>
                  <label className={`${s.label} ${p.specLabelNoMargin}`}>規格選項</label>
                  <div className={`${s.flex} ${p.gap8}`}>
                    {[{ val: false, label: '無規格' }, { val: true, label: '有規格' }].map(opt => (
                      <button key={String(opt.val)} onClick={() => setHasVariants(opt.val)} className={`${hasVariants === opt.val ? s.btnPrimary : s.btnOutline} ${p.btnToggle}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {hasVariants && (
                  <div>
                    {/* 規格名稱 */}
                    <div className={s.mb16}>
                      <label className={s.label}>規格名稱（例：尺寸、口味）</label>
                      <input value={variantLabel} onChange={e => setVariantLabel(e.target.value)} placeholder="例：尺寸" className={`${s.input} ${p.variantLabelInput}`} />
                    </div>

                    {/* 規格選項表格 */}
                    <div className={p.variantTableWrap}>
                      <div className={p.variantGridHeader}>
                        {['選項名稱', '售價', 'SKU', '啟用', '', ''].map((h, i) => (
                          <div key={i} className={p.variantGridHeaderCell}>{h}</div>
                        ))}
                      </div>
                      {variants.map((v, i) => (
                        <div key={i} className={p.variantGridRow}>
                          <input value={v.name} onChange={e => setVariants(prev => prev.map((x, j) => j===i ? {...x, name: e.target.value} : x))} placeholder="例：4吋" className={p.variantInput} />
                          <input type="number" value={v.price} onChange={e => setVariants(prev => prev.map((x, j) => j===i ? {...x, price: e.target.value} : x))} placeholder={String(form.price)} className={p.variantInput} />
                          <input value={v.sku} onChange={e => setVariants(prev => prev.map((x, j) => j===i ? {...x, sku: e.target.value} : x))} placeholder="SKU（選填）" className={p.variantInput} />
                          <div className={p.variantCheckboxCell}>
                            <input type="checkbox" checked={v.is_available} onChange={() => setVariants(prev => prev.map((x, j) => j===i ? {...x, is_available: !x.is_available} : x))} className={s.checkbox} />
                          </div>
                          <div className={p.variantIdx}>第 {i+1} 項</div>
                          <button onClick={() => setVariants(prev => prev.filter((_,j) => j!==i))} className={p.variantDeleteBtn}>✕</button>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setVariants(prev => [...prev, { ...EMPTY_VARIANT }])} className={s.btnSmall}>＋ 新增選項</button>
                  </div>
                )}
              </div>

              {/* 商品規格說明（product_specs，保存方式等） */}
              <div className={p.sectionDivider24}>
                <div className={`${s.flex} ${p.sectionHeader}`}>
                  <label className={`${s.label} ${p.specLabel}`}>商品說明規格（保存方式、份量等）</label>
                  <button onClick={() => setSpecs(prev => [...prev, { label: '', value: '', sort_order: prev.length+1 }])} className={s.btnSmall}>＋ 新增</button>
                </div>
                {specs.map((sp, i) => (
                  <div key={i} className={p.specRow}>
                    <input value={sp.label} onChange={e => setSpecs(prev => prev.map((x, j) => j===i ? {...x, label: e.target.value} : x))} placeholder="名稱（例：保存）" className={s.input} />
                    <input value={sp.value} onChange={e => setSpecs(prev => prev.map((x, j) => j===i ? {...x, value: e.target.value} : x))} placeholder="內容" className={s.input} />
                    <button onClick={() => setSpecs(prev => prev.filter((_,j) => j!==i))} className={`${s.btnDanger} ${p.specDeletePad}`}>✕</button>
                  </div>
                ))}
              </div>

              <div className={s.btnActions}>
                <button onClick={handleSave} disabled={saving} className={s.btnSave}>{saving ? '儲存中...' : '儲存'}</button>
                <button onClick={() => setShowForm(false)} className={s.btnCancel}>取消</button>
              </div>
            </div>
          )}

          {/* 篩選列 */}
          <div className={s.filterRow}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋商品名稱" className={s.searchInput} />
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className={s.filterSelect}>
              <option value="">全部分類</option>
              {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={s.filterSelect}>
              <option value="">全部狀態</option>
              <option value="on">前台顯示</option>
              <option value="off">已下架</option>
            </select>
          </div>

          {/* 商品表格 */}
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>{['圖片', '商品名稱', '分類', '售價', '前台顯示', '完售', '熱銷', '操作'].map(h => <th key={h} className={s.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((prod) => (
                  <tr key={prod.id} className={s.tr} style={{ opacity: prod.is_available ? 1 : 0.5 }}>
                    <td className={s.td}>
                      {prod.image_url ? <img src={prod.image_url} alt={prod.name} className={p.productThumb} /> : <div className={p.productThumbPlaceholder}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B8B5B0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></svg></div>}
                    </td>
                    <td className={s.td}>
                      <div className={p.prodName}>{prod.name}</div>
                      <div className={p.prodSlug}>{prod.slug}</div>
                    </td>
                    <td className={`${s.td} ${p.catColText}`}>{prod.categories?.name}</td>
                    <td className={`${s.td} ${p.priceCol}`}>NT$ {prod.price.toLocaleString()}</td>
                    <td className={s.td}><input type="checkbox" checked={prod.is_available} onChange={() => toggleField(prod, 'is_available')} className={s.checkbox} /></td>
                    <td className={s.td}><input type="checkbox" checked={prod.is_sold_out}  onChange={() => toggleField(prod, 'is_sold_out')}  className={s.checkbox} /></td>
                    <td className={`${s.td} ${p.fontSize12}`} style={{ color: prod.is_featured ? '#2ab85a' : 'var(--text-light)' }}>{prod.is_featured ? '是' : '—'}</td>
                    <td className={s.td}>
                      <div className={`${s.flex} ${p.gap4}`}>
                        <button onClick={() => openEdit(prod)} className={s.btnSmall}>編輯</button>
                        <button onClick={() => handleDeleteProduct(prod)} className={s.btnDanger}>刪除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile card list */}
            <div className={s.cardList}>
              {filtered.map((prod) => (
                <div key={prod.id} className={s.card} style={{ opacity: prod.is_available ? 1 : 0.5 }}>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>商品</span>
                    <span className={s.cardValue}>{prod.name}</span>
                  </div>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>分類</span>
                    <span className={`${s.cardValue} ${p.cardValueSm}`}>{prod.categories?.name}</span>
                  </div>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>售價</span>
                    <span className={s.cardValue}>NT$ {prod.price.toLocaleString()}</span>
                  </div>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>顯示</span>
                    <input type="checkbox" checked={prod.is_available} onChange={() => toggleField(prod, 'is_available')} className={s.checkbox} />
                  </div>
                  <div className={s.cardActions}>
                    <button onClick={() => openEdit(prod)} className={s.btnSmall}>編輯</button>
                    <button onClick={() => handleDeleteProduct(prod)} className={s.btnDanger}>刪除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ════ 商品分類 ════ */}
      {tab === 'category' && (
        <>
          <div className={`${s.infoBar} ${p.infoBarMb}`}>
            分類順序即為前台顯示順序。點擊分類可展開，並對底下商品排序。
          </div>

          {/* 分類表單 */}
          {showCatForm && (
            <div className={`${s.formPanel} ${p.formPanelMb}`}>
              <h3 className={s.formTitle}>{editingCatId ? '編輯分類' : '新增分類'}</h3>
              <div className={`${s.formGrid} ${p.formGridMb}`}>
                <div><label className={s.label}>分類名稱 *</label><input value={catForm.name} onChange={e => setCatForm({...catForm, name: e.target.value})} placeholder="例：Q餅系列" className={`${s.input} ${p.inputFull}`} /></div>
                <div><label className={s.label}>網址 slug * （只能英文和 -）</label><input value={catForm.slug} onChange={e => setCatForm({...catForm, slug: e.target.value})} placeholder="例：q-bing" className={`${s.input} ${p.inputFull}`} /></div>
              </div>
              <div className={s.btnActions}>
                <button onClick={handleCatSave} disabled={savingCat} className={s.btnSave}>{savingCat ? '儲存中...' : '儲存'}</button>
                <button onClick={() => setShowCatForm(false)} className={s.btnCancel}>取消</button>
              </div>
            </div>
          )}

          {/* 分類列表（可展開）*/}
          <div className={p.catGrid}>
            {[...categories].sort((a, b) => a.sort_order - b.sort_order).map((c, idx, sorted) => {
              const isExpanded  = expandedCats.includes(c.id);
              const isFirst     = idx === 0;
              const isLast      = idx === sorted.length - 1;
              const catProducts = [...products.filter(x => x.category_id === c.id)].sort((a, b) => a.sort_order - b.sort_order);

              return (
                <div key={c.id} className={p.catCard}>
                  {/* 分類列 */}
                  <div className={p.catRow}>
                    <button onClick={() => toggleExpandCat(c.id)} className={isExpanded ? p.catExpandBtnOpen : p.catExpandBtn}>▶</button>
                    <div className={p.flex1}>
                      <div className={p.catName}>{c.name}</div>
                      <div className={p.catSlug}>/shop/{c.slug} · {catProducts.length} 件商品</div>
                    </div>
                    <div className={`${s.flex} ${p.gap4}`}>
                      <button onClick={() => moveCategory(c, 'up')} disabled={isFirst} title="上移" className={p.sortBtn}>↑</button>
                      <button onClick={() => moveCategory(c, 'down')} disabled={isLast} title="下移" className={p.sortBtn}>↓</button>
                    </div>
                    <button onClick={() => openCatEdit(c)} className={s.btnSmall}>編輯</button>
                    <button onClick={() => handleCatDelete(c.id)} className={s.btnDanger}>刪除</button>
                  </div>

                  {/* 展開：商品列表 */}
                  {isExpanded && (
                    <div className={p.catExpandedPanel}>
                      {catProducts.length === 0 ? (
                        <div className={p.catEmptyMsg}>此分類目前沒有商品</div>
                      ) : (
                        catProducts.map((prod, pIdx) => {
                          const pIsFirst = pIdx === 0;
                          const pIsLast  = pIdx === catProducts.length - 1;
                          return (
                            <div key={prod.id} className={p.catProductRow}>
                              <div className={p.catProductThumb}>
                                {prod.image_url ? <img src={prod.image_url} alt={prod.name} className={p.catProductThumbInner} /> : <div className={p.catProductPlaceholder}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B8B5B0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></svg></div>}
                              </div>
                              <div className={p.catProductInfo}>
                                <div className={p.catProductName} style={{ color: prod.is_available ? 'var(--text-dark)' : 'var(--text-light)' }}>{prod.name}</div>
                                <div className={p.catProductSub}>NT$ {prod.price.toLocaleString()} {!prod.is_available && '· 已下架'}</div>
                              </div>
                              <div className={`${s.flex} ${p.gap4}`}>
                                <button onClick={() => moveProduct(prod, 'up', catProducts)} disabled={pIsFirst} className={p.sortBtnSm}>↑</button>
                                <button onClick={() => moveProduct(prod, 'down', catProducts)} disabled={pIsLast} className={p.sortBtnSm}>↓</button>
                              </div>
                              <button onClick={() => { setTab('list'); openEdit(prod); }} className={s.btnSmall}>編輯</button>
                              <button onClick={() => handleDeleteProduct(prod)} className={s.btnDanger}>刪除</button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ════ 快速更新 ════ */}
      {tab === 'quickupdate' && (
        <>
          <div className={`${s.infoBar} ${p.infoBarMb}`}>
            批次更新商品售價，不需要逐一進入編輯頁面。
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>{['商品名稱', '分類', '現有售價', '更新售價'].map((h, i) => <th key={h} className={i > 1 ? s.thRight : s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {quickData.map((d, i) => {
                  const prod = products.find(x => x.id === d.id);
                  return (
                    <tr key={d.id} className={s.tr}>
                      <td className={s.td}>{d.name}</td>
                      <td className={`${s.td} ${p.catColText}`}>{prod?.categories?.name ?? '—'}</td>
                      <td className={`${s.td} ${p.quickCurrentPrice}`}>NT$ {d.price.toLocaleString()}</td>
                      <td className={`${s.td} ${p.textRight}`}>
                        <input type="number" value={d.newPrice} onChange={e => setQuickData(prev => prev.map((x, j) => j===i ? {...x, newPrice: Number(e.target.value)} : x))} className={`${s.input} ${p.inputW100} ${p.textRight}`} style={{ color: d.newPrice !== d.price ? '#b35252' : 'var(--text-dark)' }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className={s.cardList}>
              {quickData.map((d, i) => {
                const prod = products.find(x => x.id === d.id);
                return (
                  <div key={d.id} className={s.card}>
                    <div className={s.cardRow}><span className={s.cardLabel}>商品</span><span className={s.cardValue}>{d.name}</span></div>
                    <div className={s.cardRow}><span className={s.cardLabel}>分類</span><span className={`${s.cardValue} ${p.cardValueSm}`}>{prod?.categories?.name ?? '—'}</span></div>
                    <div className={s.cardRow}><span className={s.cardLabel}>現價</span><span className={s.cardValue}>NT$ {d.price.toLocaleString()}</span></div>
                    <div className={s.cardRow}>
                      <span className={s.cardLabel}>新價</span>
                      <input type="number" value={d.newPrice} onChange={e => setQuickData(prev => prev.map((x, j) => j===i ? {...x, newPrice: Number(e.target.value)} : x))} className={`${s.input} ${p.inputW100} ${p.textRight}`} style={{ color: d.newPrice !== d.price ? '#b35252' : 'var(--text-dark)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className={p.quickUpdateApplyRow}>
            <button onClick={applyQuickUpdate} className={s.btnPrimary}>
              套用全部更新
            </button>
          </div>
        </>
      )}

      {/* ════ 貨到通知列表 ════ */}
      {tab === 'notify' && (
        <>
          <div className={`${s.infoBar} ${p.infoBarMb}`}>
            當商品補貨時，自動通知曾點擊「貨到通知」的顧客。（需串接 Email 發送 API）
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>{['商品名稱', '顧客 Email', '登記時間', '狀態', '操作'].map(h => <th key={h} className={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                <tr>
                  <td colSpan={5} className={s.emptyRow}>
                    貨到通知功能需要在前台商品頁加入「通知我補貨」按鈕，並建立通知登記表。目前尚未啟用。
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ════ 可出貨日期 Modal ════ */}
      {showDateModal && (
        <>
          <div onClick={() => setShowDateModal(false)} className={s.modalOverlay} />
          <div className={`${s.modal} ${p.modal480}`}>
            <div className={s.modalHeader}>
              <span className={s.modalTitle}>
                {batchMode ? '批量新增接單日期' : editingDateIdx !== null ? '編輯接單日期' : '新增接單日期'}
              </span>
              <button onClick={() => setShowDateModal(false)} className={s.modalClose}>×</button>
            </div>
            <div className={`${s.modalBody} ${p.modalBodyGrid}`}>
              {batchMode ? (
                <>
                  <div className={s.grid2}>
                    <div>
                      <label className={s.label}>開始日期 *</label>
                      <AdminDatePicker value={batchStart} onChange={val => setBatchStart(val)} className={`${s.input} ${p.inputFull}`} />
                    </div>
                    <div>
                      <label className={s.label}>結束日期 *</label>
                      <AdminDatePicker value={batchEnd} onChange={val => setBatchEnd(val)} className={`${s.input} ${p.inputFull}`} />
                    </div>
                  </div>
                  <div>
                    <label className={s.label}>每日可接單數量 *</label>
                    <input type="number" value={batchCapacity || ''} onChange={e => setBatchCapacity(e.target.value === '' ? 0 : Number(e.target.value))} placeholder="例：10" className={`${s.input} ${p.inputW100}`} />
                  </div>
                  <div>
                    <label className={s.label}>跳過星期（選填）</label>
                    <div className={`${s.flex} ${s.flexWrap} ${s.gap24}`}>
                      {['日', '一', '二', '三', '四', '五', '六'].map((name, idx) => (
                        <label key={idx} className={s.checkLabel}>
                          <input type="checkbox" checked={batchSkipDays.includes(idx)} onChange={e => {
                            setBatchSkipDays(prev => e.target.checked ? [...prev, idx] : prev.filter(d => d !== idx));
                          }} className={s.checkbox} /> {name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={s.label}>截單時間</label>
                    <input type="time" value={batchCutoff} onChange={e => setBatchCutoff(e.target.value)} className={`${s.input} ${p.inputW180}`} />
                    <div className={p.hintText}>超過此時間後，隔日將無法接單（預設 17:00）</div>
                  </div>
                  <div>
                    <label className={s.label}>排除日期（選填，逗號分隔）</label>
                    <input value={batchExclude} onChange={e => setBatchExclude(e.target.value)} placeholder="例：2026-03-28,2026-03-29" className={`${s.input} ${p.inputFull}`} />
                    <div className={p.hintText}>輸入不接單的日期，逗號分開</div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={s.label}>出貨日期 *</label>
                    <AdminDatePicker value={dateForm.ship_date} onChange={val => setDateForm({...dateForm, ship_date: val})} disabled={editingDateIdx !== null} className={`${s.input} ${p.inputW180}`} style={editingDateIdx !== null ? { opacity: 0.5 } : undefined} />
                    {editingDateIdx !== null && <div className={p.hintText}>日期不可修改，如需更改請刪除後重新新增</div>}
                  </div>
                  <div>
                    <label className={s.label}>可接單數量 *</label>
                    <div className={`${s.flex} ${p.flexCenterGap8}`}>
                      <input type="number" value={dateForm.capacity || ''} onChange={e => setDateForm({...dateForm, capacity: e.target.value === '' ? 0 : Number(e.target.value)})} placeholder="例：10" className={`${s.input} ${p.inputW100}`} />
                      <span className={p.unitLabel}>份</span>
                    </div>
                  </div>
                  <div>
                    <label className={s.label}>截單時間</label>
                    <input type="time" value={dateForm.cutoff_time ?? '17:00'} onChange={e => setDateForm({...dateForm, cutoff_time: e.target.value})} className={`${s.input} ${p.inputW180}`} />
                  </div>
                  <div>
                    <label className={s.label}>單日說明（選填）</label>
                    <input value={dateForm.note ?? ''} onChange={e => setDateForm({...dateForm, note: e.target.value})} placeholder="例：母親節檔期" className={`${s.input} ${p.inputFull}`} />
                  </div>
                  {editingDateIdx !== null && (
                    <div className={s.infoBar}>
                      已預約：{dateForm.reserved} 份 ／ 剩餘：{dateForm.capacity - dateForm.reserved} 份
                    </div>
                  )}
                  <label className={s.checkLabel}>
                    <input type="checkbox" checked={dateForm.is_open} onChange={e => setDateForm({...dateForm, is_open: e.target.checked})} className={s.checkbox} />
                    開放接單
                  </label>
                </>
              )}
              <div className={s.btnActions}>
                <button onClick={saveDate} className={s.btnSave}>
                  {batchMode ? '批量新增' : editingDateIdx !== null ? '儲存' : '新增'}
                </button>
                <button onClick={() => setShowDateModal(false)} className={s.btnCancel}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ════ 批量刪除 Modal（日曆選取） ════ */}
      {showBatchDelete && (() => {
        const [calY, calM] = deleteCalMonth.split('-').map(Number);
        const firstDay = new Date(calY, calM - 1, 1).getDay();
        const daysInMonth = new Date(calY, calM, 0).getDate();
        const todayStr = new Date().toISOString().split('T')[0];
        const shipDateSet = new Map(shipDates.map(d => [d.ship_date, d]));
        const prevMonth = () => {
          const d = new Date(calY, calM - 2, 1);
          setDeleteCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        };
        const nextMonth = () => {
          const d = new Date(calY, calM, 1);
          setDeleteCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        };
        const toggleDate = (dateStr: string) => {
          const sd = shipDateSet.get(dateStr);
          if (!sd || sd.reserved > 0) return;
          setDeleteSelected(prev => {
            const next = new Set(prev);
            if (next.has(dateStr)) next.delete(dateStr); else next.add(dateStr);
            return next;
          });
        };
        const selectAllInMonth = () => {
          const eligible = shipDates.filter(d => {
            if (d.reserved > 0) return false;
            return d.ship_date.startsWith(deleteCalMonth);
          });
          setDeleteSelected(prev => {
            const next = new Set(prev);
            const allSelected = eligible.every(d => next.has(d.ship_date));
            if (allSelected) {
              eligible.forEach(d => next.delete(d.ship_date));
            } else {
              eligible.forEach(d => next.add(d.ship_date));
            }
            return next;
          });
        };
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const cells: { day: number; dateStr: string }[] = [];
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${calY}-${String(calM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          cells.push({ day: d, dateStr });
        }
        return (
        <>
          <div onClick={() => setShowBatchDelete(false)} className={s.modalOverlay} />
          <div className={`${s.modal} ${p.modal480}`}>
            <div className={s.modalHeader}>
              <span className={s.modalTitle}>批量刪除接單日期</span>
              <button onClick={() => setShowBatchDelete(false)} className={s.modalClose}>×</button>
            </div>
            <div className={`${s.modalBody} ${p.modalBodyGrid}`}>
              <div className={p.hintText}>點選日曆上的日期來選取要刪除的項目，已有預約的日期無法刪除</div>
              {/* 月份導航 */}
              <div className={p.calendarNav}>
                <button onClick={prevMonth} className={p.calendarNavBtn}>‹</button>
                <span className={p.calendarMonth}>{calY} 年 {calM} 月</span>
                <button onClick={nextMonth} className={p.calendarNavBtn}>›</button>
              </div>
              {/* 星期標題 */}
              <div className={p.calendarGrid}>
                {weekdays.map(w => <div key={w} className={p.calendarWeekday}>{w}</div>)}
                {/* 空白填充 */}
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} className={p.calendarCell} />)}
                {/* 日期格 */}
                {cells.map(({ day, dateStr }) => {
                  const sd = shipDateSet.get(dateStr);
                  const isSelected = deleteSelected.has(dateStr);
                  const isToday = dateStr === todayStr;
                  const hasReserved = sd && sd.reserved > 0;
                  let cls = p.calendarCell;
                  if (sd) cls += ` ${p.calendarCellHasDate}`;
                  if (sd && hasReserved) cls += ` ${p.calendarCellReserved}`;
                  if (isSelected) cls += ` ${p.calendarCellSelected}`;
                  if (isToday) cls += ` ${p.calendarCellToday}`;
                  return (
                    <div key={dateStr} className={cls} onClick={() => sd && toggleDate(dateStr)} title={hasReserved ? `已有 ${sd.reserved} 筆預約` : sd ? '點選以選取' : ''}>
                      {day}
                      {hasReserved && <span className={p.calendarCellReservedDot} />}
                    </div>
                  );
                })}
              </div>
              {/* 圖例 + 全選 */}
              <div className={p.calendarLegend}>
                <span><span className={p.calendarLegendDot} style={{ background: '#f8f5f1', border: '1px solid #e6ddd3' }} /> 可刪除</span>
                <span><span className={p.calendarLegendDot} style={{ background: '#c0392b' }} /> 已選取</span>
                <span><span className={p.calendarLegendDot} style={{ background: '#f0f0f0', border: '1px solid #ddd' }} /> 有預約</span>
              </div>
              <div className={p.calendarSelectAll}>
                <span className={p.calendarSelectCount}>已選 {deleteSelected.size} 個日期</span>
                <button onClick={selectAllInMonth} className={p.calendarSelectAllBtn}>
                  {shipDates.filter(d => d.reserved === 0 && d.ship_date.startsWith(deleteCalMonth)).every(d => deleteSelected.has(d.ship_date)) && shipDates.some(d => d.ship_date.startsWith(deleteCalMonth) && d.reserved === 0) ? '取消本月全選' : '全選本月'}
                </button>
              </div>
              <div className={s.btnActions}>
                <button onClick={doBatchDelete} className={s.btnSave} style={{ background: deleteSelected.size > 0 ? '#c0392b' : '#ccc' }} disabled={deleteSelected.size === 0}>確認刪除 ({deleteSelected.size})</button>
                <button onClick={() => setShowBatchDelete(false)} className={s.btnCancel}>取消</button>
              </div>
            </div>
          </div>
        </>
        );
      })()}
    </div>
  );
}

// ════════════════════════════════════════════════
// BlockedDatesEditor  ──  不出貨日期選擇器
// ════════════════════════════════════════════════
function BlockedDatesEditor({ startDate, endDate, blocked, onChange }: {
  startDate: string;
  endDate:   string;
  blocked:   string[];
  onChange:  (dates: string[]) => void;
}) {
  const dates: string[] = [];
  if (startDate && endDate) {
    const addDay = (d: string) => {
      const dt = new Date(d + 'T12:00:00');
      dt.setDate(dt.getDate() + 1);
      return dt.toLocaleDateString('sv-SE');
    };
    let cur = startDate;
    let count = 0;
    while (cur <= endDate && count < 60) {
      dates.push(cur);
      cur = addDay(cur);
      count++;
    }
  }

  const blockedSet = new Set(blocked);
  const toggle = (d: string) => {
    const next = blockedSet.has(d)
      ? blocked.filter(x => x !== d)
      : [...blocked, d].sort();
    onChange(next);
  };

  const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

  // Need to import the page-specific CSS module inside this sub-component
  // Since it's in the same file, we can reference `p` from the parent scope

  if (!startDate || !endDate) {
    return <div className={p.blockedEmptyHint}>請先設定最早和最晚可出貨日，才能選擇不出貨日期</div>;
  }

  return (
    <div>
      {/* 已排除的日期標籤 */}
      {blocked.length > 0 && (
        <div className={p.blockedTagWrap}>
          <span className={p.blockedExcludedLabel}>已排除：</span>
          {blocked.map(d => (
            <span key={d} className={p.blockedTag}>
              {d}
              <span onClick={() => toggle(d)} className={p.blockedTagRemove}>×</span>
            </span>
          ))}
          <button onClick={() => onChange([])} className={p.blockedClearBtn}>全部清除</button>
        </div>
      )}

      {/* 日期格子 */}
      <div className={p.dateGrid}>
        {dates.map(d => {
          const weekday   = new Date(d + 'T12:00:00').getDay();
          const isBlocked = blockedSet.has(d);
          const isWeekend = weekday === 0 || weekday === 6;
          return (
            <button
              key={d}
              onClick={() => toggle(d)}
              className={isBlocked ? p.dateCellBlocked : isWeekend ? p.dateCellWeekend : p.dateCell}
            >
              <div className={isBlocked ? p.dateCellDayLabelBlocked : p.dateCellDayLabel}>
                {DAY_LABELS[weekday]}
              </div>
              {d.slice(5)}
            </button>
          );
        })}
      </div>
      <div className={p.blockedUsageHint}>
        點選日期標記為不出貨（紅色刪除線），再次點選取消。
      </div>
    </div>
  );
}
