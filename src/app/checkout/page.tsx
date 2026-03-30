'use client';

// app/checkout/page.tsx  ──  結帳頁（含運費計算、地址自動帶入）
//
// 【重要修改】
// 原本是在前端直接用 supabase.from('orders').insert(...) 建立訂單，
// 這樣很危險（使用者可以竄改價格）。
// 現在改成呼叫後端的 /api/orders API 來建立訂單，
// 所有金額計算都在 server 端完成。

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { usePromotions } from '@/hooks/usePromotions';
import { CartItemForCalc } from '@/lib/promotions';
import Link from 'next/link';
import s from './checkout.module.css';

const CITIES = ['台北市','新北市','基隆市','桃園市','台中市','台南市','高雄市','新竹縣','新竹市','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','嘉義市','屏東縣','宜蘭縣','花蓮縣','台東縣','澎湖縣','金門縣','連江縣'];
const OUTER_ISLAND_CITIES = ['澎湖縣', '金門縣', '連江縣'];

// 配送方式設定（settingKey 對應 store_settings 的開關欄位）
const SHIP_OPTIONS = [
  { value: 'home',    title: '一般宅配',  sub: '黑貓 / 新竹物流配送',   settingKey: 'ship_home' },
  { value: 'cvs_711', title: '7-11 取貨', sub: '7-11 門市取貨',           settingKey: 'ship_cvs_711' },
  { value: 'store',   title: '門市自取',  sub: '宜蘭市神農路二段 96 號', settingKey: 'ship_store' },
];
const PAY_OPTIONS = [
  { value: 'credit', title: '信用卡',   sub: 'Visa / Master / JCB — 綠界 ECPay 安全加密' },
  { value: 'atm',    title: 'ATM虛擬帳號', sub: '虛擬 ATM 付款之退款，將以銀行轉帳方式另行辦理，無法原路退回。' },
];

const RadioCard = ({ value, title, sub, checked, onChange, fee }: { value: string; title: string; sub: string; checked: boolean; onChange: () => void; fee?: string }) => (
  <label className={`${s.radioCard} ${checked ? s.radioCardChecked : ''}`}>
    <input type="radio" value={value} checked={checked} onChange={onChange} className={s.radioInput} />
    <div className={s.radioBody}>
      <div className={s.radioTitle}>{title}</div>
      <div className={s.radioSub}>{sub}</div>
    </div>
    {fee && <div className={s.radioFee}>{fee}</div>}
  </label>
);

export default function CheckoutPage() {
  const { items, totalPrice, clearCart, mixedShipDate, unifiedShipDate } = useCart();
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
  // 兌換品價格為 0，不計入金額

  // 可選出貨日期（從 API 取得）
  const [availableDates,  setAvailableDates]  = useState<string[]>([]);
  const [datesLoading,    setDatesLoading]    = useState(false);
  const [noIntersection,  setNoIntersection]  = useState(false);
  const [intersectionMsg, setIntersectionMsg] = useState('');

  // 是否混購
  const hasMixed       = items.some(i => i.isPreorder) && items.some(i => !i.isPreorder);

  // 是否全部為日期模式（已在商品頁選好出貨日）
  const effectiveItems = items.filter(i => !i.isRedeemItem && !i.isGift);
  const allDateMode    = effectiveItems.length > 0 && effectiveItems.every(i => (i as any).shipDateId);
  // 收集已選的出貨日期（去重）
  const dateModeDates  = allDateMode
    ? [...new Set(effectiveItems.map(i => (i as any).shipDate as string).filter(Boolean))].sort()
    : [];

  // 登入狀態
  const [memberId, setMemberId] = useState<string | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<number | null>(null);

  // 商店配送設定
  const [storeSettings, setStoreSettings] = useState<any>(null);

  // 商品可用運輸方式
  const [productShipFlags, setProductShipFlags] = useState<Record<number, { allow_home_delivery: boolean; allow_cvs_711: boolean; allow_store_pickup: boolean }>>({});

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
  const { promoResult, promotions: loadedPromos } = usePromotions(cartItemsForCalc);
  const promoDiscount = promoResult.total_discount;

  // 贈品商品名稱
  const [giftProductNames, setGiftProductNames] = useState<Record<number, { name: string; image_url?: string }>>({});
  useEffect(() => {
    const giftIds = [...new Set(promoResult.gifts.map(g => g.product_id))];
    if (giftIds.length === 0) { setGiftProductNames({}); return; }
    supabase.from('products').select('id, name, image_url').in('id', giftIds).then(({ data }) => {
      if (data) {
        const map: Record<number, { name: string; image_url?: string }> = {};
        data.forEach((p: any) => { map[p.id] = { name: p.name, image_url: p.image_url }; });
        setGiftProductNames(map);
      }
    });
  }, [promoResult.gifts]);

  // Step 2 欄位
  const [shipMethod, setShipMethod] = useState('home');
  // 購買人
  const [buyerName,     setBuyerName]     = useState('');
  const [buyerPhone,    setBuyerPhone]    = useState('');
  const [buyerEmail,    setBuyerEmail]    = useState('');
  // 收件人
  const [sameAsBuyer,   setSameAsBuyer]   = useState(false);
  const [customerName,  setCustomerName]  = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [city,       setCity]       = useState('');
  const [district,   setDistrict]   = useState('');
  const [address,    setAddress]    = useState('');
  const [cvsStoreName, setCvsStoreName] = useState('');
  const [cvsStoreAddr, setCvsStoreAddr] = useState('');
  const [cvsStoreId,   setCvsStoreId]   = useState('');
  const [cvsStoreBrand, setCvsStoreBrand] = useState('');
  const [pickupToken,  setPickupToken]  = useState('');
  const pickupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapWindowRef  = useRef<Window | null>(null);
  const [date,       setDate]       = useState('');
  const [note,       setNote]       = useState('');
  const [coupon,     setCoupon]     = useState('');
  const [couponMsg,  setCouponMsg]  = useState('');
  const [discount,   setDiscount]   = useState(0);
  const [payMethod,  setPayMethod]  = useState('credit');
  const [submitting, setSubmitting] = useState(false);

  // 勾選「與購買人相同」時，把購買人值複製到收件人（僅在勾選瞬間複製）
  const handleSameAsBuyer = (checked: boolean) => {
    setSameAsBuyer(checked);
    if (checked) {
      setCustomerName(buyerName);
      setCustomerPhone(buyerPhone);
      setCustomerEmail(buyerEmail);
    }
  };
  // ── 綠界超商地圖 ──────────────────────────────
  const generatePickupToken = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let t = '';
    for (let i = 0; i < 16; i++) t += chars[Math.floor(Math.random() * chars.length)];
    return t;
  };

  const pollPickupSession = useCallback(async (token: string) => {
    try {
      const res = await fetch(`/api/pickup-session?token=${token}`);
      const data = await res.json();
      if (data.found) {
        setCvsStoreId(data.store_id);
        setCvsStoreName(data.store_name);
        setCvsStoreAddr(data.store_address);
        setCvsStoreBrand(data.store_brand);
        // 停止輪詢
        if (pickupPollRef.current) { clearInterval(pickupPollRef.current); pickupPollRef.current = null; }
      }
    } catch { /* 靜默 */ }
  }, []);

  const openCvsMap = async () => {
    const token = generatePickupToken();
    setPickupToken(token);
    // 清除舊的輪詢
    if (pickupPollRef.current) { clearInterval(pickupPollRef.current); pickupPollRef.current = null; }

    // 取得 E-map 表單 HTML
    const subtype = 'UNIMART';
    const res = await fetch('/api/ecpay/cvs-map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, subtype }),
    });
    const html = await res.text();

    // 開啟新視窗
    const popup = window.open('', 'ecpay_cvs_map', 'width=1024,height=700,scrollbars=yes');
    if (popup) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      mapWindowRef.current = popup;
    }

    // 開始輪詢（每 2 秒）
    pickupPollRef.current = setInterval(() => pollPickupSession(token), 2000);
  };

  // visibilitychange：使用者從彈窗回到本頁時立即查一次
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && pickupToken) {
        pollPickupSession(pickupToken);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (pickupPollRef.current) clearInterval(pickupPollRef.current);
    };
  }, [pickupToken, pollPickupSession]);

  const [orderNo,    setOrderNo]    = useState(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('checkout_orderNo') ?? '';
  });

  const isHomeDelivery = shipMethod === 'home';
  const isCvsPickup    = shipMethod === 'cvs_711';
  const isStorePickup  = shipMethod === 'store';

  // 根據後台設定 + 購物車商品交集過濾可用的配送方式
  const availableShipOptions = useMemo(() => {
    // 全店開關過濾
    let opts = storeSettings
      ? SHIP_OPTIONS.filter(opt => storeSettings[opt.settingKey] !== false)
      : SHIP_OPTIONS;
    // 購物車商品交集：每個商品都允許的配送方式才可選
    const productIds = items.filter(i => !i.isRedeemItem).map(i => i.productRealId ?? parseInt(i.id));
    if (productIds.length > 0 && Object.keys(productShipFlags).length > 0) {
      const shipFieldMap: Record<string, keyof typeof productShipFlags[number]> = {
        home: 'allow_home_delivery',
        cvs_711: 'allow_cvs_711',
        store: 'allow_store_pickup',
      };
      opts = opts.filter(opt => {
        const field = shipFieldMap[opt.value];
        if (!field) return true;
        return productIds.every(pid => {
          const flags = productShipFlags[pid];
          return !flags || flags[field] !== false;
        });
      });
    }
    return opts;
  }, [storeSettings, items, productShipFlags]);

  // 載入登入狀態 + 商店設定
  useEffect(() => {
    const load = async () => {
      const [{ data: { session } }, { data: settings }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from('store_settings').select('*').eq('id', 1).single(),
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
          // 預設帶入購買人（收件人透過 checkbox 同步）
          setBuyerName(def.name ?? '');
          setBuyerPhone(def.phone ?? '');
          setCustomerName(def.name ?? '');
          setCustomerPhone(def.phone ?? '');
          if (def.type === 'home') { setCity(def.city ?? ''); setDistrict(def.district ?? ''); setAddress(def.address ?? ''); }
        }
        // 帶入 Email
        setBuyerEmail(session.user.email ?? '');
        setCustomerEmail(session.user.email ?? '');
      }
    };
    load();
  }, []);

  // 載入購物車商品的可用配送方式
  useEffect(() => {
    const productIds = [...new Set(items.filter(i => !i.isRedeemItem).map(i => i.productRealId ?? parseInt(i.id)))];
    if (productIds.length === 0) return;
    supabase.from('products').select('id, allow_home_delivery, allow_cvs_711, allow_store_pickup').in('id', productIds).then(({ data, error }) => {
      if (error) return; // 欄位尚未建立時靜默跳過，全部預設為 true
      if (data) {
        const map: typeof productShipFlags = {};
        data.forEach((p: any) => { map[p.id] = { allow_home_delivery: p.allow_home_delivery ?? true, allow_cvs_711: p.allow_cvs_711 ?? true, allow_store_pickup: p.allow_store_pickup ?? true }; });
        setProductShipFlags(map);
      }
    });
  }, [items]);

  // 購物車為空時，重設回 step 1（防止沿用上次的結帳進度）
  useEffect(() => {
    if (items.length === 0 && step !== 'done') {
      _setStep(1);
      sessionStorage.removeItem('checkout_step');
    }
  }, [items.length, step]);

  // 如果目前選的配送方式不可用，自動切到第一個可用的
  useEffect(() => {
    const currentStillValid = availableShipOptions.some(opt => opt.value === shipMethod);
    if (!currentStillValid && availableShipOptions.length > 0) {
      setShipMethod(availableShipOptions[0].value);
    }
  }, [availableShipOptions]);

  // 計算運費（含離島判斷 + 免運邏輯）
  const isOuterIsland = OUTER_ISLAND_CITIES.includes(city);

  useEffect(() => {
    if (!storeSettings) return;
    let fee = 0;
    if (shipMethod === 'home') {
      fee = isOuterIsland
        ? (storeSettings.fee_home_outer_island ?? 250)
        : (storeSettings.fee_home ?? 100);
    } else if (shipMethod === 'cvs_711') {
      fee = storeSettings.fee_cvs_711 ?? 60;
    } else if (shipMethod === 'store') {
      fee = storeSettings.fee_store ?? 0;
    }
    // 免運判斷
    if (shipMethod === 'home' || shipMethod === 'cvs_711') {
      const threshold = isOuterIsland
        ? (storeSettings.free_ship_outer_island_amount ?? 0)
        : (storeSettings.free_ship_mainland_amount ?? 0);
      if (threshold > 0 && totalPrice >= threshold) fee = 0;
    }
    setShippingFee(fee);
  }, [shipMethod, totalPrice, storeSettings, city, isOuterIsland]);

  // 帶入已儲存地址（再點一次同一個 = 取消選取，清空欄位）
  const applyAddress = (addr: any) => {
    if (selectedAddrId === addr.id) {
      setSelectedAddrId(null);
      setCustomerName('');
      setCustomerPhone('');
      setCity('');
      setDistrict('');
      setAddress('');
      setSameAsBuyer(false);
      return;
    }
    setSelectedAddrId(addr.id);
    setCustomerName(addr.name ?? '');
    setCustomerPhone(addr.phone ?? '');
    setSameAsBuyer(false);
    if (addr.type === 'home') {
      setShipMethod('home');
      setCity(addr.city ?? '');
      setDistrict(addr.district ?? '');
      setAddress(addr.address ?? '');
    } else {
      setShipMethod('cvs_711');
    }
  };

  // 套用折扣碼
  const applyCoupon = async () => {
    if (!coupon.trim()) return;
    const { data, error } = await supabase.from('coupons').select('*').eq('code', coupon.trim().toUpperCase()).eq('is_active', true).single();
    if (error || !data) { setDiscount(0); setCouponMsg('折扣碼無效'); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setDiscount(0); setCouponMsg('折扣碼已過期'); return; }
    if (data.min_amount > 0 && totalPrice < data.min_amount) { setDiscount(0); setCouponMsg(`需消費滿 NT$${data.min_amount} 才能使用`); return; }
    if (data.max_uses > 0 && data.used_count >= data.max_uses) { setDiscount(0); setCouponMsg('折扣碼已達使用上限'); return; }

    // user_scope 驗證
    const scope = data.user_scope ?? 'all';
    if (scope === 'member_only' && !memberId) { setDiscount(0); setCouponMsg('此折扣碼限會員使用，請先登入'); return; }
    if (scope === 'guest_only' && memberId) { setDiscount(0); setCouponMsg('此折扣碼限訪客使用'); return; }

    // stackable 併用檢查：折扣碼不可併用 + 已有活動折扣
    if (!data.stackable && promoDiscount > 0) {
      setDiscount(0);
      setCouponMsg('此折扣碼無法與商品優惠活動併用');
      return;
    }
    // 活動側不可與折扣碼併用：有任何活動的 coupon_stackable=false
    if (promoDiscount > 0) {
      const hasNonCouponStackablePromo = promoResult.discounts.some(d =>
        loadedPromos.find(p => p.id === d.promotion_id && !p.coupon_stackable)
      );
      if (hasNonCouponStackablePromo) {
        setDiscount(0);
        setCouponMsg('目前套用的商品優惠不允許與折扣碼併用');
        return;
      }
    }

    const amt = data.type === 'percent' ? Math.floor(totalPrice * data.value / 100) : Math.min(data.value, totalPrice);
    setDiscount(amt);
    setCouponMsg(`折扣碼已套用，折抵 NT$${amt}`);
  };

  // 載入可選出貨日期
  const fetchAvailableDates = async () => {
    setDatesLoading(true);
    setNoIntersection(false);
    setDate('');

    // A0. 全日期模式 → 已在商品頁選好出貨日，直接用
    if (allDateMode && dateModeDates.length > 0) {
      setAvailableDates(dateModeDates);
      setDate(dateModeDates[0]);
      setDatesLoading(false);
      return;
    }

    // A. 純預購 → 固定日期，不呼叫 API
    if (items.every(i => i.isPreorder) && mixedShipDate) {
      setAvailableDates([mixedShipDate]);
      setDate(mixedShipDate);
      setDatesLoading(false);
      return;
    }

    // B. 混購 → 只傳一般商品給 API
    //    排除預購（有 mixedShipDate 處理）和日期模式（已在商品頁選好日期）
    const itemsForApi = items.filter(i =>
      !i.isPreorder && !i.isRedeemItem && !i.isGift && !(i as any).shipDateId
    );

    // 過濾後無需查詢的商品（全是預購/日期模式/贈品/兌換品）
    if (itemsForApi.length === 0) {
      if (mixedShipDate) {
        setAvailableDates([mixedShipDate]);
        setDate(mixedShipDate);
      }
      setDatesLoading(false);
      return;
    }

    const res = await fetch('/api/available-dates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: itemsForApi.map(i => ({
          product_id: i.productRealId ?? parseInt(i.id),
          variant_id: (i as any).variantId ?? null,
          qty:        i.qty,
        })),
      }),
    });
    const data = await res.json();

    let dates: string[] = data.dates ?? [];

    // 混購：過濾掉 < unifiedShipDate 的日期
    if (hasMixed && unifiedShipDate) {
      dates = dates.filter((d: string) => d >= unifiedShipDate);
    }

    // 判斷順序：先看 API 本身是否回報無交集，再看混購過濾後是否為空
    if (data.noIntersection) {
      setNoIntersection(true);
      setIntersectionMsg(data.reason ?? '商品無共同可出貨日期');
      setAvailableDates([]);
    } else if (hasMixed && dates.length === 0) {
      setNoIntersection(true);
      setIntersectionMsg('商品的出貨時間不同，無法安排同一天出貨，請將商品分開下單。');
      setAvailableDates([]);
    } else {
      setAvailableDates(dates);
      // 預設選最早可用日期；如果原先選的日期已不在新集合中，也重設
      if (dates.length > 0) {
        if (!date || !dates.includes(date)) {
          setDate(dates[0]);
        }
      }
    }
    setDatesLoading(false);
  };

  // 進入 Step 2 時載入可選日期
  useEffect(() => {
    if (step === 2) fetchAvailableDates();
  }, [step]);

  const validateStep2 = () => {
    if (!buyerName || !buyerPhone || !buyerEmail) { alert('請填寫購買人資訊'); return; }
    const finalCustomerName  = sameAsBuyer ? buyerName  : customerName;
    const finalCustomerPhone = sameAsBuyer ? buyerPhone : customerPhone;
    const finalCustomerEmail = sameAsBuyer ? buyerEmail : customerEmail;
    if (!finalCustomerName || !finalCustomerPhone || !finalCustomerEmail) { alert('請填寫收件人資訊'); return; }
    if (isHomeDelivery && (!city || !district || !address)) { alert('請填寫完整收件地址（縣市 + 區域 + 地址）'); return; }
    if (isCvsPickup && (!cvsStoreName || !cvsStoreAddr)) { alert('請先選擇取貨門市'); return; }
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
      // 全日期模式 → 用最早的已選日期
      // 純預購 → 固定用預購批次日期
      // 混購 & 一般 → 用使用者選的日期
      const finalShipDate = allDateMode && dateModeDates.length > 0
        ? dateModeDates[0]
        : items.every(i => i.isPreorder) && mixedShipDate
          ? mixedShipDate
          : date || null;

      // 3. 呼叫後端 API 建立訂單
      // 只傳「商品 ID + 數量」和「收件資訊」，
      // 價格、運費、折扣全部由後端重新計算
      // 贈品也加入 items（is_gift=true, price 由後端設為 0）
      // 只傳購買商品，贈品由後端自行計算
      const orderItems = items.map(item => ({
        product_id: item.productRealId ?? parseInt(item.id),
        variant_id: item.variantId ?? null,
        qty:        item.qty,
        is_redeem:  item.isRedeemItem ?? false,
        preorder_batch_id: item.preorderBatchId ?? null,
        ship_date_id: item.shipDateId ?? null,
      }));

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          items: orderItems,
          ship_method:    shipMethod,
          buyerName,
          buyerPhone,
          buyerEmail,
          customerName:   sameAsBuyer ? buyerName  : customerName,
          customerPhone:  sameAsBuyer ? buyerPhone : customerPhone,
          customerEmail:  sameAsBuyer ? buyerEmail : customerEmail,
          city:           city || undefined,
          district:       district || undefined,
          address:        isCvsPickup ? `${cvsStoreName} ${cvsStoreAddr}` : (address || undefined),
          cvs_store_id:      isCvsPickup ? cvsStoreId : undefined,
          cvs_store_name:    isCvsPickup ? cvsStoreName : undefined,
          cvs_store_address: isCvsPickup ? cvsStoreAddr : undefined,
          cvs_store_brand:   isCvsPickup ? cvsStoreBrand : undefined,
          ship_date:      finalShipDate,
          note:           note || undefined,
          coupon_code:    coupon || undefined,
          pay_method:     payMethod,
          redemption_id:  redeemItem?.redemptionId,
          promotion_ids:  promoResult.discounts.map(d => d.promotion_id),
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        alert(result.error ?? '訂單建立失敗，請稍後再試');
        setSubmitting(false);
        return;
      }

      // 4. 訂單建立成功！清空購物車、清掉結帳進度
      clearCart();
      setOrderNo(result.order_no);
      sessionStorage.setItem('checkout_orderNo', result.order_no);
      sessionStorage.removeItem('checkout_step');

      // 5. 根據付款方式決定下一步
      if (payMethod === 'credit' || payMethod === 'atm') {
        // 信用卡或 ATM → 導向綠界付款頁面
        // 呼叫 /api/payment/ecpay 取得付款表單
        const payHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) payHeaders['Authorization'] = `Bearer ${token}`;

        const payRes = await fetch('/api/payment/ecpay', {
          method: 'POST',
          headers: payHeaders,
          body: JSON.stringify({
            order_id: result.order_id,
            ...(result.pay_token ? { pay_token: result.pay_token } : {}),
          }),
        });

        if (payRes.ok) {
          // 取得 HTML 表單（內含自動提交的 form → 導向綠界付款頁）
          const html = await payRes.text();

          // 方法 1：解析回傳 HTML，動態建立 form 並提交（最可靠）
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const srcForm = doc.querySelector('form');

          if (srcForm) {
            const form = document.createElement('form');
            form.method = srcForm.method || 'POST';
            form.action = srcForm.action;
            form.style.display = 'none';
            // 複製所有 hidden input
            srcForm.querySelectorAll('input').forEach(input => {
              const clone = document.createElement('input');
              clone.type = 'hidden';
              clone.name = input.name;
              clone.value = input.value;
              form.appendChild(clone);
            });
            document.body.appendChild(form);
            form.submit();
            return; // 頁面會被導走
          }

          // 方法 2：fallback — 直接覆寫整頁
          document.open();
          document.write(html);
          document.close();
          return;
        } else {
          // ECPay API 回傳錯誤 → 顯示錯誤但仍進入完成畫面（訂單已建立，可稍後付款）
          const errText = await payRes.text();
          console.error('ECPay 付款頁面取得失敗:', payRes.status, errText);
          alert('付款頁面載入失敗，訂單已建立，請至訂單查詢頁面重新付款。\n\n錯誤：' + errText);
        }
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

  // 運費顯示��字
  const feeDisplay = (opt: typeof SHIP_OPTIONS[0]) => {
    if (!storeSettings) return '';
    let fee = 0;
    if (opt.value === 'home') {
      fee = isOuterIsland ? (storeSettings.fee_home_outer_island ?? 250) : (storeSettings.fee_home ?? 100);
    } else if (opt.value === 'cvs_711') {
      fee = storeSettings.fee_cvs_711 ?? 60;
    } else if (opt.value === 'store') {
      fee = storeSettings.fee_store ?? 0;
    }
    // 免運判斷
    if (opt.value === 'home' || opt.value === 'cvs_711') {
      const threshold = isOuterIsland
        ? (storeSettings.free_ship_outer_island_amount ?? 0)
        : (storeSettings.free_ship_mainland_amount ?? 0);
      if (threshold > 0 && totalPrice >= threshold) return '免運';
    }
    return fee === 0 ? '免費' : `NT$ ${fee}`;
  };

  const StepIndicator = () => (
    <div className={s.stepIndicator}>
      {[1, 2, 3].map((n, i) => {
        const labels = ['確認購物車', '收件資訊', '付款確認'];
        const isActive = step === n || (step === 'done' && n === 3);
        const isPast = typeof step === 'number' && step > n;
        return (
          <div key={n} className={s.stepGroup}>
            <div className={s.stepColumn}>
              <div className={`${s.stepCircle} ${isActive || isPast ? s.stepCircleActive : s.stepCircleDefault}`}>
                {isPast ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 9.5 17.5 20 6" /></svg> : n}
              </div>
              <div className={`${s.stepLabel} ${isActive ? s.stepLabelActive : ''}`}>{labels[i]}</div>
            </div>
            {i < 2 && <div className={`${s.stepLine} ${isPast ? s.stepLinePast : s.stepLineDefault}`} />}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={s.page}>
      <StepIndicator />

      {/* Step 1 */}
      {step === 1 && (
        <div>
          <h2 className={s.heading}>確認購物車</h2>
          {items.length === 0 ? (
            <p className={s.emptyCart}>購物車是空的，<Link href="/shop" className={s.emptyCartLink}>去選購</Link>。</p>
          ) : (
            <>
              {items.map(item => {
                let cartKey = item.variantId ? `${item.id}_${item.variantId}` : item.id;
                if (item.preorderBatchId) cartKey += `_b${item.preorderBatchId}`;
                if ((item as any).shipDateId) cartKey += `_sd${(item as any).shipDateId}`;
                return (
                <div key={cartKey} className={s.cartRow}>
                  <div className={s.cartItemLeft}>
                    <div className={`${s.cartThumb} ${item.isRedeemItem ? s.cartThumbRedeem : ''}`}>
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt={item.name} className={s.cartThumbImg} />
                        : item.isRedeemItem ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2ab85a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 110-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" /></svg> : null
                      }
                    </div>
                    <div>
                      <div className={s.cartItemNameRow}>
                        <span className={s.cartItemName}>{item.name}</span>
                        {item.isRedeemItem && <span className={s.redeemBadge}>兌換品</span>}
                      </div>
                      <div className={s.cartItemQty}>&times; {item.qty}</div>
                    </div>
                  </div>
                  <div className={`${s.cartItemPrice} ${item.isRedeemItem ? s.cartItemPriceRedeem : ''}`}>
                    {item.isRedeemItem ? '免費' : `NT$ ${(item.price * item.qty).toLocaleString()}`}
                  </div>
                </div>
              )})}
              {/* 贈品顯示在購物車列表中 */}
              {promoResult.gifts.map(g => {
                const info = giftProductNames[g.product_id];
                return (
                  <div key={`gift-${g.promotion_id}-${g.product_id}`} className={s.cartRow}>
                    <div className={s.cartItemLeft}>
                      <div className={`${s.cartThumb} ${s.cartThumbRedeem}`}>
                        {info?.image_url
                          ? <img src={info.image_url} alt={info.name} className={s.cartThumbImg} />
                          : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2ab85a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 110-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" /></svg>
                        }
                      </div>
                      <div>
                        <div className={s.cartItemNameRow}>
                          <span className={s.cartItemName}>{info?.name ?? `贈品 #${g.product_id}`}</span>
                          <span className={s.redeemBadge}>贈品</span>
                        </div>
                        <div className={s.cartItemQty}>&times; {g.qty}<span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-light)' }}>{g.promotion_name}</span></div>
                      </div>
                    </div>
                    <div className={`${s.cartItemPrice} ${s.cartItemPriceRedeem}`}>免費</div>
                  </div>
                );
              })}
              <div className={s.summaryRow}>
                <span className={s.summaryLabel}>小計</span>
                <span className={s.summaryValue}>NT$ {totalPrice.toLocaleString()}</span>
              </div>
              {/* 活動折扣 */}
              {promoResult.discounts.length > 0 && (
                <div className={s.promoBlock}>
                  {promoResult.discounts.map(d => (
                    <div key={d.promotion_id} className={s.promoRow}>
                      <span>{d.promotion_name}</span>
                      <span>&minus; NT$ {d.discount_amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* 折扣後小計 */}
              {promoDiscount > 0 && (
                <div className={s.summaryRow}>
                  <span className={s.summaryLabel}>折扣後小計</span>
                  <span className={s.summaryValueDiscount}>NT$ {(totalPrice - promoDiscount).toLocaleString()}</span>
                </div>
              )}
              {/* 混購提示條 */}
              {hasMixed && unifiedShipDate && (
                <div className={s.mixedWarning}>
                  此訂單需統一出貨，可選出貨日期將於下一步依商品與配送條件顯示。
                </div>
              )}
              {!memberId && (
                <div className={s.guestNotice}>
                  目前為訪客購買。<Link href="/member" className={s.guestLink}>登入會員</Link> 可累積集章、自動帶入地址，查單也更方便。
                </div>
              )}
              <div className={s.actionRow}>
                <Link href="/shop" className={s.btnLink}>&larr; 繼續選購</Link>
                <button onClick={() => setStep(2)} className={s.btn}>下一步</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div>
          <h2 className={s.heading}>收件資訊</h2>

          {/* 已儲存地址快速帶入 */}
          {savedAddresses.length > 0 && (
            <div className={s.savedAddressesWrap}>
              <div className={s.sectionTitle}>選擇已儲存地址</div>
              <div className={s.savedAddressList}>
                {savedAddresses.map(addr => {
                  const isSelected = selectedAddrId === addr.id;
                  return (
                    <button key={addr.id} onClick={() => applyAddress(addr)} className={`${s.savedAddrBtn} ${isSelected ? s.savedAddrBtnSelected : ''}`}>
                      {addr.label || addr.name}
                      {addr.is_default && ' ★'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={s.sectionTitle}>購買人資訊</div>
          <div className={s.grid2}>
            {[
              { label: '姓名 *',  type: 'text',  val: buyerName,  set: setBuyerName,  ph: '購買人姓名' },
              { label: '手機 *',  type: 'tel',   val: buyerPhone, set: setBuyerPhone, ph: '0912-345-678' },
              { label: 'Email *', type: 'email', val: buyerEmail, set: setBuyerEmail, ph: '用於寄送訂單確認信' },
            ].map(({ label, type, val, set, ph }) => (
              <div key={label} className={s.fieldGroup}>
                <label className={s.label}>{label}</label>
                <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} className={s.input} />
              </div>
            ))}
          </div>

          <div className={s.sectionTitleSpaced}>收件人資訊</div>
          <label className={s.checkboxLabel}>
            <input type="checkbox" checked={sameAsBuyer} onChange={e => handleSameAsBuyer(e.target.checked)} className={s.checkbox} />
            與購買人相同
          </label>
          {!sameAsBuyer && (
            <div className={s.grid2}>
              {[
                { label: '姓名 *',  type: 'text',  val: customerName,  set: setCustomerName,  ph: '收件人姓名' },
                { label: '手機 *',  type: 'tel',   val: customerPhone, set: setCustomerPhone, ph: '0912-345-678' },
                { label: 'Email *', type: 'email', val: customerEmail, set: setCustomerEmail, ph: '收件人 Email' },
              ].map(({ label, type, val, set, ph }) => (
                <div key={`customer-${label}`} className={s.fieldGroup}>
                  <label className={s.label}>{label}</label>
                  <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} className={s.input} />
                </div>
              ))}
            </div>
          )}

          <div className={s.sectionTitle}>配送方式</div>
          {availableShipOptions.map(opt => (
            <RadioCard key={opt.value} value={opt.value} title={opt.title} sub={opt.sub} checked={shipMethod === opt.value} onChange={() => setShipMethod(opt.value)} fee={feeDisplay(opt)} />
          ))}

          {isHomeDelivery && (
            <>
              <div className={s.sectionTitleSmSpaced}>收件地址</div>
              <div className={s.grid2}>
                <div className={s.fieldGroup}>
                  <label className={s.label}>縣市 *</label>
                  <select value={city} onChange={e => setCity(e.target.value)} className={s.inputSelect}>
                    <option value="">選擇縣市</option>
                    {CITIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className={s.fieldGroup}>
                  <label className={s.label}>鄉鎮市區 *</label>
                  <input value={district} onChange={e => setDistrict(e.target.value)} placeholder="鄉鎮市區" className={s.input} />
                </div>
                <div className={s.fieldGroupFull}>
                  <label className={s.label}>詳細地址 *</label>
                  <input value={address} onChange={e => setAddress(e.target.value)} placeholder="路名、門牌號碼" className={s.input} />
                </div>
              </div>
            </>
          )}

          {isCvsPickup && (
            <>
              <div className={s.sectionTitleSmSpaced}>取貨門市</div>
              <button type="button" onClick={openCvsMap} className={s.btnCvsMap}>
                {cvsStoreName ? '重新選擇門市' : '選擇取貨門市'}
              </button>
              {cvsStoreName && (
                <div className={s.cvsStoreInfo}>
                  <div className={s.cvsStoreRow}>
                    <span className={s.cvsStoreLabel}>門市</span>
                    <span className={s.cvsStoreValue}>{cvsStoreBrand} {cvsStoreName}</span>
                  </div>
                  <div className={s.cvsStoreRow}>
                    <span className={s.cvsStoreLabel}>地址</span>
                    <span className={s.cvsStoreValue}>{cvsStoreAddr}</span>
                  </div>
                  {cvsStoreId && (
                    <div className={s.cvsStoreRow}>
                      <span className={s.cvsStoreLabel}>店號</span>
                      <span className={s.cvsStoreValue}>{cvsStoreId}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {isStorePickup && (
            <div className={s.storePickupInfo}>
              門市自取地址：宜蘭市神農路二段 96 號<br />
              請於指定日期攜帶訂單編號至門市取貨。
            </div>
          )}

          <div className={s.sectionTitleMdSpaced}>
            {shipMethod === 'store' ? '指定到店日期' : '指定出貨日期'}
          </div>

          {/* 無交集：提示分開下單 */}
          {noIntersection ? (
            <div className={s.noIntersection}>
              <div className={s.noIntersectionTitle}>無法安排同一天出貨</div>
              <div className={s.noIntersectionMsg}>{intersectionMsg}</div>
            </div>
          ) : allDateMode && dateModeDates.length > 0 ? (
            /* 全日期模式：已在商品頁選好出貨日 */
            <div className={s.fixedDateWrap}>
              <div className={s.fixedDateBox}>
                <div className={s.fixedDateLabel}>已選擇出貨日期</div>
                <div className={s.fixedDateValue}>
                  {dateModeDates.map(d => {
                    const dt = new Date(d + 'T12:00:00');
                    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
                    return `${dt.getMonth() + 1}/${dt.getDate()}（${dayNames[dt.getDay()]}）`;
                  }).join('、')}
                </div>
                <div className={s.fixedDateHint}>出貨日期已於商品頁選定，如需更改請回商品頁選取其它日期。</div>
              </div>
            </div>
          ) : items.every(i => i.isPreorder) && mixedShipDate ? (
            /* 純預購：固定顯示批次出貨日 */
            <div className={s.fixedDateWrap}>
              <div className={s.fixedDateBox}>
                <div className={s.fixedDateLabel}>統一出貨日（固定）</div>
                <div className={s.fixedDateValue}>{mixedShipDate}</div>
                <div className={s.fixedDateHint}>預購批次固定出貨日，無法更改</div>
              </div>
            </div>
          ) : datesLoading ? (
            /* 載入中 */
            <div className={s.datesLoading}>計算可出貨日期中...</div>
          ) : availableDates.length > 0 ? (
            /* 有可選日期：顯示日期按鈕（混購時多一行提示） */
            <div className={s.datesWrap}>
              {hasMixed && unifiedShipDate && (
                <div className={s.mixedDateHint}>
                  此訂單需統一出貨，以下為可選出貨日期。
                </div>
              )}
              <div className={s.dateList}>
                {availableDates.map(d => (
                  <button
                    key={d}
                    onClick={() => setDate(d)}
                    className={`${s.dateBtn} ${date === d ? s.dateBtnSelected : ''}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              {!date && <div className={s.dateHintError}>請選擇出貨日期</div>}
              {date && <div className={s.dateHintOk}>
                {shipMethod === 'store' ? '已選擇到店日期：' : '已選擇出貨日期：'}{date}
              </div>}
            </div>
          ) : (
            /* 沒有可選日期（空陣列，不是無交集） */
            <div className={s.noDates}>
              目前沒有可選的出貨日期，請聯絡客服。
            </div>
          )}

          <div className={s.sectionTitle}>備註（選填）</div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="包裝需求、禮盒說明等..." className={s.inputTextarea} />

          <div className={s.sectionTitle}>折扣碼（選填）</div>
          <div className={s.couponRow}>
            <input value={coupon} onChange={e => setCoupon(e.target.value)} placeholder="輸入折扣碼" className={s.inputCoupon} />
            <button onClick={applyCoupon} className={s.btnApply}>套用</button>
          </div>
          {couponMsg && <div className={discount > 0 ? s.couponMsgOk : s.couponMsgErr}>{couponMsg}</div>}

          <div className={s.actionRow}>
            <button onClick={() => setStep(1)} className={s.btn}>&larr; 上一步</button>
            <button onClick={validateStep2} className={s.btn}>下一步</button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div>
          <h2 className={s.heading}>選擇付款方式</h2>
          {PAY_OPTIONS.map(opt => (
            <RadioCard key={opt.value} value={opt.value} title={opt.title} sub={opt.sub} checked={payMethod === opt.value} onChange={() => setPayMethod(opt.value)} />
          ))}

          <div className={s.sectionTitleSpaced}>訂單摘要</div>
          <div className={s.orderSummaryBox}>
            {items.map(item => {
              let summaryKey = item.variantId ? `${item.id}_${item.variantId}` : item.id;
              if (item.preorderBatchId) summaryKey += `_b${item.preorderBatchId}`;
              if ((item as any).shipDateId) summaryKey += `_sd${(item as any).shipDateId}`;
              return (
              <div key={summaryKey} className={s.orderSummaryItem}>
                <span>{item.name} &times; {item.qty}</span>
                <span>{item.isRedeemItem ? '免費' : `NT$ ${(item.price * item.qty).toLocaleString()}`}</span>
              </div>
            )})}
            {promoResult.gifts.map(g => (
              <div key={`gift3-${g.promotion_id}-${g.product_id}`} className={s.orderSummaryItem} style={{ color: '#2ab85a' }}>
                <span>{giftProductNames[g.product_id]?.name ?? `贈品 #${g.product_id}`} &times; {g.qty}（贈品）</span>
                <span>免費</span>
              </div>
            ))}
          </div>

          {[
            { label: '商品小計', value: `NT$ ${totalPrice.toLocaleString()}` },
            { label: '運費', value: shippingFee === 0 ? '免運' : `NT$ ${shippingFee.toLocaleString()}` },
            ...(promoDiscount > 0 ? promoResult.discounts.map(d => ({ label: d.promotion_name, value: `− NT$ ${d.discount_amount.toLocaleString()}`, green: true })) : []),
            ...(discount > 0 ? [{ label: '折扣碼', value: `− NT$ ${discount.toLocaleString()}`, green: true }] : []),
          ].map(({ label, value, green }: any) => (
            <div key={label} className={s.step3SummaryRow}>
              <span className={green ? s.step3SummaryLabelGreen : s.step3SummaryLabel}>{label}</span>
              <span className={green ? s.step3SummaryValueGreen : s.step3SummaryValue}>{value}</span>
            </div>
          ))}

          <div className={s.totalRow}>
            <span className={s.totalLabel}>應付金額</span>
            <span className={s.totalValue}>
              NT$ {(Math.max(0, totalPrice - discount - promoDiscount) + shippingFee).toLocaleString()}
            </span>
          </div>

          <div className={s.infoNotice}>
            &middot; 下單後將寄送確認信至您的 Email<br />
            &middot; 信用卡付款由綠界 ECPay 安全處理<br />
            &middot; ATM虛擬帳號請於 72 小時內完成轉帳，逾時訂單自動取消
          </div>

          <div className={s.actionRow}>
            <button onClick={() => setStep(2)} className={s.btn}>&larr; 上一步</button>
            <button onClick={handleSubmit} disabled={submitting} className={`${s.btnSubmit} ${submitting ? s.btnSubmitDisabled : ''}`}>
              {submitting ? '處理中...' : '確認下單'}
            </button>
          </div>
        </div>
      )}

      {/* 完成 */}
      {step === 'done' && (
        <div className={s.doneWrap}>
          <div className={s.doneIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1E1C1A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="9 12 11.5 14.5 16 9.5" />
            </svg>
          </div>
          <h2 className={s.doneHeading}>訂單已成立</h2>
          <p className={s.doneSubtext}>您的訂單號碼</p>
          <p className={s.doneOrderNo}>{orderNo}</p>
          <Link href="/" onClick={() => { sessionStorage.removeItem('checkout_step'); sessionStorage.removeItem('checkout_orderNo'); }} className={s.doneHomeLink}>返回首頁</Link>
        </div>
      )}
    </div>
  );
}
