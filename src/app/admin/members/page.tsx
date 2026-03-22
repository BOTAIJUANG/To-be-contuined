'use client';

// ════════════════════════════════════════════════
// app/admin/members/page.tsx  ──  會員管理（完整版）
//
// 分頁：會員列表 / 集章設定 / 兌換商品 / 顧客統計
// ════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type MemberTab = 'list' | 'stamps' | 'redeem' | 'stats';
type DetailTab = 'profile' | 'stamp_logs' | 'redemptions';

interface Member { id: string; name: string; phone: string; birthday: string; stamps: number; stamps_frozen?: number; role: string; created_at: string; email?: string; }
interface RedeemItem { id: number; name: string; description: string | null; stamps: number; monthly_limit: number; redeemed_count: number; starts_at: string | null; ends_at: string | null; is_active: boolean; }
interface StampLog { id: number; change: number; stamps_before: number; stamps_after: number; reason: string; admin_id: string | null; created_at: string; admin_name?: string; }
interface RedemptionLog { id: number; type: string; status: string; stamps_cost: number; redeem_code: string | null; created_at: string; used_at: string | null; reward_name?: string; }

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

  // 會員詳情面板
  const [showDetail,    setShowDetail]    = useState(false);
  const [detailMember,  setDetailMember]  = useState<Member | null>(null);
  const [detailTab,     setDetailTab]     = useState<DetailTab>('profile');
  const [stampLogs,     setStampLogs]     = useState<StampLog[]>([]);
  const [redemptionLogs,setRedemptionLogs]= useState<RedemptionLog[]>([]);
  const [logsLoading,   setLogsLoading]   = useState(false);

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

  // 集章手動調整 Modal
  const [showStampModal,  setShowStampModal]  = useState(false);
  const [stampModalMember, setStampModalMember] = useState<Member | null>(null);
  const [stampDelta,       setStampDelta]       = useState(0);
  const [stampReason,      setStampReason]      = useState('');
  const [stampReasonOther, setStampReasonOther] = useState('');
  const [savingStampAdj,   setSavingStampAdj]   = useState(false);

  const STAMP_REASONS = ['手動補登', '補償', '退款', '活動', '其他'];

  // 開啟會員詳情面板
  const openDetail = async (m: Member) => {
    setDetailMember(m);
    setDetailTab('profile');
    setShowDetail(true);
    setLogsLoading(true);

    const { data: logs } = await supabase
      .from('stamp_logs')
      .select('*')
      .eq('member_id', m.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const adminIds = [...new Set((logs ?? []).filter((l: any) => l.admin_id).map((l: any) => l.admin_id))];
    let adminMap: Record<string, string> = {};
    if (adminIds.length > 0) {
      const { data: admins } = await supabase.from('members').select('id, name').in('id', adminIds);
      (admins ?? []).forEach((a: any) => { adminMap[a.id] = a.name; });
    }
    setStampLogs((logs ?? []).map((l: any) => ({ ...l, admin_name: l.admin_id ? (adminMap[l.admin_id] ?? '管理員') : null })));

    const { data: redemptions } = await supabase
      .from('redemptions')
      .select('id, type, status, stamps_cost, redeem_code, created_at, used_at, redeem_items(name)')
      .eq('member_id', m.id)
      .order('created_at', { ascending: false })
      .limit(50);

    setRedemptionLogs((redemptions ?? []).map((r: any) => ({ ...r, reward_name: r.redeem_items?.name ?? '—' })));
    setLogsLoading(false);
  };

  const openStampModal = (m: Member, delta: number) => {
    setStampModalMember(m);
    setStampDelta(delta);
    setStampReason('手動補登');
    setStampReasonOther('');
    setShowStampModal(true);
  };

  const handleStampAdjust = async () => {
    if (!stampModalMember) return;
    const reason = stampReason === '其他' ? stampReasonOther : stampReason;
    if (!reason.trim()) { alert('請填寫原因'); return; }

    const newStamps = Math.max(0, stampModalMember.stamps + stampDelta);
    setSavingStampAdj(true);

    // 更新章數
    await supabase.from('members').update({ stamps: newStamps }).eq('id', stampModalMember.id);

    // 寫入 stamp_logs
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('stamp_logs').insert({
      member_id:     stampModalMember.id,
      change:        stampDelta,
      stamps_before: stampModalMember.stamps,
      stamps_after:  newStamps,
      reason:        `手動調整（${reason}）`,
      admin_id:      session?.user?.id ?? null,
    });

    setMembers(prev => prev.map(m => m.id === stampModalMember.id ? { ...m, stamps: newStamps } : m));
    setSavingStampAdj(false);
    setShowStampModal(false);
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
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#1E1C1A' }}>
                      <span onClick={() => openDetail(m)} style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}>{m.name ?? '—'}</span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '12px', color: '#555250' }}>{m.phone ?? '—'}</td>
                    <td style={{ padding: '14px 16px', fontSize: '12px', color: '#555250' }}>{m.birthday ?? '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={() => openStampModal(m, -1)} disabled={m.stamps <= 0} style={{ width: '24px', height: '24px', border: '1px solid #E8E4DC', background: 'transparent', cursor: m.stamps <= 0 ? 'not-allowed' : 'pointer', fontSize: '14px', opacity: m.stamps <= 0 ? 0.4 : 1 }}>−</button>
                        <span style={{ fontSize: '13px', color: m.stamps >= stampTotalSlots ? '#2ab85a' : '#1E1C1A', minWidth: '24px', textAlign: 'center', fontWeight: m.stamps >= stampTotalSlots ? 700 : 400 }}>{m.stamps}</span>
                        <button onClick={() => openStampModal(m, +1)} style={{ width: '24px', height: '24px', border: '1px solid #E8E4DC', background: 'transparent', cursor: 'pointer', fontSize: '14px' }}>+</button>
                        <span style={{ fontSize: '11px', color: '#888580' }}>/ {stampTotalSlots}</span>
                        {m.stamps >= stampTotalSlots && <span style={{ fontSize: '10px', color: '#2ab85a', border: '1px solid #2ab85a', padding: '1px 6px', fontFamily: '"Montserrat", sans-serif' }}>集滿</span>}
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
                      {uploadingIcon ? '上傳中...' : '上傳圖示'}
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

      {/* ════ 會員詳情側邊面板 ════ */}
      {showDetail && detailMember && (
        <>
          <div onClick={() => setShowDetail(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '520px', maxWidth: '90vw', background: '#fff', zIndex: 301, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>

            {/* 頭部 */}
            <div style={{ padding: '24px 28px', borderBottom: '1px solid #E8E4DC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '16px', color: '#1E1C1A' }}>{detailMember.name ?? '—'}</div>
                <div style={{ fontSize: '12px', color: '#888580', marginTop: '4px' }}>{detailMember.phone ?? '無電話'}</div>
              </div>
              <button onClick={() => setShowDetail(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888580' }}>×</button>
            </div>

            {/* 頁籤 */}
            <div style={{ display: 'flex', borderBottom: '1px solid #E8E4DC', padding: '0 28px' }}>
              {([
                { key: 'profile',      label: '基本資料' },
                { key: 'stamp_logs',   label: '集章記錄' },
                { key: 'redemptions',  label: '兌換記錄' },
              ] as { key: DetailTab; label: string }[]).map(({ key, label }) => (
                <div key={key} onClick={() => setDetailTab(key)} style={{ padding: '12px 16px', cursor: 'pointer', fontSize: '13px', borderBottom: detailTab === key ? '2px solid #1E1C1A' : '2px solid transparent', color: detailTab === key ? '#1E1C1A' : '#888580', marginBottom: '-1px' }}>
                  {label}
                </div>
              ))}
            </div>

            {/* 內容 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

              {/* 基本資料 */}
              {detailTab === 'profile' && (
                <div style={{ display: 'grid', gap: '16px' }}>
                  {[
                    { label: '姓名',     value: detailMember.name },
                    { label: '手機',     value: detailMember.phone },
                    { label: '生日',     value: detailMember.birthday },
                    { label: '身份',     value: detailMember.role === 'admin' ? 'Admin' : 'Member' },
                    { label: '集章數',   value: `${detailMember.stamps} 章${(detailMember.stamps_frozen ?? 0) > 0 ? `（凍結 ${detailMember.stamps_frozen} 章）` : ''}` },
                    { label: '加入時間', value: new Date(detailMember.created_at).toLocaleString('zh-TW') },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', gap: '16px', padding: '12px 0', borderBottom: '1px solid #E8E4DC' }}>
                      <span style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.2em', color: '#888580', textTransform: 'uppercase', width: '80px', flexShrink: 0, paddingTop: '2px' }}>{label}</span>
                      <span style={{ fontSize: '13px', color: '#1E1C1A' }}>{value ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 集章記錄 */}
              {detailTab === 'stamp_logs' && (
                logsLoading ? <div style={{ color: '#888580', fontSize: '13px' }}>載入中...</div> :
                stampLogs.length === 0 ? <div style={{ color: '#888580', fontSize: '13px' }}>尚無集章記錄</div> : (
                  <div>
                    {stampLogs.map(log => (
                      <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 0', borderBottom: '1px solid #E8E4DC', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', color: '#1E1C1A', marginBottom: '4px' }}>{log.reason ?? '—'}</div>
                          <div style={{ fontSize: '11px', color: '#888580' }}>
                            {new Date(log.created_at).toLocaleString('zh-TW')}
                            {log.admin_name && <span style={{ marginLeft: '8px', color: '#b87a2a' }}>· {log.admin_name}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: log.change > 0 ? '#2ab85a' : '#c0392b' }}>
                            {log.change > 0 ? '+' : ''}{log.change}
                          </div>
                          <div style={{ fontSize: '11px', color: '#888580' }}>餘 {log.stamps_after} 章</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* 兌換記錄 */}
              {detailTab === 'redemptions' && (
                logsLoading ? <div style={{ color: '#888580', fontSize: '13px' }}>載入中...</div> :
                redemptionLogs.length === 0 ? <div style={{ color: '#888580', fontSize: '13px' }}>尚無兌換記錄</div> : (
                  <div>
                    {redemptionLogs.map(r => {
                      const statusLabel: Record<string, string> = { pending_cart: '等待中', pending_order: '訂單中', used: '已完成', released: '已取消', expired: '已過期', refunded: '已退還' };
                      const statusColor: Record<string, string> = { pending_cart: '#b87a2a', pending_order: '#2a7ab8', used: '#2ab85a', released: '#888580', expired: '#888580', refunded: '#c0392b' };
                      return (
                        <div key={r.id} style={{ padding: '14px 0', borderBottom: '1px solid #E8E4DC' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <div style={{ fontSize: '13px', color: '#1E1C1A', fontWeight: 500 }}>{r.reward_name}</div>
                            <span style={{ fontSize: '11px', color: statusColor[r.status] ?? '#888580', border: `1px solid ${statusColor[r.status] ?? '#888580'}`, padding: '2px 8px', fontFamily: '"Montserrat", sans-serif' }}>
                              {statusLabel[r.status] ?? r.status}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#888580', display: 'flex', gap: '12px' }}>
                            <span>{new Date(r.created_at).toLocaleString('zh-TW')}</span>
                            <span style={{ color: '#c0392b' }}>−{r.stamps_cost} 章</span>
                            <span>{r.type === 'code' ? `兌換碼：${r.redeem_code}` : '線上兌換'}</span>
                          </div>
                          {r.used_at && <div style={{ fontSize: '11px', color: '#2ab85a', marginTop: '4px' }}>核銷時間：{new Date(r.used_at).toLocaleString('zh-TW')}</div>}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        </>
      )}

      {/* ════ 集章手動調整 Modal ════ */}
      {showStampModal && stampModalMember && (
        <>
          <div onClick={() => setShowStampModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '400px', maxWidth: '90vw', zIndex: 201, padding: '28px' }}>
            <h3 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '15px', color: '#1E1C1A', marginBottom: '20px' }}>
              手動{stampDelta > 0 ? '增加' : '扣除'}集章
            </h3>

            {/* 會員資訊 */}
            <div style={{ background: '#F7F4EF', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#555250' }}>
              <strong style={{ color: '#1E1C1A' }}>{stampModalMember.name}</strong>
              <span style={{ marginLeft: '12px' }}>目前 {stampModalMember.stamps} 章</span>
              <span style={{ marginLeft: '8px', color: stampDelta > 0 ? '#2ab85a' : '#c0392b', fontWeight: 600 }}>
                → {Math.max(0, stampModalMember.stamps + stampDelta)} 章（{stampDelta > 0 ? '+' : ''}{stampDelta}）
              </span>
            </div>

            {/* 原因選擇 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>調整原因 *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                {STAMP_REASONS.map(r => (
                  <button key={r} onClick={() => setStampReason(r)} style={{ padding: '6px 14px', border: `1px solid ${stampReason === r ? '#1E1C1A' : '#E8E4DC'}`, background: stampReason === r ? '#1E1C1A' : 'transparent', color: stampReason === r ? '#F7F4EF' : '#555250', fontSize: '12px', cursor: 'pointer' }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* 其他原因輸入 */}
            {stampReason === '其他' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>請說明原因</label>
                <input value={stampReasonOther} onChange={e => setStampReasonOther(e.target.value)} placeholder="請輸入原因" style={{ ...inputStyle, width: '100%', marginTop: '8px' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={handleStampAdjust} disabled={savingStampAdj} style={{ flex: 1, padding: '10px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', cursor: 'pointer', opacity: savingStampAdj ? 0.6 : 1 }}>
                {savingStampAdj ? '處理中...' : '確認'}
              </button>
              <button onClick={() => setShowStampModal(false)} style={{ flex: 1, padding: '10px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>
                取消
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
