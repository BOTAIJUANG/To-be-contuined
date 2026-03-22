'use client';

// ════════════════════════════════════════════════
// components/MemberDashboard.tsx  ──  會員主頁（完整版）
//
// 分頁：個人資料 / 集章紀錄 / 訂單記錄 / 收件地址
// 收件地址支援新增/編輯/刪除，宅配和超商兩種類型
// 集章規則從 store_settings 讀取
// ════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useCart } from '@/context/CartContext';
import { fetchApi } from '@/lib/api';

const STATUS_LABEL: Record<string, string> = { processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消' };
const STATUS_COLOR: Record<string, string> = { processing: '#b87a2a', shipped: '#2a7ab8', done: '#2ab85a', cancelled: '#888580' };
const CITIES = ['台北市','新北市','桃園市','台中市','台南市','高雄市','新竹縣','新竹市','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','嘉義市','屏東縣','宜蘭縣','花蓮縣','台東縣'];

const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 0', border: 'none', borderBottom: '1px solid #E8E4DC', marginTop: '8px', fontFamily: 'inherit', fontSize: '13px', background: 'transparent', color: '#1E1C1A', letterSpacing: '0.05em', outline: 'none' };
const labelStyle: React.CSSProperties = { fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase' };

interface MemberDashboardProps {
  userId:   string;
  userName: string;
  onLogout: () => void;
}

const EMPTY_ADDR = { label: '', name: '', phone: '', type: 'home', city: '', district: '', address: '', cvs_brand: '711', store_name: '', store_address: '', is_default: false };

export default function MemberDashboard({ userId, userName, onLogout }: MemberDashboardProps) {
  const { addItem } = useCart();
  const [activeTab, setActiveTab] = useState<'profile'|'stamps'|'orders'|'address'>('profile');

  // 個人資料
  const [name,     setName]     = useState(userName);
  const [phone,    setPhone]    = useState('');
  const [birthday, setBirthday] = useState('');
  const [stamps,   setStamps]   = useState(0);

  // 集章設定（從 store_settings 讀取）
  const [stampGoal,       setStampGoal]       = useState(8);
  const [stampTotalSlots, setStampTotalSlots] = useState(10);
  const [stampThreshold,  setStampThreshold]  = useState(200);
  const [stampExpiry,     setStampExpiry]     = useState(365);
  const [stampCardName,   setStampCardName]   = useState('未半甜點護照');
  const [stampIconUrl,    setStampIconUrl]    = useState('');
  const [redeemItems,     setRedeemItems]     = useState<any[]>([]);
  const [stampsFrozen,    setStampsFrozen]    = useState(0);
  const [redeemNotice,    setRedeemNotice]    = useState('');

  // 兌換流程
  const [activeRedemptions, setActiveRedemptions] = useState<any[]>([]);
  const [stampLogsData,     setStampLogsData]     = useState<any[]>([]);
  const [showAllLogs,       setShowAllLogs]        = useState(false); // 目前進行中的兌換
  const [showRedeemModal,   setShowRedeemModal]   = useState(false);
  const [selectedReward,    setSelectedReward]    = useState<any | null>(null);
  const [redeemType,        setRedeemType]        = useState<'online' | 'code'>('online');
  const [redeemConfirmed,   setRedeemConfirmed]   = useState(false);
  const [redeeming,         setRedeeming]         = useState(false);
  const [showCodeResult,    setShowCodeResult]    = useState(false);
  const [codeResult,        setCodeResult]        = useState<{ code: string; expiresAt: string; rewardName: string } | null>(null);

  // 訂單
  const [orders,        setOrders]        = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // 收件地址
  const [addresses,      setAddresses]     = useState<any[]>([]);
  const [showAddrModal,  setShowAddrModal] = useState(false);
  const [editingAddrId,  setEditingAddrId] = useState<number | null>(null);
  const [addrForm,       setAddrForm]      = useState({ ...EMPTY_ADDR });
  const [savingAddr,     setSavingAddr]    = useState(false);

  // 載入會員資料 + 集章設定
  useEffect(() => {
    const load = async () => {
      try {
        const [memberRes, { data: settings }, { data: redeem }] = await Promise.all([
          fetchApi('/api/member/profile'),
          supabase.from('store_settings').select('stamp_goal, stamp_total_slots, stamp_threshold, stamp_expiry, stamp_card_name, stamp_icon_url, redeem_notice_text').eq('id', 1).single(),
          supabase.from('redeem_items').select('id, name, description, stamps, is_active, product_id, variant_id, products(id, name, slug, image_url)').eq('is_active', true).order('stamps'),
        ]);
        const member = memberRes.ok ? await memberRes.json() : null;
        if (member)   { setName(member.name ?? userName); setPhone(member.phone ?? ''); setBirthday(member.birthday ?? ''); setStamps(member.stamps ?? 0); setStampsFrozen(member.stamps_frozen ?? 0); }
        if (settings) { setStampGoal(settings.stamp_goal ?? 8); setStampTotalSlots(settings.stamp_total_slots ?? 10); setStampThreshold(settings.stamp_threshold ?? 200); setStampExpiry(settings.stamp_expiry ?? 365); setStampCardName(settings.stamp_card_name ?? '未半甜點護照'); setStampIconUrl(settings.stamp_icon_url ?? ''); setRedeemNotice(settings.redeem_notice_text ?? ''); }
        if (redeem)   { setRedeemItems(redeem); }

        // 載入集章異動記錄
        const { data: logs } = await supabase
          .from('stamp_logs')
          .select('id, change, stamps_after, reason, created_at')
          .eq('member_id', userId)
          .order('created_at', { ascending: false })
          .limit(30);
        setStampLogsData(logs ?? []);

        // 載入進行中的兌換
        const { data: activeReds } = await supabase
          .from('redemptions')
          .select('*, redeem_items(name, stamps)')
          .eq('member_id', userId)
          .in('status', ['pending_cart', 'pending_order'])
          .order('created_at', { ascending: false });
        setActiveRedemptions(activeReds ?? []);
      } catch (err) {
        console.error('會員資料載入失敗:', err);
      }
    };
    load();
  }, [userId]);

  // 載入訂單
  useEffect(() => {
    if (activeTab !== 'orders') return;
    const load = async () => {
      setOrdersLoading(true);
      const { data } = await supabase.from('orders').select('order_no, status, total, created_at, tracking_no, carrier, order_items(name, qty)').eq('member_id', userId).order('created_at', { ascending: false });
      setOrders(data ?? []);
      setOrdersLoading(false);
    };
    load();
  }, [activeTab, userId]);

  // 載入收件地址
  useEffect(() => {
    if (activeTab !== 'address') return;
    loadAddresses();
  }, [activeTab]);

  const loadAddresses = async () => {
    const { data } = await supabase.from('addresses').select('*').eq('member_id', userId).order('is_default', { ascending: false }).order('created_at');
    setAddresses(data ?? []);
  };

  // 儲存個人資料
  const handleSaveProfile = async () => {
    const res = await fetchApi('/api/member/profile', {
      method: 'POST',
      body: JSON.stringify({ name, phone, birthday }),
    });
    if (res.ok) alert('個人資料已儲存');
    else alert('儲存失敗，請稍後再試');
  };

  // ── 兌換相關 ─────────────────────────────────────

  // 開啟兌換 Modal
  const openRedeemModal = (item: any, type: 'online' | 'code') => {
    setSelectedReward(item);
    setRedeemType(type);
    setRedeemConfirmed(false);
    setShowRedeemModal(true);
  };

  // 確認兌換
  const handleRedeem = async () => {
    if (!selectedReward || !redeemConfirmed) return;
    setRedeeming(true);
    try {
      // 用 fetchApi 自動帶上登入 token
      const res  = await fetchApi('/api/redeem?action=create', {
        method:  'POST',
        body:    JSON.stringify({ member_id: userId, reward_id: selectedReward.id, type: redeemType }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? '兌換失敗'); setRedeeming(false); setRedeemConfirmed(false); return; }

      // 更新本地狀態
      setStampsFrozen(prev => prev + selectedReward.stamps);
      setShowRedeemModal(false);
      setRedeemConfirmed(false);

      if (redeemType === 'code') {
        setCodeResult({ code: data.redeem_code, expiresAt: data.expires_at, rewardName: data.reward_name });
        setShowCodeResult(true);
      } else {
        // 線上兌換：用真實商品資料加入購物車
        const product = selectedReward.products;
        if (!product) {
          alert('此兌換品尚未設定對應商品，請聯絡店家');
          setRedeeming(false);
          setRedeemConfirmed(false);
          return;
        }
        addItem({
          id:            `redeem-${data.redemption_id}`,
          slug:          product.slug ?? 'redeem-item',
          name:          selectedReward.name,
          price:         0,
          imageUrl:      product.image_url ?? undefined,
          isRedeemItem:  true,
          redemptionId:  data.redemption_id,
          // 傳入真實 product_id 供結帳頁計算出貨日和庫存用
          ...(selectedReward.product_id && { productRealId: selectedReward.product_id }),
          ...(selectedReward.variant_id && { variantId: selectedReward.variant_id }),
        } as any);
        alert(`「${selectedReward.name}」已加入購物車，請前往結帳完成兌換。`);
      }

      // 重新載入進行中的兌換
      const { data: activeReds } = await supabase
        .from('redemptions')
        .select('*, redeem_items(name, stamps)')
        .eq('member_id', userId)
        .in('status', ['pending_cart', 'pending_order']);
      setActiveRedemptions(activeReds ?? []);
    } catch (e) {
      alert('發生錯誤，請稍後再試');
    }
    setRedeeming(false);
  };

  // 取消兌換
  const handleCancelRedemption = async (redemptionId: number, stampsCost: number) => {
    if (!confirm('確定要取消此兌換？章數將立即歸還。')) return;
    // 用 fetchApi 自動帶上登入 token
    const res  = await fetchApi('/api/redeem?action=cancel', {
      method:  'POST',
      body:    JSON.stringify({ redemption_id: redemptionId }),
    });
    if (res.ok) {
      setStampsFrozen(prev => Math.max(0, prev - stampsCost));
      setActiveRedemptions(prev => prev.filter(r => r.id !== redemptionId));
      alert('兌換已取消，章數已歸還');
    } else {
      alert('取消失敗，請稍後再試');
    }
  };

  const availableStamps = stamps - stampsFrozen;

  // 開啟新增地址
  const openAddAddr = () => { setAddrForm({ ...EMPTY_ADDR }); setEditingAddrId(null); setShowAddrModal(true); };

  // 開啟編輯地址
  const openEditAddr = (addr: any) => {
    setAddrForm({ label: addr.label ?? '', name: addr.name, phone: addr.phone, type: addr.type ?? 'home', city: addr.city ?? '', district: addr.district ?? '', address: addr.address ?? '', cvs_brand: addr.cvs_brand ?? '711', store_name: addr.store_name ?? '', store_address: addr.store_address ?? '', is_default: addr.is_default ?? false });
    setEditingAddrId(addr.id);
    setShowAddrModal(true);
  };

  // 儲存地址
  const handleSaveAddr = async () => {
    if (!addrForm.name || !addrForm.phone) { alert('請填寫收件人姓名和手機'); return; }
    if (addrForm.type === 'home' && !addrForm.address) { alert('請填寫收件地址'); return; }
    if (addrForm.type === 'cvs' && !addrForm.store_name) { alert('請填寫門市名稱'); return; }
    setSavingAddr(true);
    const data = { ...addrForm, member_id: userId, label: addrForm.label || null };

    if (editingAddrId) {
      await supabase.from('addresses').update(data).eq('id', editingAddrId);
    } else {
      if (addresses.length >= 5) { alert('最多可儲存 5 個收件地址'); setSavingAddr(false); return; }
      await supabase.from('addresses').insert(data);
    }

    // 如果設為預設，把其他地址的 is_default 改為 false
    if (addrForm.is_default) await supabase.from('addresses').update({ is_default: false }).eq('member_id', userId).neq('id', editingAddrId ?? 0);

    setSavingAddr(false);
    setShowAddrModal(false);
    loadAddresses();
  };

  // 刪除地址
  const handleDeleteAddr = async (id: number) => {
    if (!confirm('確定要刪除此收件地址？')) return;
    await supabase.from('addresses').delete().eq('id', id);
    loadAddresses();
  };

  // 設為預設
  const setDefaultAddr = async (id: number) => {
    await supabase.from('addresses').update({ is_default: false }).eq('member_id', userId);
    await supabase.from('addresses').update({ is_default: true }).eq('id', id);
    loadAddresses();
  };

  const navItemStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'block', padding: '12px 0', paddingLeft: isActive ? '6px' : '0',
    fontSize: '13px', letterSpacing: '0.1em',
    color: isActive ? '#1E1C1A' : '#888580',
    borderBottom: '1px solid #E8E4DC', cursor: 'pointer',
    transition: 'all 0.3s', fontFamily: '"Noto Sans TC", sans-serif', textDecoration: 'none',
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '64px', alignItems: 'start' }}>

      {/* 左側 */}
      <div>
        <div style={{ textAlign: 'center', paddingBottom: '28px', borderBottom: '1px solid #E8E4DC' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#EDE9E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 500, color: '#1E1C1A', margin: '0 auto 12px', fontFamily: '"Noto Sans TC", sans-serif' }}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '0.1em', color: '#1E1C1A', marginBottom: '4px' }}>{name}</div>
          <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '11px', letterSpacing: '0.28em', color: '#888580', textTransform: 'uppercase' }}>集章會員</div>
        </div>
        <nav style={{ display: 'grid', marginTop: '20px' }}>
          {(['profile', 'stamps', 'orders', 'address'] as const).map(tab => {
            const labels = { profile: '個人資料', stamps: '集章紀錄', orders: '訂單記錄', address: '收件地址' };
            return <span key={tab} style={navItemStyle(activeTab === tab)} onClick={() => setActiveTab(tab)}>{labels[tab]}</span>;
          })}
          <span onClick={onLogout} style={{ ...navItemStyle(false), borderBottom: 'none', marginTop: '8px' }}>登出</span>
        </nav>
      </div>

      {/* 右側 */}
      <div>
        {/* 個人資料 */}
        {activeTab === 'profile' && (
          <div>
            <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.28em', color: '#1E1C1A', margin: '0 0 32px' }}>個人資料</h2>
            <div style={{ maxWidth: '520px' }}>
              {[
                { label: '姓名', type: 'text', val: name, set: setName, ph: '請輸入姓名' },
                { label: '手機號碼', type: 'tel', val: phone, set: setPhone, ph: '09XXXXXXXX' },
                { label: '生日', type: 'date', val: birthday, set: setBirthday, ph: '' },
              ].map(({ label, type, val, set, ph }) => (
                <div key={label} style={{ marginBottom: '24px' }}>
                  <label style={labelStyle}>{label}</label>
                  <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} style={inputStyle} />
                </div>
              ))}
              <button onClick={handleSaveProfile} style={{ marginTop: '24px', padding: '12px 44px', border: '1px solid rgba(0,0,0,0.18)', background: 'transparent', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.35em', textTransform: 'uppercase', color: '#1E1C1A', cursor: 'pointer' }}>
                儲存變更
              </button>
            </div>
          </div>
        )}

        {/* 集章紀錄 */}
        {activeTab === 'stamps' && (
          <div>
            <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.28em', color: '#1E1C1A', margin: '0 0 32px' }}>集章紀錄</h2>

            {/* 集章卡 */}
            <div style={{ background: '#EDE9E2', padding: '32px', marginBottom: '24px' }}>
              <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '11px', letterSpacing: '0.35em', textTransform: 'uppercase', color: '#888580', marginBottom: '20px' }}>{stampCardName}</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(stampTotalSlots, 5)}, 1fr)`, gap: '10px', marginBottom: '16px' }}>
                {Array.from({ length: stampTotalSlots }).map((_, i) => {
                  const filled = i < stamps;
                  const frozen = i >= availableStamps && i < stamps;
                  const reward = redeemItems.find(r => r.stamps === i + 1);
                  return (
                    <div key={i} style={{ position: 'relative', paddingBottom: '100%' }}>
                      <div style={{ position: 'absolute', inset: 0, border: `1.5px ${filled ? 'solid' : 'dashed'} ${filled ? 'rgba(30,28,26,0.3)' : 'rgba(0,0,0,0.15)'}`, borderRadius: '6px', background: frozen ? 'rgba(184,122,42,0.1)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s' }}>
                        {filled ? (
                          frozen
                            ? <span style={{ fontSize: '16px' }}>🔒</span>
                            : stampIconUrl
                              ? <img src={stampIconUrl} alt="章" style={{ width: '60%', height: '60%', objectFit: 'contain' }} />
                              : <span style={{ fontSize: '20px' }}>🌸</span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'rgba(0,0,0,0.2)', fontFamily: '"Montserrat", sans-serif' }}>{i + 1}</span>
                        )}
                      </div>
                      {reward && (
                        <div style={{ position: 'absolute', bottom: '-22px', left: '50%', transform: 'translateX(-50%)', fontSize: '9px', color: availableStamps >= reward.stamps ? '#2ab85a' : '#b87a2a', fontFamily: '"Montserrat", sans-serif', whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {availableStamps >= reward.stamps ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 9.5 17.5 20 6" /></svg> : '↑'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: '13px', color: '#555250', letterSpacing: '0.05em', marginTop: '24px' }}>
                已集 <strong style={{ color: '#1E1C1A' }}>{stamps}</strong> 章
                {stampsFrozen > 0 && <span style={{ color: '#b87a2a', marginLeft: '8px' }}>（凍結中 {stampsFrozen} 章）</span>}
                <span style={{ color: '#888580', marginLeft: '8px' }}>可用 <strong style={{ color: '#1E1C1A' }}>{availableStamps}</strong> 章</span>
              </div>
            </div>

            {/* 進行中的兌換 */}
            {activeRedemptions.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#b87a2a', marginBottom: '12px' }}>進行中的兌換</div>
                {activeRedemptions.map(r => {
                  const isExpired = new Date(r.expires_at) < new Date();
                  const timeLeft  = Math.max(0, Math.floor((new Date(r.expires_at).getTime() - Date.now()) / 1000 / 60));
                  return (
                    <div key={r.id} style={{ padding: '14px 20px', background: '#fff8e1', border: '1px solid #f0c040', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '13px', color: '#1E1C1A', fontWeight: 500, marginBottom: '4px' }}>
                          {r.redeem_items?.name}
                          <span style={{ fontSize: '11px', color: '#888580', marginLeft: '8px' }}>（{r.stamps_cost} 章）</span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#888580' }}>
                          {r.type === 'code'
                            ? `兌換碼：${r.redeem_code} · 有效至 ${new Date(r.expires_at).toLocaleString('zh-TW')}`
                            : `線上兌換 · 有效至 ${new Date(r.expires_at).toLocaleDateString('zh-TW')}`
                          }
                        </div>
                      </div>
                      <button onClick={() => handleCancelRedemption(r.id, r.stamps_cost)} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#c0392b', cursor: 'pointer', flexShrink: 0 }}>取消兌換</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 兌換獎勵列表 */}
            {redeemItems.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#888580', marginBottom: '12px' }}>兌換獎勵</div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {redeemItems.map((item: any) => {
                    const canRedeem  = availableStamps >= item.stamps;
                    const activeCount = activeRedemptions.filter(r => r.reward_id === item.id).length;
                    return (
                      <div key={item.id} style={{ padding: '16px 20px', background: canRedeem ? '#f0faf4' : '#fff', border: `1px solid ${canRedeem ? '#2ab85a' : '#E8E4DC'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: canRedeem ? '12px' : '0' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: canRedeem ? '#2ab85a' : '#E8E4DC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 700, color: canRedeem ? '#fff' : '#888580' }}>{item.stamps}</span>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', color: '#1E1C1A', fontWeight: 500, marginBottom: '2px' }}>{item.name}</div>
                            {item.description && <div style={{ fontSize: '11px', color: '#888580' }}>{item.description}</div>}
                          </div>
                          {!canRedeem && <span style={{ fontSize: '11px', color: '#888580' }}>還差 {item.stamps - availableStamps} 章</span>}
                          {activeCount > 0 && <span style={{ fontSize: '11px', color: '#b87a2a', border: '1px solid #b87a2a', padding: '3px 10px', fontFamily: '"Montserrat", sans-serif' }}>兌換中 ×{activeCount}</span>}
                        </div>
                        {/* 章數夠就能兌換，不管有沒有進行中 */}
                        {canRedeem && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => openRedeemModal(item, 'online')} style={{ flex: 1, padding: '9px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 600, letterSpacing: '0.15em', cursor: 'pointer' }}>
                              線上兌換
                            </button>
                            <button onClick={() => openRedeemModal(item, 'code')} style={{ flex: 1, padding: '9px', background: 'transparent', color: '#1E1C1A', border: '1px solid #1E1C1A', fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 600, letterSpacing: '0.15em', cursor: 'pointer' }}>
                              現場兌換碼
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 集章說明 */}
            <div style={{ fontSize: '12px', color: '#888580', lineHeight: 2, padding: '16px 20px', background: '#F7F4EF', border: '1px solid #E8E4DC' }}>
              <div>每消費 NT${stampThreshold.toLocaleString()} 累積 1 章</div>
              <div>章的有效期限：最後一次消費後 {stampExpiry} 天</div>
            </div>

            {/* 最近異動記錄 */}
            {stampLogsData.length > 0 && (
              <div style={{ marginTop: '28px' }}>
                <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#888580', marginBottom: '12px' }}>最近異動記錄</div>
                <div>
                  {(showAllLogs ? stampLogsData : stampLogsData.slice(0, 10)).map(log => (
                    <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #E8E4DC' }}>
                      <div>
                        <div style={{ fontSize: '13px', color: '#1E1C1A', marginBottom: '2px' }}>{log.reason ?? '—'}</div>
                        <div style={{ fontSize: '11px', color: '#888580' }}>{new Date(log.created_at).toLocaleDateString('zh-TW')}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: log.change > 0 ? '#2ab85a' : '#c0392b' }}>
                          {log.change > 0 ? '+' : ''}{log.change}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888580' }}>餘 {log.stamps_after} 章</div>
                      </div>
                    </div>
                  ))}
                </div>
                {stampLogsData.length > 10 && (
                  <button onClick={() => setShowAllLogs(!showAllLogs)} style={{ marginTop: '12px', padding: '8px 0', background: 'transparent', border: 'none', fontSize: '12px', color: '#888580', cursor: 'pointer', textDecoration: 'underline' }}>
                    {showAllLogs ? '收起' : `查看更多（共 ${stampLogsData.length} 筆）`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 兌換確認 Modal */}
        {showRedeemModal && selectedReward && (
          <>
            <div onClick={() => setShowRedeemModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '480px', maxWidth: '90vw', zIndex: 401, padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '16px', color: '#1E1C1A', marginBottom: '20px' }}>
                確認{redeemType === 'online' ? '線上' : '現場'}兌換
              </h3>

              {/* 獎勵資訊 */}
              <div style={{ background: '#EDE9E2', padding: '14px 20px', marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', color: '#1E1C1A', fontWeight: 600, marginBottom: '4px' }}>{selectedReward.name}</div>
                {selectedReward.description && <div style={{ fontSize: '12px', color: '#888580' }}>{selectedReward.description}</div>}
                <div style={{ fontSize: '12px', color: '#555250', marginTop: '8px' }}>使用 <strong>{selectedReward.stamps}</strong> 章兌換</div>
              </div>

              {/* 注意事項 */}
              <div style={{ background: '#fef0e8', border: '1px solid #e8a87c', padding: '14px 16px', marginBottom: '20px', fontSize: '12px', color: '#7a3c00', lineHeight: 2 }}>
                {redeemNotice
                  ? redeemNotice.split('\n').map((line, i) => <div key={i}>{line}</div>)
                  : (
                    <>
                      <div>・確認兌換後，您的 {selectedReward.stamps} 章將立即凍結</div>
                      {redeemType === 'online'
                        ? <div>・兌換品將自動加入您的下一筆訂單購物車，無法手動移除</div>
                        : <div>・現場兌換碼請於 120 分鐘內至門市出示，逾時自動失效</div>
                      }
                      <div>・確認後章數立即凍結，無法取消</div>
                      <div>・請確保您確實要兌換此獎勵</div>
                    </>
                  )
                }
              </div>

              {/* 確認勾選 */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: '#1E1C1A', cursor: 'pointer', marginBottom: '24px', lineHeight: 1.8 }}>
                <input type="checkbox" checked={redeemConfirmed} onChange={e => setRedeemConfirmed(e.target.checked)} style={{ accentColor: '#1E1C1A', marginTop: '3px', flexShrink: 0 }} />
                我已了解以上規則，確認使用 <strong>{selectedReward.stamps}</strong> 章兌換「{selectedReward.name}」
              </label>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={handleRedeem} disabled={!redeemConfirmed || redeeming} style={{ flex: 1, padding: '12px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', cursor: redeemConfirmed && !redeeming ? 'pointer' : 'not-allowed', opacity: redeemConfirmed && !redeeming ? 1 : 0.4 }}>
                  {redeeming ? '處理中...' : '確認兌換'}
                </button>
                <button onClick={() => setShowRedeemModal(false)} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#555250', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </>
        )}

        {/* 現場兌換碼結果 Modal */}
        {showCodeResult && codeResult && (
          <>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '400px', maxWidth: '90vw', zIndex: 401, padding: '32px', textAlign: 'center' }}>
              <div style={{ marginBottom: '16px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1E1C1A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 5l-1 1" /><path d="M2 12h6l3-9 4 18 3-9h6" />
                </svg>
              </div>
              <h3 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '16px', color: '#1E1C1A', marginBottom: '8px' }}>兌換碼已產生</h3>
              <div style={{ fontSize: '13px', color: '#888580', marginBottom: '24px' }}>{codeResult.rewardName}</div>

              {/* 兌換碼 */}
              <div style={{ background: '#EDE9E2', padding: '20px', marginBottom: '16px' }}>
                <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '28px', fontWeight: 700, letterSpacing: '0.2em', color: '#1E1C1A' }}>
                  {codeResult.code}
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '24px' }}>
                有效期限：{new Date(codeResult.expiresAt).toLocaleString('zh-TW')}
              </div>
              <div style={{ fontSize: '11px', color: '#888580', marginBottom: '24px', lineHeight: 1.8 }}>
                請出示此畫面給門市人員核銷<br/>
                兌換碼逾時將自動失效，章數歸還
              </div>

              <button onClick={() => setShowCodeResult(false)} style={{ width: '100%', padding: '12px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', cursor: 'pointer' }}>
                關閉
              </button>
            </div>
          </>
        )}

        {/* 訂單記錄 */}
        {activeTab === 'orders' && (
          <div>
            <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.28em', color: '#1E1C1A', margin: '0 0 32px' }}>訂單記錄</h2>
            {ordersLoading ? <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p> :
              orders.length === 0 ? <p style={{ color: '#888580', fontSize: '13px' }}>目前沒有訂單記錄。</p> :
              orders.map(order => (
                <div key={order.order_no} style={{ padding: '20px 0', borderBottom: '1px solid #E8E4DC' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '13px', fontWeight: 600, letterSpacing: '0.1em', color: '#1E1C1A' }}>{order.order_no}</span>
                    <span style={{ fontSize: '11px', letterSpacing: '0.15em', color: STATUS_COLOR[order.status], border: `1px solid ${STATUS_COLOR[order.status]}`, padding: '2px 10px', fontFamily: '"Montserrat", sans-serif' }}>
                      {STATUS_LABEL[order.status]}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#555250', marginBottom: '6px' }}>
                    {order.order_items?.map((i: any) => `${i.name} ×${i.qty}`).join('、')}
                  </div>
                  {/* 追蹤號碼（有才顯示）*/}
                  {order.tracking_no && (
                    <div style={{ fontSize: '12px', color: '#2ab85a', marginBottom: '6px' }}>
                      {order.carrier && `${order.carrier} ／`} 追蹤號：{order.tracking_no}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#888580' }}>{new Date(order.created_at).toLocaleDateString('zh-TW')}</span>
                    <span style={{ color: '#1E1C1A', fontWeight: 500 }}>NT$ {order.total.toLocaleString()}</span>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* 收件地址 */}
        {activeTab === 'address' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.28em', color: '#1E1C1A', margin: 0 }}>收件地址</h2>
              {addresses.length < 5 && (
                <button onClick={openAddAddr} style={{ padding: '8px 20px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  ＋ 新增地址
                </button>
              )}
            </div>
            <p style={{ fontSize: '12px', color: '#888580', marginBottom: '24px' }}>最多可儲存 5 個收件地址（{addresses.length}/5）</p>

            {addresses.length === 0 ? (
              <div style={{ padding: '32px', border: '1px dashed #E8E4DC', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: '#888580', marginBottom: '16px' }}>尚未儲存任何收件地址</p>
                <button onClick={openAddAddr} style={{ padding: '10px 24px', background: 'transparent', border: '1px solid #E8E4DC', fontFamily: '"Noto Sans TC", sans-serif', fontSize: '12px', color: '#888580', cursor: 'pointer', letterSpacing: '0.1em' }}>
                  ＋ 新增收件地址
                </button>
              </div>
            ) : (
              addresses.map(addr => (
                <div key={addr.id} style={{ padding: '20px 24px', border: `1px solid ${addr.is_default ? '#1E1C1A' : '#E8E4DC'}`, marginBottom: '12px', position: 'relative' }}>
                  {addr.is_default && (
                    <span style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '10px', color: '#1E1C1A', border: '1px solid #1E1C1A', padding: '2px 8px', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.15em' }}>預設</span>
                  )}
                  {addr.label && <div style={{ fontSize: '11px', color: '#888580', letterSpacing: '0.15em', marginBottom: '6px', fontFamily: '"Montserrat", sans-serif', textTransform: 'uppercase' }}>{addr.label}</div>}
                  <div style={{ fontSize: '14px', fontWeight: 500, color: '#1E1C1A', marginBottom: '4px' }}>{addr.name}</div>
                  <div style={{ fontSize: '12px', color: '#555250', marginBottom: '4px' }}>{addr.phone}</div>
                  {addr.type === 'home' ? (
                    <div style={{ fontSize: '12px', color: '#555250' }}>{addr.city}{addr.district}{addr.address}</div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#555250' }}>{addr.cvs_brand === '711' ? '7-11' : '全家'} {addr.store_name} — {addr.store_address}</div>
                  )}
                  <div style={{ display: 'flex', gap: '12px', marginTop: '14px' }}>
                    {!addr.is_default && (
                      <button onClick={() => setDefaultAddr(addr.id)} style={{ fontSize: '11px', color: '#888580', background: 'transparent', border: '1px solid #E8E4DC', padding: '5px 12px', cursor: 'pointer' }}>設為預設</button>
                    )}
                    <button onClick={() => openEditAddr(addr)} style={{ fontSize: '11px', color: '#555250', background: 'transparent', border: '1px solid #E8E4DC', padding: '5px 12px', cursor: 'pointer' }}>編輯</button>
                    <button onClick={() => handleDeleteAddr(addr.id)} style={{ fontSize: '11px', color: '#c0392b', background: 'transparent', border: '1px solid #E8E4DC', padding: '5px 12px', cursor: 'pointer' }}>刪除</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 地址 Modal */}
      {showAddrModal && (
        <>
          <div onClick={() => setShowAddrModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '480px', maxWidth: '90vw', zIndex: 201, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '15px', color: '#1E1C1A' }}>{editingAddrId ? '編輯收件地址' : '新增收件地址'}</span>
              <button onClick={() => setShowAddrModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888580' }}>×</button>
            </div>
            <div style={{ padding: '24px', display: 'grid', gap: '16px' }}>
              {/* 地址暱稱 */}
              <div>
                <label style={labelStyle}>地址暱稱（選填）</label>
                <input value={addrForm.label} onChange={e => setAddrForm({...addrForm, label: e.target.value})} placeholder="例：自己、媽媽、公司" style={inputStyle} />
              </div>
              {/* 收件人 + 手機 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>收件人姓名 *</label>
                  <input value={addrForm.name} onChange={e => setAddrForm({...addrForm, name: e.target.value})} placeholder="請輸入姓名" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>手機號碼 *</label>
                  <input value={addrForm.phone} onChange={e => setAddrForm({...addrForm, phone: e.target.value})} placeholder="09XXXXXXXX" style={inputStyle} />
                </div>
              </div>
              {/* 配送類型 */}
              <div>
                <label style={labelStyle}>配送類型</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                  {[{ val: 'home', label: '宅配地址' }, { val: 'cvs', label: '超商取貨' }].map(({ val, label }) => (
                    <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1E1C1A', cursor: 'pointer' }}>
                      <input type="radio" value={val} checked={addrForm.type === val} onChange={() => setAddrForm({...addrForm, type: val})} style={{ accentColor: '#1E1C1A' }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              {/* 宅配欄位 */}
              {addrForm.type === 'home' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>縣市 *</label>
                      <select value={addrForm.city} onChange={e => setAddrForm({...addrForm, city: e.target.value})} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">選擇縣市</option>
                        {CITIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>鄉鎮市區</label>
                      <input value={addrForm.district} onChange={e => setAddrForm({...addrForm, district: e.target.value})} placeholder="鄉鎮市區" style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>詳細地址 *</label>
                    <input value={addrForm.address} onChange={e => setAddrForm({...addrForm, address: e.target.value})} placeholder="路名、門牌號碼" style={inputStyle} />
                  </div>
                </>
              )}
              {/* 超商欄位 */}
              {addrForm.type === 'cvs' && (
                <>
                  <div>
                    <label style={labelStyle}>超商品牌</label>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                      {[{ val: '711', label: '7-11' }, { val: 'family', label: '全家' }].map(({ val, label }) => (
                        <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1E1C1A', cursor: 'pointer' }}>
                          <input type="radio" value={val} checked={addrForm.cvs_brand === val} onChange={() => setAddrForm({...addrForm, cvs_brand: val})} style={{ accentColor: '#1E1C1A' }} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>門市名稱 *</label>
                    <input value={addrForm.store_name} onChange={e => setAddrForm({...addrForm, store_name: e.target.value})} placeholder="例：翊豐門市" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>門市地址</label>
                    <input value={addrForm.store_address} onChange={e => setAddrForm({...addrForm, store_address: e.target.value})} placeholder="例：桃園市平鎮區中豐路一段36號" style={inputStyle} />
                  </div>
                </>
              )}
              {/* 設為預設 */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#555250', cursor: 'pointer' }}>
                <input type="checkbox" checked={addrForm.is_default} onChange={e => setAddrForm({...addrForm, is_default: e.target.checked})} style={{ accentColor: '#1E1C1A' }} />
                設為預設收件地址
              </label>
              <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
                <button onClick={handleSaveAddr} disabled={savingAddr} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: savingAddr ? 0.6 : 1 }}>
                  {savingAddr ? '儲存中...' : '儲存'}
                </button>
                <button onClick={() => setShowAddrModal(false)} style={{ padding: '10px 32px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
