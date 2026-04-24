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
import s from './MemberDashboard.module.css';

const STATUS_LABEL: Record<string, string> = { processing: '處理中', shipped: '已出貨', done: '已完成', cancelled: '已取消' };
const STATUS_COLOR: Record<string, string> = { processing: '#b87a2a', shipped: '#2a7ab8', done: '#2ab85a', cancelled: '#888580' };

// 根據付款狀態決定顯示文字：信用卡/ATM 未付款或失敗 → 顯示付款相關狀態
function getDisplayStatus(order: any): { label: string; color: string } {
  const needPay = order.pay_method === 'credit' || order.pay_method === 'atm';
  if (needPay && order.pay_status === 'pending') return { label: '待付款', color: '#b87a2a' };
  if (order.status === 'cancelled' && order.pay_status === 'failed') return { label: '已取消', color: '#888580' };
  if (needPay && order.pay_status === 'failed')  return { label: '付款失敗', color: '#c44' };
  if (needPay && order.pay_status === 'refunded') return { label: '已退款', color: '#888580' };
  return { label: STATUS_LABEL[order.status] ?? order.status, color: STATUS_COLOR[order.status] ?? '#888' };
}
const CITIES = ['台北市','新北市','基隆市','桃園市','台中市','台南市','高雄市','新竹縣','新竹市','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','嘉義市','屏東縣','宜蘭縣','花蓮縣','台東縣','澎湖縣','金門縣','連江縣'];

interface MemberDashboardProps {
  userId:   string;
  userName: string;
  onLogout: () => void;
}

const EMPTY_ADDR = { label: '', name: '', phone: '', type: 'home', city: '', district: '', address: '', cvs_brand: '711', store_name: '', store_address: '', is_default: false };

export default function MemberDashboard({ userId, userName, onLogout }: MemberDashboardProps) {
  const { addItem, showToast, triggerBounce } = useCart();
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

  // 兌換流程
  const [activeRedemptions, setActiveRedemptions] = useState<any[]>([]);
  const [stampLogsData,     setStampLogsData]     = useState<any[]>([]);
  const [showAllLogs,       setShowAllLogs]        = useState(false); // 目前進行中的兌換
  const [showRedeemModal,   setShowRedeemModal]   = useState(false);
  const [selectedReward,    setSelectedReward]    = useState<any | null>(null);
  const [rewardVariants,    setRewardVariants]    = useState<any[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [selectedVariantName, setSelectedVariantName] = useState('');
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
        if (settings) { setStampGoal(settings.stamp_goal ?? 8); setStampTotalSlots(settings.stamp_total_slots ?? 10); setStampThreshold(settings.stamp_threshold ?? 200); setStampExpiry(settings.stamp_expiry ?? 365); setStampCardName(settings.stamp_card_name ?? '未半甜點護照'); setStampIconUrl(settings.stamp_icon_url ?? ''); }
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
      const { data } = await supabase.from('orders').select('order_no, status, total, created_at, tracking_no, carrier, pay_status, pay_method, order_items(name, qty)').eq('member_id', userId).order('created_at', { ascending: false });
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
    setSelectedVariantId(null);
    setSelectedVariantName('');
    setRewardVariants([]);
    setShowRedeemModal(true);

    if (type === 'online' && item.product_id) {
      supabase
        .from('product_variants')
        .select('id, name, is_available')
        .eq('product_id', item.product_id)
        .eq('is_available', true)
        .order('sort_order')
        .then(({ data }) => setRewardVariants(data ?? []));
    }
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
        if (rewardVariants.length > 0 && !selectedVariantId) {
          alert('請選擇商品規格');
          setRedeeming(false);
          setRedeemConfirmed(false);
          return;
        }
        const resolvedVariantId   = selectedVariantId ?? selectedReward.variant_id ?? undefined;
        const resolvedVariantName = selectedVariantName || undefined;
        addItem({
          id:            `redeem-${data.redemption_id}`,
          slug:          product.slug ?? 'redeem-item',
          name:          selectedReward.name,
          price:         0,
          imageUrl:      product.image_url ?? undefined,
          isRedeemItem:  true,
          redemptionId:  data.redemption_id,
          ...(selectedReward.product_id && { productRealId: selectedReward.product_id }),
          ...(resolvedVariantId   && { variantId:   resolvedVariantId }),
          ...(resolvedVariantName && { variantName: resolvedVariantName }),
        } as any);
        showToast(`已加入購物車：${selectedReward.name}${resolvedVariantName ? `（${resolvedVariantName}）` : ''} × 1`);
        triggerBounce();
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

  return (
    <div className={s.layout}>

      {/* 左側 */}
      <div className={s.sidebar}>
        <div className={s.avatar}>
          <div className={s.avatarCircle}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div className={s.avatarName}>{name}</div>
          <div className={s.avatarRole}>集章會員</div>
        </div>
        <nav className={s.nav}>
          {(['profile', 'stamps', 'orders', 'address'] as const).map(tab => {
            const labels = { profile: '個人資料', stamps: '集章紀錄', orders: '訂單記錄', address: '收件地址' };
            return <span key={tab} className={activeTab === tab ? s.navItemActive : s.navItem} onClick={() => setActiveTab(tab)}>{labels[tab]}</span>;
          })}
          <span onClick={onLogout} className={s.navLogout}>登出</span>
        </nav>
      </div>

      {/* 右側 */}
      <div className={s.content}>
        {/* 個人資料 */}
        {activeTab === 'profile' && (
          <div>
            <h2 className={s.sectionHeading}>個人資料</h2>
            <div className={s.profileForm}>
              {[
                { label: '姓名', type: 'text', val: name, set: setName, ph: '請輸入姓名' },
                { label: '手機號碼', type: 'tel', val: phone, set: setPhone, ph: '09XXXXXXXX' },
                { label: '生日', type: 'date', val: birthday, set: setBirthday, ph: '' },
              ].map(({ label, type, val, set, ph }) => (
                <div key={label} className={s.fieldGroup}>
                  <label className={s.label}>{label}</label>
                  <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} className={s.input} />
                </div>
              ))}
              <button onClick={handleSaveProfile} className={s.saveBtn}>
                儲存變更
              </button>
            </div>
          </div>
        )}

        {/* 集章紀錄 */}
        {activeTab === 'stamps' && (
          <div>
            <h2 className={s.sectionHeading}>集章紀錄</h2>

            {/* 集章卡 */}
            <div className={s.stampCard}>
              <div className={s.stampCardHeader}>
                <div className={s.stampCardName}>{stampCardName}</div>
                <div className={s.stampCardSubtitle}>集滿印章即可兌換會員專屬甜點</div>
              </div>
              <div className={s.stampGrid} style={{ gridTemplateColumns: `repeat(${Math.min(stampTotalSlots, 5)}, 1fr)` }}>
                {Array.from({ length: stampTotalSlots }).map((_, i) => {
                  const filled = i < stamps;
                  const frozen = i >= availableStamps && i < stamps;
                  return (
                    <div key={i} className={`${s.stampSlot} ${filled ? (frozen ? s.stampSlotFrozen : s.stampSlotCollected) : ''}`}>
                      <div className={s.stampInner}>
                        {filled ? (
                          frozen
                            ? <span className={s.stampFrozenEmoji}>🔒</span>
                            : stampIconUrl
                              ? <img src={stampIconUrl} alt="章" className={s.stampIcon} />
                              : <span className={s.stampEmoji}>🌸</span>
                        ) : (
                          <span className={s.stampNumber}>{i + 1}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={s.stampSummary}>
                <div className={s.stampSummaryItem}>
                  <span className={s.stampSummaryLabel}>已集章數</span>
                  <span className={s.stampSummaryValue}>{stamps}</span>
                </div>
                {stampsFrozen > 0 && (
                  <div className={s.stampSummaryItem}>
                    <span className={s.stampSummaryLabel}>凍結中</span>
                    <span className={s.stampSummaryValueWarn}>{stampsFrozen}</span>
                  </div>
                )}
                <div className={s.stampSummaryItem}>
                  <span className={s.stampSummaryLabel}>目前可用</span>
                  <span className={s.stampSummaryValue}>{availableStamps}</span>
                </div>
              </div>
            </div>

            {/* 進行中的兌換 */}
            {activeRedemptions.length > 0 && (
              <div className={s.redeemActiveSection}>
                <div className={s.subSectionTitleWarn}>進行中的兌換</div>
                {activeRedemptions.map(r => (
                  <div key={r.id} className={s.activeRedemption}>
                    <div className={s.activeRedemptionBody}>
                      {/* 第一行：名稱 + badge 群 */}
                      <div className={s.activeRedemptionRow}>
                        <span className={s.activeRedemptionName}>{r.redeem_items?.name}</span>
                        <span className={s.activeRedemptionStampBadge}>{r.stamps_cost} 章</span>
                        <span className={s.activeRedemptionTypeBadge}>
                          {r.type === 'code' ? '現場兌換' : '線上兌換'}
                        </span>
                      </div>
                      {/* 第二行：說明或兌換碼 */}
                      <div className={s.activeRedemptionDetail}>
                        {r.type === 'code'
                          ? <>兌換碼：<strong>{r.redeem_code}</strong></>
                          : '商品已加入購物車，請於期限內完成下單'
                        }
                      </div>
                      {/* 第三行：有效期限 */}
                      <div className={s.activeRedemptionExpiry}>
                        有效至 {r.type === 'code'
                          ? new Date(r.expires_at).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })
                          : new Date(r.expires_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
                        }
                      </div>
                    </div>
                    <button onClick={() => handleCancelRedemption(r.id, r.stamps_cost)} className={s.cancelRedeemBtn}>
                      取消兌換
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 兌換獎勵列表 */}
            {redeemItems.length > 0 && (
              <div className={s.rewardListSection}>
                <div className={s.subSectionTitle}>兌換獎勵</div>
                <div className={s.rewardGrid}>
                  {redeemItems.map((item: any) => {
                    const canRedeem  = availableStamps >= item.stamps;
                    const activeCount = activeRedemptions.filter(r => r.reward_id === item.id).length;
                    return (
                      <div key={item.id} className={canRedeem ? s.rewardCardCanRedeem : s.rewardCard}>
                        <div className={s.rewardHeader}>
                          <div className={s.rewardStampCircle} style={{ background: canRedeem ? '#edf7f1' : '#f6f1ea' }}>
                            <span className={s.rewardStampNumber} style={{ color: canRedeem ? '#2a8a4a' : '#888580' }}>{item.stamps}</span>
                          </div>
                          <div className={s.rewardInfo}>
                            <div className={s.rewardName}>{item.name}</div>
                            {item.description && <div className={s.rewardDesc}>{item.description}</div>}
                          </div>
                          {!canRedeem && <span className={s.rewardNeedMore}>還差 {item.stamps - availableStamps} 章</span>}
                          {activeCount > 0 && <span className={s.rewardActiveBadge}>兌換中 ×{activeCount}</span>}
                        </div>
                        {/* 章數夠就能兌換，不管有沒有進行中 */}
                        {canRedeem && (
                          <div className={s.rewardActions}>
                            <button onClick={() => openRedeemModal(item, 'online')} className={s.redeemOnlineBtn}>
                              線上兌換
                            </button>
                            <button onClick={() => openRedeemModal(item, 'code')} className={s.redeemCodeBtn}>
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
            <div className={s.stampInfo}>
              <div>每消費 NT${stampThreshold.toLocaleString()} 累積 1 章</div>
              <div>章的有效期限：最後一次消費後 {stampExpiry} 天</div>
            </div>

            {/* 最近異動記錄 */}
            {stampLogsData.length > 0 && (
              <div className={s.logsSection}>
                <div className={s.subSectionTitle}>最近異動記錄</div>
                <div>
                  {(showAllLogs ? stampLogsData : stampLogsData.slice(0, 10)).map(log => (
                    <div key={log.id} className={s.logRow}>
                      <div>
                        <div className={s.logReason}>{log.reason ?? '—'}</div>
                        <div className={s.logDate}>{new Date(log.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}</div>
                      </div>
                      <div>
                        <div className={log.change > 0 ? s.logChangePositive : s.logChangeNegative}>
                          {log.change > 0 ? '+' : ''}{log.change}
                        </div>
                        <div className={s.logAfter}>餘 {log.stamps_after} 章</div>
                      </div>
                    </div>
                  ))}
                </div>
                {stampLogsData.length > 10 && (
                  <button onClick={() => setShowAllLogs(!showAllLogs)} className={s.showMoreBtn}>
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
            <div onClick={() => setShowRedeemModal(false)} className={s.modalOverlay} />
            <div className={s.modal}>
              <h3 className={s.modalTitle}>
                確認{redeemType === 'online' ? '線上' : '現場'}兌換
              </h3>

              {/* 獎勵資訊 */}
              <div className={s.rewardInfoBox}>
                <div className={s.rewardInfoName}>{selectedReward.name}</div>
                {selectedReward.description && <div className={s.rewardInfoDesc}>{selectedReward.description}</div>}
                <div className={s.rewardInfoCost}>使用 <strong>{selectedReward.stamps}</strong> 章兌換</div>
              </div>

              {/* 規格選擇（線上兌換且商品有規格時才顯示）*/}
              {redeemType === 'online' && rewardVariants.length > 0 && (
                <div className={s.variantSelector}>
                  <div className={s.variantLabel}>選擇規格</div>
                  <div className={s.variantOptions}>
                    {rewardVariants.map(v => (
                      <button
                        key={v.id}
                        className={`${s.variantOption} ${selectedVariantId === v.id ? s.variantOptionSelected : ''}`}
                        onClick={() => { setSelectedVariantId(v.id); setSelectedVariantName(v.name); }}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 注意事項 */}
              <div className={s.warningBox}>
                {redeemType === 'online'
                  ? <div>・點選「線上兌換」後，商品將自動加入購物車，請儘快與其他商品一併完成下單。</div>
                  : <div>・現場兌換碼請於 120 分鐘內至門市出示，逾時自動失效</div>
                }
              </div>

              {/* 確認勾選 */}
              <label className={s.confirmLabel}>
                <input type="checkbox" checked={redeemConfirmed} onChange={e => setRedeemConfirmed(e.target.checked)} className={s.confirmCheckbox} />
                我已了解以上規則，確認使用 <strong>{selectedReward.stamps}</strong> 章兌換「{selectedReward.name}」
              </label>

              <div className={s.modalActions}>
                <button onClick={handleRedeem} disabled={!redeemConfirmed || redeeming || (rewardVariants.length > 0 && !selectedVariantId)} className={redeemConfirmed && !redeeming && !(rewardVariants.length > 0 && !selectedVariantId) ? s.modalPrimaryBtn : s.modalPrimaryBtnDisabled}>
                  {redeeming ? '處理中...' : '確認兌換'}
                </button>
                <button onClick={() => setShowRedeemModal(false)} className={s.modalSecondaryBtn}>取消</button>
              </div>
            </div>
          </>
        )}

        {/* 現場兌換碼結果 Modal */}
        {showCodeResult && codeResult && (
          <>
            <div className={s.modalOverlay} />
            <div className={s.modalSmall}>
              <div className={s.codeResultIcon}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1E1C1A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 5l-1 1" /><path d="M2 12h6l3-9 4 18 3-9h6" />
                </svg>
              </div>
              <h3 className={s.codeResultTitle}>兌換碼已產生</h3>
              <div className={s.codeResultReward}>{codeResult.rewardName}</div>

              {/* 兌換碼 */}
              <div className={s.codeBox}>
                <div className={s.codeText}>
                  {codeResult.code}
                </div>
              </div>

              <div className={s.codeExpiry}>
                有效期限：{new Date(codeResult.expiresAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
              </div>
              <div className={s.codeHint}>
                請出示此畫面給門市人員核銷<br/>
                兌換碼逾時將自動失效，章數歸還
              </div>

              <button onClick={() => setShowCodeResult(false)} className={s.codeCloseBtn}>
                關閉
              </button>
            </div>
          </>
        )}

        {/* 訂單記錄 */}
        {activeTab === 'orders' && (
          <div>
            <h2 className={s.sectionHeading}>訂單記錄</h2>
            {ordersLoading ? <p className={s.ordersEmpty}>載入中...</p> :
              orders.length === 0 ? <p className={s.ordersEmpty}>目前沒有訂單記錄。</p> :
              orders.map(order => (
                <div key={order.order_no} className={s.orderCard}>
                  <div className={s.orderHeader}>
                    <span className={s.orderNo}>{order.order_no}</span>
                    {(() => {
                      const ds = getDisplayStatus(order);
                      return (
                        <span className={s.orderStatusBadge} style={{ color: ds.color, border: `1px solid ${ds.color}` }}>
                          {ds.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div className={s.orderItems}>
                    {order.order_items?.map((i: any) => `${i.name} ×${i.qty}`).join('、')}
                  </div>
                  {/* 追蹤號碼（有才顯示）*/}
                  {order.tracking_no && (
                    <div className={s.orderTracking}>
                      {order.carrier && `${order.carrier} ／`} 追蹤號：{order.tracking_no}
                    </div>
                  )}
                  <div className={s.orderFooter}>
                    <span className={s.orderDate}>{new Date(order.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}</span>
                    <span className={s.orderTotal}>NT$ {order.total.toLocaleString()}</span>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* 收件地址 */}
        {activeTab === 'address' && (
          <div>
            <div className={s.addressHeader}>
              <h2 className={s.sectionHeading} style={{ margin: 0 }}>收件地址</h2>
              {addresses.length < 5 && (
                <button onClick={openAddAddr} className={s.addAddrBtn}>
                  ＋ 新增地址
                </button>
              )}
            </div>
            <p className={s.addressSubtitle}>最多可儲存 5 個收件地址（{addresses.length}/5）</p>

            {addresses.length === 0 ? (
              <div className={s.addressEmpty}>
                <p className={s.addressEmptyText}>尚未儲存任何收件地址</p>
                <button onClick={openAddAddr} className={s.addressEmptyBtn}>
                  ＋ 新增收件地址
                </button>
              </div>
            ) : (
              addresses.map(addr => (
                <div key={addr.id} className={addr.is_default ? s.addressCardDefault : s.addressCard}>
                  {addr.is_default && (
                    <span className={s.addressDefaultBadge}>預設</span>
                  )}
                  {addr.label && <div className={s.addressLabel}>{addr.label}</div>}
                  <div className={s.addressName}>{addr.name}</div>
                  <div className={s.addressPhone}>{addr.phone}</div>
                  {addr.type === 'home' ? (
                    <div className={s.addressDetail}>{addr.city}{addr.district}{addr.address}</div>
                  ) : (
                    <div className={s.addressDetail}>{addr.cvs_brand === '711' ? '7-11' : '全家'} {addr.store_name} — {addr.store_address}</div>
                  )}
                  <div className={s.addressActions}>
                    {!addr.is_default && (
                      <button onClick={() => setDefaultAddr(addr.id)} className={s.addrActionDefault}>設為預設</button>
                    )}
                    <button onClick={() => openEditAddr(addr)} className={s.addrActionEdit}>編輯</button>
                    <button onClick={() => handleDeleteAddr(addr.id)} className={s.addrActionDelete}>刪除</button>
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
          <div onClick={() => setShowAddrModal(false)} className={s.modalOverlayLight} />
          <div className={s.modalAddr}>
            <div className={s.addrModalHeader}>
              <span className={s.addrModalTitle}>{editingAddrId ? '編輯收件地址' : '新增收件地址'}</span>
              <button onClick={() => setShowAddrModal(false)} className={s.addrModalClose}>×</button>
            </div>
            <div className={s.addrModalBody}>
              {/* 地址暱稱 */}
              <div>
                <label className={s.label}>地址暱稱（選填）</label>
                <input value={addrForm.label} onChange={e => setAddrForm({...addrForm, label: e.target.value})} placeholder="例：自己、媽媽、公司" className={s.input} />
              </div>
              {/* 收件人 + 手機 */}
              <div className={s.addrTwoCol}>
                <div>
                  <label className={s.label}>收件人姓名 *</label>
                  <input value={addrForm.name} onChange={e => setAddrForm({...addrForm, name: e.target.value})} placeholder="請輸入姓名" className={s.input} />
                </div>
                <div>
                  <label className={s.label}>手機號碼 *</label>
                  <input value={addrForm.phone} onChange={e => setAddrForm({...addrForm, phone: e.target.value})} placeholder="09XXXXXXXX" className={s.input} />
                </div>
              </div>
              {/* 配送類型 */}
              <div>
                <label className={s.label}>配送類型</label>
                <div className={s.radioGroup}>
                  {[{ val: 'home', label: '宅配地址' }, { val: 'cvs', label: '超商取貨' }].map(({ val, label }) => (
                    <label key={val} className={s.radioLabel}>
                      <input type="radio" value={val} checked={addrForm.type === val} onChange={() => setAddrForm({...addrForm, type: val})} className={s.radioInput} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              {/* 宅配欄位 */}
              {addrForm.type === 'home' && (
                <>
                  <div className={s.addrTwoCol}>
                    <div>
                      <label className={s.label}>縣市 *</label>
                      <select value={addrForm.city} onChange={e => setAddrForm({...addrForm, city: e.target.value})} className={s.input} style={{ cursor: 'pointer' }}>
                        <option value="">選擇縣市</option>
                        {CITIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={s.label}>鄉鎮市區</label>
                      <input value={addrForm.district} onChange={e => setAddrForm({...addrForm, district: e.target.value})} placeholder="鄉鎮市區" className={s.input} />
                    </div>
                  </div>
                  <div>
                    <label className={s.label}>詳細地址 *</label>
                    <input value={addrForm.address} onChange={e => setAddrForm({...addrForm, address: e.target.value})} placeholder="路名、門牌號碼" className={s.input} />
                  </div>
                </>
              )}
              {/* 超商欄位 */}
              {addrForm.type === 'cvs' && (
                <>
                  <div>
                    <label className={s.label}>超商品牌</label>
                    <div className={s.radioGroup}>
                      {[{ val: '711', label: '7-11' }, { val: 'family', label: '全家' }].map(({ val, label }) => (
                        <label key={val} className={s.radioLabel}>
                          <input type="radio" value={val} checked={addrForm.cvs_brand === val} onChange={() => setAddrForm({...addrForm, cvs_brand: val})} className={s.radioInput} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={s.label}>門市名稱 *</label>
                    <input value={addrForm.store_name} onChange={e => setAddrForm({...addrForm, store_name: e.target.value})} placeholder="例：翊豐門市" className={s.input} />
                  </div>
                  <div>
                    <label className={s.label}>門市地址</label>
                    <input value={addrForm.store_address} onChange={e => setAddrForm({...addrForm, store_address: e.target.value})} placeholder="例：桃園市平鎮區中豐路一段36號" className={s.input} />
                  </div>
                </>
              )}
              {/* 設為預設 */}
              <label className={s.checkboxLabel}>
                <input type="checkbox" checked={addrForm.is_default} onChange={e => setAddrForm({...addrForm, is_default: e.target.checked})} className={s.radioInput} />
                設為預設收件地址
              </label>
              <div className={s.addrModalActions}>
                <button onClick={handleSaveAddr} disabled={savingAddr} className={savingAddr ? s.addrSaveBtnDisabled : s.addrSaveBtn}>
                  {savingAddr ? '儲存中...' : '儲存'}
                </button>
                <button onClick={() => setShowAddrModal(false)} className={s.addrCancelBtn}>取消</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
