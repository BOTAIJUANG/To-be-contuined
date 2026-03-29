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
import s from '../_shared/admin-shared.module.css';
import p from './preorder.module.css';
import AdminDatePicker from '../_shared/AdminDatePicker';

const numVal = (v: number) => v === 0 ? '' : String(v);

const EMPTY_BATCH = { name: '', starts_at: '', ends_at: '', ship_date: '', limit_qty: 0, status: 'draft' as string, note: '' };

const STATUS_OPTIONS = [
  { value: 'draft',    label: '草稿',  color: '#7d6d60', badgeCls: 'badgeDraft' },
  { value: 'active',   label: '開放中', color: '#4e7c5c', badgeCls: 'badgeOpen' },
  { value: 'closed',   label: '關閉',  color: '#6d6058', badgeCls: 'badgeClosed' },
  { value: 'sold_out', label: '售完',  color: '#b55245', badgeCls: 'badgeSoldOut' },
];

const Toggle = ({ val, onChange }: { val: boolean; onChange: () => void }) => (
  <div onClick={onChange} className={s.toggle} style={{ background: val ? '#6b4a3a' : '#ddd2c6' }}>
    <div className={s.toggleDot} style={{ left: val ? '21px' : '3px' }} />
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

    // 從 order_items 按 preorder_batch_id 統計各批次已接數量（排除已取消訂單）
    const stats: Record<string, number> = {};
    if (batchData && batchData.length > 0) {
      const batchIds = batchData.map((b: any) => b.id);
      const { data: itemData } = await supabase
        .from('order_items')
        .select('preorder_batch_id, qty, orders!inner(status)')
        .in('preorder_batch_id', batchIds)
        .neq('orders.status', 'cancelled');
      (itemData ?? []).forEach((i: any) => {
        const key = `batch_${i.preorder_batch_id}`;
        stats[key] = (stats[key] ?? 0) + (i.qty ?? 0);
      });
    }
    setOrderStats(stats);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAddBatch = async (productId: number, variantId: number | null = null) => {
    setBatchProductId(productId);
    setBatchVariantId(variantId);
    setBatchForm({ ...EMPTY_BATCH });
    setEditingBatchId(null);
    const { data } = await supabase.from('product_variants').select('*').eq('product_id', productId).eq('is_available', true).order('sort_order');
    setVariants(data ?? []);
    setShowBatchModal(true);
  };

  const openEditBatch = async (batch: any) => {
    setBatchProductId(batch.product_id);
    setBatchVariantId(batch.variant_id);
    setBatchForm({ name: batch.name, starts_at: batch.starts_at ?? '', ends_at: batch.ends_at ?? '', ship_date: batch.ship_date, limit_qty: batch.limit_qty, status: batch.status ?? (batch.is_active ? 'active' : 'closed'), note: batch.note ?? '' });
    setEditingBatchId(batch.id);
    const { data } = await supabase.from('product_variants').select('*').eq('product_id', batch.product_id).eq('is_available', true).order('sort_order');
    setVariants(data ?? []);
    setShowBatchModal(true);
  };

  const saveBatch = async () => {
    if (!batchForm.name)      { alert('請填寫批次名稱'); return; }
    if (!batchForm.ship_date) { alert('請填寫預計出貨日'); return; }

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
      reserved:   0,
      status:     batchForm.status,
      is_active:  batchForm.status === 'active',
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

  const getBatchesFor = (productId: number, variantId: number | null = null) =>
    batches.filter(b => b.product_id === productId && (b.variant_id ?? null) === (variantId ?? null));

  const getBatchStatus = (batch: any) => {
    const st = batch.status ?? (batch.is_active ? 'active' : 'closed');
    const opt = STATUS_OPTIONS.find(o => o.value === st);
    if (opt) return { label: opt.label, color: opt.color, badgeCls: opt.badgeCls };
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (batch.starts_at && batch.starts_at > today) return { label: '未開始', color: '#7d6d60', badgeCls: 'badgeDraft' };
    if (batch.ends_at   && batch.ends_at   < today) return { label: '已結束', color: '#6d6058', badgeCls: 'badgeClosed' };
    return { label: '接單中', color: '#4e7c5c', badgeCls: 'badgeOpen' };
  };

  if (loading) return <p className={s.loadingText}>載入中...</p>;

  return (
    <div>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>預購系統</h1>
        <button onClick={() => router.push('/admin/products')} className={s.btnOutline}>
          前往商品管理設定預購商品 →
        </button>
      </div>

      {products.length === 0 ? (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#B8B5B0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05" /><path d="M12 22.08V12" />
            </svg>
          </div>
          <div className={s.emptyTitle}>尚無預購商品</div>
          <div className={s.emptyDesc}>請先至商品管理，將商品標記為「預購商品」</div>
          <button onClick={() => router.push('/admin/products')} className={s.btnPrimary}>前往商品管理</button>
        </div>
      ) : (
        <div className={s.grid1}>
          {products.map(product => {
            const hasVariants = (product.product_variants ?? []).length > 0;
            const isExpanded  = expandedProd === product.id;

            return (
              <div key={product.id} className={p.productCard}>
                {/* 商品標題列 */}
                <div
                  onClick={() => setExpandedProd(isExpanded ? null : product.id)}
                  className={p.productHeader}
                >
                  <div className={p.productInfo}>
                    {product.image_url && <img src={product.image_url} alt={product.name} className={p.productThumb} />}
                    <div>
                      <div className={p.productName}>{product.name}</div>
                      <div className={p.productSub}>
                        {hasVariants ? `${product.product_variants.length} 個規格` : '無規格'}
                        {' · '}
                        {getBatchesFor(product.id).some(b => { const st = getBatchStatus(b).label; return st === '開放中' || st === '接單中'; })
                          ? <span className={p.statusActive}>接單中</span>
                          : <span className={p.statusInactive}>未開放</span>}
                      </div>
                    </div>
                  </div>
                  <div className={`${s.flex} ${s.itemsCenter} ${s.gap12}`}>
                    {!hasVariants && (
                      <button onClick={e => { e.stopPropagation(); openAddBatch(product.id, null); }} className={p.btnAddBatch}>
                        ＋ 新增批次
                      </button>
                    )}
                    <span className={p.toggleIcon}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* 展開內容 */}
                {isExpanded && (
                  <div className={p.expandContent}>
                    {hasVariants ? (
                      product.product_variants.map((variant: any) => (
                        <div key={variant.id} className={p.variantSection}>
                          <div className={p.variantHeader}>
                            <span className={p.variantName}>規格：{variant.name}</span>
                            <button onClick={() => openAddBatch(product.id, variant.id)} className={p.btnAddBatch}>
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

                    {product.preorder_note && (
                      <div className={p.preorderNote}>前台說明：{product.preorder_note}</div>
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
          <div onClick={() => setShowBatchModal(false)} className={s.modalOverlay} />
          <div className={s.modal}>
            <div className={s.modalHeader}>
              <span className={s.modalTitle}>{editingBatchId ? '編輯批次' : '新增預購批次'}</span>
              <button onClick={() => setShowBatchModal(false)} className={s.modalClose}>×</button>
            </div>
            <div className={s.modalBody}>
              {/* 規格選擇（有規格才顯示）*/}
              {variants.length > 0 && (
                <div>
                  <label className={s.label}>規格</label>
                  <select value={batchVariantId ?? ''} onChange={e => setBatchVariantId(e.target.value ? Number(e.target.value) : null)} className={s.select}>
                    <option value="">無規格（整體商品）</option>
                    {variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className={s.label}>批次名稱 *</label>
                <input value={batchForm.name} onChange={e => setBatchForm({...batchForm, name: e.target.value})} placeholder="例：第一批、春季限定、母親節" className={s.input} />
              </div>

              <div className={s.grid2}>
                <div>
                  <label className={s.label}>預購開始日（留空 = 立即）</label>
                  <AdminDatePicker value={batchForm.starts_at} onChange={val => setBatchForm({...batchForm, starts_at: val})} className={s.input} />
                </div>
                <div>
                  <label className={s.label}>預購結束日（留空 = 無期限）</label>
                  <AdminDatePicker value={batchForm.ends_at} onChange={val => setBatchForm({...batchForm, ends_at: val})} className={s.input} />
                </div>
              </div>

              <div>
                <label className={s.label}>預計出貨日 *</label>
                <AdminDatePicker value={batchForm.ship_date} onChange={val => setBatchForm({...batchForm, ship_date: val})} className={`${s.input} ${p.inputMaxWidth}`} />
              </div>

              <div>
                <label className={s.label}>數量上限（0 = 不限）</label>
                <div className={`${s.flex} ${s.itemsCenter} ${s.gap8}`}>
                  <input type="number" value={numVal(batchForm.limit_qty)} onChange={e => setBatchForm({...batchForm, limit_qty: e.target.value === '' ? 0 : Number(e.target.value)})} className={`${s.input} ${p.inputSmallWidth}`} />
                  <span className={p.unitLabel}>份</span>
                </div>
              </div>

              <div>
                <label className={s.label}>批次狀態</label>
                <div className={p.statusBtns}>
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setBatchForm({...batchForm, status: opt.value})}
                      className={p.statusBtn}
                      style={{
                        border: `1px solid ${batchForm.status === opt.value ? opt.color : '#e5dbcf'}`,
                        background: batchForm.status === opt.value ? opt.color : 'transparent',
                        color: batchForm.status === opt.value ? '#fffaf6' : '#7a6a5d',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className={p.statusHint}>
                  {batchForm.status === 'draft'    && '草稿：前台不顯示，尚未開放'}
                  {batchForm.status === 'active'   && '開放中：前台可見，顧客可選購'}
                  {batchForm.status === 'closed'   && '關閉：前台不顯示，暫停接單'}
                  {batchForm.status === 'sold_out' && '售完：前台顯示「已售完」，無法下單'}
                </div>
              </div>

              <div>
                <label className={s.label}>備註（選填）</label>
                <input value={batchForm.note} onChange={e => setBatchForm({...batchForm, note: e.target.value})} placeholder="內部備註" className={s.input} />
              </div>

              <div className={s.btnActions}>
                <button onClick={saveBatch} disabled={savingBatch} className={s.btnSave}>
                  {savingBatch ? '儲存中...' : '儲存'}
                </button>
                <button onClick={() => setShowBatchModal(false)} className={s.btnCancel}>取消</button>
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
  getBatchStatus: (b: any) => { label: string; color: string; badgeCls: string };
  onEdit: (b: any) => void; onToggle: (b: any) => void; onDelete: (id: number) => void;
}) {
  if (batches.length === 0) {
    return <p className={p.emptyBatch}>尚無批次，點「新增批次」開始</p>;
  }
  return (
    <div className={p.batchListGrid}>
      {batches.map(batch => {
        const status   = getBatchStatus(batch);
        const reserved = orderStats[`batch_${batch.id}`] ?? 0;
        const pct      = batch.limit_qty > 0 ? Math.round(reserved / batch.limit_qty * 100) : 0;
        const isActive = batch.status === 'active';
        const isDraft  = batch.status === 'draft';
        const cardCls  = isActive ? p.batchCardActive : isDraft ? p.batchCardDraft : p.batchCard;
        const badgeCls = (p as any)[status.badgeCls] ?? p.badgeDraft;

        return (
          <div key={batch.id} className={cardCls}>
            <div className={p.batchTop}>
              <div className={p.batchTitleGroup}>
                <span className={p.batchName}>{batch.name}</span>
                <span className={badgeCls}>{status.label}</span>
              </div>
              <div className={p.batchActions}>
                <Toggle val={isActive} onChange={() => onToggle(batch)} />
                <button onClick={() => onEdit(batch)} className={p.actionBtn}>編輯</button>
                <button onClick={() => onDelete(batch.id)} className={p.deleteBtn}>刪除</button>
              </div>
            </div>

            <div className={p.batchMeta}>
              <span>預購期間：{batch.starts_at ?? '立即'} ～ {batch.ends_at ?? '無期限'}</span>
              <span>預計出貨：<strong className={p.batchShipDate}>{batch.ship_date}</strong></span>
              <span>數量上限：{batch.limit_qty === 0 ? '不限' : `${batch.limit_qty} 份`}</span>
            </div>

            {/* 接單進度條 */}
            <div className={p.progressWrap}>
              <div className={p.progressBar}>
                <div className={p.progressFill} style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#b55245' : '#6b4a3a' }} />
              </div>
              <span className={p.progressText}>
                已接 {reserved} {batch.limit_qty > 0 ? `/ ${batch.limit_qty}` : ''} 份
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
