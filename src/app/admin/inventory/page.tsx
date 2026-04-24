'use client';

// ════════════════════════════════════════════════
// app/admin/inventory/page.tsx  ──  庫存管理（完整版）
//
// 分頁：商品庫存 / 原料庫存 / 產能管理 / 異動記錄
// ════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import s from '../_shared/admin-shared.module.css';
import p from './inventory.module.css';
import AdminDatePicker from '../_shared/AdminDatePicker';

// ── 數字 input helpers（避免前導 0）────────────────
const numVal = (v: number) => v === 0 ? '' : String(v);
const numChange = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
  set(e.target.value === '' ? 0 : Number(e.target.value));
};

const Toggle = ({ val, onChange }: { val: boolean; onChange: () => void }) => (
  <div onClick={onChange} className={s.toggle} style={{ background: val ? '#1E1C1A' : '#E8E4DC' }}>
    <div className={s.toggleDot} style={{ left: val ? '21px' : '3px' }} />
  </div>
);

const CHANGE_TYPE_LABEL: Record<string, string> = {
  purchase: '進貨', damage: '損耗', restock: '補貨',
  order: '接單預留', ship: '出貨扣庫存', cancel: '取消釋放',
  refund: '退款回補', audit: '盤點修正', adjust: '手動調整',
};
const CHANGE_TYPE_COLOR: Record<string, string> = {
  purchase: '#2ab85a', damage: '#c0392b', restock: '#2ab85a',
  order: '#b87a2a', ship: '#2a7ab8', cancel: '#888580',
  refund: '#5a7a8a', audit: '#555250', adjust: '#b87a2a',
};

export default function AdminInventoryPage() {
  const [tab, setTab] = useState<'product' | 'ingredient' | 'capacity' | 'logs'>('product');
  const searchParams = useSearchParams();

  // 從 URL 參數讀取初始 tab（例如 /admin/inventory?tab=ingredient）
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'ingredient' || t === 'capacity' || t === 'logs') setTab(t);
  }, [searchParams]);

  // 功能開關
  const [featureIngredient, setFeatureIngredient] = useState(false);
  const [featureCapacity,   setFeatureCapacity]   = useState(false);

  // 當前管理員
  const [adminId,   setAdminId]   = useState('');
  const [adminName, setAdminName] = useState('');

  // 商品庫存
  const [inventory,  setInventory]  = useState<any[]>([]);
  const [products,   setProducts]   = useState<any[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  // 每日接單（date_mode）
  const [shipDateRows, setShipDateRows] = useState<any[]>([]);
  const [expandedShipProducts, setExpandedShipProducts] = useState<Set<number>>(new Set());

  // 庫存調整 Modal
  const [showAdjModal,  setShowAdjModal]  = useState(false);
  const [adjTarget,     setAdjTarget]     = useState<any | null>(null);
  const [adjMode,       setAdjMode]       = useState<'adjust' | 'audit'>('adjust');
  const [adjQty,        setAdjQty]        = useState(0);
  const [adjType,       setAdjType]       = useState('purchase');
  const [adjReason,     setAdjReason]     = useState('');
  const [adjAuditVal,   setAdjAuditVal]   = useState(0);
  const [savingAdj,     setSavingAdj]     = useState(false);

  // 新增/編輯庫存 Modal
  const [showInvModal, setShowInvModal] = useState(false);
  const [editingInvId, setEditingInvId] = useState<number | null>(null);
  const [invForm, setInvForm] = useState({
    product_id: 0, variant_id: null as number | null,
    inventory_mode: 'stock', stock: 0, reserved: 0,
    safety_stock: 0, max_preorder: 0, reserved_preorder: 0,
  });
  const [savingInv, setSavingInv] = useState(false);

  // 原料庫存
  const [ingredients,  setIngredients]  = useState<any[]>([]);
  const [ingLoading,   setIngLoading]   = useState(false);
  const [showIngModal, setShowIngModal] = useState(false);
  const [editingIngId, setEditingIngId] = useState<number | null>(null);
  const [ingForm, setIngForm] = useState({ name: '', category: '原料', unit: 'kg', stock: 0, safety_stock: 0, expiry_date: '', restocked_at: '', location: '', note: '' });
  const [savingIng, setSavingIng] = useState(false);
  const [ingSearch,    setIngSearch]    = useState('');
  const [ingCatFilter, setIngCatFilter] = useState('');

  // 原料盤點
  const [showIngAuditModal, setShowIngAuditModal] = useState(false);
  const [auditTarget,       setAuditTarget]       = useState<any | null>(null);
  const [auditActual,       setAuditActual]       = useState(0);
  const [auditChangeType,   setAuditChangeType]   = useState('audit');
  const [auditReason,       setAuditReason]       = useState('');
  const [savingAudit,       setSavingAudit]       = useState(false);

  // 原料異動記錄
  const [ingLogs,        setIngLogs]        = useState<any[]>([]);
  const [ingLogsLoading, setIngLogsLoading] = useState(false);
  const [showIngLogs,    setShowIngLogs]    = useState(false);
  const [ingLogFilter,   setIngLogFilter]   = useState({ ingredient_id: '', change_type: '', date_start: '', date_end: '' });

  // 產能排程
  const [schedule, setSchedule] = useState<any[]>([]);

  // 異動記錄
  const [logs,       setLogs]       = useState<any[]>([]);
  const [logsLoading,setLogsLoading]= useState(false);
  const [logFilter,  setLogFilter]  = useState({ product_id: '', change_type: '', date_start: '', date_end: '' });

  // ── 初始化 ──────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const [{ data: session }, { data: settings }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from('store_settings').select('feature_ingredient, feature_capacity').eq('id', 1).single(),
      ]);
      if (session?.session?.user) {
        setAdminId(session.session.user.id);
        setAdminName(session.session.user.user_metadata?.name ?? 'Admin');
      }
      if (settings) {
        setFeatureIngredient(settings.feature_ingredient ?? false);
        setFeatureCapacity(settings.feature_capacity ?? false);
      }
    };
    init();
    loadInventory();
    loadProducts();
    loadShipDates();
  }, []);

  useEffect(() => {
    if (tab === 'ingredient' && featureIngredient) loadIngredients();
    if (tab === 'capacity'   && featureCapacity)   loadSchedule();
    if (tab === 'logs')                            loadLogs();
  }, [tab]);

  // ── 功能開關 ─────────────────────────────────────
  const toggleFeature = async (field: 'feature_ingredient' | 'feature_capacity', val: boolean) => {
    await supabase.from('store_settings').upsert({ id: 1, [field]: val, updated_at: new Date().toISOString() });
    if (field === 'feature_ingredient') setFeatureIngredient(val);
    else                                setFeatureCapacity(val);
  };

  // ── 載入商品庫存 ─────────────────────────────────
  const loadInventory = async () => {
    setInvLoading(true);
    const { data } = await supabase
      .from('inventory')
      .select('*, products(name, is_sold_out, stock_mode), product_variants(name)')
      .order('product_id');
    // 過濾掉 date_mode 商品（由 shipDateRows 顯示）
    setInventory((data ?? []).filter((i: any) => i.products?.stock_mode !== 'date_mode'));
    setInvLoading(false);
  };

  const loadShipDates = async () => {
    const { data } = await supabase
      .from('product_ship_dates')
      .select('*, products(name, is_sold_out, stock_mode)')
      .order('ship_date');
    // 只顯示目前仍為 date_mode 的商品（切回總量模式的不顯示）
    setShipDateRows((data ?? []).filter((d: any) => d.products?.stock_mode === 'date_mode'));
  };

  const updateShipDateField = async (id: number, field: string, value: any) => {
    await supabase.from('product_ship_dates').update({ [field]: value }).eq('id', id);
    loadShipDates();
  };

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, name').eq('is_available', true).order('sort_order');
    setProducts(data ?? []);
  };

  // ── 載入原料 ─────────────────────────────────────
  const loadIngredients = async () => {
    setIngLoading(true);
    const { data } = await supabase.from('ingredients').select('*, ingredient_products(product_id, products(name))').order('name');
    setIngredients(data ?? []);
    setIngLoading(false);
  };

  // ── 載入出貨排程 ─────────────────────────────────
  const loadSchedule = async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
    const { data } = await supabase
      .from('orders')
      .select('ship_date, order_items(qty, product_name_snapshot, variant_name_snapshot, products(categories(name)))')
      .gte('ship_date', today)
      .neq('status', 'cancelled')
      .order('ship_date');

    const map: Record<string, { total: number; byCategory: Record<string, number> }> = {};
    (data ?? []).forEach((o: any) => {
      const d = o.ship_date ?? '未指定';
      if (!map[d]) map[d] = { total: 0, byCategory: {} };
      (o.order_items ?? []).forEach((item: any) => {
        map[d].total += item.qty;
        const cat = item.products?.categories?.name ?? '其他';
        map[d].byCategory[cat] = (map[d].byCategory[cat] ?? 0) + item.qty;
      });
    });
    setSchedule(Object.entries(map).map(([date, v]) => ({ date, ...v })));
  };

  // ── 載入異動記錄 ─────────────────────────────────
  const loadLogs = async () => {
    setLogsLoading(true);
    let q = supabase
      .from('inventory_logs')
      .select('*, products(name), product_variants(name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (logFilter.product_id)  q = q.eq('product_id', logFilter.product_id);
    if (logFilter.change_type) q = q.eq('change_type', logFilter.change_type);
    if (logFilter.date_start)  q = q.gte('created_at', logFilter.date_start);
    if (logFilter.date_end)    q = q.lte('created_at', logFilter.date_end + 'T23:59:59');
    const { data } = await q;
    setLogs(data ?? []);
    setLogsLoading(false);
  };

  // ── 新增庫存異動 log ────────────────────────────
  const writeLog = async (
    inv: any, changeType: string,
    qtyBefore: number, qtyAfter: number, reason: string, orderId?: number
  ) => {
    await supabase.from('inventory_logs').insert({
      inventory_id: inv.id, product_id: inv.product_id, variant_id: inv.variant_id ?? null,
      change_type: changeType,
      qty_before: qtyBefore, qty_after: qtyAfter, qty_change: qtyAfter - qtyBefore,
      reason, admin_id: adminId, admin_name: adminName,
      order_id: orderId ?? null,
    });
  };

  // ── 庫存調整（adjust / audit）───────────────────
  const openAdj = (inv: any, mode: 'adjust' | 'audit') => {
    setAdjTarget(inv);
    setAdjMode(mode);
    setAdjQty(0);
    setAdjType(mode === 'audit' ? 'audit' : 'purchase');
    setAdjReason('');
    setAdjAuditVal(inv.stock);
    setShowAdjModal(true);
  };

  const handleAdj = async () => {
    if (!adjTarget) return;
    if (!adjReason.trim()) { alert('請填寫原因'); return; }
    setSavingAdj(true);

    const before = adjTarget.stock;
    let after: number;
    let changeType: string;

    if (adjMode === 'audit') {
      after      = adjAuditVal;
      changeType = 'audit';
    } else {
      after      = Math.max(0, before + adjQty);
      changeType = adjType;
    }

    await supabase.from('inventory').update({ stock: after, updated_at: new Date().toISOString() }).eq('id', adjTarget.id);
    await writeLog(adjTarget, changeType, before, after, adjReason);

    setSavingAdj(false);
    setShowAdjModal(false);
    loadInventory();
  };

  // ── 新增/編輯庫存 ─────────────────────────────────
  const openAddInv = () => {
    setInvForm({ product_id: products[0]?.id ?? 0, variant_id: null, inventory_mode: 'stock', stock: 0, reserved: 0, safety_stock: 0, max_preorder: 0, reserved_preorder: 0 });
    setEditingInvId(null);
    setShowInvModal(true);
  };
  const openEditInv = (item: any) => {
    setInvForm({ product_id: item.product_id, variant_id: item.variant_id, inventory_mode: item.inventory_mode, stock: item.stock, reserved: item.reserved, safety_stock: item.safety_stock, max_preorder: item.max_preorder, reserved_preorder: item.reserved_preorder });
    setEditingInvId(item.id);
    setShowInvModal(true);
  };
  const saveInv = async () => {
    setSavingInv(true);
    const data = { ...invForm, variant_id: invForm.variant_id || null, updated_at: new Date().toISOString() };
    if (editingInvId) await supabase.from('inventory').update(data).eq('id', editingInvId);
    else              await supabase.from('inventory').insert(data);
    setSavingInv(false);
    setShowInvModal(false);
    loadInventory();
  };
  const deleteInv = async (id: number) => {
    if (!confirm('確定要刪除此庫存記錄？')) return;
    await supabase.from('inventory').delete().eq('id', id);
    loadInventory();
  };

  // ── 同步：替缺庫存記錄的商品自動補建 ──────────────
  const [syncing, setSyncing] = useState(false);
  const syncInventory = async () => {
    setSyncing(true);
    // 抓所有上架商品 + 規格
    const { data: allProducts } = await supabase
      .from('products').select('id, is_preorder, stock_mode, product_variants(id, is_available)').eq('is_available', true);
    // 抓所有現有庫存
    const { data: allInv } = await supabase.from('inventory').select('product_id, variant_id');
    const invSet = new Set((allInv ?? []).map(i => `${i.product_id}_${i.variant_id ?? 'null'}`));

    let created = 0;
    for (const prod of (allProducts ?? [])) {
      // date_mode 商品使用 product_ship_dates 管理，不需建 inventory 記錄
      if ((prod as any).stock_mode === 'date_mode') continue;
      const mode = prod.is_preorder ? 'preorder' : 'stock';
      const variants = ((prod.product_variants ?? []) as any[]).filter(v => v.is_available);
      if (variants.length > 0) {
        for (const v of variants) {
          if (!invSet.has(`${prod.id}_${v.id}`)) {
            await supabase.from('inventory').insert({
              product_id: prod.id, variant_id: v.id,
              inventory_mode: mode, stock: 0, reserved: 0,
              safety_stock: 0, max_preorder: 0, reserved_preorder: 0,
            });
            created++;
          }
        }
      } else {
        if (!invSet.has(`${prod.id}_null`)) {
          await supabase.from('inventory').insert({
            product_id: prod.id, variant_id: null,
            inventory_mode: mode, stock: 0, reserved: 0,
            safety_stock: 0, max_preorder: 0, reserved_preorder: 0,
          });
          created++;
        }
      }
    }
    setSyncing(false);
    loadInventory();
    alert(created > 0 ? `已補建 ${created} 筆庫存記錄` : '所有商品都已有庫存記錄，無需同步');
  };

  // ── 原料 CRUD ─────────────────────────────────────
  const openAddIng  = () => { setIngForm({ name: '', category: '原料', unit: 'kg', stock: 0, safety_stock: 0, expiry_date: '', restocked_at: '', location: '', note: '' }); setEditingIngId(null); setShowIngModal(true); };
  const openEditIng = (ing: any) => {
    setIngForm({ name: ing.name, category: ing.category ?? '原料', unit: ing.unit ?? 'kg', stock: ing.stock, safety_stock: ing.safety_stock, expiry_date: ing.expiry_date ?? '', restocked_at: ing.restocked_at ?? '', location: ing.location ?? '', note: ing.note ?? '' });
    setEditingIngId(ing.id);
    setShowIngModal(true);
  };
  const saveIng = async () => {
    if (!ingForm.name) { alert('請填寫品項名稱'); return; }
    setSavingIng(true);
    const data = { ...ingForm, expiry_date: ingForm.expiry_date || null, restocked_at: ingForm.restocked_at || null, location: ingForm.location || null, note: ingForm.note || null };
    if (editingIngId) await supabase.from('ingredients').update(data).eq('id', editingIngId);
    else              await supabase.from('ingredients').insert(data);
    setSavingIng(false);
    setShowIngModal(false);
    loadIngredients();
  };
  const deleteIng = async (id: number) => { if (!confirm('確定要刪除？')) return; await supabase.from('ingredients').delete().eq('id', id); loadIngredients(); };

  // ── 原料盤點 ─────────────────────────────────────
  const openIngAudit = (ing: any) => {
    setAuditTarget(ing);
    setAuditActual(Number(ing.stock));
    setAuditChangeType('audit');
    setAuditReason('');
    setShowIngAuditModal(true);
  };

  const handleIngAudit = async () => {
    if (!auditTarget) return;
    if (!auditReason.trim()) { alert('請填寫調整原因'); return; }
    setSavingAudit(true);

    const qtyBefore = Number(auditTarget.stock);
    const qtyAfter  = auditActual;
    const qtyChange = qtyAfter - qtyBefore;

    await supabase.from('ingredients').update({ stock: qtyAfter }).eq('id', auditTarget.id);

    await supabase.from('ingredient_logs').insert({
      ingredient_id:   auditTarget.id,
      ingredient_name: auditTarget.name,
      change_type:     auditChangeType,
      qty_before:      qtyBefore,
      qty_after:       qtyAfter,
      qty_change:      qtyChange,
      reason:          auditReason,
      admin_id:        adminId || null,
      admin_name:      adminName || '管理員',
    });

    setSavingAudit(false);
    setShowIngAuditModal(false);
    loadIngredients();
  };

  // ── 原料異動記錄 ─────────────────────────────────
  const loadIngLogs = async () => {
    setIngLogsLoading(true);
    let q = supabase
      .from('ingredient_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (ingLogFilter.ingredient_id) q = q.eq('ingredient_id', ingLogFilter.ingredient_id);
    if (ingLogFilter.change_type)   q = q.eq('change_type', ingLogFilter.change_type);
    if (ingLogFilter.date_start)    q = q.gte('created_at', ingLogFilter.date_start);
    if (ingLogFilter.date_end)      q = q.lte('created_at', ingLogFilter.date_end + 'T23:59:59');
    const { data } = await q;
    setIngLogs(data ?? []);
    setIngLogsLoading(false);
  };

  const FeatureToggleBar = ({ enabled, onToggle, label, desc }: { enabled: boolean; onToggle: () => void; label: string; desc: string }) => (
    <div className={p.featureBar}>
      <div>
        <div className={p.featureBarLabel}>{label}</div>
        <div className={p.featureBarDesc}>{desc}</div>
      </div>
      <div className={p.featureBarRight}>
        <span className={p.featureBarStatus} style={{ color: enabled ? '#2ab85a' : 'var(--text-light)' }}>{enabled ? '啟用中' : '已停用'}</span>
        <Toggle val={enabled} onChange={onToggle} />
      </div>
    </div>
  );

  const DisabledPlaceholder = ({ label, desc, onEnable }: { label: string; desc: string; onEnable: () => void }) => (
    <div className={p.disabledPlaceholder}>
      <div className={p.placeholderIconWrap}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#B8B5B0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div className={p.disabledPlaceholderLabel}>{label}</div>
      <div className={p.disabledPlaceholderDesc}>{desc}</div>
      <button onClick={onEnable} className={s.btnPrimary}>啟用功能</button>
    </div>
  );

  return (
    <div>
      <h1 className={`${s.pageTitle} ${p.pageTitleMb}`}>庫存管理</h1>

      <div className={s.tabBar}>
        <div className={tab === 'product' ? s.tabActive : s.tab} onClick={() => setTab('product')}>商品庫存</div>
        <div className={tab === 'ingredient' ? s.tabActive : s.tab} onClick={() => setTab('ingredient')}>原料庫存 {!featureIngredient && <span className={p.tabDisabledHint}>(停用)</span>}</div>
        <div className={tab === 'capacity' ? s.tabActive : s.tab} onClick={() => setTab('capacity')}>產能管理 {!featureCapacity && <span className={p.tabDisabledHint}>(停用)</span>}</div>
        <div className={tab === 'logs' ? s.tabActive : s.tab} onClick={() => setTab('logs')}>異動記錄</div>
      </div>

      {/* ════ 商品庫存 ════ */}
      {tab === 'product' && (
        <>
          {/* 低庫存警示 */}
          {inventory.some(i => i.inventory_mode === 'stock' && (i.stock - i.reserved) <= i.safety_stock && i.safety_stock > 0) && (
            <div className={s.errorBar}>
              有商品庫存低於安全庫存，請盡快補貨。
            </div>
          )}

          {/* 統計卡片 */}
          <div className={s.statGrid}>
            {[
              { label: '商品種類',   value: inventory.length + (new Set(shipDateRows.map(d => d.product_id))).size },
              { label: '低庫存',     value: inventory.filter(i => i.inventory_mode === 'stock' && (i.stock - i.reserved) <= i.safety_stock && i.safety_stock > 0).length, color: '#b87a2a' },
              { label: '完售中',     value: inventory.filter(i => i.inventory_mode === 'stock' ? (i.stock - i.reserved) <= 0 : i.products?.is_sold_out).length, color: '#c0392b' },
              { label: '每日接單',   value: new Set(shipDateRows.map(d => d.product_id)).size },
            ].map(({ label, value, color }) => (
              <div key={label} className={s.statCard}>
                <div className={s.statLabel}>{label}</div>
                <div className={s.statValue} style={{ color: color ?? 'var(--text-dark)' }}>{value}</div>
              </div>
            ))}
          </div>

          <div className={`${s.flex} ${p.sectionHeader}`}>
            <div className={s.sectionTitle}>庫存總覽</div>
            <div className={`${s.flex} ${s.gap8}`}>
              <button onClick={syncInventory} disabled={syncing} className={s.btnOutline}>{syncing ? '同步中...' : '同步商品庫存'}</button>
              <button onClick={openAddInv} className={s.btnPrimary}>＋ 新增庫存</button>
            </div>
          </div>

          {invLoading ? <p className={s.loadingText}>載入中...</p> : (
            <div className={s.tableWrap}>
              {/* Desktop table */}
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.th}>商品名稱</th>
                    <th className={s.th}>規格</th>
                    <th className={s.th}>模式</th>
                    <th className={s.th}>出貨日</th>
                    <th className={s.thRight}>實體庫存</th>
                    <th className={s.thRight}>預留</th>
                    <th className={s.thRight}>可售</th>
                    <th className={s.thRight}>安全庫存</th>
                    <th className={s.th}>狀態</th>
                    <th className={s.th}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.length === 0 && shipDateRows.length === 0 ? (
                    <tr><td colSpan={10} className={s.emptyRow}>尚未設定庫存</td></tr>
                  ) : inventory.map(item => {
                    const isStock    = item.inventory_mode === 'stock';
                    const available  = isStock ? item.stock - item.reserved : item.max_preorder - item.reserved_preorder;
                    const isLow      = isStock && item.safety_stock > 0 && available <= item.safety_stock;
                    const isSoldOut  = isStock ? available <= 0 : item.products?.is_sold_out;
                    return (
                      <tr key={item.id} className={s.tr}>
                        <td className={s.td}>{item.products?.name ?? '—'}</td>
                        <td className={`${s.td} ${p.variantCol}`}>{item.product_variants?.name ?? '—'}</td>
                        <td className={s.td}>
                          <span className={isStock ? p.modeBadgeStock : p.modeBadgePreorder}>
                            {isStock ? '現貨' : '預購'}
                          </span>
                        </td>
                        <td className={s.td} style={{ color: 'var(--text-light)' }}>—</td>
                        <td className={`${s.td} ${p.tdRightBold}`}>{isStock ? item.stock : '—'}</td>
                        <td className={`${s.td} ${p.tdRightLight}`}>{isStock ? item.reserved : '—'}</td>
                        <td className={`${s.td} ${p.tdRightBold}`} style={{ color: isStock ? (available <= 0 ? '#c0392b' : isLow ? '#b87a2a' : '#2ab85a') : undefined }}>
                          {isStock ? available : '—'}
                        </td>
                        <td className={`${s.td} ${p.tdRightLight}`}>{isStock ? item.safety_stock : '—'}</td>
                        <td className={s.td}>
                          <span className={s.badge} style={{ color: isSoldOut ? '#c0392b' : '#2ab85a', border: `1px solid ${isSoldOut ? '#c0392b' : '#2ab85a'}` }}>
                            {isSoldOut ? '完售' : '販售中'}
                          </span>
                          {isLow && !isSoldOut && <span className={p.lowStockHint}>低庫存</span>}
                        </td>
                        <td className={s.td}>
                          <div className={p.actionRow}>
                            {isStock && <button onClick={() => openAdj(item, 'adjust')} className={p.btnActionPrimary}>調整庫存</button>}
                            {isStock && <button onClick={() => openAdj(item, 'audit')} className={p.btnActionSecondary}>盤點</button>}
                            <button onClick={() => openEditInv(item)} className={p.btnActionSecondary}>編輯</button>
                            <button onClick={() => deleteInv(item.id)} className={s.btnDanger}>刪除</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {/* 每日接單（date_mode）— 按商品分組，摘要列可展開 */}
                  {(() => {
                    // 按 product_id 分組
                    const grouped = new Map<number, any[]>();
                    shipDateRows.forEach(sd => {
                      const pid = sd.product_id;
                      if (!grouped.has(pid)) grouped.set(pid, []);
                      grouped.get(pid)!.push(sd);
                    });
                    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
                    return Array.from(grouped.entries()).map(([pid, dates]) => {
                      const sorted = [...dates].sort((a: any, b: any) => a.ship_date.localeCompare(b.ship_date));
                      const prodName = sorted[0]?.products?.name ?? '—';
                      const fmt = (d: string) => { const [, m, day] = d.split('-'); return `${parseInt(m)}/${parseInt(day)}`; };
                      const range = `${fmt(sorted[0].ship_date)} ~ ${fmt(sorted[sorted.length - 1].ship_date)}`;
                      // 最常見容量
                      const capC: Record<number, number> = {};
                      dates.forEach((d: any) => { capC[d.capacity] = (capC[d.capacity] ?? 0) + 1; });
                      const topCap = Object.entries(capC).sort((a, b) => b[1] - a[1])[0][0];
                      // 休息日
                      const daySpan = (new Date(sorted[sorted.length - 1].ship_date).getTime() - new Date(sorted[0].ship_date).getTime()) / 86400000;
                      let closedDaysStr = '';
                      if (daySpan >= 7) {
                        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
                        const present = new Set(dates.map((d: any) => new Date(d.ship_date + 'T12:00:00').getDay()));
                        const closed = [0,1,2,3,4,5,6].filter(d => !present.has(d));
                        if (closed.length > 0 && closed.length < 7) closedDaysStr = `週${closed.map(d => dayNames[d]).join('、')}休`;
                      }
                      // 截單時間
                      const ctC: Record<string, number> = {};
                      dates.forEach((d: any) => { const c = d.cutoff_time ?? '17:00'; ctC[c] = (ctC[c] ?? 0) + 1; });
                      const topCt = Object.entries(ctC).sort((a, b) => b[1] - a[1])[0][0];
                      const totalReserved = dates.reduce((s: number, d: any) => s + (d.reserved ?? 0), 0);
                      const isExpanded = expandedShipProducts.has(pid);

                      return (
                        <React.Fragment key={`sdg_${pid}`}>
                          {/* 摘要列 */}
                          <tr
                            className={s.tr}
                            style={{ cursor: 'pointer', background: '#faf8f5' }}
                            onClick={() => setExpandedShipProducts(prev => {
                              const next = new Set(prev);
                              if (next.has(pid)) next.delete(pid); else next.add(pid);
                              return next;
                            })}
                          >
                            <td className={s.td}>
                              <span style={{ marginRight: 6, display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', fontSize: 11, color: 'var(--text-light)' }}>&#9654;</span>
                              {prodName}
                            </td>
                            <td className={`${s.td} ${p.variantCol}`}>—</td>
                            <td className={s.td}>
                              <span className={p.modeBadgeStock} style={{ background: '#f0e6d3', color: '#8a6d3b' }}>每日</span>
                            </td>
                            <td className={s.td} colSpan={5} style={{ fontSize: '0.88em', color: 'var(--text-dark)' }}>
                              <span style={{ fontWeight: 600 }}>{range}</span>
                              <span style={{ margin: '0 6px', color: 'var(--text-light)' }}>/</span>
                              每日 {topCap} 份
                              {closedDaysStr && <><span style={{ margin: '0 6px', color: 'var(--text-light)' }}>/</span><span style={{ color: '#c0392b' }}>{closedDaysStr}</span></>}
                              <span style={{ margin: '0 6px', color: 'var(--text-light)' }}>/</span>
                              截單 {topCt}
                              {totalReserved > 0 && <span style={{ marginLeft: 8, color: '#b87a2a' }}>（已預約 {totalReserved}）</span>}
                            </td>
                            <td className={s.td}>
                              <span style={{ fontSize: '0.8em', color: 'var(--text-light)' }}>{dates.length} 天</span>
                            </td>
                          </tr>
                          {/* 展開後的個別日期行 */}
                          {isExpanded && sorted.map((sd: any) => {
                            const remaining = (sd.capacity ?? 0) - (sd.reserved ?? 0);
                            const isFull = remaining <= 0;
                            const isPast = sd.ship_date < today;
                            return (
                              <tr key={`sd_${sd.id}`} className={s.tr} style={{ opacity: isPast ? 0.5 : 1, background: '#fefdfb' }}>
                                <td className={s.td} style={{ paddingLeft: 32 }}>{sd.products?.name ?? '—'}</td>
                                <td className={`${s.td} ${p.variantCol}`}>—</td>
                                <td className={s.td}></td>
                                <td className={s.td} style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{sd.ship_date}</td>
                                <td className={`${s.td} ${p.tdRightBold}`}>{sd.capacity ?? 0}</td>
                                <td className={`${s.td} ${p.tdRightLight}`} style={{ color: sd.reserved > 0 ? '#b87a2a' : undefined }}>{sd.reserved ?? 0}</td>
                                <td className={`${s.td} ${p.tdRightBold}`} style={{ color: isFull ? '#c0392b' : '#2ab85a' }}>{remaining}</td>
                                <td className={`${s.td} ${p.tdRightLight}`}>—</td>
                                <td className={s.td}>
                                  <span className={s.badge} style={{ color: !sd.is_open ? 'var(--text-light)' : isFull ? '#c0392b' : '#2ab85a', border: `1px solid ${!sd.is_open ? 'var(--text-light)' : isFull ? '#c0392b' : '#2ab85a'}` }}>
                                    {!sd.is_open ? '已關閉' : isFull ? '已滿' : '開放'}
                                  </span>
                                </td>
                                <td className={s.td}>
                                  <div className={p.actionRow}>
                                    <button onClick={(e) => { e.stopPropagation(); updateShipDateField(sd.id, 'is_open', !sd.is_open); }} className={s.btnSmall} style={{ color: sd.is_open ? 'var(--text-light)' : '#2ab85a' }}>
                                      {sd.is_open ? '關閉' : '開放'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    });
                  })()}
                </tbody>
              </table>

              {/* Mobile card list */}
              <div className={s.cardList}>
                {inventory.length === 0 && shipDateRows.length === 0 ? (
                  <div className={s.emptyRow}>尚未設定庫存</div>
                ) : inventory.map(item => {
                  const isStock    = item.inventory_mode === 'stock';
                  const available  = isStock ? item.stock - item.reserved : item.max_preorder - item.reserved_preorder;
                  const isLow      = isStock && item.safety_stock > 0 && available <= item.safety_stock;
                  const isSoldOut  = item.products?.is_sold_out;
                  return (
                    <div key={item.id} className={s.card}>
                      <div className={s.cardRow}>
                        <span className={s.cardLabel}>商品</span>
                        <span className={s.cardValue}>{item.products?.name ?? '—'}</span>
                      </div>
                      <div className={s.cardRow}>
                        <span className={s.cardLabel}>模式</span>
                        <span className={isStock ? p.modeBadgeStock : p.modeBadgePreorder}>{isStock ? '現貨' : '預購'}</span>
                      </div>
                      <div className={s.cardRow}>
                        <span className={s.cardLabel}>庫存</span>
                        <span className={`${s.cardValue} ${p.cardValueBold}`}>{isStock ? item.stock : '—'}</span>
                      </div>
                      <div className={s.cardRow}>
                        <span className={s.cardLabel}>可售</span>
                        <span className={`${s.cardValue} ${p.cardValueBold}`} style={{ color: isStock ? (available <= 0 ? '#c0392b' : isLow ? '#b87a2a' : '#2ab85a') : undefined }}>
                          {isStock ? available : '—'}
                        </span>
                      </div>
                      <div className={s.cardRow}>
                        <span className={s.cardLabel}>狀態</span>
                        <span className={s.badge} style={{ color: isSoldOut ? '#c0392b' : '#2ab85a', border: `1px solid ${isSoldOut ? '#c0392b' : '#2ab85a'}` }}>
                          {isSoldOut ? '完售' : '販售中'}
                        </span>
                      </div>
                      <div className={s.cardActions}>
                        {isStock && <button onClick={() => openAdj(item, 'adjust')} className={p.btnActionPrimary}>調整</button>}
                        {isStock && <button onClick={() => openAdj(item, 'audit')} className={p.btnActionSecondary}>盤點</button>}
                        <button onClick={() => openEditInv(item)} className={p.btnActionSecondary}>編輯</button>
                        <button onClick={() => deleteInv(item.id)} className={s.btnDanger}>刪除</button>
                      </div>
                    </div>
                  );
                })}
                {/* 每日接單 mobile cards — 按商品分組 */}
                {(() => {
                  const grouped = new Map<number, any[]>();
                  shipDateRows.forEach(sd => {
                    const pid = sd.product_id;
                    if (!grouped.has(pid)) grouped.set(pid, []);
                    grouped.get(pid)!.push(sd);
                  });
                  return Array.from(grouped.entries()).map(([pid, dates]) => {
                    const sorted = [...dates].sort((a: any, b: any) => a.ship_date.localeCompare(b.ship_date));
                    const prodName = sorted[0]?.products?.name ?? '—';
                    const fmt = (d: string) => { const [, m, day] = d.split('-'); return `${parseInt(m)}/${parseInt(day)}`; };
                    const range = `${fmt(sorted[0].ship_date)} ~ ${fmt(sorted[sorted.length - 1].ship_date)}`;
                    const capC: Record<number, number> = {};
                    dates.forEach((d: any) => { capC[d.capacity] = (capC[d.capacity] ?? 0) + 1; });
                    const topCap = Object.entries(capC).sort((a, b) => b[1] - a[1])[0][0];
                    const totalReserved = dates.reduce((s: number, d: any) => s + (d.reserved ?? 0), 0);
                    const isExpanded = expandedShipProducts.has(pid);

                    return (
                      <React.Fragment key={`sdg_m_${pid}`}>
                        {/* 摘要卡片 */}
                        <div
                          className={s.card}
                          style={{ cursor: 'pointer', background: '#faf8f5' }}
                          onClick={() => setExpandedShipProducts(prev => {
                            const next = new Set(prev);
                            if (next.has(pid)) next.delete(pid); else next.add(pid);
                            return next;
                          })}
                        >
                          <div className={s.cardRow}>
                            <span className={s.cardLabel}>
                              <span style={{ marginRight: 6, display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', fontSize: 10 }}>&#9654;</span>
                              商品
                            </span>
                            <span className={s.cardValue}>{prodName}</span>
                          </div>
                          <div className={s.cardRow}>
                            <span className={s.cardLabel}>模式</span>
                            <span className={p.modeBadgeStock} style={{ background: '#f0e6d3', color: '#8a6d3b' }}>每日</span>
                          </div>
                          <div className={s.cardRow}>
                            <span className={s.cardLabel}>接單範圍</span>
                            <span className={s.cardValue}>{range}（{dates.length} 天）</span>
                          </div>
                          <div className={s.cardRow}>
                            <span className={s.cardLabel}>每日份數</span>
                            <span className={`${s.cardValue} ${p.cardValueBold}`}>{topCap} 份</span>
                          </div>
                          {totalReserved > 0 && (
                            <div className={s.cardRow}>
                              <span className={s.cardLabel}>總預約</span>
                              <span className={`${s.cardValue} ${p.cardValueBold}`} style={{ color: '#b87a2a' }}>{totalReserved}</span>
                            </div>
                          )}
                        </div>
                        {/* 展開後的個別日期卡片 */}
                        {isExpanded && sorted.map((sd: any) => {
                          const remaining = (sd.capacity ?? 0) - (sd.reserved ?? 0);
                          const isFull = remaining <= 0;
                          return (
                            <div key={`sd_m_${sd.id}`} className={s.card} style={{ marginLeft: 16, borderLeft: '3px solid #f0e6d3' }}>
                              <div className={s.cardRow}>
                                <span className={s.cardLabel}>出貨日</span>
                                <span className={s.cardValue} style={{ fontFamily: 'monospace' }}>{sd.ship_date}</span>
                              </div>
                              <div className={s.cardRow}>
                                <span className={s.cardLabel}>可接單 / 已預約</span>
                                <span className={`${s.cardValue} ${p.cardValueBold}`}>{sd.capacity ?? 0} / {sd.reserved ?? 0}</span>
                              </div>
                              <div className={s.cardRow}>
                                <span className={s.cardLabel}>剩餘</span>
                                <span className={`${s.cardValue} ${p.cardValueBold}`} style={{ color: isFull ? '#c0392b' : '#2ab85a' }}>{remaining}</span>
                              </div>
                              <div className={s.cardRow}>
                                <span className={s.cardLabel}>狀態</span>
                                <span className={s.badge} style={{ color: !sd.is_open ? 'var(--text-light)' : isFull ? '#c0392b' : '#2ab85a', border: `1px solid ${!sd.is_open ? 'var(--text-light)' : isFull ? '#c0392b' : '#2ab85a'}` }}>
                                  {!sd.is_open ? '已關閉' : isFull ? '已滿' : '開放'}
                                </span>
                              </div>
                              <div className={s.cardActions}>
                                <button onClick={(e) => { e.stopPropagation(); updateShipDateField(sd.id, 'is_open', !sd.is_open); }} className={s.btnSmall}>
                                  {sd.is_open ? '關閉' : '開放'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </React.Fragment>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </>
      )}

      {/* ════ 原料庫存 ════ */}
      {tab === 'ingredient' && (
        <div>
          <FeatureToggleBar enabled={featureIngredient} onToggle={() => toggleFeature('feature_ingredient', !featureIngredient)} label="原料 / 包材 / 耗材庫存" desc="啟用後可追蹤庫存量，低庫存自動警示" />
          {!featureIngredient ? (
            <DisabledPlaceholder label="原料庫存功能已停用" desc="開啟此功能可追蹤食材、包材、耗材庫存" onEnable={() => toggleFeature('feature_ingredient', true)} />
          ) : (
            <>
              {/* 低庫存警示 */}
              {ingredients.some(i => Number(i.stock) <= Number(i.safety_stock) && Number(i.safety_stock) > 0) && (
                <div className={s.errorBar}>
                  有品項庫存低於安全庫存，請盡快補貨。
                </div>
              )}

              {/* 搜尋 + 篩選 + 新增 */}
              <div className={s.filterRow}>
                <input value={ingSearch} onChange={e => setIngSearch(e.target.value)} placeholder="搜尋品項名稱..." className={s.searchInput} />
                <select value={ingCatFilter} onChange={e => setIngCatFilter(e.target.value)} className={s.filterSelect}>
                  <option value="">全部分類</option>
                  <option value="原料">原料</option>
                  <option value="包材">包材</option>
                  <option value="耗材">耗材</option>
                </select>
                <div className={s.mlAuto}>
                  <button onClick={openAddIng} className={s.btnPrimary}>＋ 新增品項</button>
                </div>
              </div>

              {ingLoading ? <p className={s.loadingText}>載入中...</p> : (
                <div className={s.tableWrap}>
                  {/* Desktop table */}
                  <table className={s.table}>
                    <thead><tr>
                      <th className={s.th}>品項名稱</th>
                      <th className={s.th}>分類</th>
                      <th className={s.th}>單位</th>
                      <th className={s.thRight}>現有庫存</th>
                      <th className={s.thRight}>安全庫存</th>
                      <th className={s.th}>狀態</th>
                      <th className={s.th}>最近進貨日</th>
                      <th className={s.th}>保存期限</th>
                      <th className={s.th}>儲放位置</th>
                      <th className={s.th}>操作</th>
                    </tr></thead>
                    <tbody>
                      {ingredients
                        .filter(i => (!ingSearch || i.name.includes(ingSearch)) && (!ingCatFilter || i.category === ingCatFilter))
                        .length === 0 ? (
                        <tr><td colSpan={10} className={s.emptyRow}>沒有符合條件的品項</td></tr>
                      ) : ingredients
                        .filter(i => (!ingSearch || i.name.includes(ingSearch)) && (!ingCatFilter || i.category === ingCatFilter))
                        .map(ing => {
                          const isLow = Number(ing.safety_stock) > 0 && Number(ing.stock) <= Number(ing.safety_stock);
                          const todayTW = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
                          const isExpired = ing.expiry_date && ing.expiry_date < todayTW;
                          return (
                            <tr key={ing.id} className={s.tr}>
                              <td className={`${s.td} ${isLow ? p.ingNameLow : ''}`}>{ing.name}</td>
                              <td className={s.td}>
                                <span className={p.ingCatBadge} style={{ background: ing.category === '原料' ? 'var(--surface)' : ing.category === '包材' ? '#e8f0fb' : '#fff8e1' }}>
                                  {ing.category ?? '原料'}
                                </span>
                              </td>
                              <td className={`${s.td} ${p.unitCol}`}>{ing.unit}</td>
                              <td className={`${s.td} ${p.tdRightBold}`}>
                                <span style={{ color: isLow ? '#c0392b' : 'var(--text-dark)' }}>{ing.stock}</span>
                              </td>
                              <td className={`${s.td} ${p.safetyStockCol}`}>{ing.safety_stock}</td>
                              <td className={s.td}>
                                <span className={s.badge} style={{ color: isLow ? '#c0392b' : '#2ab85a', border: `1px solid ${isLow ? '#c0392b' : '#2ab85a'}` }}>
                                  {isLow ? '庫存不足' : '正常'}
                                </span>
                              </td>
                              <td className={`${s.td} ${p.dateCol}`}>{ing.restocked_at ?? '—'}</td>
                              <td className={`${s.td} ${p.dateColMid}`} style={isExpired ? { color: '#c0392b' } : undefined}>{ing.expiry_date ?? '—'}{isExpired && ' 已過期'}</td>
                              <td className={`${s.td} ${p.locationCol}`}>{ing.location ?? '—'}</td>
                              <td className={s.td}>
                                <div className={p.actionRow}>
                                  <button onClick={() => openIngAudit(ing)} className={p.btnActionPrimary}>盤點</button>
                                  <button onClick={() => openEditIng(ing)} className={p.btnActionSecondary}>編輯</button>
                                  <button onClick={() => deleteIng(ing.id)} className={s.btnDanger}>刪除</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>

                  {/* Mobile card list */}
                  <div className={s.cardList}>
                    {ingredients
                      .filter(i => (!ingSearch || i.name.includes(ingSearch)) && (!ingCatFilter || i.category === ingCatFilter))
                      .length === 0 ? (
                      <div className={s.emptyRow}>沒有符合條件的品項</div>
                    ) : ingredients
                      .filter(i => (!ingSearch || i.name.includes(ingSearch)) && (!ingCatFilter || i.category === ingCatFilter))
                      .map(ing => {
                        const isLow = Number(ing.safety_stock) > 0 && Number(ing.stock) <= Number(ing.safety_stock);
                        return (
                          <div key={ing.id} className={s.card}>
                            <div className={s.cardRow}>
                              <span className={s.cardLabel}>品項</span>
                              <span className={`${s.cardValue} ${isLow ? p.ingNameLow : ''}`}>{ing.name}</span>
                            </div>
                            <div className={s.cardRow}>
                              <span className={s.cardLabel}>分類</span>
                              <span className={p.ingCatBadge} style={{ background: ing.category === '原料' ? 'var(--surface)' : ing.category === '包材' ? '#e8f0fb' : '#fff8e1' }}>{ing.category ?? '原料'}</span>
                            </div>
                            <div className={s.cardRow}>
                              <span className={s.cardLabel}>庫存</span>
                              <span className={`${s.cardValue} ${p.cardValueBold}`} style={{ color: isLow ? '#c0392b' : 'var(--text-dark)' }}>{ing.stock} {ing.unit}</span>
                            </div>
                            <div className={s.cardRow}>
                              <span className={s.cardLabel}>狀態</span>
                              <span className={s.badge} style={{ color: isLow ? '#c0392b' : '#2ab85a', border: `1px solid ${isLow ? '#c0392b' : '#2ab85a'}` }}>{isLow ? '庫存不足' : '正常'}</span>
                            </div>
                            <div className={s.cardActions}>
                              <button onClick={() => openIngAudit(ing)} className={p.btnActionPrimary}>盤點</button>
                              <button onClick={() => openEditIng(ing)} className={p.btnActionSecondary}>編輯</button>
                              <button onClick={() => deleteIng(ing.id)} className={s.btnDanger}>刪除</button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* 異動記錄 */}
              <div className={s.mt28}>
                <div className={`${s.flex} ${p.sectionHeader}`}>
                  <div className={s.sectionTitle}>異動記錄</div>
                  <button onClick={() => { setShowIngLogs(!showIngLogs); if (!showIngLogs) loadIngLogs(); }} className={s.btnSmall}>
                    {showIngLogs ? '收起' : '展開查看'}
                  </button>
                </div>
                {showIngLogs && (
                  <>
                    {/* 篩選 */}
                    <div className={`${s.filterRow} ${p.filterRowEnd}`}>
                      <select value={ingLogFilter.ingredient_id} onChange={e => setIngLogFilter(f => ({...f, ingredient_id: e.target.value}))} className={s.filterSelect}>
                        <option value="">全部品項</option>
                        {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                      <select value={ingLogFilter.change_type} onChange={e => setIngLogFilter(f => ({...f, change_type: e.target.value}))} className={s.filterSelect}>
                        <option value="">全部類型</option>
                        <option value="use">使用</option>
                        <option value="damage">損耗</option>
                        <option value="scrap">報廢</option>
                        <option value="purchase">進貨補登</option>
                        <option value="audit">盤點修正</option>
                        <option value="adjust">其他</option>
                      </select>
                      <AdminDatePicker value={ingLogFilter.date_start} onChange={val => setIngLogFilter(f => ({...f, date_start: val}))} className={s.input} />
                      <span className={p.dateSeparator}>～</span>
                      <AdminDatePicker value={ingLogFilter.date_end} onChange={val => setIngLogFilter(f => ({...f, date_end: val}))} className={s.input} />
                      <button onClick={loadIngLogs} className={s.btnPrimary}>查詢</button>
                    </div>
                    {ingLogsLoading ? <p className={s.loadingText}>載入中...</p> : (
                      <div className={s.tableWrap}>
                        <table className={s.table}>
                          <thead><tr>
                            <th className={s.th}>時間</th>
                            <th className={s.th}>品項</th>
                            <th className={s.th}>類型</th>
                            <th className={s.thRight}>調整前</th>
                            <th className={s.thRight}>變動量</th>
                            <th className={s.thRight}>調整後</th>
                            <th className={s.th}>原因</th>
                            <th className={s.th}>操作者</th>
                          </tr></thead>
                          <tbody>
                            {ingLogs.length === 0 ? (
                              <tr><td colSpan={8} className={s.emptyRow}>沒有符合條件的記錄</td></tr>
                            ) : ingLogs.map(logItem => {
                              const ING_TYPE_LABEL: Record<string, string> = { use: '使用', damage: '損耗', scrap: '報廢', purchase: '進貨補登', audit: '盤點修正', adjust: '其他' };
                              const ING_TYPE_COLOR: Record<string, string> = { use: '#888580', damage: '#c0392b', scrap: '#c0392b', purchase: '#2ab85a', audit: '#555250', adjust: '#b87a2a' };
                              return (
                                <tr key={logItem.id} className={s.tr}>
                                  <td className={`${s.td} ${p.logTimeCell}`}>{new Date(logItem.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</td>
                                  <td className={s.td}>{logItem.ingredient_name ?? '—'}</td>
                                  <td className={s.td}>
                                    <span className={s.badge} style={{ color: ING_TYPE_COLOR[logItem.change_type], border: `1px solid ${ING_TYPE_COLOR[logItem.change_type]}` }}>
                                      {ING_TYPE_LABEL[logItem.change_type] ?? logItem.change_type}
                                    </span>
                                  </td>
                                  <td className={`${s.td} ${p.logQtyBefore}`}>{logItem.qty_before}</td>
                                  <td className={`${s.td} ${p.logQtyChangeBold}`} style={{ color: Number(logItem.qty_change) >= 0 ? '#2ab85a' : '#c0392b' }}>
                                    {Number(logItem.qty_change) >= 0 ? `+${logItem.qty_change}` : logItem.qty_change}
                                  </td>
                                  <td className={`${s.td} ${p.logQtyAfter}`}>{logItem.qty_after}</td>
                                  <td className={`${s.td} ${p.logReasonCell}`}>{logItem.reason ?? '—'}</td>
                                  <td className={`${s.td} ${p.logAdminCell}`}>{logItem.admin_name ?? '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        <div className={s.cardList}>
                          {ingLogs.length === 0 ? (
                            <div className={s.emptyRow}>沒有符合條件的記錄</div>
                          ) : ingLogs.map(logItem => {
                            const ING_TYPE_LABEL: Record<string, string> = { use: '使用', damage: '損耗', scrap: '報廢', purchase: '進貨補登', audit: '盤點修正', adjust: '其他' };
                            const ING_TYPE_COLOR: Record<string, string> = { use: '#888580', damage: '#c0392b', scrap: '#c0392b', purchase: '#2ab85a', audit: '#555250', adjust: '#b87a2a' };
                            return (
                              <div key={logItem.id} className={s.card}>
                                <div className={s.cardRow}><span className={s.cardLabel}>時間</span><span className={`${s.cardValue} ${p.cardValueSm}`}>{new Date(logItem.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</span></div>
                                <div className={s.cardRow}><span className={s.cardLabel}>品項</span><span className={s.cardValue}>{logItem.ingredient_name ?? '—'}</span></div>
                                <div className={s.cardRow}><span className={s.cardLabel}>類型</span><span className={s.badge} style={{ color: ING_TYPE_COLOR[logItem.change_type], border: `1px solid ${ING_TYPE_COLOR[logItem.change_type]}` }}>{ING_TYPE_LABEL[logItem.change_type] ?? logItem.change_type}</span></div>
                                <div className={s.cardRow}><span className={s.cardLabel}>變動</span><span className={`${s.cardValue} ${p.cardChangeBold}`} style={{ color: Number(logItem.qty_change) >= 0 ? '#2ab85a' : '#c0392b' }}>{Number(logItem.qty_change) >= 0 ? `+${logItem.qty_change}` : logItem.qty_change}</span></div>
                                <div className={s.cardRow}><span className={s.cardLabel}>調整後</span><span className={`${s.cardValue} ${p.cardAfterBold}`}>{logItem.qty_after}</span></div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ════ 產能管理 ════ */}
      {tab === 'capacity' && (
        <div>
          <FeatureToggleBar enabled={featureCapacity} onToggle={() => toggleFeature('feature_capacity', !featureCapacity)} label="產能管理功能" desc="啟用後可查看訂單出貨排程，掌握每日製作量" />
          {!featureCapacity ? (
            <DisabledPlaceholder label="產能管理功能已停用" desc="開啟此功能可查看出貨排程，預估每日製作量" onEnable={() => toggleFeature('feature_capacity', true)} />
          ) : (
            <>
              {/* 今日產能 */}
              <div className={s.sectionTitle}>今日可售狀況</div>
              <div className={p.capacityGrid}>
                {inventory.filter(i => i.inventory_mode === 'stock').map(item => {
                  const available = item.stock - item.reserved;
                  const capacity  = item.stock;
                  const pct       = capacity > 0 ? Math.round((capacity - available) / capacity * 100) : 0;
                  return (
                    <div key={item.id} className={p.capacityCard}>
                      <div className={p.capacityCardLabel}>{item.products?.name}{item.product_variants?.name && ` · ${item.product_variants.name}`}</div>
                      <div className={p.capacityCardRow}>
                        <span className={p.capacityCardValue} style={{ color: available <= 0 ? '#c0392b' : 'var(--text-dark)' }}>{available}</span>
                        <span className={p.capacityCardSub}>/ {capacity} 件</span>
                      </div>
                      <div className={s.progressBar}>
                        <div className={s.progressFill} style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#c0392b' : pct >= 80 ? '#b87a2a' : '#2ab85a' }} />
                      </div>
                      <div className={p.capacityCardMeta}>已預留 {item.reserved} 件</div>
                    </div>
                  );
                })}
              </div>

              {/* 出貨排程 */}
              <div className={s.sectionTitle}>訂單出貨排程</div>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr>
                    <th className={s.th}>出貨日</th>
                    <th className={s.th}>各類需求</th>
                    <th className={s.thRight}>總件數</th>
                    <th className={s.th}>狀況</th>
                  </tr></thead>
                  <tbody>
                    {schedule.length === 0 ? (
                      <tr><td colSpan={4} className={s.emptyRow}>近期無出貨排程</td></tr>
                    ) : schedule.map(sched => (
                      <tr key={sched.date} className={s.tr}>
                        <td className={`${s.td} ${p.monoFont}`}>{sched.date}</td>
                        <td className={`${s.td} ${p.schedDetailText}`}>
                          {Object.entries(sched.byCategory).map(([cat, qty]: any) => <span key={cat} className={p.schedCatItem}>{cat} {qty} 件</span>)}
                        </td>
                        <td className={`${s.td} ${p.schedTotalBold}`}>{sched.total}</td>
                        <td className={s.td}>
                          <span className={`${s.badge} ${p.badgeNormal}`}>正常</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className={s.cardList}>
                  {schedule.length === 0 ? (
                    <div className={s.emptyRow}>近期無出貨排程</div>
                  ) : schedule.map(sched => (
                    <div key={sched.date} className={s.card}>
                      <div className={s.cardRow}><span className={s.cardLabel}>出貨日</span><span className={`${s.cardValue} ${p.monoFont}`}>{sched.date}</span></div>
                      <div className={s.cardRow}><span className={s.cardLabel}>總件數</span><span className={`${s.cardValue} ${p.cardAfterBold}`}>{sched.total}</span></div>
                      <div className={s.cardRow}><span className={s.cardLabel}>狀況</span><span className={`${s.badge} ${p.badgeNormal}`}>正常</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ════ 異動記錄 ════ */}
      {tab === 'logs' && (
        <div>
          {/* 篩選 */}
          <div className={p.filterPanel}>
            <div>
              <label className={s.label}>商品</label>
              <select value={logFilter.product_id} onChange={e => setLogFilter(f => ({...f, product_id: e.target.value}))} className={s.select}>
                <option value="">全部商品</option>
                {products.map(prod => <option key={prod.id} value={prod.id}>{prod.name}</option>)}
              </select>
            </div>
            <div>
              <label className={s.label}>異動類型</label>
              <select value={logFilter.change_type} onChange={e => setLogFilter(f => ({...f, change_type: e.target.value}))} className={s.select}>
                <option value="">全部類型</option>
                {Object.entries(CHANGE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={s.label}>開始日期</label>
              <AdminDatePicker value={logFilter.date_start} onChange={val => setLogFilter(f => ({...f, date_start: val}))} className={s.input} />
            </div>
            <div>
              <label className={s.label}>結束日期</label>
              <AdminDatePicker value={logFilter.date_end} onChange={val => setLogFilter(f => ({...f, date_end: val}))} className={s.input} />
            </div>
            <button onClick={loadLogs} className={s.btnPrimary}>查詢</button>
          </div>

          {logsLoading ? <p className={s.loadingText}>載入中...</p> : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead><tr>
                  <th className={s.th}>時間</th><th className={s.th}>商品</th>
                  <th className={s.th}>規格</th><th className={s.th}>類型</th>
                  <th className={s.thRight}>異動前</th><th className={s.thRight}>變動量</th><th className={s.thRight}>異動後</th>
                  <th className={s.th}>原因</th><th className={s.th}>操作者</th>
                </tr></thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={9} className={s.emptyRow}>沒有符合條件的記錄</td></tr>
                  ) : logs.map(logItem => (
                    <tr key={logItem.id} className={s.tr}>
                      <td className={`${s.td} ${p.logTimeCell}`}>{new Date(logItem.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</td>
                      <td className={s.td}>{logItem.products?.name ?? '—'}</td>
                      <td className={`${s.td} ${p.variantCol}`}>{logItem.product_variants?.name ?? '—'}</td>
                      <td className={s.td}>
                        <span className={s.badge} style={{ color: CHANGE_TYPE_COLOR[logItem.change_type], border: `1px solid ${CHANGE_TYPE_COLOR[logItem.change_type]}` }}>
                          {CHANGE_TYPE_LABEL[logItem.change_type] ?? logItem.change_type}
                        </span>
                      </td>
                      <td className={`${s.td} ${p.logQtyBefore}`}>{logItem.qty_before}</td>
                      <td className={`${s.td} ${p.logQtyChangeBold}`} style={{ color: logItem.qty_change >= 0 ? '#2ab85a' : '#c0392b' }}>
                        {logItem.qty_change >= 0 ? `+${logItem.qty_change}` : logItem.qty_change}
                      </td>
                      <td className={`${s.td} ${p.logQtyAfter}`}>{logItem.qty_after}</td>
                      <td className={`${s.td} ${p.logReasonCellWide}`}>{logItem.reason ?? '—'}</td>
                      <td className={`${s.td} ${p.logAdminCell}`}>{logItem.admin_name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className={s.cardList}>
                {logs.length === 0 ? (
                  <div className={s.emptyRow}>沒有符合條件的記錄</div>
                ) : logs.map(logItem => (
                  <div key={logItem.id} className={s.card}>
                    <div className={s.cardRow}><span className={s.cardLabel}>時間</span><span className={`${s.cardValue} ${p.cardValueSm}`}>{new Date(logItem.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</span></div>
                    <div className={s.cardRow}><span className={s.cardLabel}>商品</span><span className={s.cardValue}>{logItem.products?.name ?? '—'}</span></div>
                    <div className={s.cardRow}><span className={s.cardLabel}>類型</span><span className={s.badge} style={{ color: CHANGE_TYPE_COLOR[logItem.change_type], border: `1px solid ${CHANGE_TYPE_COLOR[logItem.change_type]}` }}>{CHANGE_TYPE_LABEL[logItem.change_type] ?? logItem.change_type}</span></div>
                    <div className={s.cardRow}><span className={s.cardLabel}>變動</span><span className={`${s.cardValue} ${p.cardChangeBold}`} style={{ color: logItem.qty_change >= 0 ? '#2ab85a' : '#c0392b' }}>{logItem.qty_change >= 0 ? `+${logItem.qty_change}` : logItem.qty_change}</span></div>
                    <div className={s.cardRow}><span className={s.cardLabel}>異動後</span><span className={`${s.cardValue} ${p.cardAfterBold}`}>{logItem.qty_after}</span></div>
                    <div className={s.cardRow}><span className={s.cardLabel}>原因</span><span className={`${s.cardValue} ${p.cardValueSm}`}>{logItem.reason ?? '—'}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════ 庫存調整 Modal ════ */}
      {showAdjModal && adjTarget && (
        <>
          <div onClick={() => setShowAdjModal(false)} className={s.modalOverlay} />
          <div className={`${s.modal} ${p.modal480}`}>
            <div className={s.modalHeader}>
              <span className={s.modalTitle}>
                {adjMode === 'audit' ? '盤點修正' : '調整庫存'}
              </span>
              <button onClick={() => setShowAdjModal(false)} className={s.modalClose}>×</button>
            </div>
            <div className={`${s.modalBody} ${p.modalBodyGrid}`}>
              <div className={p.adjInfoBar}>
                {adjTarget.products?.name}{adjTarget.product_variants?.name && ` · ${adjTarget.product_variants.name}`}
                <span className={p.adjInfoRight}>目前庫存：<strong>{adjTarget.stock}</strong> 件</span>
              </div>

              {adjMode === 'adjust' ? (
                <>
                  <div>
                    <label className={s.label}>異動類型</label>
                    <select value={adjType} onChange={e => setAdjType(e.target.value)} className={`${s.select} ${p.inputFull}`}>
                      {[['purchase','進貨'],['restock','補貨'],['damage','損耗'],['adjust','手動調整']].map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={s.label}>數量（正數 = 增加，負數 = 減少）</label>
                    <div className={p.qtyControlRow}>
                      <button onClick={() => setAdjQty(q => q - 1)} className={p.qtyBtn}>−</button>
                      <input type="number" value={numVal(adjQty)} onChange={numChange(setAdjQty)} className={`${s.input} ${p.qtyInputCenter}`} />
                      <button onClick={() => setAdjQty(q => q + 1)} className={p.qtyBtn}>+</button>
                      <span className={p.qtyResult}>
                        → 調整後：<strong style={{ color: adjQty >= 0 ? '#2ab85a' : '#c0392b' }}>{Math.max(0, adjTarget.stock + adjQty)}</strong> 件
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className={s.label}>盤點後實際數量</label>
                  <div className={p.qtyControlRow}>
                    <input type="number" value={numVal(adjAuditVal)} onChange={numChange(setAdjAuditVal)} className={`${s.input} ${p.auditInput100}`} />
                    <span className={p.qtyResult}>
                      差異：<strong style={{ color: adjAuditVal - adjTarget.stock >= 0 ? '#2ab85a' : '#c0392b' }}>
                        {adjAuditVal - adjTarget.stock >= 0 ? '+' : ''}{adjAuditVal - adjTarget.stock}
                      </strong> 件
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className={s.label}>原因 *</label>
                <input value={adjReason} onChange={e => setAdjReason(e.target.value)} placeholder={adjMode === 'audit' ? '盤點日期或備註' : '例：3/19 補貨、試作損耗'} className={`${s.input} ${p.inputFull}`} />
              </div>

              <div className={s.btnActions}>
                <button onClick={handleAdj} disabled={savingAdj} className={s.btnSave} style={{ opacity: savingAdj ? 0.6 : 1 }}>
                  {savingAdj ? '儲存中...' : '確認'}
                </button>
                <button onClick={() => setShowAdjModal(false)} className={s.btnCancel}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ════ 新增/編輯庫存 Modal ════ */}
      {showInvModal && (
        <>
          <div onClick={() => setShowInvModal(false)} className={s.modalOverlay} />
          <div className={`${s.modal} ${p.modal500}`}>
            <div className={s.modalHeader}>
              <span className={s.modalTitle}>{editingInvId ? '編輯庫存' : '新增庫存'}</span>
              <button onClick={() => setShowInvModal(false)} className={s.modalClose}>×</button>
            </div>
            <div className={`${s.modalBody} ${p.modalBodyGrid}`}>
              <div>
                <label className={s.label}>商品</label>
                <select value={invForm.product_id} onChange={e => setInvForm({...invForm, product_id: Number(e.target.value)})} className={`${s.select} ${p.inputFull}`}>
                  {products.map(prod => <option key={prod.id} value={prod.id}>{prod.name}</option>)}
                </select>
              </div>
              <div>
                <label className={s.label}>庫存模式</label>
                <div className={p.radioRow}>
                  {[['stock','現貨'],['preorder','預購']].map(([v, l]) => (
                    <label key={v} className={p.radioLabel}>
                      <input type="radio" value={v} checked={invForm.inventory_mode === v} onChange={() => setInvForm({...invForm, inventory_mode: v})} className={s.checkbox} />{l}
                    </label>
                  ))}
                </div>
              </div>

              {invForm.inventory_mode === 'stock' ? (
                <div className={s.grid2}>
                  <div><label className={s.label}>實體庫存</label><input type="number" value={numVal(invForm.stock)} onChange={e => setInvForm({...invForm, stock: e.target.value === "" ? 0 : Number(e.target.value)})} className={`${s.input} ${p.inputFull}`} /></div>
                  <div><label className={s.label}>安全庫存門檻</label><input type="number" value={numVal(invForm.safety_stock)} onChange={e => setInvForm({...invForm, safety_stock: e.target.value === "" ? 0 : Number(e.target.value)})} className={`${s.input} ${p.inputFull}`} /></div>
                </div>
              ) : (
                <div className={s.grid2}>
                  <div><label className={s.label}>預購上限（0 = 不限）</label><input type="number" value={numVal(invForm.max_preorder)} onChange={e => setInvForm({...invForm, max_preorder: e.target.value === "" ? 0 : Number(e.target.value)})} className={`${s.input} ${p.inputFull}`} /></div>
                  <div><label className={s.label}>已接單數（唯讀）</label><input type="number" value={invForm.reserved_preorder} disabled className={`${s.input} ${p.inputFull} ${p.inputDisabledHalf}`} /></div>
                </div>
              )}

              <div className={s.btnActions}>
                <button onClick={saveInv} disabled={savingInv} className={s.btnSave} style={{ opacity: savingInv ? 0.6 : 1 }}>
                  {savingInv ? '儲存中...' : '儲存'}
                </button>
                <button onClick={() => setShowInvModal(false)} className={s.btnCancel}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ════ 原料盤點 Modal ════ */}
      {showIngAuditModal && auditTarget && (
        <>
          <div onClick={() => setShowIngAuditModal(false)} className={s.modalOverlay} />
          <div className={`${s.modal} ${p.modal480}`}>
            <div className={s.modalHeader}>
              <span className={s.modalTitle}>盤點 — {auditTarget.name}</span>
              <button onClick={() => setShowIngAuditModal(false)} className={s.modalClose}>×</button>
            </div>
            <div className={`${s.modalBody} ${p.modalBodyGrid}`}>
              {/* 系統庫存 vs 實際 */}
              <div className={p.auditCompareGrid}>
                <div className={p.auditSystemBox}>
                  <div className={p.auditSystemLabel}>系統庫存</div>
                  <div className={p.auditSystemValue}>{auditTarget.stock} <span className={p.auditSystemUnit}>{auditTarget.unit}</span></div>
                </div>
                <div className={p.auditActualBox}>
                  <div className={p.auditSystemLabel}>實際盤點數量</div>
                  <div className={`${s.flex} ${p.flexCenterGap8}`}>
                    <input
                      type="number"
                      step="0.1"
                      value={numVal(auditActual)}
                      onChange={e => setAuditActual(e.target.value === '' ? 0 : Number(e.target.value))}
                      className={`${s.input} ${p.auditActualInput}`}
                    />
                    <span className={p.unitLabel}>{auditTarget.unit}</span>
                  </div>
                </div>
              </div>

              {/* 差異顯示 */}
              {auditActual !== Number(auditTarget.stock) && (
                <div className={Number(auditActual) - Number(auditTarget.stock) > 0 ? p.auditDiffPositive : p.auditDiffNegative}>
                  <div className={p.auditDiffLabel}>差異</div>
                  <div className={p.auditDiffValue} style={{ color: Number(auditActual) - Number(auditTarget.stock) > 0 ? '#2ab85a' : '#c0392b' }}>
                    {Number(auditActual) - Number(auditTarget.stock) > 0 ? '+' : ''}{(Number(auditActual) - Number(auditTarget.stock)).toFixed(1)} {auditTarget.unit}
                  </div>
                </div>
              )}

              {/* 調整原因（有差異才顯示）*/}
              {auditActual !== Number(auditTarget.stock) ? (
                <>
                  <div>
                    <label className={s.label}>調整原因 *</label>
                    <select value={auditChangeType} onChange={e => setAuditChangeType(e.target.value)} className={`${s.select} ${p.inputFull}`}>
                      <option value="audit">盤點修正</option>
                      <option value="use">使用</option>
                      <option value="damage">損耗</option>
                      <option value="scrap">報廢</option>
                      <option value="purchase">進貨補登</option>
                      <option value="adjust">其他</option>
                    </select>
                  </div>
                  <div>
                    <label className={s.label}>備註說明 *</label>
                    <input
                      value={auditReason}
                      onChange={e => setAuditReason(e.target.value)}
                      placeholder="例：定期盤點、試作消耗、進貨未登記"
                      className={`${s.input} ${p.inputFull}`}
                    />
                  </div>
                </>
              ) : (
                <div className={p.auditOkBanner}>
                  庫存數量與系統一致，無需調整
                </div>
              )}

              <div className={s.btnActions}>
                <button
                  onClick={handleIngAudit}
                  disabled={savingAudit || auditActual === Number(auditTarget.stock)}
                  className={s.btnSave}
                  style={{ opacity: (savingAudit || auditActual === Number(auditTarget.stock)) ? 0.4 : 1 }}
                >
                  {savingAudit ? '儲存中...' : '確認送出'}
                </button>
                <button onClick={() => setShowIngAuditModal(false)} className={s.btnCancel}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ════ 原料 Modal ════ */}
      {showIngModal && (
        <>
          <div onClick={() => setShowIngModal(false)} className={s.modalOverlay} />
          <div className={`${s.modal} ${p.modal520}`}>
            <div className={s.modalHeader}>
              <span className={s.modalTitle}>{editingIngId ? '編輯品項' : '新增品項'}</span>
              <button onClick={() => setShowIngModal(false)} className={s.modalClose}>×</button>
            </div>
            <div className={`${s.modalBody} ${p.modalBodyGrid}`}>
              {/* 名稱 + 分類 + 單位 */}
              <div>
                <label className={s.label}>品項名稱 *</label>
                <input value={ingForm.name} onChange={e => setIngForm({...ingForm, name: e.target.value})} placeholder="例：草莓、牛皮紙袋、一次性手套" className={`${s.input} ${p.inputFull}`} />
              </div>
              <div className={s.grid2}>
                <div>
                  <label className={s.label}>分類</label>
                  <select value={ingForm.category} onChange={e => setIngForm({...ingForm, category: e.target.value})} className={`${s.select} ${p.inputFull}`}>
                    <option value="原料">原料</option>
                    <option value="包材">包材</option>
                    <option value="耗材">耗材</option>
                  </select>
                </div>
                <div>
                  <label className={s.label}>單位</label>
                  <select value={ingForm.unit} onChange={e => setIngForm({...ingForm, unit: e.target.value})} className={`${s.select} ${p.inputFull}`}>
                    {['kg','g','L','ml','個','包','張','盒','瓶'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              {/* 庫存數量 */}
              <div className={s.grid2}>
                <div>
                  <label className={s.label}>現有庫存</label>
                  <input type="number" step="0.1" value={numVal(ingForm.stock)} onChange={e => setIngForm({...ingForm, stock: e.target.value === "" ? 0 : Number(e.target.value)})} className={`${s.input} ${p.inputFull}`} />
                </div>
                <div>
                  <label className={s.label}>安全庫存（低於此值警示）</label>
                  <input type="number" step="0.1" value={numVal(ingForm.safety_stock)} onChange={e => setIngForm({...ingForm, safety_stock: e.target.value === "" ? 0 : Number(e.target.value)})} className={`${s.input} ${p.inputFull}`} />
                </div>
              </div>
              {/* 日期 */}
              <div className={s.grid2}>
                <div>
                  <label className={s.label}>最近進貨日（選填）</label>
                  <AdminDatePicker value={ingForm.restocked_at} onChange={val => setIngForm({...ingForm, restocked_at: val})} className={`${s.input} ${p.inputFull}`} />
                </div>
                <div>
                  <label className={s.label}>保存期限（選填）</label>
                  <AdminDatePicker value={ingForm.expiry_date} onChange={val => setIngForm({...ingForm, expiry_date: val})} className={`${s.input} ${p.inputFull}`} />
                </div>
              </div>
              {/* 位置 + 備註 */}
              <div>
                <label className={s.label}>儲放位置（選填）</label>
                <input value={ingForm.location} onChange={e => setIngForm({...ingForm, location: e.target.value})} placeholder="例：冷藏區A、乾貨架2層" className={`${s.input} ${p.inputFull}`} />
              </div>
              <div>
                <label className={s.label}>備註（選填）</label>
                <input value={ingForm.note} onChange={e => setIngForm({...ingForm, note: e.target.value})} placeholder="進貨來源、注意事項等" className={`${s.input} ${p.inputFull}`} />
              </div>
              <div className={s.btnActions}>
                <button onClick={saveIng} disabled={savingIng} className={s.btnSave} style={{ opacity: savingIng ? 0.6 : 1 }}>{savingIng ? '儲存中...' : '儲存'}</button>
                <button onClick={() => setShowIngModal(false)} className={s.btnCancel}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
