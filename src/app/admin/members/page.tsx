'use client';

// ════════════════════════════════════════════════
// app/admin/members/page.tsx  ──  會員管理（完整版）
//
// 分頁：會員列表 / 集章設定 / 兌換商品 / 顧客統計
// ════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type MemberTab = 'list' | 'stamps' | 'redeem' | 'stats';

interface Member { id: string; name: string; phone: string; birthday: string; stamps: number; role: string; created_at: string; }
interface RedeemItem { id: number; name: string; description: string | null; stamps: number; monthly_limit: number; redeemed_count: number; starts_at: string | null; ends_at: string | null; is_active: boolean; }

const thStyle: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC', whiteSpace: 'nowrap' };
const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #E8E4DC', background: '#fff', fontFamily: 'inherit', fontSize: '13px', color: '#1E1C1A', outline: 'none' };
const labelStyle: React.CSSProperties = { fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', display: 'block', marginBottom: '6px' };
const sectionTitle: React.CSSProperties = { fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '14px', color: '#1E1C1A', borderBottom: '1px solid #E8E4DC', paddingBottom: '12px', marginBottom: '20px' };

const Toggle = ({ val, onChange }: { val: boolean; onChange: () => void }) => (
  <div onClick={onChange} style={{ width: '40px', height: '22px', borderRadius: '11px', background: val ? '#1E1C1A' : '#E8E4DC', position: 'relative', cursor: 'pointer', transition: 'background 0.3s', flexShrink: 0 }}>
    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: val ? '21px' : '3px', transition: 'left 0.3s' }} />
  </div>
);

const EMPTY_REDEEM = { name: '', description: '', stamps: 8, monthly_limit: 0, starts_at: '', ends_at: '', is_active: true, product_id: 0, variant_id: 0 };

export default function AdminMembersPage() {
  const [tab,     setTab]     = useState<MemberTab>('list');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  // 集章設定
  const [stampEnabled,    setStampEnabled]    = useState(true);
  const [stampThreshold,  setStampThreshold]  = useState(200);
  const [stampGoal,       setStampGoal]       = useState(8);
  const [stampTotalSlots, setStampTotalSlots] = useState(10);  // 集章卡總格數
  const [stampExpiry,     setStampExpiry]     = useState(365);
  const [stampCardName,   setStampCardName]   = useState('未半甜點護照');
  const [stampIconUrl,    setStampIconUrl]    = useState('');
  const [uploadingIcon,   setUploadingIcon]   = useState(false);
  const stampIconRef = useRef<HTMLInputElement>(null);
  const [notifySuccess,   setNotifySuccess]   = useState(true);
  const [notifyFull,      setNotifyFull]      = useState(true);
  const [notifyExpiryDays,setNotifyExpiryDays]= useState(30);
  const [savingStamp,     setSavingStamp]     = useState(false);

  // 兌換商品
  const [redeemItems,   setRedeemItems]   = useState<RedeemItem[]>([]);
  const [showRedeem,    setShowRedeem]    = useState(false);
  const [editingRedeem, setEditingRedeem] = useState<number | null>(null);
  const [redeemForm,    setRedeemForm]    = useState({ ...EMPTY_REDEEM });
  const [savingRedeem,  setSavingRedeem]  = useState(false);
  const [products,      setProducts]      = useState<{ id: number; name: string; slug: string }[]>([]);

  // 顧客統計
  const [stats, setStats] = useState({ total: 0, newThisMonth: 0, withOrders: 0, avgStamps: 0, stampsFull: 0, stampsInProgress: 0, topSpenders: [] as any[] });

  const loadMembers = async () => {
    setLoading(true);
    const { data } = await supabase.from('members').select('*').order('created_at', { ascending: false });
    setMembers(data ?? []);
    setLoading(false);
  };

  const loadStampSettings = async () => {
    const { data } = await supabase.from('store_settings').select('stamp_enabled,stamp_threshold,stamp_goal,stamp_total_slots,stamp_expiry,stamp_card_name,stamp_icon_url,stamp_notify_success,stamp_notify_full,stamp_notify_expiry_days').eq('id', 1).single();
    if (data) {
      setStampEnabled(data.stamp_enabled ?? true);
      setStampThreshold(data.stamp_threshold ?? 200);
      setStampGoal(data.stamp_goal ?? 8);
      setStampTotalSlots(data.stamp_total_slots ?? 10);
      setStampExpiry(data.stamp_expiry ?? 365);
      setStampCardName(data.stamp_card_name ?? '未半甜點護照');
      setStampIconUrl(data.stamp_icon_url ?? '');
      setNotifySuccess(data.stamp_notify_success ?? true);
      setNotifyFull(data.stamp_notify_full ?? true);
      setNotifyExpiryDays(data.stamp_notify_expiry_days ?? 30);
    }
  };

  const loadRedeemItems = async () => {
    const { data } = await supabase.from('redeem_items').select('*').order('created_at', { ascending: false });
    setRedeemItems(data ?? []);
  };

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, name, slug').eq('is_available', true).order('sort_order');
    setProducts(data ?? []);
  };

  const loadStats = async () => {
    const now       = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const [{ count: total }, { count: newThisMonth }, { data: memberData }] = await Promise.all([
      supabase.from('members').select('*', { count: 'exact', head: true }),
      supabase.from('members').select('*', { count: 'exact', head: true }).gte('created_at', thisMonth),
      supabase.from('members').select('id, name, stamps'),
    ]);
    const { data: orderData } = await supabase.from('orders').select('member_id, total').not('member_id', 'is', null).eq('pay_status', 'paid');
    const memberOrderMap: Record<string, { total: number; orders: number }> = {};
    (orderData ?? []).forEach((o: any) => { if (!memberOrderMap[o.member_id]) memberOrderMap[o.member_id] = { total: 0, orders: 0 }; memberOrderMap[o.member_id].total += o.total; memberOrderMap[o.member_id].orders++; });
    const withOrders = Object.keys(memberOrderMap).length;
    const avgStamps  = memberData && memberData.length > 0 ? Math.round(memberData.reduce((s: number, m: any) => s + (m.stamps ?? 0), 0) / memberData.length) : 0;
    const stampsFull = (memberData ?? []).filter((m: any) => m.stamps >= stampGoal).length;
    const stampsInProgress = (memberData ?? []).filter((m: any) => m.stamps > 0 && m.stamps < stampGoal).length;
    const topSpenders = (memberData ?? []).filter((m: any) => memberOrderMap[m.id]).map((m: any) => ({ name: m.name ?? '—', ...memberOrderMap[m.id] })).sort((a, b) => b.total - a.total).slice(0, 5);
    setStats({ total: total ?? 0, newThisMonth: newThisMonth ?? 0, withOrders, avgStamps, stampsFull, stampsInProgress, topSpenders });
  };

  useEffect(() => { loadMembers(); loadStampSettings(); loadRedeemItems(); loadProducts(); }, []);
  useEffect(() => { if (tab === 'stats') loadStats(); }, [tab]);

  const updateStamps = async (id: string, stamps: number) => {
    if (stamps < 0) return;
    await supabase.from('members').update({ stamps }).eq('id', id);
    setMembers(prev => prev.map(m => m.id === id ? { ...m, stamps } : m));
  };

  const saveStampSettings = async () => {
    setSavingStamp(true);
    await supabase.from('store_settings').upsert({ id: 1, stamp_enabled: stampEnabled, stamp_threshold: stampThreshold, stamp_goal: stampGoal, stamp_total_slots: stampTotalSlots, stamp_expiry: stampExpiry, stamp_card_name: stampCardName, stamp_icon_url: stampIconUrl || null, stamp_notify_success: notifySuccess, stamp_notify_full: notifyFull, stamp_notify_expiry_days: notifyExpiryDays, updated_at: new Date().toISOString() });
    setSavingStamp(false);
    alert('集章設定已儲存');
  };

  const handleStampIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    const ext      = file.name.split('.').pop();
    const fileName = `store/stamp-icon-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('images').upload(fileName, file, { cacheControl: '3600', upsert: true, contentType: file.type });
    if (error) { alert('上傳失敗：' + error.message); setUploadingIcon(false); return; }
    const { data: urlData } = supabase.storage.from('images').getPublicUrl(fileName);
    setStampIconUrl(urlData.publicUrl);
    setUploadingIcon(false);
  };

  const openAddRedeem  = () => { setRedeemForm({ ...EMPTY_REDEEM, stamps: stampGoal }); setEditingRedeem(null); setShowRedeem(true); };
  const openEditRedeem = (item: RedeemItem) => { setRedeemForm({ name: item.name, description: item.description ?? '', stamps: item.stamps, monthly_limit: item.monthly_limit, starts_at: item.starts_at ?? '', ends_at: item.ends_at ?? '', is_active: item.is_active, product_id: (item as any).product_id ?? 0, variant_id: (item as any).variant_id ?? 0 }); setEditingRedeem(item.id); setShowRedeem(true); };

  const saveRedeemItem = async () => {
    if (!redeemForm.name) { alert('請填寫兌換品名稱'); return; }
    if (!redeemForm.product_id) { alert('請選擇對應商品'); return; }
    setSavingRedeem(true);
    const data = {
      ...redeemForm,
      description: redeemForm.description || null,
      starts_at:   redeemForm.starts_at   || null,
      ends_at:     redeemForm.ends_at     || null,
      product_id:  redeemForm.product_id  || null,
      variant_id:  redeemForm.variant_id  || null,
    };
    if (editingRedeem) await supabase.from('redeem_items').update(data).eq('id', editingRedeem);
    else               await supabase.from('redeem_items').insert(data);
    setSavingRedeem(false);
    setShowRedeem(false);
    loadRedeemItems();
  };

  const toggleRedeemActive = async (item: RedeemItem) => {
    await supabase.from('redeem_items').update({ is_active: !item.is_active }).eq('id', item.id);
    setRedeemItems(prev => prev.map(x => x.id === item.id ? { ...x, is_active: !x.is_active } : x));
  };

  const deleteRedeem = async (id: number) => {
    if (!confirm('確定要刪除？')) return;
    const { error } = await supabase.from('redeem_items').delete().eq('id', id);
    if (error) { alert('刪除失敗：' + error.message); return; }
    setRedeemItems(prev => prev.filter(r => r.id !== id));
  };

  const filtered = members.filter(m => (m.name ?? '').includes(search) || (m.phone ?? '').includes(search));

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '10px 20px', cursor: 'pointer', fontSize: '13px',
    borderBottom: tab === t ? '2px solid #1E1C1A' : '2px solid transparent',
    color: tab === t ? '#1E1C1A' : '#888580',
    fontFamily: '"Noto Sans TC", sans-serif', whiteSpace: 'nowrap',
  });

  if (loading && tab === 'list') return <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: 0 }}>會員管理</h1>
        <div style={{ fontSize: '13px', color: '#888580' }}>共 {members.length} 位會員</div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #E8E4DC', marginBottom: '24px' }}>
        <div style={tabStyle('list')}   onClick={() => setTab('list')}>會員列表</div>
        <div style={tabStyle('stamps')} onClick={() => setTab('stamps')}>集章設定</div>
        <div style={tabStyle('redeem')} onClick={() => setTab('redeem')}>兌換商品</div>
        <div style={tabStyle('stats')}  onClick={() => setTab('stats')}>顧客統計</div>
      </div>

      {/* ════ 會員列表 ════ */}
      {tab === 'list' && (
        <>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋姓名或手機..." style={{ ...inputStyle, minWidth: '240px' }} />
          </div>
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['姓名', '手機', '生日', '集章數', '身份', '加入時間'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>沒有符合條件的會員</td></tr>
                ) : filtered.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #E8E4DC' }}>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1E1C1A' }}>{m.name ?? '—'}</td>
                    <td style={{ padding: '14px 16px', fontSize: '12px', color: '#555250' }}>{m.phone ?? '—'}</td>
                    <td style={{ padding: '14px 16px', fontSize: '12px', color: '#555250' }}>{m.birthday ?? '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={() => updateStamps(m.id, m.stamps - 1)} style={{ width: '24px', height: '24px', border: '1px solid #E8E4DC', background: 'transparent', cursor: 'pointer', fontSize: '14px' }}>−</button>
                        <span style={{ fontSize: '13px', color: m.stamps >= stampGoal ? '#2ab85a' : '#1E1C1A', minWidth: '24px', textAlign: 'center', fontWeight: m.stamps >= stampGoal ? 700 : 400 }}>{m.stamps}</span>
                        <button onClick={() => updateStamps(m.id, m.stamps + 1)} style={{ width: '24px', height: '24px', border: '1px solid #E8E4DC', background: 'transparent', cursor: 'pointer', fontSize: '14px' }}>+</button>
                        <span style={{ fontSize: '11px', color: '#888580' }}>/ {stampGoal}</span>
                        {m.stamps >= stampGoal && <span style={{ fontSize: '10px', color: '#2ab85a', border: '1px solid #2ab85a', padding: '1px 6px', fontFamily: '"Montserrat", sans-serif' }}>可兌換</span>}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: '11px', letterSpacing: '0.15em', padding: '3px 10px', background: m.role === 'admin' ? '#1E1C1A' : '#EDE9E2', color: m.role === 'admin' ? '#F7F4EF' : '#555250', fontFamily: '"Montserrat", sans-serif' }}>
                        {m.role === 'admin' ? 'ADMIN' : 'MEMBER'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '12px', color: '#888580' }}>{new Date(m.created_at).toLocaleDateString('zh-TW')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ════ 集章設定 ════ */}
      {tab === 'stamps' && (
        <div style={{ maxWidth: '560px' }}>
          <div style={sectionTitle}>集章規則</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #E8E4DC', marginBottom: '20px' }}>
            <span style={{ fontSize: '13px', color: '#1E1C1A' }}>啟用集章系統</span>
            <Toggle val={stampEnabled} onChange={() => setStampEnabled(!stampEnabled)} />
          </div>
          <div style={{ display: 'grid', gap: '16px', marginBottom: '28px' }}>
            <div>
              <label style={labelStyle}>蓋章門檻</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#888580' }}>每消費 NT$</span>
                <input type="number" value={stampThreshold} onChange={e => setStampThreshold(Number(e.target.value))} style={{ ...inputStyle, width: '80px' }} />
                <span style={{ fontSize: '12px', color: '#888580' }}>得 1 章</span>
              </div>
            </div>
            <div>
              <label style={labelStyle}>集章卡總格數</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="number" value={stampTotalSlots} onChange={e => setStampTotalSlots(Number(e.target.value))} style={{ ...inputStyle, width: '80px' }} />
                <span style={{ fontSize: '12px', color: '#888580' }}>格（集章卡顯示的總格數）</span>
              </div>
            </div>
            <div style={{ background: '#F7F4EF', border: '1px solid #E8E4DC', padding: '14px 16px' }}>
              <div style={{ fontSize: '11px', color: '#888580', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>兌換門檻設定</div>
              <div style={{ fontSize: '12px', color: '#555250', marginBottom: '12px' }}>
                在「兌換商品」分頁，每個商品可以各自設定需要幾章才能兌換。<br/>
                例如：總格數 10 格，集 3 章換A、集 6 章換B、集 10 章換C。
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#888580' }}>集滿</span>
                <input type="number" value={stampGoal} onChange={e => setStampGoal(Number(e.target.value))} style={{ ...inputStyle, width: '80px' }} />
                <span style={{ fontSize: '12px', color: '#888580' }}>章可兌換（最高門檻，用於顯示「集滿」提示）</span>
              </div>
            </div>
            <div>
              <label style={labelStyle}>章的有效期限</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="number" value={stampExpiry} onChange={e => setStampExpiry(Number(e.target.value))} style={{ ...inputStyle, width: '80px' }} />
                <span style={{ fontSize: '12px', color: '#888580' }}>天（從最後一次消費日起算）</span>
              </div>
            </div>
            <div>
              <label style={labelStyle}>集章卡名稱</label>
              <input value={stampCardName} onChange={e => setStampCardName(e.target.value)} style={{ ...inputStyle, width: '100%', maxWidth: '300px' }} />
            </div>
            <div>
              <label style={labelStyle}>章的圖示（建議使用去背 PNG，約 100×100px）</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
                {/* 預覽 */}
                <div style={{ width: '52px', height: '52px', borderRadius: '4px', background: '#1E1C1A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {stampIconUrl
                    ? <img src={stampIconUrl} alt="章圖示" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
                    : <span style={{ fontSize: '18px' }}>🌸</span>
                  }
                </div>
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                    <button onClick={() => stampIconRef.current?.click()} disabled={uploadingIcon} style={{ padding: '7px 14px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '12px', color: '#555250', cursor: 'pointer' }}>
                      {uploadingIcon ? '上傳中...' : '📁 上傳圖示'}
                    </button>
                    {stampIconUrl && (
                      <button onClick={() => setStampIconUrl('')} style={{ padding: '7px 14px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '12px', color: '#c0392b', cursor: 'pointer' }}>
                        移除
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: '#888580' }}>建議使用去背 PNG，圖示會顯示在深色格子上</div>
                </div>
                <input ref={stampIconRef} type="file" accept="image/*" onChange={handleStampIconUpload} style={{ display: 'none' }} />
              </div>
            </div>
          </div>

          <div style={sectionTitle}>通知設定</div>
          {[
            { label: '集章成功通知',   val: notifySuccess, set: setNotifySuccess },
            { label: '集滿提醒通知',   val: notifyFull,    set: setNotifyFull    },
          ].map(({ label, val, set }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontSize: '13px', color: '#1E1C1A' }}>{label}</span>
              <Toggle val={val} onChange={() => set(!val)} />
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid #E8E4DC', marginBottom: '24px' }}>
            <span style={{ fontSize: '13px', color: '#1E1C1A', flex: 1 }}>即將到期提醒</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#888580' }}>到期前</span>
              <input type="number" value={notifyExpiryDays} onChange={e => setNotifyExpiryDays(Number(e.target.value))} style={{ ...inputStyle, width: '60px' }} />
              <span style={{ fontSize: '12px', color: '#888580' }}>天發送提醒</span>
            </div>
          </div>

          <button onClick={saveStampSettings} disabled={savingStamp} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: savingStamp ? 0.6 : 1 }}>
            {savingStamp ? '儲存中...' : '儲存設定'}
          </button>
        </div>
      )}

      {/* ════ 兌換商品 ════ */}
      {tab === 'redeem' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ background: '#EDE9E2', border: '1px solid #E8E4DC', padding: '12px 16px', fontSize: '13px', color: '#555250', flex: 1, marginRight: '16px' }}>
              集滿 <strong>{stampGoal}</strong> 章可兌換以下任一商品。
            </div>
            <button onClick={openAddRedeem} style={{ padding: '10px 20px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ＋ 新增
            </button>
          </div>

          {/* Modal */}
          {showRedeem && (
            <>
              <div onClick={() => setShowRedeem(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
              <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '520px', maxWidth: '90vw', zIndex: 201, maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC' }}>
                  <span style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '15px', color: '#1E1C1A' }}>{editingRedeem ? '編輯兌換商品' : '新增兌換商品'}</span>
                  <button onClick={() => setShowRedeem(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888580' }}>×</button>
                </div>
                <div style={{ padding: '24px', display: 'grid', gap: '16px' }}>
                  <div><label style={labelStyle}>商品名稱 *</label><input value={redeemForm.name} onChange={e => setRedeemForm({...redeemForm, name: e.target.value})} placeholder="例：法式可麗露" style={{...inputStyle, width:'100%'}} /></div>
                  <div><label style={labelStyle}>說明（選填）</label><input value={redeemForm.description} onChange={e => setRedeemForm({...redeemForm, description: e.target.value})} placeholder="例：任選口味一入" style={{...inputStyle, width:'100%'}} /></div>

                  {/* 對應商品（必填）*/}
                  <div>
                    <label style={labelStyle}>對應商品 *（用於結帳、出貨日計算、庫存扣除）</label>
                    <select
                      value={redeemForm.product_id}
                      onChange={e => setRedeemForm({...redeemForm, product_id: Number(e.target.value), variant_id: 0})}
                      style={{...inputStyle, width:'100%'}}
                    >
                      <option value={0}>請選擇商品</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div style={{ fontSize: '11px', color: '#888580', marginTop: '4px' }}>
                      選擇對應的實際商品，顧客結帳時會以此商品計算出貨日期與庫存
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>所需章數</label>
                      <input type="number" value={redeemForm.stamps} onChange={e => setRedeemForm({...redeemForm, stamps: Number(e.target.value)})} style={{...inputStyle, width:'100%'}} />
                    </div>
                    <div>
                      <label style={labelStyle}>每月限量（0 = 不限）</label>
                      <input type="number" value={redeemForm.monthly_limit} onChange={e => setRedeemForm({...redeemForm, monthly_limit: Number(e.target.value)})} style={{...inputStyle, width:'100%'}} />
                    </div>
                    <div>
                      <label style={labelStyle}>開始日期（留空 = 立即）</label>
                      <input type="date" value={redeemForm.starts_at} onChange={e => setRedeemForm({...redeemForm, starts_at: e.target.value})} style={{...inputStyle, width:'100%'}} />
                    </div>
                    <div>
                      <label style={labelStyle}>結束日期（留空 = 長期）</label>
                      <input type="date" value={redeemForm.ends_at} onChange={e => setRedeemForm({...redeemForm, ends_at: e.target.value})} style={{...inputStyle, width:'100%'}} />
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#555250', cursor: 'pointer' }}>
                    <input type="checkbox" checked={redeemForm.is_active} onChange={e => setRedeemForm({...redeemForm, is_active: e.target.checked})} style={{ accentColor: '#1E1C1A' }} />
                    啟用此兌換品
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={saveRedeemItem} disabled={savingRedeem} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: savingRedeem ? 0.6 : 1 }}>{savingRedeem ? '儲存中...' : '儲存'}</button>
                    <button onClick={() => setShowRedeem(false)} style={{ padding: '10px 32px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>取消</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 兌換商品列表 */}
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['商品名稱', '所需章數', '每月限量', '已兌換', '有效期間', '啟用', '操作'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {redeemItems.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>尚無兌換商品</td></tr>
                ) : redeemItems.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #E8E4DC', opacity: item.is_active ? 1 : 0.5 }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: '13px', color: '#1E1C1A' }}>{item.name}</div>
                      {item.description && <div style={{ fontSize: '11px', color: '#888580', marginTop: '2px' }}>{item.description}</div>}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1E1C1A' }}>{item.stamps} 章</td>
                    <td style={{ padding: '14px 16px', fontSize: '12px', color: '#555250' }}>{item.monthly_limit === 0 ? '不限' : `${item.monthly_limit} 份`}</td>
                    <td style={{ padding: '14px 16px', fontSize: '12px', color: '#555250' }}>{item.redeemed_count} 次</td>
                    <td style={{ padding: '14px 16px', fontSize: '11px', color: '#888580' }}>
                      {item.starts_at ?? '立即'} ～ {item.ends_at ?? '長期'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <input type="checkbox" checked={item.is_active} onChange={() => toggleRedeemActive(item)} style={{ accentColor: '#1E1C1A', cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '14px 16px', display: 'flex', gap: '6px' }}>
                      <button onClick={() => openEditRedeem(item)} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#555250', cursor: 'pointer' }}>編輯</button>
                      <button onClick={() => deleteRedeem(item.id)} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#c0392b', cursor: 'pointer' }}>刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════ 顧客統計 ════ */}
      {tab === 'stats' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
            {[
              { label: '總會員數',   value: stats.total },
              { label: '本月新增',   value: stats.newThisMonth },
              { label: '有消費記錄', value: stats.withOrders },
              { label: '平均集章數', value: stats.avgStamps },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '20px 24px' }}>
                <div style={{ fontSize: '10px', color: '#888580', letterSpacing: '0.2em', marginBottom: '10px', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#1E1C1A' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* 集章統計 */}
          <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#555250', marginBottom: '12px', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif' }}>集章統計</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '28px' }}>
            {[
              { label: '已集滿可兌換', value: stats.stampsFull,      color: '#2ab85a' },
              { label: '集章中（未滿）',value: stats.stampsInProgress, color: '#b87a2a' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '20px 24px' }}>
                <div style={{ fontSize: '10px', color: '#888580', letterSpacing: '0.2em', marginBottom: '10px', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* 消費前五名 */}
          <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#555250', marginBottom: '12px', textTransform: 'uppercase', fontFamily: '"Montserrat", sans-serif' }}>消費前五名</div>
          <div style={{ background: '#fff', border: '1px solid #E8E4DC' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['排名', '姓名', '訂單數', '消費總額'].map((h, i) => <th key={h} style={{ ...thStyle, textAlign: i > 1 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>
                {stats.topSpenders.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#888580', fontSize: '13px' }}>尚無消費記錄</td></tr>
                ) : stats.topSpenders.map((s, i) => (
                  <tr key={s.name} style={{ borderBottom: '1px solid #E8E4DC' }}>
                    <td style={{ padding: '14px 16px', fontFamily: '"Montserrat", sans-serif', fontWeight: 700, fontSize: '14px', color: i < 3 ? '#b35252' : '#888580' }}>#{i+1}</td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1E1C1A' }}>{s.name}</td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#555250', textAlign: 'right' }}>{s.orders} 筆</td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#3d7a55', textAlign: 'right' }}>NT$ {s.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
