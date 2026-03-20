'use client';

// app/checkout/page.tsx  ──  結帳頁（含運費計算、地址自動帶入）

import { useState, useEffect } from 'react';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

const CITIES = ['台北市','新北市','桃園市','台中市','台南市','高雄市','新竹縣','新竹市','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','嘉義市','屏東縣','宜蘭縣','花蓮縣','台東縣'];

// 配送方式設定
const SHIP_OPTIONS = [
  { value: 'home_normal', title: '一般宅配',  sub: '黑貓 / 新竹 — 常溫商品',  feeKey: 'fee_home_normal' },
  { value: 'home_cold',   title: '低溫宅配',  sub: '冷藏配送 — 蛋糕類商品',   feeKey: 'fee_home_cold' },
  { value: 'cvs_711',     title: '7-11 取貨', sub: '超商取貨付款',             feeKey: 'fee_cvs' },
  { value: 'cvs_family',  title: '全家取貨',  sub: '超商取貨付款',             feeKey: 'fee_cvs' },
  { value: 'store',       title: '門市自取',  sub: '宜蘭市神農路二段 96 號',   feeKey: null },
];
const PAY_OPTIONS = [
  { value: 'credit', title: '信用卡',   sub: 'Visa / Master / JCB — 綠界 ECPay 安全加密' },
  { value: 'atm',    title: 'ATM 轉帳', sub: '系統產生虛擬帳號，請於 3 天內完成轉帳' },
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
  const [step, setStep] = useState<1|2|3|'done'>(1);

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

  // 商店配送設定
  const [storeSettings, setStoreSettings] = useState<any>(null);

  // 運費
  const [shippingFee, setShippingFee] = useState(0);

  // Step 2 欄位
  const [shipMethod, setShipMethod] = useState('home_cold');
  const [name,       setName]       = useState('');
  const [phone,      setPhone]      = useState('');
  const [email,      setEmail]      = useState('');
  const [city,       setCity]       = useState('');
  const [district,   setDistrict]   = useState('');
  const [address,    setAddress]    = useState('');
  const [date,       setDate]       = useState('');
  const [note,       setNote]       = useState('');
  const [coupon,     setCoupon]     = useState('');
  const [couponMsg,  setCouponMsg]  = useState('');
  const [discount,   setDiscount]   = useState(0);
  const [payMethod,  setPayMethod]  = useState('credit');
  const [submitting, setSubmitting] = useState(false);
  const [orderNo,    setOrderNo]    = useState('');

  const isHomeDelivery = shipMethod === 'home_normal' || shipMethod === 'home_cold';

  // 載入登入狀態 + 商店設定
  useEffect(() => {
    const load = async () => {
      const [{ data: { session } }, { data: settings }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from('store_settings').select('fee_home_normal, fee_home_cold, fee_cvs, free_ship_amount, free_ship_cold').eq('id', 1).single(),
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

  // 帶入已儲存地址
  const applyAddress = (addr: any) => {
    setName(addr.name ?? '');
    setPhone(addr.phone ?? '');
    if (addr.type === 'home') {
      if (addr.city?.includes('normal') || true) setShipMethod('home_cold');
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
    if (error || !data) { setDiscount(0); setCouponMsg('✗ 折扣碼無效'); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setCouponMsg('✗ 折扣碼已過期'); return; }
    if (data.min_amount > 0 && totalPrice < data.min_amount) { setCouponMsg(`✗ 需消費滿 NT$${data.min_amount} 才能使用`); return; }
    if (data.max_uses > 0 && data.used_count >= data.max_uses) { setCouponMsg('✗ 折扣碼已達使用上限'); return; }
    const amt = data.type === 'percent' ? Math.floor(totalPrice * data.value / 100) : data.value;
    setDiscount(amt);
    setCouponMsg(`✓ 折扣碼套用成功，折抵 NT$${amt}`);
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
    if (noIntersection) { alert('您的購物車商品無法安排在同一天出貨，請分開下單。'); return; }
    if (!date && availableDates.length > 0) { alert('請選擇出貨日期'); return; }
    setStep(3);
  };

  const generateOrderNo = () => {
    const now = new Date();
    const d = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    return `WB${d}${String(Math.floor(Math.random() * 9000) + 1000)}`;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    const no    = generateOrderNo();
    const total = totalPrice - discount + shippingFee;
    const fullAddress = isHomeDelivery ? `${city}${district}${address}` : undefined;

    // 有預購或混購時，出貨日固定用統一出貨日
    const finalShipDate = (hasMixed || items.every(i => i.isPreorder)) && mixedShipDate
      ? mixedShipDate
      : date || null;

    const { data: order, error: orderError } = await supabase.from('orders').insert({
      order_no: no, member_id: memberId, buyer_name: name, buyer_phone: phone, buyer_email: email,
      ship_method: shipMethod, city: city || null, district: district || null, address: fullAddress || null,
      ship_date: finalShipDate, note: note || null,
      subtotal: totalPrice, discount, shipping_fee: shippingFee, total,
      coupon_code: coupon || null, pay_method: payMethod, pay_status: 'pending', status: 'processing',
    }).select('id').single();

    if (orderError || !order) { setSubmitting(false); alert('訂單建立失敗，請稍後再試'); return; }

    // 寫入訂單明細（含 snapshot，兌換品price=0）
    await supabase.from('order_items').insert(items.map(item => ({
      order_id:              order.id,
      product_id:            parseInt(item.id),
      variant_id:            (item as any).variantId ?? null,
      product_name_snapshot: item.name,
      variant_name_snapshot: (item as any).variantName ?? null,
      unit_price:            item.isRedeemItem ? 0 : item.price,
      qty:                   item.qty,
      subtotal:              item.isRedeemItem ? 0 : item.price * item.qty,
      name:  item.name,
      price: item.isRedeemItem ? 0 : item.price,
    })));

    // 預留庫存（兌換品也要預留）
    await fetch('/api/inventory?action=reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: order.id,
        items: items.map(item => ({
          product_id: item.productRealId ?? parseInt(item.id),
          variant_id: (item as any).variantId ?? null,
          qty:        item.qty,
        })),
      }),
    });

    // 兌換品：更新 redemption 狀態為 pending_order 並綁定訂單
    if (redeemItem?.redemptionId) {
      await fetch('/api/redeem?action=update_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redemption_id: redeemItem.redemptionId,
          order_id:      order.id,
        }),
      });

      // 更新訂單的兌換欄位
      await supabase.from('orders').update({
        redemption_id:  redeemItem.redemptionId,
        redeem_stamps:  redeemItem.redemptionId ? 1 : 0,
      }).eq('id', order.id);
    }

    if (coupon && discount > 0) await supabase.rpc('increment_coupon_usage', { coupon_code: coupon.toUpperCase() });

    clearCart();
    setOrderNo(no);
    setSubmitting(false);
    setStep('done');
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
                {isPast ? '✓' : s}
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
                        : item.isRedeemItem ? <span style={{ fontSize: '20px' }}>🎁</span> : null
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
              {/* 混購提示條 */}
              {hasMixed && mixedShipDate && (
                <div style={{ margin: '16px 0', padding: '14px 20px', background: '#fff8e1', border: '1px solid #f0c040', fontSize: '13px', color: '#7a5c00', lineHeight: 2 }}>
                  ⚠️ 此購物車包含預購商品，若一起結帳，所有商品將於 <strong>{mixedShipDate}</strong> 統一出貨。
                </div>
              )}
              {!memberId && (
                <div style={{ margin: '24px 0', padding: '16px 20px', background: '#EDE9E2', fontSize: '12px', color: '#555250', lineHeight: 2 }}>
                  💡 <Link href="/member" style={{ color: '#1E1C1A', textDecoration: 'underline' }}>登入</Link> 後結帳可累積集章、自動帶入收件地址。
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

          <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.28em', color: '#1E1C1A', margin: '0 0 28px' }}>收件資訊</h2>

          {/* 已儲存地址快速帶入 */}
          {savedAddresses.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={sectionTitleStyle}>選擇已儲存地址</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {savedAddresses.map(addr => (
                  <button key={addr.id} onClick={() => applyAddress(addr)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '12px', color: '#555250', cursor: 'pointer', fontFamily: '"Noto Sans TC", sans-serif' }}>
                    {addr.label || addr.name}
                    {addr.is_default && ' ★'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={sectionTitleStyle}>配送方式</div>
          {SHIP_OPTIONS.map(opt => (
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

          <div style={{ ...sectionTitleStyle, marginTop: '24px' }}>
            {shipMethod === 'store' ? '指定到店日期' : '指定出貨日期'}
          </div>

          {/* 無交集：提示分開下單 */}
          {noIntersection ? (
            <div style={{ padding: '16px 20px', background: '#fef0f0', border: '1px solid #f5c6c6', marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#c0392b', marginBottom: '6px' }}>⚠️ 無法安排同一天出貨</div>
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
          {couponMsg && <div style={{ fontSize: '11px', marginTop: '6px', color: couponMsg.startsWith('✓') ? '#2ab85a' : '#c0392b' }}>{couponMsg}</div>}

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
            ...(discount > 0 ? [{ label: '折扣', value: `− NT$ ${discount.toLocaleString()}`, green: true }] : []),
          ].map(({ label, value, green }: any) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: '13px' }}>
              <span style={{ color: green ? '#2ab85a' : '#888580' }}>{label}</span>
              <span style={{ color: green ? '#2ab85a' : '#555250' }}>{value}</span>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', marginTop: '8px' }}>
            <span style={{ fontSize: '14px', color: '#1E1C1A', letterSpacing: '0.1em' }}>應付金額</span>
            <span style={{ fontFamily: '"Noto Serif TC", serif', fontSize: '20px', fontWeight: 200, color: '#b35252' }}>
              NT$ {(totalPrice - discount + shippingFee).toLocaleString()}
            </span>
          </div>

          <div style={{ fontSize: '12px', color: '#888580', lineHeight: 2.2, padding: '16px 20px', background: '#F7F4EF', border: '1px solid #E8E4DC', margin: '16px 0 28px' }}>
            ✓ 下單後將寄送確認信至您的 Email<br />
            ✓ 信用卡付款由綠界 ECPay 安全處理<br />
            ✓ ATM 轉帳請於 72 小時內完成，逾時訂單自動取消
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
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>✓</div>
          <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.3em', color: '#1E1C1A', marginBottom: '12px' }}>訂單已成立</h2>
          <p style={{ fontSize: '13px', color: '#555250', marginBottom: '8px' }}>訂單確認信已寄至您的 Email</p>
          <p style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '11px', letterSpacing: '0.2em', color: '#888580', marginBottom: '32px' }}>{orderNo}</p>
          <Link href="/" style={{ ...btnStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>返回首頁</Link>
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
