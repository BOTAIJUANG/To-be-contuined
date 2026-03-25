'use client';

// app/checkout/page.tsx  ──  結帳頁（含運費計算、地址自動帶入）
//
// 【重要修改】
// 原本是在前端直接用 supabase.from('orders').insert(...) 建立訂單，
// 這樣很危險（使用者可以竄改價格）。
// 現在改成呼叫後端的 /api/orders API 來建立訂單，
// 所有金額計算都在 server 端完成。

import { useState, useEffect, useMemo } from 'react';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { usePromotions } from '@/hooks/usePromotions';
import { CartItemForCalc } from '@/lib/promotions';
import Link from 'next/link';

const CITIES = ['台北市','新北市','桃園市','台中市','台南市','高雄市','新竹縣','新竹市','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','嘉義市','屏東縣','宜蘭縣','花蓮縣','台東縣'];

// 配送方式設定（settingKey 對應 store_settings 的開關欄位）
const SHIP_OPTIONS = [
  { value: 'home_normal', title: '一般宅配',  sub: '黑貓 / 新竹 — 常溫商品',  feeKey: 'fee_home_normal', settingKey: 'ship_home_normal' },
  { value: 'home_cold',   title: '低溫宅配',  sub: '冷藏配送 — 蛋糕類商品',   feeKey: 'fee_home_cold',   settingKey: 'ship_home_cold' },
  { value: 'cvs_711',     title: '7-11 取貨', sub: '超商取貨付款',             feeKey: 'fee_cvs',         settingKey: 'ship_cvs_711' },
  { value: 'cvs_family',  title: '全家取貨',  sub: '超商取貨付款',             feeKey: 'fee_cvs',         settingKey: 'ship_cvs_family' },
  { value: 'store',       title: '門市自取',  sub: '宜蘭市神農路二段 96 號',   feeKey: null,              settingKey: 'ship_store' },
];
const PAY_OPTIONS = [
  { value: 'credit', title: '信用卡',   sub: 'Visa / Master / JCB — 綠界 ECPay 安全加密' },
  { value: 'atm',    title: 'ATM虛擬帳號', sub: '虛擬 ATM 付款之退款，將以銀行轉帳方式另行辦理，無法原路退回。' },
];

const labelStyle: React.CSSProperties = { fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.3em', color: '#888580', textTransform: 'uppercase', display: 'block', marginBottom: '8px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 0', border: 'none', borderBottom: '1px solid #E8E4DC', fontFamily: 'inherit', fontSize: '13px', background: 'transparent', color: '#1E1C1A', letterSpacing: '0.05em', outline: 'none' };
const sectionTitleStyle: React.CSSProperties = { fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 600, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#1E1C1A', marginBottom: '16px' };
const btnStyle: React.CSSProperties = { padding: '12px 44px', border: '1px solid rgba(0,0,0,0.18)', background: 'transparent', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.35em', textTransform: 'uppercase', color: '#1E1C1A', cursor: 'pointer' };

const RadioCard = ({ value, title, sub, checked, onChange, fee }: { value: string; title: string; sub: string; checked: boolean; onChange: () => void; fee?: string }) => (
  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px 20px', border: `1px solid ${checked ? '#1E1C1A' : '#E8E4DC'}`, cursor: 'pointer', marginBottom: '10px', transition: 'border-color 0.3s' }}>
    <input type="radio" value={value} checked={checked} onChange={onChange} style={{ marginTop: '2px', accentColor: '#1E1C1A' }} />
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '13px', color: '#1E1C1A', letterSpacing: '0.1em', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '11px', color: '#888580', letterSpacing: '0.05em' }}>{sub}</div>
    </div>
    {fee && <div style={{ fontSize: '12px', color: '#888580', whiteSpace: 'nowrap' }}>{fee}</div>}
  </label>
);

export default function CheckoutPage() {
  const { items, totalPrice, clearCart, mixedShipDate } = useCart();
  const [step, _setStep] = useState<1|2|3|'done'>(() => {
    if (typeof window === 'undefined') return 1;
    const saved = sessionStorage.getItem('checkout_step');
    if (saved === '2') return 2;
    if (saved === '3') return 3;
    if (saved === 'done') return 'done';
    return 1;
  });
  const setStep = (s: 1|2|3|'done') => {
    _setStep(s);
    sessionStorage.setItem('checkout_step', String(s));
  };

  // 兌換品相關
  const redeemItem    = items.find(i => i.isRedeemItem);           // 購物車裡的兌換品
  const regularItems  = items.filter(i => !i.isRedeemItem);        // 一般商品
  const redeemStamps  = redeemItem ? 0 : 0;                        // 兌換品價格為 0

  // 可選出貨日期（從 API 取得）
  const [availableDates,  setAvailableDates]  = useState<string[]>([]);
  const [datesLoading,    setDatesLoading]    = useState(false);
  const [noIntersection,  setNoIntersection]  = useState(false);
  const [intersectionMsg, setIntersectionMsg] = useState('');

  // 混購確認彈窗
  const [showMixedModal,    setShowMixedModal]    = useState(false);
  const [mixedConfirmed,    setMixedConfirmed]    = useState(false);

  // 是否混購
  const hasMixed       = items.some(i => i.isPreorder) && items.some(i => !i.isPreorder);
  const stockShipDate  = (() => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    return today.toISOString().split('T')[0];
  })();

  // 登入狀態
  const [memberId, setMemberId] = useState<string | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<number | null>(null);

  // 商店配送設定
  const [storeSettings, setStoreSettings] = useState<any>(null);

  // 運費
  const [shippingFee, setShippingFee] = useState(0);

  // 優惠活動
  const cartItemsForCalc: CartItemForCalc[] = useMemo(() =>
    items.filter(i => !i.isRedeemItem).map(i => ({
      product_id: i.productRealId ?? parseInt(i.id),
      qty: i.qty,
      price: i.price,
      name: i.name,
    })),
    [items]
  );
  const { promoResult } = usePromotions(cartItemsForCalc);
  const promoDiscount = promoResult.total_discount;

  // Step 2 欄位
  const [shipMethod, setShipMethod] = useState('home_cold');
  const [name,       setName]       = useState('');
  const [phone,      setPhone]      = useState('');
  const [email,      setEmail]      = useState('');
  const [city,       setCity]       = useState('');
  const [district,   setDistrict]   = useState('');
  const [address,    setAddress]    = useState('');
  const [cvsStoreName, setCvsStoreName] = useState('');
  const [cvsStoreAddr, setCvsStoreAddr] = useState('');
  const [date,       setDate]       = useState('');
  const [note,       setNote]       = useState('');
  const [coupon,     setCoupon]     = useState('');
  const [couponMsg,  setCouponMsg]  = useState('');
  const [discount,   setDiscount]   = useState(0);
  const [payMethod,  setPayMethod]  = useState('credit');
  const [submitting, setSubmitting] = useState(false);
  const [orderNo,    setOrderNo]    = useState(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('checkout_orderNo') ?? '';
  });

  const isHomeDelivery = shipMethod === 'home_normal' || shipMethod === 'home_cold';
  const isCvsPickup    = shipMethod === 'cvs_711' || shipMethod === 'cvs_family';
  const isStorePickup  = shipMethod === 'store';

  // 根據後台設定過濾可用的配送方式
  const availableShipOptions = storeSettings
    ? SHIP_OPTIONS.filter(opt => storeSettings[opt.settingKey] !== false)
    : SHIP_OPTIONS;

  // 載入登入狀態 + 商店設定
  useEffect(() => {
    const load = async () => {
      const [{ data: { session } }, { data: settings }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from('store_settings').select('fee_home_normal, fee_home_cold, fee_cvs, free_ship_amount, free_ship_cold, ship_home_normal, ship_home_cold, ship_cvs_711, ship_cvs_family, ship_store').eq('id', 1).single(),
      ]);
      setStoreSettings(settings);
      if (session?.user) {
        setMemberId(session.user.id);
        // 載入已儲存的地址
        const { data: addrs } = await supabase.from('addresses').select('*').eq('member_id', session.user.id).order('is_default', { ascending: false });
        setSavedAddresses(addrs ?? []);
        // 自動帶入預設地址
        const def = (addrs ?? []).find((a: any) => a.is_default) ?? addrs?.[0];
        if (def) {
          setName(def.name ?? '');
          setPhone(def.phone ?? '');
          if (def.type === 'home') { setCity(def.city ?? ''); setDistrict(def.district ?? ''); setAddress(def.address ?? ''); }
        }
        // 帶入 Email
        setEmail(session.user.email ?? '');
      }
    };
    load();
  }, []);

  // 如果目前選的配送方式被後台關閉了，自動切到第一個可用的
  useEffect(() => {
    if (!storeSettings) return;
    const currentAvailable = SHIP_OPTIONS.filter(opt => storeSettings[opt.settingKey] !== false);
    const currentStillValid = currentAvailable.some(opt => opt.value === shipMethod);
    if (!currentStillValid && currentAvailable.length > 0) {
      setShipMethod(currentAvailable[0].value);
    }
  }, [storeSettings]);

  // 計算運費
  useEffect(() => {
    if (!storeSettings) return;
    const opt = SHIP_OPTIONS.find(o => o.value === shipMethod);
    if (!opt || !opt.feeKey) { setShippingFee(0); return; }
    const fee = storeSettings[opt.feeKey] ?? 0;
    // 免運判斷
    const freeShipAmount = storeSettings.free_ship_amount ?? 0;
    if (freeShipAmount > 0 && totalPrice >= freeShipAmount) {
      if (shipMethod === 'home_cold' && !storeSettings.free_ship_cold) { setShippingFee(fee); return; }
      setShippingFee(0);
    } else {
      setShippingFee(fee);
    }
  }, [shipMethod, totalPrice, storeSettings]);

  // 帶入已儲存地址（再點一次同一個 = 取消選取，清空欄位）
  const applyAddress = (addr: any) => {
    if (selectedAddrId === addr.id) {
      // 取消選取，清空欄位
      setSelectedAddrId(null);
      setName('');
      setPhone('');
      setCity('');
      setDistrict('');
      setAddress('');
      return;
    }
    setSelectedAddrId(addr.id);
    setName(addr.name ?? '');
    setPhone(addr.phone ?? '');
    if (addr.type === 'home') {
      setShipMethod('home_cold');
      setCity(addr.city ?? '');
      setDistrict(addr.district ?? '');
      setAddress(addr.address ?? '');
    } else {
      setShipMethod(addr.cvs_brand === '711' ? 'cvs_711' : 'cvs_family');
    }
  };

  // 套用折扣碼
  const applyCoupon = async () => {
    if (!coupon.trim()) return;
    const { data, error } = await supabase.from('coupons').select('*').eq('code', coupon.trim().toUpperCase()).eq('is_active', true).single();
    if (error || !data) { setDiscount(0); setCouponMsg('折扣碼無效'); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setCouponMsg('折扣碼已過期'); return; }
    if (data.min_amount > 0 && totalPrice < data.min_amount) { setCouponMsg(`需消費滿 NT$${data.min_amount} 才能使用`); return; }
    if (data.max_uses > 0 && data.used_count >= data.max_uses) { setCouponMsg('折扣碼已達使用上限'); return; }
    const amt = data.type === 'percent' ? Math.floor(totalPrice * data.value / 100) : data.value;
    setDiscount(amt);
    setCouponMsg(`折扣碼已套用，折抵 NT$${amt}`);
  };

  // 載入可選出貨日期
  const fetchAvailableDates = async () => {
    setDatesLoading(true);
    setNoIntersection(false);
    setDate('');

    // 預購 / 混購時直接用 mixedShipDate
    if ((hasMixed || items.every(i => i.isPreorder)) && mixedShipDate) {
      setAvailableDates([mixedShipDate]);
      setDate(mixedShipDate);
      setDatesLoading(false);
      return;
    }

    const res = await fetch('/api/available-dates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(i => ({
          product_id: i.productRealId ?? parseInt(i.id),
          variant_id: (i as any).variantId ?? null,
          qty:        i.qty,
        })),
      }),
    });
    const data = await res.json();

    if (data.noIntersection) {
      setNoIntersection(true);
      setIntersectionMsg(data.reason ?? '');
      setAvailableDates([]);
    } else {
      setAvailableDates(data.dates ?? []);
    }
    setDatesLoading(false);
  };

  // 進入 Step 2 時載入可選日期
  useEffect(() => {
    if (step === 2) fetchAvailableDates();
  }, [step]);

  const validateStep2 = () => {
    if (!name || !phone || !email) { alert('請填寫收件人資訊'); return; }
    if (isHomeDelivery && (!city || !address)) { alert('請填寫完整收件地址'); return; }
    if (isCvsPickup && (!cvsStoreName || !cvsStoreAddr)) { alert('請填寫取貨門市名稱與地址'); return; }
    if (noIntersection) { alert('您的購物車商品無法安排在同一天出貨，請分開下單。'); return; }
    if (!date && availableDates.length > 0) { alert('請選擇出貨日期'); return; }
    setStep(3);
  };

  // ── 取得目前登入的 token（給 API 用）────────────
  // 有登入就帶 token（會員單），沒登入也能下單（訪客單）
  const getAuthToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  // ── 送出訂單 ──────────────────────────────────────
  // 【重要改動】
  // 之前：前端直接寫入資料庫 → 不安全（可以竄改價格）
  // 現在：呼叫後端 API → 安全（價格由後端計算）
  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      // 1. 取得登入 token（可為 null = 訪客下單）
      const token = await getAuthToken();

      // 訪客不能使用兌換品
      if (!token && redeemItem) {
        alert('兌換品僅限會員使用，請先登入');
        setSubmitting(false);
        return;
      }

      // 2. 計算出貨日
      const finalShipDate = (hasMixed || items.every(i => i.isPreorder)) && mixedShipDate
        ? mixedShipDate
        : date || null;

      // 3. 呼叫後端 API 建立訂單
      // 只傳「商品 ID + 數量」和「收件資訊」，
      // 價格、運費、折扣全部由後端重新計算
      // 贈品也加入 items（is_gift=true, price 由後端設為 0）
      const orderItems = [
        ...items.map(item => ({
          product_id: item.productRealId ?? parseInt(item.id),
          variant_id: item.variantId ?? null,
          qty:        item.qty,
          is_redeem:  item.isRedeemItem ?? false,
        })),
        ...promoResult.gifts.map(g => ({
          product_id: g.product_id,
          variant_id: null,
          qty:        g.qty,
          is_gift:    true,
        })),
      ];

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          items: orderItems,
          ship_method:   shipMethod,
          name,
          phone,
          email,
          city:          city || undefined,
          district:      district || undefined,
          address:       isCvsPickup ? `${cvsStoreName} ${cvsStoreAddr}` : (address || undefined),
          cvs_store_name: isCvsPickup ? cvsStoreName : undefined,
          cvs_store_addr: isCvsPickup ? cvsStoreAddr : undefined,
          ship_date:     finalShipDate,
          note:          note || undefined,
          coupon_code:   coupon || undefined,
          pay_method:    payMethod,
          redemption_id: redeemItem?.redemptionId,
          promotion_ids: promoResult.discounts.map(d => d.promotion_id),
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        alert(result.error ?? '訂單建立失敗，請稍後再試');
        setSubmitting(false);
        return;
      }

      // 4. 訂單建立成功！清空購物車
      clearCart();
      setOrderNo(result.order_no);
      sessionStorage.setItem('checkout_orderNo', result.order_no);

      // 5. 根據付款方式決定下一步
      if (payMethod === 'credit' || payMethod === 'atm') {
        // 信用卡或 ATM → 導向綠界付款頁面
        // 呼叫 /api/payment/ecpay 取得付款表單
        const payHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) payHeaders['Authorization'] = `Bearer ${token}`;

        const payRes = await fetch('/api/payment/ecpay', {
          method: 'POST',
          headers: payHeaders,
          body: JSON.stringify({ order_id: result.order_id }),
        });

        if (payRes.ok) {
          // 取得 HTML 表單，寫入新頁面自動提交到綠界
          const html = await payRes.text();
          const newWindow = window.open('', '_self');
          if (newWindow) {
            newWindow.document.write(html);
            newWindow.document.close();
            return; // 頁面會被導走，不需要繼續
          }
        }

        // 如果付款頁面打不開，還是顯示成功畫面（使用者可以稍後付款）
        console.warn('無法自動導向付款頁面');
      }

      // 6. 顯示訂單完成畫面
      setSubmitting(false);
      setStep('done');

    } catch (err) {
      console.error('結帳失敗:', err);
      alert('結帳失敗，請稍後再試');
      setSubmitting(false);
    }
  };

  // 運費顯示文字
  const feeDisplay = (opt: typeof SHIP_OPTIONS[0]) => {
    if (!opt.feeKey || !storeSettings) return '';
    const fee = storeSettings[opt.feeKey] ?? 0;
    const freeShipAmount = storeSettings.free_ship_amount ?? 0;
    if (freeShipAmount > 0 && totalPrice >= freeShipAmount) {
      if (opt.value === 'home_cold' && !storeSettings.free_ship_cold) return `NT$ ${fee}`;
      return '免運';
    }
    return fee === 0 ? '免費' : `NT$ ${fee}`;
  };

  const StepIndicator = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '52px' }}>
      {[1, 2, 3].map((s, i) => {
        const labels = ['確認購物車', '收件資訊', '付款確認'];
        const isActive = step === s || (step === 'done' && s === 3);
        const isPast = typeof step === 'number' && step > s;
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: isActive || isPast ? '#1E1C1A' : 'transparent', border: `2px solid ${isActive || isPast ? '#1E1C1A' : '#E8E4DC'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 500, color: isActive || isPast ? '#F7F4EF' : '#888580' }}>
                {isPast ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 9.5 17.5 20 6" /></svg> : s}
              </div>
              <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: isActive ? '#1E1C1A' : '#888580', whiteSpace: 'nowrap' }}>{labels[i]}</div>
            </div>
            {i < 2 && <div style={{ width: '80px', height: '1px', background: isPast ? '#1E1C1A' : '#E8E4DC', margin: '0 8px', marginBottom: '24px' }} />}
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ width: 'min(calc(100% - 60px), 860px)', margin: 'auto', padding: '72px 0' }}>
      <StepIndicator />

      {/* Step 1 */}
      {step === 1 && (
        <div>
          <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.28em', color: '#1E1C1A', margin: '0 0 28px' }}>確認購物車</h2>
          {items.length === 0 ? (
            <p style={{ color: '#888580', fontSize: '13px' }}>購物車是空的，<Link href="/shop" style={{ color: '#1E1C1A' }}>去選購</Link>。</p>
          ) : (
            <>
              {items.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #E8E4DC' }}>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ width: '56px', height: '56px', background: item.isRedeemItem ? '#f0faf4' : '#EDE9E2', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : item.isRedeemItem ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2ab85a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 110-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" /></svg> : null
                      }
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', color: '#1E1C1A', letterSpacing: '0.1em' }}>{item.name}</span>
                        {item.isRedeemItem && <span style={{ fontSize: '10px', color: '#2ab85a', border: '1px solid #2ab85a', padding: '1px 6px', fontFamily: '"Montserrat", sans-serif' }}>兌換品</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#888580' }}>× {item.qty}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', fontFamily: '"Noto Serif TC", serif', color: item.isRedeemItem ? '#2ab85a' : '#1E1C1A', fontWeight: item.isRedeemItem ? 600 : 200 }}>
                    {item.isRedeemItem ? '免費' : `NT$ ${(item.price * item.qty).toLocaleString()}`}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E8E4DC', fontSize: '13px' }}>
                <span style={{ color: '#888580' }}>小計</span>
                <span style={{ color: '#1E1C1A' }}>NT$ {totalPrice.toLocaleString()}</span>
              </div>
              {/* 活動折扣 */}
              {promoResult.discounts.length > 0 && (
                <div style={{ padding: '12px 0', borderBottom: '1px solid #E8E4DC' }}>
                  {promoResult.discounts.map(d => (
                    <div key={d.promotion_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#2ab85a', padding: '3px 0' }}>
                      <span>{d.promotion_name}</span>
                      <span>− NT$ {d.discount_amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* 贈品提示 */}
              {promoResult.gifts.length > 0 && (
                <div style={{ margin: '12px 0', padding: '10px 16px', background: '#f9f5ff', border: '1px solid #e8dff5', fontSize: '12px', color: '#6e3a8e', lineHeight: 2 }}>
                  {promoResult.gifts.map(g => (
                    <div key={`gift-${g.promotion_id}`}>🎁 {g.promotion_name}：贈品 × {g.qty}</div>
                  ))}
                </div>
              )}
              {/* 折扣後小計 */}
              {promoDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E8E4DC', fontSize: '13px' }}>
                  <span style={{ color: '#888580' }}>折扣後小計</span>
                  <span style={{ color: '#b35252', fontFamily: '"Noto Serif TC", serif' }}>NT$ {(totalPrice - promoDiscount).toLocaleString()}</span>
                </div>
              )}
              {/* 混購提示條 */}
              {hasMixed && mixedShipDate && (
                <div style={{ margin: '16px 0', padding: '14px 20px', background: '#fff8e1', border: '1px solid #f0c040', fontSize: '13px', color: '#7a5c00', lineHeight: 2 }}>
                  此購物車包含預購商品，若一起結帳，所有商品將於 <strong>{mixedShipDate}</strong> 統一出貨。
                </div>
              )}
              {!memberId && (
                <div style={{ margin: '24px 0', padding: '16px 20px', background: '#EDE9E2', fontSize: '12px', color: '#555250', lineHeight: 2 }}>
                  目前為訪客購買。<Link href="/member" style={{ color: '#1E1C1A', textDecoration: 'underline' }}>登入會員</Link> 可累積集章、自動帶入地址，查單也更方便。
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px' }}>
                <Link href="/shop" style={{ ...btnStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>← 繼續選購</Link>
                <button onClick={() => { if (hasMixed && !mixedConfirmed) { setShowMixedModal(true); } else { setStep(2); } }} style={btnStyle}>下一步</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div>
          <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.28em', color: '#1E1C1A', margin: '0 0 28px' }}>收件資訊</h2>

          {/* 已儲存地址快速帶入 */}
          {savedAddresses.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={sectionTitleStyle}>選擇已儲存地址</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {savedAddresses.map(addr => {
                  const isSelected = selectedAddrId === addr.id;
                  return (
                    <button key={addr.id} onClick={() => applyAddress(addr)} style={{
                      padding: '8px 16px',
                      background: isSelected ? '#1E1C1A' : 'transparent',
                      border: isSelected ? '1px solid #1E1C1A' : '1px solid #E8E4DC',
                      fontSize: '12px',
                      color: isSelected ? '#F7F4EF' : '#555250',
                      cursor: 'pointer',
                      fontFamily: '"Noto Sans TC", sans-serif',
                      transition: 'all 0.2s',
                    }}>
                      {addr.label || addr.name}
                      {addr.is_default && ' ★'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={sectionTitleStyle}>配送方式</div>
          {availableShipOptions.map(opt => (
            <RadioCard key={opt.value} value={opt.value} title={opt.title} sub={opt.sub} checked={shipMethod === opt.value} onChange={() => setShipMethod(opt.value)} fee={feeDisplay(opt)} />
          ))}

          <div style={{ ...sectionTitleStyle, marginTop: '28px' }}>收件人資訊</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            {[
              { label: '姓名 *',   type: 'text',  val: name,  set: setName,  ph: '收件人姓名' },
              { label: '手機 *',   type: 'tel',   val: phone, set: setPhone, ph: '0912-345-678' },
              { label: 'Email *',  type: 'email', val: email, set: setEmail, ph: '用於寄送訂單確認信' },
            ].map(({ label, type, val, set, ph }) => (
              <div key={label} style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>{label}</label>
                <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} style={inputStyle} />
              </div>
            ))}
          </div>

          {isHomeDelivery && (
            <>
              <div style={{ ...sectionTitleStyle, marginTop: '20px' }}>收件地址</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                <div style={{ marginBottom: '24px' }}>
                  <label style={labelStyle}>縣市 *</label>
                  <select value={city} onChange={e => setCity(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">選擇縣市</option>
                    {CITIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <label style={labelStyle}>鄉鎮市區</label>
                  <input value={district} onChange={e => setDistrict(e.target.value)} placeholder="鄉鎮市區" style={inputStyle} />
                </div>
                <div style={{ marginBottom: '24px', gridColumn: '1/-1' }}>
                  <label style={labelStyle}>詳細地址 *</label>
                  <input value={address} onChange={e => setAddress(e.target.value)} placeholder="路名、門牌號碼" style={inputStyle} />
                </div>
              </div>
            </>
          )}

          {isCvsPickup && (
            <>
              <div style={{ ...sectionTitleStyle, marginTop: '20px' }}>取貨門市資訊</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                <div style={{ marginBottom: '24px' }}>
                  <label style={labelStyle}>門市名稱 *</label>
                  <input value={cvsStoreName} onChange={e => setCvsStoreName(e.target.value)} placeholder={`${shipMethod === 'cvs_711' ? '7-11' : '全家'} ○○門市`} style={inputStyle} />
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <label style={labelStyle}>門市地址 *</label>
                  <input value={cvsStoreAddr} onChange={e => setCvsStoreAddr(e.target.value)} placeholder="門市所在地址" style={inputStyle} />
                </div>
              </div>
            </>
          )}

          {isStorePickup && (
            <div style={{ marginTop: '20px', padding: '14px 20px', background: '#EDE9E2', fontSize: '13px', color: '#555250', lineHeight: 1.8 }}>
              門市自取地址：宜蘭市神農路二段 96 號<br />
              請於指定日期攜帶訂單編號至門市取貨。
            </div>
          )}

          <div style={{ ...sectionTitleStyle, marginTop: '24px' }}>
            {shipMethod === 'store' ? '指定到店日期' : '指定出貨日期'}
          </div>

          {/* 無交集：提示分開下單 */}
          {noIntersection ? (
            <div style={{ padding: '16px 20px', background: '#fef0f0', border: '1px solid #f5c6c6', marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#c0392b', marginBottom: '6px' }}>無法安排同一天出貨</div>
              <div style={{ fontSize: '13px', color: '#c0392b' }}>{intersectionMsg}</div>
            </div>
          ) : (hasMixed || items.every(i => i.isPreorder)) && mixedShipDate ? (
            /* 預購 / 混購：固定顯示統一出貨日 */
            <div style={{ marginBottom: '24px' }}>
              <div style={{ padding: '14px 20px', background: '#e8f0fb', border: '1px solid #b5d4f4', maxWidth: '400px' }}>
                <div style={{ fontSize: '11px', color: '#2a5a8c', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '6px' }}>統一出貨日（固定）</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#1E1C1A' }}>{mixedShipDate}</div>
                <div style={{ fontSize: '11px', color: '#888580', marginTop: '4px' }}>
                  {hasMixed ? '因購物車含預購商品，所有商品統一於此日出貨' : '預購批次固定出貨日，無法更改'}
                </div>
              </div>
            </div>
          ) : datesLoading ? (
            /* 載入中 */
            <div style={{ fontSize: '13px', color: '#888580', marginBottom: '24px' }}>計算可出貨日期中...</div>
          ) : availableDates.length > 0 ? (
            /* 有可選日期：顯示日期按鈕 */
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {availableDates.map(d => (
                  <button
                    key={d}
                    onClick={() => setDate(d)}
                    style={{
                      padding: '10px 18px',
                      border: `1px solid ${date === d ? '#1E1C1A' : '#E8E4DC'}`,
                      background: date === d ? '#1E1C1A' : 'transparent',
                      color: date === d ? '#F7F4EF' : '#1E1C1A',
                      fontFamily: '"Montserrat", sans-serif',
                      fontSize: '13px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
              {!date && <div style={{ fontSize: '11px', color: '#c0392b', marginTop: '4px' }}>請選擇出貨日期</div>}
              {date && <div style={{ fontSize: '11px', color: '#888580', marginTop: '4px' }}>
                {shipMethod === 'store' ? '已選擇到店日期：' : '已選擇出貨日期：'}{date}
              </div>}
            </div>
          ) : (
            /* 沒有可選日期（空陣列，不是無交集） */
            <div style={{ fontSize: '13px', color: '#888580', marginBottom: '24px', padding: '12px 16px', background: '#EDE9E2', border: '1px solid #E8E4DC' }}>
              目前沒有可選的出貨日期，請聯絡客服。
            </div>
          )}

          <div style={sectionTitleStyle}>備註（選填）</div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="包裝需求、禮盒說明等..." style={{ ...inputStyle, resize: 'vertical', marginBottom: '24px' }} />

          <div style={sectionTitleStyle}>折扣碼（選填）</div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <input value={coupon} onChange={e => setCoupon(e.target.value)} placeholder="輸入折扣碼" style={{ ...inputStyle, maxWidth: '220px', textTransform: 'uppercase' }} />
            <button onClick={applyCoupon} style={{ ...btnStyle, padding: '11px 20px', whiteSpace: 'nowrap' }}>套用</button>
          </div>
          {couponMsg && <div style={{ fontSize: '11px', marginTop: '6px', color: discount > 0 ? '#2ab85a' : '#c0392b' }}>{couponMsg}</div>}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px' }}>
            <button onClick={() => setStep(1)} style={btnStyle}>← 上一步</button>
            <button onClick={validateStep2} style={btnStyle}>下一步</button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div>
          <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.28em', color: '#1E1C1A', margin: '0 0 28px' }}>選擇付款方式</h2>
          {PAY_OPTIONS.map(opt => (
            <RadioCard key={opt.value} value={opt.value} title={opt.title} sub={opt.sub} checked={payMethod === opt.value} onChange={() => setPayMethod(opt.value)} />
          ))}

          <div style={{ ...sectionTitleStyle, marginTop: '28px' }}>訂單摘要</div>
          <div style={{ background: '#EDE9E2', padding: '20px 24px' }}>
            {items.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', color: '#555250' }}>
                <span>{item.name} × {item.qty}</span>
                <span>NT$ {(item.price * item.qty).toLocaleString()}</span>
              </div>
            ))}
          </div>

          {[
            { label: '商品小計', value: `NT$ ${totalPrice.toLocaleString()}` },
            { label: '運費', value: shippingFee === 0 ? '免運' : `NT$ ${shippingFee.toLocaleString()}` },
            ...(promoDiscount > 0 ? promoResult.discounts.map(d => ({ label: d.promotion_name, value: `− NT$ ${d.discount_amount.toLocaleString()}`, green: true })) : []),
            ...(discount > 0 ? [{ label: '折扣碼', value: `− NT$ ${discount.toLocaleString()}`, green: true }] : []),
          ].map(({ label, value, green }: any) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: '13px' }}>
              <span style={{ color: green ? '#2ab85a' : '#888580' }}>{label}</span>
              <span style={{ color: green ? '#2ab85a' : '#555250' }}>{value}</span>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', marginTop: '8px' }}>
            <span style={{ fontSize: '14px', color: '#1E1C1A', letterSpacing: '0.1em' }}>應付金額</span>
            <span style={{ fontFamily: '"Noto Serif TC", serif', fontSize: '20px', fontWeight: 200, color: '#b35252' }}>
              NT$ {(totalPrice - discount - promoDiscount + shippingFee).toLocaleString()}
            </span>
          </div>

          <div style={{ fontSize: '12px', color: '#888580', lineHeight: 2.2, padding: '16px 20px', background: '#F7F4EF', border: '1px solid #E8E4DC', margin: '16px 0 28px' }}>
            · 下單後將寄送確認信至您的 Email<br />
            · 信用卡付款由綠界 ECPay 安全處理<br />
            · ATM虛擬帳號請於 72 小時內完成轉帳，逾時訂單自動取消
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(2)} style={btnStyle}>← 上一步</button>
            <button onClick={handleSubmit} disabled={submitting} style={{ ...btnStyle, background: '#1E1C1A', color: '#F7F4EF', borderColor: '#1E1C1A', padding: '13px 52px', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? '處理中...' : '確認下單'}
            </button>
          </div>
        </div>
      )}

      {/* 完成 */}
      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ marginBottom: '20px' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1E1C1A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="9 12 11.5 14.5 16 9.5" />
            </svg>
          </div>
          <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.3em', color: '#1E1C1A', marginBottom: '12px' }}>訂單已成立</h2>
          <p style={{ fontSize: '13px', color: '#555250', marginBottom: '8px' }}>訂單確認信已寄至您的 Email</p>
          <p style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '11px', letterSpacing: '0.2em', color: '#888580', marginBottom: '32px' }}>{orderNo}</p>
          <Link href="/" onClick={() => { sessionStorage.removeItem('checkout_step'); sessionStorage.removeItem('checkout_orderNo'); }} style={{ ...btnStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>返回首頁</Link>
        </div>
      )}
      {/* 混購確認彈窗 */}
      {showMixedModal && hasMixed && mixedShipDate && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', width: '520px', maxWidth: '90vw', zIndex: 401, padding: '32px' }}>
            <h3 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '16px', color: '#1E1C1A', marginBottom: '20px', letterSpacing: '0.15em' }}>
              此購物車包含一般商品與預購商品
            </h3>
            <p style={{ fontSize: '13px', color: '#555250', lineHeight: 2, marginBottom: '20px' }}>
              若一起結帳，所有商品將統一於最晚出貨日出貨。
            </p>
            <div style={{ background: '#EDE9E2', padding: '16px 20px', marginBottom: '20px', display: 'grid', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#888580' }}>一般商品最快可出貨日</span>
                <span style={{ color: '#1E1C1A', fontWeight: 500 }}>{stockShipDate}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#888580' }}>預購商品預計出貨日</span>
                <span style={{ color: '#1E1C1A', fontWeight: 500 }}>{mixedShipDate}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #E8E4DC' }}>
                <span style={{ color: '#1E1C1A', fontWeight: 600 }}>本筆訂單統一出貨日</span>
                <span style={{ color: '#b35252', fontWeight: 700 }}>{mixedShipDate}</span>
              </div>
            </div>
            <p style={{ fontSize: '12px', color: '#888580', lineHeight: 2, marginBottom: '20px' }}>
              若希望先收到一般商品，請返回購物車分成兩筆訂單下單。
            </p>
            {/* 勾選確認 */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: '#1E1C1A', cursor: 'pointer', marginBottom: '24px', lineHeight: 1.8 }}>
              <input
                type="checkbox"
                checked={mixedConfirmed}
                onChange={e => setMixedConfirmed(e.target.checked)}
                style={{ accentColor: '#1E1C1A', marginTop: '3px', flexShrink: 0 }}
              />
              我已了解本訂單將於 <strong>{mixedShipDate}</strong> 統一出貨
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { if (!mixedConfirmed) { alert('請先勾選確認後再繼續'); return; } setShowMixedModal(false); setStep(2); }}
                disabled={!mixedConfirmed}
                style={{ flex: 1, padding: '12px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', cursor: mixedConfirmed ? 'pointer' : 'not-allowed', opacity: mixedConfirmed ? 1 : 0.4 }}
              >
                確認一起結帳
              </button>
              <button
                onClick={() => { setShowMixedModal(false); setMixedConfirmed(false); }}
                style={{ flex: 1, padding: '12px', background: 'transparent', color: '#555250', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', letterSpacing: '0.2em', cursor: 'pointer' }}
              >
                返回購物車調整
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
