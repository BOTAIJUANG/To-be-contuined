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

type ProductTab = 'list' | 'category' | 'quickupdate' | 'notify';

interface Product { id: number; name: string; name_en: string; slug: string; price: number; description: string; image_url: string; is_available: boolean; is_sold_out: boolean; is_preorder: boolean; is_featured: boolean; sort_order: number; category_id: number; stock_mode: string; categories?: { name: string }; }
interface Category { id: number; name: string; slug: string; sort_order: number; }
interface Spec { id?: number; label: string; value: string; sort_order: number; }
interface ShipDate { id?: number; ship_date: string; capacity: number; reserved: number; is_open: boolean; }

const EMPTY_FORM = { name: '', name_en: '', slug: '', price: 0, description: '', image_url: '', is_available: true, is_sold_out: false, is_preorder: false, is_featured: false, sort_order: 0, category_id: 0, stock_mode: 'stock_mode', ship_start_date: '', ship_end_date: '', ship_blocked_dates: '[]' };
const EMPTY_CAT  = { name: '', slug: '', sort_order: 0 };
const EMPTY_SHIP_DATE: ShipDate = { ship_date: '', capacity: 0, reserved: 0, is_open: true };

const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #E8E4DC', background: '#fff', fontFamily: 'inherit', fontSize: '13px', color: '#1E1C1A', outline: 'none' };
const labelStyle: React.CSSProperties = { fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', display: 'block', marginBottom: '6px' };
const thStyle:    React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC', whiteSpace: 'nowrap' };

export default function AdminProductsPage() {
  const [tab,          setTab]         = useState<ProductTab>('list');
  const [products,     setProducts]    = useState<Product[]>([]);
  const [categories,   setCategories]  = useState<Category[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [filterCat,    setFilterCat]   = useState('');
  const [filterStatus, setFilterStatus]= useState('');
  const [search,       setSearch]      = useState('');

  // 商品表單
  const [showForm,   setShowForm]   = useState(false);
  const [editingId,  setEditingId]  = useState<number | null>(null);
  const [form,       setForm]       = useState({ ...EMPTY_FORM });
  const [specs,      setSpecs]      = useState<Spec[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 可出貨日設定
  const [shipDates,      setShipDates]      = useState<ShipDate[]>([]);
  const [showDateModal,  setShowDateModal]  = useState(false);
  const [editingDateIdx, setEditingDateIdx] = useState<number | null>(null);
  const [dateForm,       setDateForm]       = useState<ShipDate>({ ...EMPTY_SHIP_DATE });
  const [batchMode,      setBatchMode]      = useState(false);   // 批量新增模式
  const [batchStart,     setBatchStart]     = useState('');
  const [batchEnd,       setBatchEnd]       = useState('');
  const [batchCapacity,  setBatchCapacity]  = useState(0);
  const [batchExclude,   setBatchExclude]   = useState('');      // 排除的日期，逗號分隔

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
    // 準備快速更新資料
    setQuickData((prods ?? []).map(p => ({ id: p.id, name: p.name, price: p.price, newPrice: p.price, stock: 0, newStock: 0 })));
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // ── 商品 CRUD ──────────────────────────────────
  const openAdd = () => { setForm({ ...EMPTY_FORM, category_id: categories[0]?.id ?? 0 }); setSpecs([]); setEditingId(null); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const openEdit = async (p: Product) => {
    setForm({ name: p.name, name_en: p.name_en ?? '', slug: p.slug, price: p.price, description: p.description ?? '', image_url: p.image_url ?? '', is_available: p.is_available, is_sold_out: p.is_sold_out, is_preorder: p.is_preorder, is_featured: p.is_featured, sort_order: p.sort_order, category_id: p.category_id, stock_mode: p.stock_mode ?? 'stock_mode', ship_start_date: (p as any).ship_start_date ?? '', ship_end_date: (p as any).ship_end_date ?? '', ship_blocked_dates: (p as any).ship_blocked_dates ?? '[]' });
    const [{ data: specData }, { data: shipDateData }] = await Promise.all([
      supabase.from('product_specs').select('id, label, value, sort_order').eq('product_id', p.id).order('sort_order'),
      supabase.from('product_ship_dates').select('id, ship_date, capacity, reserved, is_open').eq('product_id', p.id).is('variant_id', null).order('ship_date'),
    ]);
    setSpecs(specData ?? []);
    setShipDates((shipDateData ?? []).map((d: any) => ({ id: d.id, ship_date: d.ship_date, capacity: d.capacity, reserved: d.reserved, is_open: d.is_open })));
    setEditingId(p.id);
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

    // 切換到日期模式但沒有設定任何日期：警示
    if (form.stock_mode === 'date_mode' && !form.is_preorder && shipDates.length === 0) {
      if (!confirm('您已選擇日期模式，但尚未設定任何可出貨日期，前台將無日期可選。確定要儲存嗎？')) return;
    }

    setSaving(true);
    let productId = editingId;
    if (editingId) {
      await supabase.from('products').update(form).eq('id', editingId);
    } else {
      const { data } = await supabase.from('products').insert(form).select('id').single();
      productId = data?.id ?? null;
    }
    if (productId) {
      // 儲存規格
      await supabase.from('product_specs').delete().eq('product_id', productId);
      const valid = specs.filter(s => s.label && s.value);
      if (valid.length > 0) await supabase.from('product_specs').insert(valid.map((s, i) => ({ product_id: productId, label: s.label, value: s.value, sort_order: i+1 })));

      // 儲存可出貨日（日期模式才處理）
      if (form.stock_mode === 'date_mode' && !form.is_preorder) {
        for (const d of shipDates) {
          if (d.id) {
            // 已存在的 → 只更新 capacity 和 is_open，不動 reserved
            await supabase.from('product_ship_dates').update({ capacity: d.capacity, is_open: d.is_open }).eq('id', d.id);
          } else {
            // 新增的
            await supabase.from('product_ship_dates').insert({ product_id: productId, variant_id: null, ship_date: d.ship_date, capacity: d.capacity, reserved: 0, is_open: d.is_open });
          }
        }
      }
    }
    setSaving(false);
    setShowForm(false);
    loadData();
  };

  const toggleField = async (p: Product, field: 'is_available' | 'is_sold_out' | 'is_featured') => {
    await supabase.from('products').update({ [field]: !p[field] }).eq('id', p.id);
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, [field]: !x[field] } : x));
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
    if (!dateForm.ship_date) { alert('請選擇日期'); return; }
    if (dateForm.capacity <= 0) { alert('請填寫可接單數量（需大於 0）'); return; }

    if (batchMode) {
      // 批量新增
      if (!batchStart || !batchEnd) { alert('請選擇起訖日期'); return; }
      const excludeSet = new Set(batchExclude.split(',').map(s => s.trim()).filter(Boolean));
      const result: ShipDate[] = [];
      const addDay = (d: string) => {
        const dt = new Date(d + 'T12:00:00');
        dt.setDate(dt.getDate() + 1);
        return dt.toLocaleDateString('sv-SE');
      };
      let cur = batchStart;
      while (cur <= batchEnd) {
        if (!excludeSet.has(cur) && !shipDates.find(x => x.ship_date === cur)) {
          result.push({ ship_date: cur, capacity: batchCapacity, reserved: 0, is_open: true });
        }
        cur = addDay(cur);
      }
      setShipDates(prev => [...prev, ...result].sort((a, b) => a.ship_date.localeCompare(b.ship_date)));
    } else if (editingDateIdx !== null) {
      // 編輯
      setShipDates(prev => prev.map((d, i) => i === editingDateIdx ? { ...d, capacity: dateForm.capacity, is_open: dateForm.is_open } : d));
    } else {
      // 新增單筆
      if (shipDates.find(x => x.ship_date === dateForm.ship_date)) { alert('此日期已存在'); return; }
      setShipDates(prev => [...prev, { ...dateForm, reserved: 0 }].sort((a, b) => a.ship_date.localeCompare(b.ship_date)));
    }
    setShowDateModal(false);
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

  // ── 分類 CRUD ──────────────────────────────────
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

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '10px 20px', cursor: 'pointer', fontSize: '13px',
    borderBottom: tab === t ? '2px solid #1E1C1A' : '2px solid transparent',
    color: tab === t ? '#1E1C1A' : '#888580', fontFamily: '"Noto Sans TC", sans-serif', whiteSpace: 'nowrap',
  });

  // 篩選商品
  const filtered = products.filter(p => {
    const matchCat    = !filterCat    || String(p.category_id) === filterCat;
    const matchStatus = !filterStatus || (filterStatus === 'on' ? p.is_available : !p.is_available);
    const matchSearch = !search       || p.name.includes(search) || p.slug.includes(search);
    return matchCat && matchStatus && matchSearch;
  });

  if (loading) return <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: 0 }}>商品管理</h1>
        {tab === 'list' && <button onClick={openAdd} style={{ padding: '10px 24px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' }}>＋ 新增商品</button>}
        {tab === 'category' && <button onClick={() => { setCatForm({ ...EMPTY_CAT }); setEditingCatId(null); setShowCatForm(true); }} style={{ padding: '10px 24px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' }}>＋ 新增分類</button>}
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #E8E4DC', marginBottom: '24px' }}>
        <div style={tabStyle('list')}        onClick={() => setTab('list')}>商品列表</div>
        <div style={tabStyle('category')}    onClick={() => setTab('category')}>商品分類</div>
        <div style={tabStyle('quickupdate')} onClick={() => setTab('quickupdate')}>快速更新</div>
        <div style={tabStyle('notify')}      onClick={() => setTab('notify')}>貨到通知</div>
      </div>

      {/* ════ 商品列表 ════ */}
      {tab === 'list' && (
        <>
          {/* 商品表單 */}
          {showForm && (
            <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '32px', marginBottom: '24px' }}>
              <h3 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '16px', color: '#1E1C1A', margin: '0 0 24px' }}>{editingId ? '編輯商品' : '新增商品'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div><label style={labelStyle}>商品名稱（中文）*</label><input value={form.name}    onChange={e => setForm({...form, name: e.target.value})}    placeholder="例：杜拜Q餅"    style={{...inputStyle, width:'100%'}} /></div>
                <div><label style={labelStyle}>商品英文名</label>        <input value={form.name_en} onChange={e => setForm({...form, name_en: e.target.value})} placeholder="例：DUBAI Q-BING" style={{...inputStyle, width:'100%'}} /></div>
                <div><label style={labelStyle}>網址 slug * （只能英文和 -）</label><input value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder="例：dubai-qbing" style={{...inputStyle, width:'100%'}} /></div>
                <div><label style={labelStyle}>售價（NT$）*</label><input type="number" value={form.price} onChange={e => setForm({...form, price: Number(e.target.value)})} style={{...inputStyle, width:'100%'}} /></div>
                <div><label style={labelStyle}>分類</label><select value={form.category_id} onChange={e => setForm({...form, category_id: Number(e.target.value)})} style={{...inputStyle, width:'100%'}}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label style={labelStyle}>排序</label><input type="number" value={form.sort_order} onChange={e => setForm({...form, sort_order: Number(e.target.value)})} style={{...inputStyle, width:'100%'}} /></div>
                <div style={{ gridColumn: '1/-1' }}><label style={labelStyle}>商品描述</label><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} style={{...inputStyle, width:'100%', resize:'vertical'}} /></div>
              </div>

              {/* 圖片上傳 */}
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>商品圖片</label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginTop: '8px' }}>
                  {form.image_url && <img src={form.image_url} alt="預覽" style={{ width: '72px', height: '72px', objectFit: 'cover', border: '1px solid #E8E4DC' }} />}
                  <div style={{ flex: 1 }}>
                    <input value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})} placeholder="貼上圖片網址，或點下方按鈕上傳" style={{...inputStyle, width:'100%'}} />
                    <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ padding: '7px 14px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '12px', color: '#555250', cursor: 'pointer' }}>{uploading ? '上傳中...' : '📁 從電腦上傳'}</button>
                      <span style={{ fontSize: '11px', color: '#888580' }}>建議尺寸 800×800px</span>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  </div>
                </div>
              </div>

              {/* 開關 */}
              <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', flexWrap: 'wrap' }}>
                {[{ key: 'is_available', label: '上架中' }, { key: 'is_featured', label: '首頁熱銷' }, { key: 'is_preorder', label: '預購商品' }, { key: 'is_sold_out', label: '今日完售' }].map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#555250', cursor: 'pointer' }}>
                    <input type="checkbox" checked={(form as any)[key]} onChange={e => setForm({...form, [key]: e.target.checked})} style={{ accentColor: '#1E1C1A' }} /> {label}
                  </label>
                ))}
              </div>

              {/* 庫存模式（非預購商品才顯示）*/}
              {!form.is_preorder && (
                <div style={{ borderTop: '1px solid #E8E4DC', paddingTop: '20px', marginBottom: '20px' }}>
                  <label style={{ ...labelStyle, fontSize: '11px', marginBottom: '12px' }}>庫存控制模式</label>
                  <div style={{ display: 'flex', gap: '20px', marginBottom: '16px' }}>
                    {[
                      { val: 'stock_mode', title: '總量模式', desc: '統一管理總庫存量，顧客自由選出貨日期（依商店規則）' },
                      { val: 'date_mode',  title: '日期模式', desc: '設定特定可出貨日期及各日名額，顧客只能從開放的日期選擇' },
                    ].map(({ val, title, desc }) => (
                      <label key={val} style={{ display: 'flex', gap: '10px', padding: '12px 16px', border: `1px solid ${form.stock_mode === val ? '#1E1C1A' : '#E8E4DC'}`, cursor: 'pointer', flex: 1, background: form.stock_mode === val ? '#F7F4EF' : '#fff' }}>
                        <input type="radio" value={val} checked={form.stock_mode === val} onChange={() => {
                          if (val === 'stock_mode' && form.stock_mode === 'date_mode' && shipDates.some(d => d.reserved > 0)) {
                            if (!confirm('此商品有已預約的出貨日訂單，切換模式只影響新訂單，舊訂單不受影響。確定切換？')) return;
                          }
                          setForm({...form, stock_mode: val});
                        }} style={{ accentColor: '#1E1C1A', marginTop: '2px', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E1C1A', marginBottom: '4px' }}>{title}</div>
                          <div style={{ fontSize: '11px', color: '#888580' }}>{desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* 總量模式：自訂出貨日期範圍 */}
                  {form.stock_mode === 'stock_mode' && (
                    <div style={{ background: '#F7F4EF', border: '1px solid #E8E4DC', padding: '16px 20px' }}>
                      <div style={{ fontSize: '11px', color: '#888580', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '14px' }}>
                        出貨日期範圍（選填，留空套用商店預設）
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                        <div>
                          <label style={labelStyle}>最早可出貨日</label>
                          <input type="date" value={(form as any).ship_start_date} onChange={e => setForm({...form, ship_start_date: e.target.value} as any)} style={{ ...inputStyle, width: '100%' }} />
                        </div>
                        <div>
                          <label style={labelStyle}>最晚可出貨日</label>
                          <input type="date" value={(form as any).ship_end_date} onChange={e => setForm({...form, ship_end_date: e.target.value} as any)} style={{ ...inputStyle, width: '100%' }} />
                        </div>
                      </div>

                      {/* 不出貨日期選擇器 */}
                      <div>
                        <label style={labelStyle}>不出貨日期（點選加入排除清單）</label>
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
              {form.stock_mode === 'date_mode' && !form.is_preorder && (
                <div style={{ borderTop: '1px solid #E8E4DC', paddingTop: '20px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <label style={{ ...labelStyle, fontSize: '11px', margin: 0 }}>可出貨日期設定</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={openBatchAdd} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer' }}>批量新增</button>
                      <button onClick={openAddDate} style={{ padding: '5px 12px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontSize: '11px', cursor: 'pointer', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.1em' }}>＋ 新增日期</button>
                    </div>
                  </div>

                  {shipDates.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed #E8E4DC', color: '#888580', fontSize: '13px' }}>尚未設定可出貨日期，點「新增日期」或「批量新增」開始</div>
                  ) : (
                    <div style={{ border: '1px solid #E8E4DC', overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            {['出貨日', '可接單', '已預約', '剩餘', '狀態', '操作'].map(h => (
                              <th key={h} style={{ ...thStyle, fontSize: '10px' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {shipDates.map((d, i) => {
                            const remaining = d.capacity - d.reserved;
                            const isFull    = remaining <= 0;
                            const isPast    = d.ship_date < new Date().toISOString().split('T')[0];
                            return (
                              <tr key={d.ship_date} style={{ borderBottom: '1px solid #E8E4DC', opacity: isPast ? 0.5 : 1 }}>
                                <td style={{ padding: '10px 16px', fontFamily: '"Montserrat", sans-serif', fontSize: '13px', color: '#1E1C1A' }}>
                                  {d.ship_date}
                                  {isPast && <span style={{ fontSize: '10px', color: '#888580', marginLeft: '6px' }}>已過</span>}
                                </td>
                                <td style={{ padding: '10px 16px', fontSize: '13px', textAlign: 'right' }}>{d.capacity}</td>
                                <td style={{ padding: '10px 16px', fontSize: '13px', textAlign: 'right', color: d.reserved > 0 ? '#b87a2a' : '#888580' }}>{d.reserved}</td>
                                <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, textAlign: 'right', color: isFull ? '#c0392b' : '#2ab85a' }}>{remaining}</td>
                                <td style={{ padding: '10px 16px' }}>
                                  <span style={{ fontSize: '11px', color: !d.is_open ? '#888580' : isFull ? '#c0392b' : '#2ab85a', border: `1px solid ${!d.is_open ? '#888580' : isFull ? '#c0392b' : '#2ab85a'}`, padding: '2px 8px', fontFamily: '"Montserrat", sans-serif' }}>
                                    {!d.is_open ? '已關閉' : isFull ? '已滿' : '開放'}
                                  </span>
                                </td>
                                <td style={{ padding: '10px 16px', display: 'flex', gap: '6px' }}>
                                  <button onClick={() => openEditDate(i)} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer' }}>編輯</button>
                                  <button onClick={() => toggleDateOpen(i)} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: d.is_open ? '#888580' : '#2ab85a', cursor: 'pointer' }}>
                                    {d.is_open ? '關閉' : '開放'}
                                  </button>
                                  <button onClick={() => deleteDate(i)} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#c0392b', cursor: 'pointer' }}>刪除</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 商品規格 */}
              <div style={{ borderTop: '1px solid #E8E4DC', paddingTop: '20px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ ...labelStyle, fontSize: '11px' }}>商品規格</label>
                  <button onClick={() => setSpecs(prev => [...prev, { label: '', value: '', sort_order: prev.length+1 }])} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer' }}>＋ 新增</button>
                </div>
                {specs.map((s, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                    <input value={s.label} onChange={e => setSpecs(prev => prev.map((x, j) => j===i ? {...x, label: e.target.value} : x))} placeholder="名稱（例：保存）" style={{...inputStyle, marginTop: 0}} />
                    <input value={s.value} onChange={e => setSpecs(prev => prev.map((x, j) => j===i ? {...x, value: e.target.value} : x))} placeholder="內容" style={{...inputStyle, marginTop: 0}} />
                    <button onClick={() => setSpecs(prev => prev.filter((_,j) => j!==i))} style={{ padding: '10px', background: 'transparent', border: '1px solid #E8E4DC', color: '#c0392b', cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={handleSave} disabled={saving} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? '儲存中...' : '儲存'}</button>
                <button onClick={() => setShowForm(false)} style={{ padding: '10px 32px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          )}

          {/* 篩選列 */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋商品名稱" style={{ padding: '8px 12px', border: '1px solid #E8E4DC', background: '#fff', fontSize: '13px', color: '#1E1C1A', outline: 'none', minWidth: '200px' }} />
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #E8E4DC', background: '#fff', fontSize: '12px', color: '#555250', outline: 'none' }}>
              <option value="">全部分類</option>
              {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #E8E4DC', background: '#fff', fontSize: '12px', color: '#555250', outline: 'none' }}>
              <option value="">全部狀態</option>
              <option value="on">上架中</option>
              <option value="off">已下架</option>
            </select>
          </div>

          {/* 商品表格 */}
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['圖片', '商品名稱', '分類', '售價', '上架', '完售', '熱銷', '操作'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #E8E4DC', opacity: p.is_available ? 1 : 0.5 }}>
                    <td style={{ padding: '10px 16px' }}>
                      {p.image_url ? <img src={p.image_url} alt={p.name} style={{ width: '44px', height: '44px', objectFit: 'cover' }} /> : <div style={{ width: '44px', height: '44px', background: '#EDE9E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🍰</div>}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontSize: '13px', color: '#1E1C1A' }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: '#888580', fontFamily: '"Montserrat", sans-serif' }}>{p.slug}</div>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#555250' }}>{p.categories?.name}</td>
                    <td style={{ padding: '10px 16px', fontSize: '13px', color: '#1E1C1A', whiteSpace: 'nowrap' }}>NT$ {p.price.toLocaleString()}</td>
                    <td style={{ padding: '10px 16px' }}><input type="checkbox" checked={p.is_available} onChange={() => toggleField(p, 'is_available')} style={{ accentColor: '#1E1C1A', cursor: 'pointer' }} /></td>
                    <td style={{ padding: '10px 16px' }}><input type="checkbox" checked={p.is_sold_out}  onChange={() => toggleField(p, 'is_sold_out')}  style={{ accentColor: '#1E1C1A', cursor: 'pointer' }} /></td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: p.is_featured ? '#2ab85a' : '#888580' }}>{p.is_featured ? '✓' : '—'}</td>
                    <td style={{ padding: '10px 16px' }}><button onClick={() => openEdit(p)} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer', fontFamily: '"Montserrat", sans-serif' }}>編輯</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ════ 商品分類 ════ */}
      {tab === 'category' && (
        <>
          <div style={{ background: '#EDE9E2', border: '1px solid #E8E4DC', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#555250' }}>
            分類名稱會顯示在前台選購頁的側邊欄。
          </div>

          {/* 分類表單 */}
          {showCatForm && (
            <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '24px', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '15px', color: '#1E1C1A', margin: '0 0 20px' }}>{editingCatId ? '編輯分類' : '新增分類'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div><label style={labelStyle}>分類名稱 *</label><input value={catForm.name} onChange={e => setCatForm({...catForm, name: e.target.value})} placeholder="例：Q餅系列" style={{...inputStyle, width:'100%'}} /></div>
                <div><label style={labelStyle}>網址 slug * （只能英文和 -）</label><input value={catForm.slug} onChange={e => setCatForm({...catForm, slug: e.target.value})} placeholder="例：q-bing" style={{...inputStyle, width:'100%'}} /></div>
                <div><label style={labelStyle}>排序</label><input type="number" value={catForm.sort_order} onChange={e => setCatForm({...catForm, sort_order: Number(e.target.value)})} style={{...inputStyle, width:'100%'}} /></div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={handleCatSave} disabled={savingCat} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: savingCat ? 0.6 : 1 }}>{savingCat ? '儲存中...' : '儲存'}</button>
                <button onClick={() => setShowCatForm(false)} style={{ padding: '10px 32px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          )}

          <div style={{ background: '#fff', border: '1px solid #E8E4DC' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['分類名稱', 'Slug', '商品數量', '排序', '操作'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #E8E4DC' }}>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1E1C1A' }}>{c.name}</td>
                    <td style={{ padding: '14px 16px', fontSize: '12px', color: '#888580', fontFamily: '"Montserrat", sans-serif' }}>/shop/{c.slug}</td>
                    <td style={{ padding: '14px 16px', fontSize: '12px', color: '#555250' }}>{products.filter(p => p.category_id === c.id).length} 件</td>
                    <td style={{ padding: '14px 16px', fontSize: '12px', color: '#888580' }}>{c.sort_order}</td>
                    <td style={{ padding: '14px 16px', display: 'flex', gap: '6px' }}>
                      <button onClick={() => openCatEdit(c)} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer' }}>編輯</button>
                      <button onClick={() => handleCatDelete(c.id)} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#c0392b', cursor: 'pointer' }}>刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ════ 快速更新 ════ */}
      {tab === 'quickupdate' && (
        <>
          <div style={{ background: '#EDE9E2', border: '1px solid #E8E4DC', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#555250' }}>
            批次更新商品售價，不需要逐一進入編輯頁面。
          </div>
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['商品名稱', '分類', '現有售價', '更新售價'].map((h, i) => <th key={h} style={{ ...thStyle, textAlign: i > 1 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>
                {quickData.map((d, i) => {
                  const prod = products.find(p => p.id === d.id);
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid #E8E4DC' }}>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A' }}>{d.name}</td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250' }}>{prod?.categories?.name ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#888580', textAlign: 'right' }}>NT$ {d.price.toLocaleString()}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <input type="number" value={d.newPrice} onChange={e => setQuickData(prev => prev.map((x, j) => j===i ? {...x, newPrice: Number(e.target.value)} : x))} style={{ ...inputStyle, width: '100px', textAlign: 'right', color: d.newPrice !== d.price ? '#b35252' : '#1E1C1A' }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding: '14px 18px', textAlign: 'right', borderTop: '1px solid #E8E4DC' }}>
              <button onClick={applyQuickUpdate} style={{ padding: '10px 24px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' }}>
                套用全部更新
              </button>
            </div>
          </div>
        </>
      )}

      {/* ════ 貨到通知列表 ════ */}
      {tab === 'notify' && (
        <>
          <div style={{ background: '#EDE9E2', border: '1px solid #E8E4DC', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#555250' }}>
            當商品補貨時，自動通知曾點擊「貨到通知」的顧客。（需串接 Email 發送 API）
          </div>
          <div style={{ background: '#fff', border: '1px solid #E8E4DC' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['商品名稱', '顧客 Email', '登記時間', '狀態', '操作'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                <tr>
                  <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>
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
          <div onClick={() => setShowDateModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '480px', maxWidth: '90vw', zIndex: 201, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '15px', color: '#1E1C1A' }}>
                {batchMode ? '批量新增出貨日期' : editingDateIdx !== null ? '編輯出貨日期' : '新增出貨日期'}
              </span>
              <button onClick={() => setShowDateModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888580' }}>×</button>
            </div>
            <div style={{ padding: '24px', display: 'grid', gap: '16px' }}>
              {batchMode ? (
                /* 批量新增 */
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>開始日期 *</label>
                      <input type="date" value={batchStart} onChange={e => setBatchStart(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                    </div>
                    <div>
                      <label style={labelStyle}>結束日期 *</label>
                      <input type="date" value={batchEnd} onChange={e => setBatchEnd(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>每日可接單數量 *</label>
                    <input type="number" value={batchCapacity || ''} onChange={e => setBatchCapacity(e.target.value === '' ? 0 : Number(e.target.value))} placeholder="例：10" style={{ ...inputStyle, width: '100px' }} />
                  </div>
                  <div>
                    <label style={labelStyle}>排除日期（選填，逗號分隔）</label>
                    <input value={batchExclude} onChange={e => setBatchExclude(e.target.value)} placeholder="例：2026-03-28,2026-03-29" style={{ ...inputStyle, width: '100%' }} />
                    <div style={{ fontSize: '11px', color: '#888580', marginTop: '4px' }}>輸入不出貨的日期，逗號分開，例如：2026-03-28,2026-03-29</div>
                  </div>
                </>
              ) : (
                /* 單筆新增 / 編輯 */
                <>
                  <div>
                    <label style={labelStyle}>出貨日期 *</label>
                    <input type="date" value={dateForm.ship_date} onChange={e => setDateForm({...dateForm, ship_date: e.target.value})} disabled={editingDateIdx !== null} style={{ ...inputStyle, width: '180px', opacity: editingDateIdx !== null ? 0.5 : 1 }} />
                    {editingDateIdx !== null && <div style={{ fontSize: '11px', color: '#888580', marginTop: '4px' }}>日期不可修改，如需更改請刪除後重新新增</div>}
                  </div>
                  <div>
                    <label style={labelStyle}>可接單數量 *</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="number" value={dateForm.capacity || ''} onChange={e => setDateForm({...dateForm, capacity: e.target.value === '' ? 0 : Number(e.target.value)})} placeholder="例：10" style={{ ...inputStyle, width: '100px' }} />
                      <span style={{ fontSize: '12px', color: '#888580' }}>份</span>
                    </div>
                  </div>
                  {editingDateIdx !== null && (
                    <div style={{ padding: '12px 16px', background: '#EDE9E2', fontSize: '12px', color: '#555250' }}>
                      已預約：{dateForm.reserved} 份 ／ 剩餘：{dateForm.capacity - dateForm.reserved} 份
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#555250', cursor: 'pointer' }}>
                    <input type="checkbox" checked={dateForm.is_open} onChange={e => setDateForm({...dateForm, is_open: e.target.checked})} style={{ accentColor: '#1E1C1A' }} />
                    開放接單
                  </label>
                </>
              )}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={saveDate} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  {batchMode ? '批量新增' : editingDateIdx !== null ? '儲存' : '新增'}
                </button>
                <button onClick={() => setShowDateModal(false)} style={{ padding: '10px 32px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}
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
    // 用純字串比較避免時區問題
    const addDay = (d: string) => {
      const dt = new Date(d + 'T12:00:00'); // 用中午避免 DST 邊界
      dt.setDate(dt.getDate() + 1);
      return dt.toLocaleDateString('sv-SE'); // sv-SE 格式為 YYYY-MM-DD
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

  if (!startDate || !endDate) {
    return <div style={{ padding: '10px 0', fontSize: '12px', color: '#888580' }}>請先設定最早和最晚可出貨日，才能選擇不出貨日期</div>;
  }

  return (
    <div>
      {/* 已排除的日期標籤 */}
      {blocked.length > 0 && (
        <div style={{ marginBottom: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#888580' }}>已排除：</span>
          {blocked.map(d => (
            <span key={d} style={{ padding: '3px 10px', background: '#fef0f0', border: '1px solid #f5c6c6', fontSize: '11px', color: '#c0392b', display: 'flex', alignItems: 'center', gap: '5px' }}>
              {d}
              <span onClick={() => toggle(d)} style={{ cursor: 'pointer', fontWeight: 700, fontSize: '13px', lineHeight: 1 }}>×</span>
            </span>
          ))}
          <button onClick={() => onChange([])} style={{ padding: '3px 10px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#888580', cursor: 'pointer' }}>全部清除</button>
        </div>
      )}

      {/* 日期格子 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {dates.map(d => {
          const weekday   = new Date(d + 'T12:00:00').getDay();
          const isBlocked = blockedSet.has(d);
          const isWeekend = weekday === 0 || weekday === 6;
          return (
            <button
              key={d}
              onClick={() => toggle(d)}
              style={{
                padding: '7px 10px', minWidth: '66px', textAlign: 'center',
                border: `1px solid ${isBlocked ? '#c0392b' : '#E8E4DC'}`,
                background: isBlocked ? '#fef0f0' : isWeekend ? '#F7F4EF' : '#fff',
                color: isBlocked ? '#c0392b' : isWeekend ? '#888580' : '#1E1C1A',
                fontSize: '11px', cursor: 'pointer',
                textDecoration: isBlocked ? 'line-through' : 'none',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '10px', color: isBlocked ? '#c0392b' : '#888580', marginBottom: '2px' }}>
                {DAY_LABELS[weekday]}
              </div>
              {d.slice(5)}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: '11px', color: '#888580', marginTop: '8px' }}>
        點選日期標記為不出貨（紅色刪除線），再次點選取消。
      </div>
    </div>
  );
}
