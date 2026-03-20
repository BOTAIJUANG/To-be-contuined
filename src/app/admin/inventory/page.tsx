'use client';

// ════════════════════════════════════════════════
// app/admin/inventory/page.tsx  ──  庫存管理（完整版）
//
// 分頁：商品庫存 / 原料庫存 / 產能管理 / 異動記錄
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';

// ── 共用樣式 ─────────────────────────────────────
const thStyle: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC', whiteSpace: 'nowrap' };
const thRight: React.CSSProperties = { ...thStyle, textAlign: 'right' };
const inputStyle: React.CSSProperties = { padding: '9px 12px', border: '1px solid #E8E4DC', background: '#fff', fontFamily: 'inherit', fontSize: '13px', color: '#1E1C1A', outline: 'none' };
const labelStyle: React.CSSProperties = { fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', display: 'block', marginBottom: '6px' };
const sectionTitle: React.CSSProperties = { fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#555250', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif', marginBottom: '12px' };

// ── 數字 input helpers（避免前導 0）────────────────
const numVal = (v: number) => v === 0 ? '' : String(v);
const numChange = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
  set(e.target.value === '' ? 0 : Number(e.target.value));
};

const Toggle = ({ val, onChange }: { val: boolean; onChange: () => void }) => (
  <div onClick={onChange} style={{ width: '40px', height: '22px', borderRadius: '11px', background: val ? '#1E1C1A' : '#E8E4DC', position: 'relative', cursor: 'pointer', transition: 'background 0.3s', flexShrink: 0 }}>
    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: val ? '21px' : '3px', transition: 'left 0.3s' }} />
  </div>
);

const CHANGE_TYPE_LABEL: Record<string, string> = {
  purchase: '進貨', damage: '損耗', restock: '補貨',
  order: '接單預留', ship: '出貨扣庫存', cancel: '取消釋放',
  audit: '盤點修正', adjust: '手動調整',
};
const CHANGE_TYPE_COLOR: Record<string, string> = {
  purchase: '#2ab85a', damage: '#c0392b', restock: '#2ab85a',
  order: '#b87a2a', ship: '#2a7ab8', cancel: '#888580',
  audit: '#555250', adjust: '#b87a2a',
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
  const [auditActual,       setAuditActual]       = useState(0);    // 實際盤點數量
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
      .select('*, products(name, is_sold_out), product_variants(name)')
      .order('product_id');
    setInventory(data ?? []);
    setInvLoading(false);
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
    const today = new Date().toISOString().split('T')[0];
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

    // 更新庫存
    await supabase.from('ingredients').update({ stock: qtyAfter }).eq('id', auditTarget.id);

    // 寫入記錄
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

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '10px 20px', cursor: 'pointer', fontSize: '13px',
    borderBottom: tab === t ? '2px solid #1E1C1A' : '2px solid transparent',
    color: tab === t ? '#1E1C1A' : '#888580',
    fontFamily: '"Noto Sans TC", sans-serif', whiteSpace: 'nowrap',
  });

  const FeatureToggleBar = ({ enabled, onToggle, label, desc }: { enabled: boolean; onToggle: () => void; label: string; desc: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: '#fff', border: '1px solid #E8E4DC', marginBottom: '20px' }}>
      <div>
        <div style={{ fontSize: '13px', color: '#1E1C1A', marginBottom: '4px' }}>{label}</div>
        <div style={{ fontSize: '11px', color: '#888580' }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.2em', color: enabled ? '#2ab85a' : '#888580', textTransform: 'uppercase' }}>{enabled ? '啟用中' : '已停用'}</span>
        <Toggle val={enabled} onChange={onToggle} />
      </div>
    </div>
  );

  const DisabledPlaceholder = ({ icon, label, desc, onEnable }: { icon: string; label: string; desc: string; onEnable: () => void }) => (
    <div style={{ padding: '64px 0', textAlign: 'center', border: '1px solid #E8E4DC', background: '#fff' }}>
      <div style={{ fontSize: '32px', marginBottom: '16px' }}>{icon}</div>
      <div style={{ fontSize: '14px', color: '#888580', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: '#888580', marginBottom: '24px' }}>{desc}</div>
      <button onClick={onEnable} style={{ padding: '10px 28px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', cursor: 'pointer' }}>啟用功能</button>
    </div>
  );

  return (
    <div>
      <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: '0 0 24px' }}>庫存管理</h1>

      <div style={{ display: 'flex', borderBottom: '1px solid #E8E4DC', marginBottom: '24px' }}>
        <div style={tabStyle('product')}>    <span onClick={() => setTab('product')}>商品庫存</span></div>
        <div style={tabStyle('ingredient')} onClick={() => setTab('ingredient')}>原料庫存 {!featureIngredient && <span style={{ fontSize: '10px', color: '#888580' }}>(停用)</span>}</div>
        <div style={tabStyle('capacity')}   onClick={() => setTab('capacity')}>產能管理 {!featureCapacity && <span style={{ fontSize: '10px', color: '#888580' }}>(停用)</span>}</div>
        <div style={tabStyle('logs')}       onClick={() => setTab('logs')}>異動記錄</div>
      </div>

      {/* ════ 商品庫存 ════ */}
      {tab === 'product' && (
        <>
          {/* 低庫存警示 */}
          {inventory.some(i => i.inventory_mode === 'stock' && (i.stock - i.reserved) <= i.safety_stock && i.safety_stock > 0) && (
            <div style={{ background: '#fef0e8', border: '1px solid #e8a87c', padding: '12px 16px', marginBottom: '16px', fontSize: '12px', color: '#7a3c00' }}>
              ⚠️ 有商品庫存低於安全庫存，請盡快補貨。
            </div>
          )}

          {/* 統計卡片 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: '商品種類',   value: inventory.length },
              { label: '低庫存',     value: inventory.filter(i => i.inventory_mode === 'stock' && (i.stock - i.reserved) <= i.safety_stock && i.safety_stock > 0).length, color: '#b87a2a' },
              { label: '完售中',     value: inventory.filter(i => i.products?.is_sold_out).length, color: '#c0392b' },
              { label: '預購商品',   value: inventory.filter(i => i.inventory_mode === 'preorder').length },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '16px 20px' }}>
                <div style={{ fontSize: '10px', color: '#888580', letterSpacing: '0.2em', marginBottom: '8px', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: color ?? '#1E1C1A' }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={sectionTitle}>庫存總覽</div>
            <button onClick={openAddInv} style={{ padding: '7px 16px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 600, letterSpacing: '0.2em', cursor: 'pointer' }}>＋ 新增庫存</button>
          </div>

          {invLoading ? <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p> : (
            <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>商品名稱</th>
                    <th style={thStyle}>規格</th>
                    <th style={thStyle}>模式</th>
                    <th style={thRight}>實體庫存</th>
                    <th style={thRight}>預留</th>
                    <th style={thRight}>可售</th>
                    <th style={thRight}>安全庫存</th>
                    <th style={thStyle}>狀態</th>
                    <th style={thStyle}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>尚未設定庫存</td></tr>
                  ) : inventory.map(item => {
                    const isStock    = item.inventory_mode === 'stock';
                    const available  = isStock ? item.stock - item.reserved : item.max_preorder - item.reserved_preorder;
                    const isLow      = isStock && item.safety_stock > 0 && available <= item.safety_stock;
                    const isSoldOut  = item.products?.is_sold_out;
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid #E8E4DC' }}>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A' }}>{item.products?.name ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580' }}>{item.product_variants?.name ?? '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: isStock ? '#EDE9E2' : '#e8f0fb', color: isStock ? '#555250' : '#2a7ab8', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.1em' }}>
                            {isStock ? 'STOCK' : 'PREORDER'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A', textAlign: 'right', fontWeight: 600 }}>{isStock ? item.stock : item.reserved_preorder}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#888580', textAlign: 'right' }}>{isStock ? item.reserved : '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: available <= 0 ? '#c0392b' : isLow ? '#b87a2a' : '#2ab85a', textAlign: 'right' }}>
                          {isStock ? available : `${item.max_preorder === 0 ? '不限' : available}`}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#888580', textAlign: 'right' }}>{isStock ? item.safety_stock : '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: '11px', color: isSoldOut ? '#c0392b' : '#2ab85a', border: `1px solid ${isSoldOut ? '#c0392b' : '#2ab85a'}`, padding: '2px 8px', fontFamily: '"Montserrat", sans-serif' }}>
                            {isSoldOut ? '完售' : '販售中'}
                          </span>
                          {isLow && !isSoldOut && <span style={{ fontSize: '10px', color: '#b87a2a', display: 'block', marginTop: '3px' }}>⚠ 低庫存</span>}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
                            {isStock && <button onClick={() => openAdj(item, 'adjust')} style={{ padding: '5px 8px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#2ab85a', cursor: 'pointer', whiteSpace: 'nowrap' }}>調整庫存</button>}
                            {isStock && <button onClick={() => openAdj(item, 'audit')}  style={{ padding: '5px 8px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#888580', cursor: 'pointer' }}>盤點</button>}
                            <button onClick={() => openEditInv(item)} style={{ padding: '5px 8px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer' }}>編輯</button>
                            <button onClick={() => deleteInv(item.id)} style={{ padding: '5px 8px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#c0392b', cursor: 'pointer' }}>刪除</button>
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

      {/* ════ 原料庫存 ════ */}
      {tab === 'ingredient' && (
        <div>
          <FeatureToggleBar enabled={featureIngredient} onToggle={() => toggleFeature('feature_ingredient', !featureIngredient)} label="原料 / 包材 / 耗材庫存" desc="啟用後可追蹤庫存量，低庫存自動警示" />
          {!featureIngredient ? (
            <DisabledPlaceholder icon="🌾" label="原料庫存功能已停用" desc="開啟此功能可追蹤食材、包材、耗材庫存" onEnable={() => toggleFeature('feature_ingredient', true)} />
          ) : (
            <>
              {/* 低庫存警示 */}
              {ingredients.some(i => Number(i.stock) <= Number(i.safety_stock) && Number(i.safety_stock) > 0) && (
                <div style={{ background: '#fef0e8', border: '1px solid #e8a87c', padding: '12px 16px', marginBottom: '16px', fontSize: '12px', color: '#7a3c00' }}>
                  ⚠️ 有品項庫存低於安全庫存，請盡快補貨。
                </div>
              )}

              {/* 搜尋 + 篩選 + 新增 */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={ingSearch} onChange={e => setIngSearch(e.target.value)} placeholder="搜尋品項名稱..." style={{ ...inputStyle, minWidth: '200px' }} />
                <select value={ingCatFilter} onChange={e => setIngCatFilter(e.target.value)} style={inputStyle}>
                  <option value="">全部分類</option>
                  <option value="原料">原料</option>
                  <option value="包材">包材</option>
                  <option value="耗材">耗材</option>
                </select>
                <div style={{ marginLeft: 'auto' }}>
                  <button onClick={openAddIng} style={{ padding: '7px 16px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 600, letterSpacing: '0.2em', cursor: 'pointer' }}>＋ 新增品項</button>
                </div>
              </div>

              {ingLoading ? <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p> : (
                <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={thStyle}>品項名稱</th>
                      <th style={thStyle}>分類</th>
                      <th style={thStyle}>單位</th>
                      <th style={thRight}>現有庫存</th>
                      <th style={thRight}>安全庫存</th>
                      <th style={thStyle}>狀態</th>
                      <th style={thStyle}>最近進貨日</th>
                      <th style={thStyle}>保存期限</th>
                      <th style={thStyle}>儲放位置</th>
                      <th style={thStyle}>操作</th>
                    </tr></thead>
                    <tbody>
                      {ingredients
                        .filter(i => (!ingSearch || i.name.includes(ingSearch)) && (!ingCatFilter || i.category === ingCatFilter))
                        .length === 0 ? (
                        <tr><td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>沒有符合條件的品項</td></tr>
                      ) : ingredients
                        .filter(i => (!ingSearch || i.name.includes(ingSearch)) && (!ingCatFilter || i.category === ingCatFilter))
                        .map(ing => {
                          const isLow     = Number(ing.safety_stock) > 0 && Number(ing.stock) <= Number(ing.safety_stock);
                          const isExpired = ing.expiry_date && new Date(ing.expiry_date) < new Date();
                          return (
                            <tr key={ing.id} style={{ borderBottom: '1px solid #E8E4DC' }}>
                              <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A', fontWeight: isLow ? 600 : 400 }}>{ing.name}</td>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{ fontSize: '11px', padding: '2px 8px', background: ing.category === '原料' ? '#EDE9E2' : ing.category === '包材' ? '#e8f0fb' : '#fff8e1', color: '#555250', fontFamily: '"Montserrat", sans-serif' }}>
                                  {ing.category ?? '原料'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580' }}>{ing.unit}</td>
                              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: isLow ? '#c0392b' : '#1E1C1A' }}>{ing.stock}</span>
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580', textAlign: 'right' }}>{ing.safety_stock}</td>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{ fontSize: '11px', color: isLow ? '#c0392b' : '#2ab85a', border: `1px solid ${isLow ? '#c0392b' : '#2ab85a'}`, padding: '2px 8px', fontFamily: '"Montserrat", sans-serif' }}>
                                  {isLow ? '庫存不足' : '正常'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580' }}>{ing.restocked_at ?? '—'}</td>
                              <td style={{ padding: '12px 16px', fontSize: '12px', color: isExpired ? '#c0392b' : '#555250' }}>{ing.expiry_date ?? '—'}{isExpired && ' ⚠️'}</td>
                              <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580' }}>{ing.location ?? '—'}</td>
                              <td style={{ padding: '12px 16px', display: 'flex', gap: '6px' }}>
                                <button onClick={() => openIngAudit(ing)} style={{ padding: '5px 8px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#2ab85a', cursor: 'pointer', whiteSpace: 'nowrap' }}>盤點</button>
                                <button onClick={() => openEditIng(ing)} style={{ padding: '5px 8px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer' }}>編輯</button>
                                <button onClick={() => deleteIng(ing.id)} style={{ padding: '5px 8px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#c0392b', cursor: 'pointer' }}>刪除</button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 異動記錄 */}
              <div style={{ marginTop: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={sectionTitle}>異動記錄</div>
                  <button onClick={() => { setShowIngLogs(!showIngLogs); if (!showIngLogs) loadIngLogs(); }} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer', fontFamily: '"Montserrat", sans-serif' }}>
                    {showIngLogs ? '收起' : '展開查看'}
                  </button>
                </div>
                {showIngLogs && (
                  <>
                    {/* 篩選 */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <select value={ingLogFilter.ingredient_id} onChange={e => setIngLogFilter(f => ({...f, ingredient_id: e.target.value}))} style={inputStyle}>
                        <option value="">全部品項</option>
                        {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                      <select value={ingLogFilter.change_type} onChange={e => setIngLogFilter(f => ({...f, change_type: e.target.value}))} style={inputStyle}>
                        <option value="">全部類型</option>
                        <option value="use">使用</option>
                        <option value="damage">損耗</option>
                        <option value="scrap">報廢</option>
                        <option value="purchase">進貨補登</option>
                        <option value="audit">盤點修正</option>
                        <option value="adjust">其他</option>
                      </select>
                      <input type="date" value={ingLogFilter.date_start} onChange={e => setIngLogFilter(f => ({...f, date_start: e.target.value}))} style={inputStyle} />
                      <span style={{ color: '#888580', alignSelf: 'center' }}>～</span>
                      <input type="date" value={ingLogFilter.date_end} onChange={e => setIngLogFilter(f => ({...f, date_end: e.target.value}))} style={inputStyle} />
                      <button onClick={loadIngLogs} style={{ padding: '9px 16px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>查詢</button>
                    </div>
                    {ingLogsLoading ? <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p> : (
                      <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead><tr>
                            <th style={thStyle}>時間</th>
                            <th style={thStyle}>品項</th>
                            <th style={thStyle}>類型</th>
                            <th style={thRight}>調整前</th>
                            <th style={thRight}>變動量</th>
                            <th style={thRight}>調整後</th>
                            <th style={thStyle}>原因</th>
                            <th style={thStyle}>操作者</th>
                          </tr></thead>
                          <tbody>
                            {ingLogs.length === 0 ? (
                              <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>沒有符合條件的記錄</td></tr>
                            ) : ingLogs.map(log => {
                              const ING_TYPE_LABEL: Record<string, string> = { use: '使用', damage: '損耗', scrap: '報廢', purchase: '進貨補登', audit: '盤點修正', adjust: '其他' };
                              const ING_TYPE_COLOR: Record<string, string> = { use: '#888580', damage: '#c0392b', scrap: '#c0392b', purchase: '#2ab85a', audit: '#555250', adjust: '#b87a2a' };
                              return (
                                <tr key={log.id} style={{ borderBottom: '1px solid #E8E4DC' }}>
                                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString('zh-TW')}</td>
                                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A' }}>{log.ingredient_name ?? '—'}</td>
                                  <td style={{ padding: '12px 16px' }}>
                                    <span style={{ fontSize: '11px', color: ING_TYPE_COLOR[log.change_type], border: `1px solid ${ING_TYPE_COLOR[log.change_type]}`, padding: '2px 8px', fontFamily: '"Montserrat", sans-serif', whiteSpace: 'nowrap' }}>
                                      {ING_TYPE_LABEL[log.change_type] ?? log.change_type}
                                    </span>
                                  </td>
                                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#888580', textAlign: 'right' }}>{log.qty_before}</td>
                                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: Number(log.qty_change) >= 0 ? '#2ab85a' : '#c0392b', textAlign: 'right' }}>
                                    {Number(log.qty_change) >= 0 ? `+${log.qty_change}` : log.qty_change}
                                  </td>
                                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A', textAlign: 'right', fontWeight: 600 }}>{log.qty_after}</td>
                                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250' }}>{log.reason ?? '—'}</td>
                                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580' }}>{log.admin_name ?? '—'}</td>
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
            </>
          )}
        </div>
      )}

      {/* ════ 產能管理 ════ */}
      {tab === 'capacity' && (
        <div>
          <FeatureToggleBar enabled={featureCapacity} onToggle={() => toggleFeature('feature_capacity', !featureCapacity)} label="產能管理功能" desc="啟用後可查看訂單出貨排程，掌握每日製作量" />
          {!featureCapacity ? (
            <DisabledPlaceholder icon="📅" label="產能管理功能已停用" desc="開啟此功能可查看出貨排程，預估每日製作量" onEnable={() => toggleFeature('feature_capacity', true)} />
          ) : (
            <>
              {/* 今日產能 */}
              <div style={sectionTitle}>今日可售狀況</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '28px' }}>
                {inventory.filter(i => i.inventory_mode === 'stock').map(item => {
                  const available = item.stock - item.reserved;
                  const capacity  = item.stock;
                  const pct       = capacity > 0 ? Math.round((capacity - available) / capacity * 100) : 0;
                  return (
                    <div key={item.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '16px 20px' }}>
                      <div style={{ fontSize: '12px', color: '#888580', marginBottom: '4px' }}>{item.products?.name}{item.product_variants?.name && ` · ${item.product_variants.name}`}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '20px', fontWeight: 700, color: available <= 0 ? '#c0392b' : '#1E1C1A' }}>{available}</span>
                        <span style={{ fontSize: '12px', color: '#888580', alignSelf: 'flex-end' }}>/ {capacity} 件</span>
                      </div>
                      <div style={{ height: '4px', background: '#E8E4DC', borderRadius: '2px' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#c0392b' : pct >= 80 ? '#b87a2a' : '#2ab85a', borderRadius: '2px' }} />
                      </div>
                      <div style={{ fontSize: '10px', color: '#888580', marginTop: '6px' }}>已預留 {item.reserved} 件</div>
                    </div>
                  );
                })}
              </div>

              {/* 出貨排程 */}
              <div style={sectionTitle}>訂單出貨排程</div>
              <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={thStyle}>出貨日</th>
                    <th style={thStyle}>各類需求</th>
                    <th style={thRight}>總件數</th>
                    <th style={thStyle}>狀況</th>
                  </tr></thead>
                  <tbody>
                    {schedule.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>近期無出貨排程</td></tr>
                    ) : schedule.map(s => (
                      <tr key={s.date} style={{ borderBottom: '1px solid #E8E4DC' }}>
                        <td style={{ padding: '12px 16px', fontFamily: '"Montserrat", sans-serif', fontSize: '13px', color: '#1E1C1A' }}>{s.date}</td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250' }}>
                          {Object.entries(s.byCategory).map(([cat, qty]: any) => <span key={cat} style={{ marginRight: '12px' }}>{cat} {qty} 件</span>)}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1E1C1A', textAlign: 'right' }}>{s.total}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: '11px', color: '#2ab85a', border: '1px solid #2ab85a', padding: '2px 8px', fontFamily: '"Montserrat", sans-serif' }}>正常</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ════ 異動記錄 ════ */}
      {tab === 'logs' && (
        <div>
          {/* 篩選 */}
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={labelStyle}>商品</label>
              <select value={logFilter.product_id} onChange={e => setLogFilter(f => ({...f, product_id: e.target.value}))} style={{ ...inputStyle }}>
                <option value="">全部商品</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>異動類型</label>
              <select value={logFilter.change_type} onChange={e => setLogFilter(f => ({...f, change_type: e.target.value}))} style={{ ...inputStyle }}>
                <option value="">全部類型</option>
                {Object.entries(CHANGE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>開始日期</label>
              <input type="date" value={logFilter.date_start} onChange={e => setLogFilter(f => ({...f, date_start: e.target.value}))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>結束日期</label>
              <input type="date" value={logFilter.date_end} onChange={e => setLogFilter(f => ({...f, date_end: e.target.value}))} style={inputStyle} />
            </div>
            <button onClick={loadLogs} style={{ padding: '9px 20px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.15em', cursor: 'pointer' }}>查詢</button>
          </div>

          {logsLoading ? <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p> : (
            <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={thStyle}>時間</th><th style={thStyle}>商品</th>
                  <th style={thStyle}>規格</th><th style={thStyle}>類型</th>
                  <th style={thRight}>異動前</th><th style={thRight}>變動量</th><th style={thRight}>異動後</th>
                  <th style={thStyle}>原因</th><th style={thStyle}>操作者</th>
                </tr></thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>沒有符合條件的記錄</td></tr>
                  ) : logs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #E8E4DC' }}>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString('zh-TW')}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A' }}>{log.products?.name ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580' }}>{log.product_variants?.name ?? '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '11px', color: CHANGE_TYPE_COLOR[log.change_type], border: `1px solid ${CHANGE_TYPE_COLOR[log.change_type]}`, padding: '2px 8px', fontFamily: '"Montserrat", sans-serif', whiteSpace: 'nowrap' }}>
                          {CHANGE_TYPE_LABEL[log.change_type] ?? log.change_type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#888580', textAlign: 'right' }}>{log.qty_before}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: log.qty_change >= 0 ? '#2ab85a' : '#c0392b', textAlign: 'right' }}>
                        {log.qty_change >= 0 ? `+${log.qty_change}` : log.qty_change}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A', textAlign: 'right', fontWeight: 600 }}>{log.qty_after}</td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: '#555250', maxWidth: '160px' }}>{log.reason ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580' }}>{log.admin_name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════ 庫存調整 Modal ════ */}
      {showAdjModal && adjTarget && (
        <>
          <div onClick={() => setShowAdjModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '480px', maxWidth: '90vw', zIndex: 201 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '15px', color: '#1E1C1A' }}>
                {adjMode === 'audit' ? '盤點修正' : '調整庫存'}
              </span>
              <button onClick={() => setShowAdjModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888580' }}>×</button>
            </div>
            <div style={{ padding: '24px', display: 'grid', gap: '16px' }}>
              <div style={{ background: '#EDE9E2', padding: '12px 16px', fontSize: '13px', color: '#555250' }}>
                {adjTarget.products?.name}{adjTarget.product_variants?.name && ` · ${adjTarget.product_variants.name}`}
                <span style={{ float: 'right' }}>目前庫存：<strong>{adjTarget.stock}</strong> 件</span>
              </div>

              {adjMode === 'adjust' ? (
                <>
                  <div>
                    <label style={labelStyle}>異動類型</label>
                    <select value={adjType} onChange={e => setAdjType(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                      {[['purchase','進貨'],['restock','補貨'],['damage','損耗'],['adjust','手動調整']].map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>數量（正數 = 增加，負數 = 減少）</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button onClick={() => setAdjQty(q => q - 1)} style={{ width: '36px', height: '36px', border: '1px solid #E8E4DC', background: 'transparent', fontSize: '18px', cursor: 'pointer' }}>−</button>
                      <input type="number" value={numVal(adjQty)} onChange={numChange(setAdjQty)} style={{ ...inputStyle, width: '80px', textAlign: 'center' }} />
                      <button onClick={() => setAdjQty(q => q + 1)} style={{ width: '36px', height: '36px', border: '1px solid #E8E4DC', background: 'transparent', fontSize: '18px', cursor: 'pointer' }}>+</button>
                      <span style={{ fontSize: '12px', color: '#888580' }}>
                        → 調整後：<strong style={{ color: adjQty >= 0 ? '#2ab85a' : '#c0392b' }}>{Math.max(0, adjTarget.stock + adjQty)}</strong> 件
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label style={labelStyle}>盤點後實際數量</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input type="number" value={numVal(adjAuditVal)} onChange={numChange(setAdjAuditVal)} style={{ ...inputStyle, width: '100px' }} />
                    <span style={{ fontSize: '12px', color: '#888580' }}>
                      差異：<strong style={{ color: adjAuditVal - adjTarget.stock >= 0 ? '#2ab85a' : '#c0392b' }}>
                        {adjAuditVal - adjTarget.stock >= 0 ? '+' : ''}{adjAuditVal - adjTarget.stock}
                      </strong> 件
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>原因 *</label>
                <input value={adjReason} onChange={e => setAdjReason(e.target.value)} placeholder={adjMode === 'audit' ? '盤點日期或備註' : '例：3/19 補貨、試作損耗'} style={{ ...inputStyle, width: '100%' }} />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={handleAdj} disabled={savingAdj} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: savingAdj ? 0.6 : 1 }}>
                  {savingAdj ? '儲存中...' : '確認'}
                </button>
                <button onClick={() => setShowAdjModal(false)} style={{ padding: '10px 32px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ════ 新增/編輯庫存 Modal ════ */}
      {showInvModal && (
        <>
          <div onClick={() => setShowInvModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '500px', maxWidth: '90vw', zIndex: 201, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '15px', color: '#1E1C1A' }}>{editingInvId ? '編輯庫存' : '新增庫存'}</span>
              <button onClick={() => setShowInvModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888580' }}>×</button>
            </div>
            <div style={{ padding: '24px', display: 'grid', gap: '16px' }}>
              <div>
                <label style={labelStyle}>商品</label>
                <select value={invForm.product_id} onChange={e => setInvForm({...invForm, product_id: Number(e.target.value)})} style={{ ...inputStyle, width: '100%' }}>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>庫存模式</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                  {[['stock','現貨'],['preorder','預購']].map(([v, l]) => (
                    <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                      <input type="radio" value={v} checked={invForm.inventory_mode === v} onChange={() => setInvForm({...invForm, inventory_mode: v})} style={{ accentColor: '#1E1C1A' }} />{l}
                    </label>
                  ))}
                </div>
              </div>

              {invForm.inventory_mode === 'stock' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div><label style={labelStyle}>實體庫存</label><input type="number" value={numVal(invForm.stock)} onChange={e => setInvForm({...invForm, stock: e.target.value === "" ? 0 : Number(e.target.value)})} style={{...inputStyle, width:'100%'}} /></div>
                  <div><label style={labelStyle}>安全庫存門檻</label><input type="number" value={numVal(invForm.safety_stock)} onChange={e => setInvForm({...invForm, safety_stock: e.target.value === "" ? 0 : Number(e.target.value)})} style={{...inputStyle, width:'100%'}} /></div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div><label style={labelStyle}>預購上限（0 = 不限）</label><input type="number" value={numVal(invForm.max_preorder)} onChange={e => setInvForm({...invForm, max_preorder: e.target.value === "" ? 0 : Number(e.target.value)})} style={{...inputStyle, width:'100%'}} /></div>
                  <div><label style={labelStyle}>已接單數（唯讀）</label><input type="number" value={invForm.reserved_preorder} disabled style={{...inputStyle, width:'100%', opacity: 0.5}} /></div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={saveInv} disabled={savingInv} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: savingInv ? 0.6 : 1 }}>
                  {savingInv ? '儲存中...' : '儲存'}
                </button>
                <button onClick={() => setShowInvModal(false)} style={{ padding: '10px 32px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ════ 原料盤點 Modal ════ */}
      {showIngAuditModal && auditTarget && (
        <>
          <div onClick={() => setShowIngAuditModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '480px', maxWidth: '90vw', zIndex: 201 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '15px', color: '#1E1C1A' }}>盤點 — {auditTarget.name}</span>
              <button onClick={() => setShowIngAuditModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888580' }}>×</button>
            </div>
            <div style={{ padding: '24px', display: 'grid', gap: '16px' }}>
              {/* 系統庫存 vs 實際 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#EDE9E2', padding: '14px 16px' }}>
                  <div style={{ fontSize: '10px', color: '#888580', letterSpacing: '0.2em', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase', marginBottom: '8px' }}>系統庫存</div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#1E1C1A' }}>{auditTarget.stock} <span style={{ fontSize: '12px', fontWeight: 400 }}>{auditTarget.unit}</span></div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '14px 16px' }}>
                  <div style={{ fontSize: '10px', color: '#888580', letterSpacing: '0.2em', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase', marginBottom: '8px' }}>實際盤點數量</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="number"
                      step="0.1"
                      value={numVal(auditActual)}
                      onChange={e => setAuditActual(e.target.value === '' ? 0 : Number(e.target.value))}
                      style={{ ...inputStyle, width: '90px', fontSize: '18px', fontWeight: 600, padding: '6px 8px' }}
                    />
                    <span style={{ fontSize: '12px', color: '#888580' }}>{auditTarget.unit}</span>
                  </div>
                </div>
              </div>

              {/* 差異顯示 */}
              {auditActual !== Number(auditTarget.stock) && (
                <div style={{ padding: '12px 16px', background: Number(auditActual) - Number(auditTarget.stock) > 0 ? '#f0faf4' : '#fef0f0', border: `1px solid ${Number(auditActual) - Number(auditTarget.stock) > 0 ? '#b2dfdb' : '#f5c6c6'}` }}>
                  <div style={{ fontSize: '12px', color: '#555250', marginBottom: '4px' }}>差異</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: Number(auditActual) - Number(auditTarget.stock) > 0 ? '#2ab85a' : '#c0392b' }}>
                    {Number(auditActual) - Number(auditTarget.stock) > 0 ? '+' : ''}{(Number(auditActual) - Number(auditTarget.stock)).toFixed(1)} {auditTarget.unit}
                  </div>
                </div>
              )}

              {/* 調整原因（有差異才顯示）*/}
              {auditActual !== Number(auditTarget.stock) ? (
                <>
                  <div>
                    <label style={labelStyle}>調整原因 *</label>
                    <select value={auditChangeType} onChange={e => setAuditChangeType(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                      <option value="audit">盤點修正</option>
                      <option value="use">使用</option>
                      <option value="damage">損耗</option>
                      <option value="scrap">報廢</option>
                      <option value="purchase">進貨補登</option>
                      <option value="adjust">其他</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>備註說明 *</label>
                    <input
                      value={auditReason}
                      onChange={e => setAuditReason(e.target.value)}
                      placeholder="例：定期盤點、試作消耗、進貨未登記"
                      style={{ ...inputStyle, width: '100%' }}
                    />
                  </div>
                </>
              ) : (
                <div style={{ padding: '12px 16px', background: '#f0faf4', border: '1px solid #b2dfdb', fontSize: '13px', color: '#2ab85a', textAlign: 'center' }}>
                  ✓ 庫存數量與系統一致，無需調整
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={handleIngAudit}
                  disabled={savingAudit || auditActual === Number(auditTarget.stock)}
                  style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: (savingAudit || auditActual === Number(auditTarget.stock)) ? 0.4 : 1 }}
                >
                  {savingAudit ? '儲存中...' : '確認送出'}
                </button>
                <button onClick={() => setShowIngAuditModal(false)} style={{ padding: '10px 32px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ════ 原料 Modal ════ */}
      {showIngModal && (
        <>
          <div onClick={() => setShowIngModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '520px', maxWidth: '90vw', zIndex: 201, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '15px', color: '#1E1C1A' }}>{editingIngId ? '編輯品項' : '新增品項'}</span>
              <button onClick={() => setShowIngModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888580' }}>×</button>
            </div>
            <div style={{ padding: '24px', display: 'grid', gap: '16px' }}>
              {/* 名稱 + 分類 + 單位 */}
              <div>
                <label style={labelStyle}>品項名稱 *</label>
                <input value={ingForm.name} onChange={e => setIngForm({...ingForm, name: e.target.value})} placeholder="例：草莓、牛皮紙袋、一次性手套" style={{...inputStyle, width:'100%'}} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>分類</label>
                  <select value={ingForm.category} onChange={e => setIngForm({...ingForm, category: e.target.value})} style={{...inputStyle, width:'100%'}}>
                    <option value="原料">原料</option>
                    <option value="包材">包材</option>
                    <option value="耗材">耗材</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>單位</label>
                  <select value={ingForm.unit} onChange={e => setIngForm({...ingForm, unit: e.target.value})} style={{...inputStyle, width:'100%'}}>
                    {['kg','g','L','ml','個','包','張','盒','瓶'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              {/* 庫存數量 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>現有庫存</label>
                  <input type="number" step="0.1" value={numVal(ingForm.stock)} onChange={e => setIngForm({...ingForm, stock: e.target.value === "" ? 0 : Number(e.target.value)})} style={{...inputStyle, width:'100%'}} />
                </div>
                <div>
                  <label style={labelStyle}>安全庫存（低於此值警示）</label>
                  <input type="number" step="0.1" value={numVal(ingForm.safety_stock)} onChange={e => setIngForm({...ingForm, safety_stock: e.target.value === "" ? 0 : Number(e.target.value)})} style={{...inputStyle, width:'100%'}} />
                </div>
              </div>
              {/* 日期 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>最近進貨日（選填）</label>
                  <input type="date" value={ingForm.restocked_at} onChange={e => setIngForm({...ingForm, restocked_at: e.target.value})} style={{...inputStyle, width:'100%'}} />
                </div>
                <div>
                  <label style={labelStyle}>保存期限（選填）</label>
                  <input type="date" value={ingForm.expiry_date} onChange={e => setIngForm({...ingForm, expiry_date: e.target.value})} style={{...inputStyle, width:'100%'}} />
                </div>
              </div>
              {/* 位置 + 備註 */}
              <div>
                <label style={labelStyle}>儲放位置（選填）</label>
                <input value={ingForm.location} onChange={e => setIngForm({...ingForm, location: e.target.value})} placeholder="例：冷藏區A、乾貨架2層" style={{...inputStyle, width:'100%'}} />
              </div>
              <div>
                <label style={labelStyle}>備註（選填）</label>
                <input value={ingForm.note} onChange={e => setIngForm({...ingForm, note: e.target.value})} placeholder="進貨來源、注意事項等" style={{...inputStyle, width:'100%'}} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={saveIng} disabled={savingIng} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: savingIng ? 0.6 : 1 }}>{savingIng ? '儲存中...' : '儲存'}</button>
                <button onClick={() => setShowIngModal(false)} style={{ padding: '10px 32px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
