'use client';

// ════════════════════════════════════════════════
// app/admin/preorder/page.tsx  ──  預購系統總覽
//
// 顯示所有 is_preorder = true 的商品
// 可管理批次（新增/編輯/開關）
// 顯示各批次接單狀況
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #E8E4DC', background: '#fff', fontFamily: 'inherit', fontSize: '13px', color: '#1E1C1A', outline: 'none' };
const labelStyle: React.CSSProperties = { fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', display: 'block', marginBottom: '6px' };
const numVal = (v: number) => v === 0 ? '' : String(v);

const EMPTY_BATCH = { name: '', starts_at: '', ends_at: '', ship_date: '', limit_qty: 0, status: 'draft' as string, note: '' };

const STATUS_OPTIONS = [
  { value: 'draft',    label: '草稿',  color: '#888580' },
  { value: 'active',   label: '開放中', color: '#2ab85a' },
  { value: 'closed',   label: '關閉',  color: '#555250' },
  { value: 'sold_out', label: '售完',  color: '#c0392b' },
];

const Toggle = ({ val, onChange }: { val: boolean; onChange: () => void }) => (
  <div onClick={onChange} style={{ width: '40px', height: '22px', borderRadius: '11px', background: val ? '#1E1C1A' : '#E8E4DC', position: 'relative', cursor: 'pointer', transition: 'background 0.3s', flexShrink: 0 }}>
    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: val ? '21px' : '3px', transition: 'left 0.3s' }} />
  </div>
);

export default function AdminPreorderPage() {
  const router = useRouter();
  const [products,     setProducts]     = useState<any[]>([]);
  const [batches,      setBatches]      = useState<any[]>([]);
  const [orderStats,   setOrderStats]   = useState<Record<string, number>>({});
  const [loading,      setLoading]      = useState(true);
  const [expandedProd, setExpandedProd] = useState<number | null>(null);

  // 批次 Modal
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchForm,      setBatchForm]      = useState({ ...EMPTY_BATCH });
  const [batchProductId, setBatchProductId] = useState(0);
  const [batchVariantId, setBatchVariantId] = useState<number | null>(null);
  const [editingBatchId, setEditingBatchId] = useState<number | null>(null);
  const [savingBatch,    setSavingBatch]    = useState(false);
  const [variants,       setVariants]       = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: prods }, { data: batchData }] = await Promise.all([
      supabase.from('products').select('id, name, is_preorder, is_available, image_url, preorder_note, product_variants(id, name)').eq('is_preorder', true).order('sort_order'),
      supabase.from('preorder_batches').select('*').order('created_at', { ascending: false }),
    ]);
    setProducts(prods ?? []);
    setBatches(batchData ?? []);

    // 各批次已接單數（從 inventory 的 reserved_preorder）
    const stats: Record<string, number> = {};
    if (batchData && batchData.length > 0) {
      const productIds = [...new Set(batchData.map((b: any) => b.product_id))];
      const { data: invData } = await supabase
        .from('inventory')
        .select('product_id, variant_id, reserved_preorder')
        .in('product_id', productIds)
        .eq('inventory_mode', 'preorder');
      (invData ?? []).forEach((i: any) => {
        const key = `${i.product_id}_${i.variant_id ?? 'null'}`;
        stats[key] = i.reserved_preorder ?? 0;
      });
    }
    setOrderStats(stats);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // 開啟新增批次
  const openAddBatch = async (productId: number, variantId: number | null = null) => {
    setBatchProductId(productId);
    setBatchVariantId(variantId);
    setBatchForm({ ...EMPTY_BATCH });
    setEditingBatchId(null);

    // 載入此商品的規格
    const { data } = await supabase.from('product_variants').select('*').eq('product_id', productId).eq('is_available', true).order('sort_order');
    setVariants(data ?? []);
    setShowBatchModal(true);
  };

  // 開啟編輯批次
  const openEditBatch = async (batch: any) => {
    setBatchProductId(batch.product_id);
    setBatchVariantId(batch.variant_id);
    setBatchForm({ name: batch.name, starts_at: batch.starts_at ?? '', ends_at: batch.ends_at ?? '', ship_date: batch.ship_date, limit_qty: batch.limit_qty, status: batch.status ?? (batch.is_active ? 'active' : 'closed'), note: batch.note ?? '' });
    setEditingBatchId(batch.id);
    const { data } = await supabase.from('product_variants').select('*').eq('product_id', batch.product_id).eq('is_available', true).order('sort_order');
    setVariants(data ?? []);
    setShowBatchModal(true);
  };

  // 儲存批次
  const saveBatch = async () => {
    if (!batchForm.name)      { alert('請填寫批次名稱'); return; }
    if (!batchForm.ship_date) { alert('請填寫預計出貨日'); return; }

    // 出貨日衝突驗證（同商品同出貨日只能有一個批次）
    const conflictQuery = supabase
      .from('preorder_batches')
      .select('id, name')
      .eq('product_id', batchProductId)
      .eq('ship_date', batchForm.ship_date);
    if (editingBatchId) conflictQuery.neq('id', editingBatchId);
    const { data: conflict } = await conflictQuery;
    if (conflict && conflict.length > 0) {
      alert(`此商品在 ${batchForm.ship_date} 已有批次「${conflict[0].name}」，出貨日不能重複。`);
      return;
    }

    setSavingBatch(true);
    const data = {
      product_id: batchProductId,
      variant_id: batchVariantId || null,
      name:       batchForm.name,
      starts_at:  batchForm.starts_at  || null,
      ends_at:    batchForm.ends_at    || null,
      ship_date:  batchForm.ship_date,
      limit_qty:  batchForm.limit_qty,
      status:     batchForm.status,
      is_active:  batchForm.status === 'active',  // 同步舊欄位
      note:       batchForm.note || null,
    };
    if (editingBatchId) {
      const { error } = await supabase.from('preorder_batches').update(data).eq('id', editingBatchId);
      if (error) { alert(error.message); setSavingBatch(false); return; }
    } else {
      const { error } = await supabase.from('preorder_batches').insert(data);
      if (error) { alert(error.message); setSavingBatch(false); return; }
    }
    setSavingBatch(false);
    setShowBatchModal(false);
    load();
  };

  // 切換批次接單開關
  const toggleBatch = async (batch: any) => {
    const newStatus = (batch.status === 'active') ? 'closed' : 'active';
    const { error } = await supabase.from('preorder_batches').update({ status: newStatus, is_active: newStatus === 'active' }).eq('id', batch.id);
    if (error) { alert(error.message); return; }
    setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, status: newStatus, is_active: newStatus === 'active' } : b));
  };

  const deleteBatch = async (id: number) => {
    if (!confirm('確定要刪除此批次？')) return;
    await supabase.from('preorder_batches').delete().eq('id', id);
    load();
  };

  // 取得某商品某規格的批次
  const getBatchesFor = (productId: number, variantId: number | null = null) =>
    batches.filter(b => b.product_id === productId && (b.variant_id ?? null) === (variantId ?? null));

  // 批次狀態
  const getBatchStatus = (batch: any) => {
    const s = batch.status ?? (batch.is_active ? 'active' : 'closed');
    const opt = STATUS_OPTIONS.find(o => o.value === s);
    if (opt) return { label: opt.label, color: opt.color };
    // fallback：用日期判斷
    const today = new Date().toISOString().split('T')[0];
    if (batch.starts_at && batch.starts_at > today) return { label: '未開始', color: '#b87a2a' };
    if (batch.ends_at   && batch.ends_at   < today) return { label: '已結束', color: '#888580' };
    return { label: '接單中', color: '#2ab85a' };
  };

  if (loading) return <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: 0 }}>預購系統</h1>
        <button onClick={() => router.push('/admin/products')} style={{ padding: '8px 20px', background: 'transparent', border: '1px solid #E8E4DC', fontFamily: '"Noto Sans TC", sans-serif', fontSize: '12px', color: '#555250', cursor: 'pointer' }}>
          前往商品管理設定預購商品 →
        </button>
      </div>

      {products.length === 0 ? (
        <div style={{ padding: '64px 0', textAlign: 'center', border: '1px solid #E8E4DC', background: '#fff' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>📦</div>
          <div style={{ fontSize: '14px', color: '#888580', marginBottom: '8px' }}>尚無預購商品</div>
          <div style={{ fontSize: '12px', color: '#888580', marginBottom: '24px' }}>請先至商品管理，將商品標記為「預購商品」</div>
          <button onClick={() => router.push('/admin/products')} style={{ padding: '10px 28px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', cursor: 'pointer' }}>
            前往商品管理
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {products.map(product => {
            const hasVariants = (product.product_variants ?? []).length > 0;
            const isExpanded  = expandedProd === product.id;

            return (
              <div key={product.id} style={{ background: '#fff', border: '1px solid #E8E4DC' }}>
                {/* 商品標題列 */}
                <div
                  onClick={() => setExpandedProd(isExpanded ? null : product.id)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {product.image_url && <img src={product.image_url} alt={product.name} style={{ width: '40px', height: '40px', objectFit: 'cover' }} />}
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#1E1C1A', marginBottom: '4px' }}>{product.name}</div>
                      <div style={{ fontSize: '11px', color: '#888580' }}>
                        {hasVariants ? `${product.product_variants.length} 個規格` : '無規格'}
                        {' · '}
                        {getBatchesFor(product.id).filter(b => getBatchStatus(b).label === '接單中').length > 0
                          ? <span style={{ color: '#2ab85a' }}>接單中</span>
                          : <span style={{ color: '#888580' }}>未開放</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {!hasVariants && (
                      <button onClick={e => { e.stopPropagation(); openAddBatch(product.id, null); }} style={{ padding: '6px 14px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 600, letterSpacing: '0.15em', cursor: 'pointer' }}>
                        ＋ 新增批次
                      </button>
                    )}
                    <span style={{ fontSize: '12px', color: '#888580' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* 展開內容 */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #E8E4DC', padding: '16px 20px' }}>
                    {hasVariants ? (
                      // 有規格：按規格分組
                      product.product_variants.map((variant: any) => (
                        <div key={variant.id} style={{ marginBottom: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#1E1C1A' }}>規格：{variant.name}</span>
                            <button onClick={() => openAddBatch(product.id, variant.id)} style={{ padding: '5px 12px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                              ＋ 新增批次
                            </button>
                          </div>
                          <BatchList
                            batches={getBatchesFor(product.id, variant.id)}
                            orderStats={orderStats}
                            productId={product.id}
                            getBatchStatus={getBatchStatus}
                            onEdit={openEditBatch}
                            onToggle={toggleBatch}
                            onDelete={deleteBatch}
                          />
                        </div>
                      ))
                    ) : (
                      // 無規格：直接顯示批次
                      <BatchList
                        batches={getBatchesFor(product.id, null)}
                        orderStats={orderStats}
                        productId={product.id}
                        getBatchStatus={getBatchStatus}
                        onEdit={openEditBatch}
                        onToggle={toggleBatch}
                        onDelete={deleteBatch}
                      />
                    )}

                    {/* 預購說明 */}
                    {product.preorder_note && (
                      <div style={{ marginTop: '12px', padding: '10px 14px', background: '#EDE9E2', fontSize: '12px', color: '#555250' }}>
                        前台說明：{product.preorder_note}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 批次 Modal */}
      {showBatchModal && (
        <>
          <div onClick={() => setShowBatchModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '520px', maxWidth: '90vw', zIndex: 201, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '15px', color: '#1E1C1A' }}>{editingBatchId ? '編輯批次' : '新增預購批次'}</span>
              <button onClick={() => setShowBatchModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888580' }}>×</button>
            </div>
            <div style={{ padding: '24px', display: 'grid', gap: '16px' }}>
              {/* 規格選擇（有規格才顯示）*/}
              {variants.length > 0 && (
                <div>
                  <label style={labelStyle}>規格</label>
                  <select value={batchVariantId ?? ''} onChange={e => setBatchVariantId(e.target.value ? Number(e.target.value) : null)} style={{ ...inputStyle, width: '100%' }}>
                    <option value="">無規格（整體商品）</option>
                    {variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label style={labelStyle}>批次名稱 *</label>
                <input value={batchForm.name} onChange={e => setBatchForm({...batchForm, name: e.target.value})} placeholder="例：第一批、春季限定、母親節" style={{...inputStyle, width: '100%'}} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>預購開始日（留空 = 立即）</label>
                  <input type="date" value={batchForm.starts_at} onChange={e => setBatchForm({...batchForm, starts_at: e.target.value})} style={{...inputStyle, width: '100%'}} />
                </div>
                <div>
                  <label style={labelStyle}>預購結束日（留空 = 無期限）</label>
                  <input type="date" value={batchForm.ends_at} onChange={e => setBatchForm({...batchForm, ends_at: e.target.value})} style={{...inputStyle, width: '100%'}} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>預計出貨日 *</label>
                <input type="date" value={batchForm.ship_date} onChange={e => setBatchForm({...batchForm, ship_date: e.target.value})} style={{...inputStyle, width: '100%', maxWidth: '200px'}} />
              </div>

              <div>
                <label style={labelStyle}>數量上限（0 = 不限）</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="number" value={numVal(batchForm.limit_qty)} onChange={e => setBatchForm({...batchForm, limit_qty: e.target.value === '' ? 0 : Number(e.target.value)})} style={{...inputStyle, width: '100px'}} />
                  <span style={{ fontSize: '12px', color: '#888580' }}>份</span>
                </div>
              </div>

              <div>
                <label style={labelStyle}>批次狀態</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setBatchForm({...batchForm, status: opt.value})}
                      style={{
                        padding: '7px 16px', border: `1px solid ${batchForm.status === opt.value ? opt.color : '#E8E4DC'}`,
                        background: batchForm.status === opt.value ? opt.color : 'transparent',
                        color: batchForm.status === opt.value ? '#fff' : '#555250',
                        fontSize: '12px', cursor: 'pointer', fontFamily: '"Montserrat", sans-serif',
                        letterSpacing: '0.1em', transition: 'all 0.2s',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: '#888580', marginTop: '6px' }}>
                  {batchForm.status === 'draft'    && '草稿：前台不顯示，尚未開放'}
                  {batchForm.status === 'active'   && '開放中：前台可見，顧客可選購'}
                  {batchForm.status === 'closed'   && '關閉：前台不顯示，暫停接單'}
                  {batchForm.status === 'sold_out' && '售完：前台顯示「已售完」，無法下單'}
                </div>
              </div>

              <div>
                <label style={labelStyle}>備註（選填）</label>
                <input value={batchForm.note} onChange={e => setBatchForm({...batchForm, note: e.target.value})} placeholder="內部備註" style={{...inputStyle, width: '100%'}} />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={saveBatch} disabled={savingBatch} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: savingBatch ? 0.6 : 1 }}>
                  {savingBatch ? '儲存中...' : '儲存'}
                </button>
                <button onClick={() => setShowBatchModal(false)} style={{ padding: '10px 32px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── 批次列表子元件 ────────────────────────────────
function BatchList({ batches, orderStats, productId, getBatchStatus, onEdit, onToggle, onDelete }: {
  batches: any[]; orderStats: Record<string, number>; productId: number;
  getBatchStatus: (b: any) => { label: string; color: string };
  onEdit: (b: any) => void; onToggle: (b: any) => void; onDelete: (id: number) => void;
}) {
  if (batches.length === 0) {
    return <p style={{ fontSize: '12px', color: '#888580', padding: '12px 0' }}>尚無批次，點「新增批次」開始</p>;
  }
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {batches.map(batch => {
        const status   = getBatchStatus(batch);
        const statKey  = `${batch.product_id}_${batch.variant_id ?? 'null'}`;
        const reserved = orderStats[statKey] ?? 0;
        const pct      = batch.limit_qty > 0 ? Math.round(reserved / batch.limit_qty * 100) : 0;
        return (
          <div key={batch.id} style={{ padding: '14px 16px', background: '#F7F4EF', border: '1px solid #E8E4DC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E1C1A', marginRight: '12px' }}>{batch.name}</span>
                <span style={{ fontSize: '11px', color: status.color, border: `1px solid ${status.color}`, padding: '2px 8px', fontFamily: '"Montserrat", sans-serif' }}>{status.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Toggle val={batch.status === 'active'} onChange={() => onToggle(batch)} />
                <button onClick={() => onEdit(batch)} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer' }}>編輯</button>
                <button onClick={() => onDelete(batch.id)} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#c0392b', cursor: 'pointer' }}>刪除</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: '#555250', flexWrap: 'wrap', marginBottom: '8px' }}>
              <span>預購期間：{batch.starts_at ?? '立即'} ～ {batch.ends_at ?? '無期限'}</span>
              <span>預計出貨：<strong style={{ color: '#1E1C1A' }}>{batch.ship_date}</strong></span>
              <span>數量上限：{batch.limit_qty === 0 ? '不限' : `${batch.limit_qty} 份`}</span>
            </div>

            {/* 接單進度條 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1, height: '4px', background: '#E8E4DC', borderRadius: '2px' }}>
                <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#c0392b' : '#2ab85a', borderRadius: '2px', transition: 'width 0.5s' }} />
              </div>
              <span style={{ fontSize: '12px', color: '#555250', whiteSpace: 'nowrap' }}>
                已接 {reserved} {batch.limit_qty > 0 ? `/ ${batch.limit_qty}` : ''} 份
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
