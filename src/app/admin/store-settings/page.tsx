'use client';

// ════════════════════════════════════════════════
// app/admin/store-settings/page.tsx  ──  商店設定（完整版）
// ════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const DAYS_TW = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const DAYS_EN = ['0', '1', '2', '3', '4', '5', '6'];

const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #E8E4DC', background: '#fff', fontFamily: 'inherit', fontSize: '13px', color: '#1E1C1A', outline: 'none' };
const labelStyle: React.CSSProperties = { fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', display: 'block', marginBottom: '6px' };
const sectionTitle: React.CSSProperties = { fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '14px', color: '#1E1C1A', borderBottom: '1px solid #E8E4DC', paddingBottom: '12px', marginBottom: '20px' };
const Toggle = ({ val, onChange }: { val: boolean; onChange: () => void }) => (
  <div onClick={onChange} style={{ width: '40px', height: '22px', borderRadius: '11px', background: val ? '#1E1C1A' : '#E8E4DC', position: 'relative', cursor: 'pointer', transition: 'background 0.3s', flexShrink: 0 }}>
    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: val ? '21px' : '3px', transition: 'left 0.3s' }} />
  </div>
);

export default function AdminStoreSettingsPage() {
  const [tab,     setTab]     = useState<'info'|'shipping'|'payment'|'appearance'|'seo'>('info');
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 商店資訊
  const [name, setName] = useState('未半甜點');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [lineId, setLineId] = useState('');
  const [hours, setHours] = useState(DAYS_TW.map((d, i) => ({ day: d, open: i > 0 && i < 6, start: '10:00', end: '20:00' })));

  // 配送設定
  const [shipHomeNormal, setShipHomeNormal] = useState(true);
  const [shipHomeCold, setShipHomeCold] = useState(true);
  const [shipCvs711, setShipCvs711] = useState(true);
  const [shipCvsFamily, setShipCvsFamily] = useState(true);
  const [shipStore, setShipStore] = useState(true);
  const [feeHomeNormal, setFeeHomeNormal] = useState(100);
  const [feeHomeCold, setFeeHomeCold] = useState(200);
  const [feeCvs, setFeeCvs] = useState(60);
  const [freeShipEnabled, setFreeShipEnabled] = useState(false);
  const [freeShip, setFreeShip] = useState(0);
  const [freeShipCold, setFreeShipCold] = useState(false);
  const [shipMinDays, setShipMinDays] = useState(1);
  const [shipMaxDays, setShipMaxDays] = useState(14);
  const [sidebarProductLimit, setSidebarProductLimit] = useState(3);
  const [blockedWeekdays, setBlockedWeekdays] = useState<string[]>(['0', '6']);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [newBlockedDate, setNewBlockedDate] = useState('');

  // 前台外觀
  const [heroTitle, setHeroTitle] = useState('未半甜點');
  const [heroSub, setHeroSub] = useState('手工甜點 · 2024');
  const [heroDesc, setHeroDesc] = useState('');
  const [heroBtn, setHeroBtn] = useState('立即選購');
  const [aboutTitle, setAboutTitle] = useState('關於未半');
  const [aboutBody, setAboutBody] = useState('');
  const [aboutImageUrl, setAboutImageUrl] = useState('');
  const [colorBg, setColorBg] = useState('#F7F4EF');
  const [colorSurface, setColorSurface] = useState('#EDE9E2');
  const [colorDark, setColorDark] = useState('#1E1C1A');
  const [colorPrice, setColorPrice] = useState('#b35252');
  const [colorBtn, setColorBtn] = useState('#1E1C1A');
  const [fontTitle, setFontTitle] = useState("'Noto Serif TC', serif");
  const [fontBody, setFontBody] = useState("'Noto Sans TC', sans-serif");
  const [footerShowTel, setFooterShowTel] = useState(true);
  const [footerShowEmail, setFooterShowEmail] = useState(true);
  const [footerShowAddress, setFooterShowAddress] = useState(true);
  const [footerShowCopyright, setFooterShowCopyright] = useState(false);
  const [footerCopyright, setFooterCopyright] = useState('© 未半甜點 版權所有');

  // SEO
  const [seoTitle, setSeoTitle] = useState('未半甜點 | 手工甜點');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoKeywords, setSeoKeywords] = useState('');
  const [ogTitle, setOgTitle] = useState('');
  const [ogDescription, setOgDescription] = useState('');
  const [ogImageUrl, setOgImageUrl] = useState('');
  const [fbPixelId, setFbPixelId] = useState('');
  const [ga4Id, setGa4Id] = useState('');
  const [gtmId, setGtmId] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('store_settings').select('*').eq('id', 1).single();
      if (data) {
        setName(data.name ?? '未半甜點');
        setDescription(data.description ?? '');
        setEmail(data.email ?? '');
        setPhone(data.phone ?? '');
        setAddress(data.address ?? '');
        setInstagram(data.instagram_url ?? '');
        setFacebook(data.facebook_url ?? '');
        setLineId(data.line_id ?? '');
        setShipHomeNormal(data.ship_home_normal ?? true);
        setShipHomeCold(data.ship_home_cold ?? true);
        setShipCvs711(data.ship_cvs_711 ?? true);
        setShipCvsFamily(data.ship_cvs_family ?? true);
        setShipStore(data.ship_store ?? true);
        setFeeHomeNormal(data.fee_home_normal ?? 100);
        setFeeHomeCold(data.fee_home_cold ?? 200);
        setFeeCvs(data.fee_cvs ?? 60);
        setFreeShip(data.free_ship_amount ?? 0);
        setFreeShipEnabled((data.free_ship_amount ?? 0) > 0);
        setFreeShipCold(data.free_ship_cold ?? false);
        setShipMinDays(data.ship_min_days ?? 1);
        setShipMaxDays(data.ship_max_days ?? 14);
        setSidebarProductLimit(data.sidebar_product_limit ?? 3);
        setBlockedWeekdays(JSON.parse(data.ship_blocked_weekdays ?? '["0","6"]'));
        setBlockedDates(JSON.parse(data.ship_blocked_dates ?? '[]'));
        if (data.business_hours) {
          try { setHours(JSON.parse(data.business_hours)); } catch {}
        }
        setHeroTitle(data.hero_title ?? '未半甜點');
        setHeroSub(data.hero_sub ?? '手工甜點 · 2024');
        setHeroDesc(data.hero_desc ?? '');
        setHeroBtn(data.hero_btn ?? '立即選購');
        setAboutTitle(data.about_title ?? '關於未半');
        setAboutBody(data.about_body ?? '');
        setAboutImageUrl(data.about_image_url ?? '');
        setColorBg(data.color_bg ?? '#F7F4EF');
        setColorSurface(data.color_surface ?? '#EDE9E2');
        setColorDark(data.color_dark ?? '#1E1C1A');
        setColorPrice(data.color_price ?? '#b35252');
        setColorBtn(data.color_btn ?? '#1E1C1A');
        setFontTitle(data.font_title ?? "'Noto Serif TC', serif");
        setFontBody(data.font_body ?? "'Noto Sans TC', sans-serif");
        setFooterShowTel(data.footer_show_tel ?? true);
        setFooterShowEmail(data.footer_show_email ?? true);
        setFooterShowAddress(data.footer_show_address ?? true);
        setFooterShowCopyright(data.footer_show_copyright ?? false);
        setFooterCopyright(data.footer_copyright ?? '© 未半甜點 版權所有');
        setSeoTitle(data.seo_title ?? '未半甜點 | 手工甜點');
        setSeoDescription(data.seo_description ?? '');
        setSeoKeywords(data.seo_keywords ?? '');
        setOgTitle(data.og_title ?? '');
        setOgDescription(data.og_description ?? '');
        setOgImageUrl(data.og_image_url ?? '');
        setFbPixelId(data.fb_pixel_id ?? '');
        setGa4Id(data.ga4_id ?? '');
        setGtmId(data.gtm_id ?? '');
      }
      setLoading(false);
    };
    load();
  }, []);

  // 上傳品牌故事圖片
  const handleAboutImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const fileName = `store/about-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('images').upload(fileName, file, { cacheControl: '3600', upsert: true, contentType: file.type });
    if (error) { alert('上傳失敗：' + error.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('images').getPublicUrl(fileName);
    setAboutImageUrl(urlData.publicUrl);
    setUploading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await supabase.from('store_settings').upsert({
      id: 1, name, description, email, phone, address,
      instagram_url: instagram, facebook_url: facebook, line_id: lineId,
      ship_home_normal: shipHomeNormal, ship_home_cold: shipHomeCold,
      ship_cvs_711: shipCvs711, ship_cvs_family: shipCvsFamily, ship_store: shipStore,
      fee_home_normal: feeHomeNormal, fee_home_cold: feeHomeCold, fee_cvs: feeCvs,
      free_ship_amount: freeShipEnabled ? freeShip : 0, free_ship_cold: freeShipCold,
      ship_min_days: shipMinDays, ship_max_days: shipMaxDays,
      sidebar_product_limit: sidebarProductLimit,
      ship_blocked_weekdays: JSON.stringify(blockedWeekdays),
      ship_blocked_dates: JSON.stringify(blockedDates),
      business_hours: JSON.stringify(hours),
      hero_title: heroTitle, hero_sub: heroSub, hero_desc: heroDesc, hero_btn: heroBtn,
      about_title: aboutTitle, about_body: aboutBody, about_image_url: aboutImageUrl,
      color_bg: colorBg, color_surface: colorSurface, color_dark: colorDark,
      color_price: colorPrice, color_btn: colorBtn,
      font_title: fontTitle, font_body: fontBody,
      footer_show_tel: footerShowTel, footer_show_email: footerShowEmail,
      footer_show_address: footerShowAddress, footer_show_copyright: footerShowCopyright,
      footer_copyright: footerCopyright,
      seo_title: seoTitle, seo_description: seoDescription, seo_keywords: seoKeywords,
      og_title: ogTitle, og_description: ogDescription, og_image_url: ogImageUrl,
      fb_pixel_id: fbPixelId, ga4_id: ga4Id, gtm_id: gtmId,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    alert('設定已儲存');
  };

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '10px 20px', cursor: 'pointer', fontSize: '13px',
    borderBottom: tab === t ? '2px solid #1E1C1A' : '2px solid transparent',
    color: tab === t ? '#1E1C1A' : '#888580',
    fontFamily: '"Noto Sans TC", sans-serif', whiteSpace: 'nowrap',
  });

  const toggleWeekday = (d: string) => setBlockedWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  const addBlockedDate = () => { if (!newBlockedDate || blockedDates.includes(newBlockedDate)) return; setBlockedDates(prev => [...prev, newBlockedDate].sort()); setNewBlockedDate(''); };

  const ColorRow = ({ label, val, set }: { label: string; val: string; set: (v: string) => void }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
      <label style={{ ...labelStyle, marginBottom: 0, width: '120px', flexShrink: 0 }}>{label}</label>
      <input type="color" value={val} onChange={e => set(e.target.value)} style={{ width: '44px', height: '36px', border: '1px solid #E8E4DC', cursor: 'pointer', padding: '2px' }} />
      <input value={val} onChange={e => set(e.target.value)} style={{ ...inputStyle, width: '120px', fontFamily: '"Montserrat", sans-serif' }} />
      <button onClick={() => {}} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '11px', color: '#888580', cursor: 'pointer' }}>預設</button>
    </div>
  );

  if (loading) return <p style={{ color: '#888580', fontSize: '13px' }}>載入中...</p>;

  return (
    <div>
      <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: '0 0 24px' }}>商店設定</h1>

      <div style={{ display: 'flex', borderBottom: '1px solid #E8E4DC', marginBottom: '32px', overflowX: 'auto' }}>
        {[{ key: 'info', label: '商店資訊' }, { key: 'shipping', label: '配送設定' }, { key: 'payment', label: '付款設定' }, { key: 'appearance', label: '前台外觀' }, { key: 'seo', label: 'SEO 設定' }].map(({ key, label }) => (
          <div key={key} style={tabStyle(key)} onClick={() => setTab(key as any)}>{label}</div>
        ))}
      </div>

      {/* ════ 商店資訊 ════ */}
      {tab === 'info' && (
        <div style={{ maxWidth: '640px' }}>
          <div style={sectionTitle}>基本資訊</div>
          {[
            { label: '商店名稱', val: name, set: setName, ph: '未半甜點', max: '320px' },
            { label: '商店描述', val: description, set: setDescription, ph: '以純粹視覺為引...', max: '480px', textarea: true },
            { label: '聯絡 Email', val: email, set: setEmail, ph: 'hello@weiban.tw', max: '320px' },
            { label: '商店電話', val: phone, set: setPhone, ph: '039-381-241', max: '220px' },
            { label: '實體地址', val: address, set: setAddress, ph: '260 台灣宜蘭縣...', max: '480px' },
          ].map(({ label, val, set, ph, max, textarea }) => (
            <div key={label} style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>{label}</label>
              {textarea ? <textarea value={val} onChange={e => set(e.target.value)} rows={3} placeholder={ph} style={{ ...inputStyle, width: '100%', maxWidth: max, resize: 'vertical' }} />
                : <input value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{ ...inputStyle, width: '100%', maxWidth: max }} />}
            </div>
          ))}

          <div style={{ ...sectionTitle, marginTop: '32px' }}>營業時間</div>
          {hours.map((h, i) => (
            <div key={h.day} style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
              <span style={{ width: '44px', fontSize: '13px', color: '#1E1C1A', flexShrink: 0 }}>{h.day}</span>
              <Toggle val={h.open} onChange={() => setHours(prev => prev.map((d, j) => j === i ? { ...d, open: !d.open } : d))} />
              {h.open ? (
                <>
                  <input
                    type="time"
                    value={h.start}
                    onChange={e => setHours(prev => prev.map((d, j) => j === i ? { ...d, start: e.target.value } : d))}
                    style={{ ...inputStyle, width: '130px', minWidth: '130px' }}
                  />
                  <span style={{ color: '#888580', flexShrink: 0 }}>—</span>
                  <input
                    type="time"
                    value={h.end}
                    onChange={e => setHours(prev => prev.map((d, j) => j === i ? { ...d, end: e.target.value } : d))}
                    style={{ ...inputStyle, width: '130px', minWidth: '130px' }}
                  />
                </>
              ) : (
                <span style={{ fontSize: '12px', color: '#888580' }}>公休</span>
              )}
            </div>
          ))}

          <div style={{ ...sectionTitle, marginTop: '32px' }}>社群連結</div>
          {[
            { label: 'Instagram', val: instagram, set: setInstagram, ph: 'https://instagram.com/...' },
            { label: 'Facebook', val: facebook, set: setFacebook, ph: 'https://facebook.com/...' },
            { label: 'LINE 官方帳號', val: lineId, set: setLineId, ph: '@weiban' },
          ].map(({ label, val, set, ph }) => (
            <div key={label} style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>{label}</label>
              <input value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{ ...inputStyle, width: '100%', maxWidth: '400px' }} />
            </div>
          ))}
        </div>
      )}

      {/* ════ 配送設定 ════ */}
      {tab === 'shipping' && (
        <div style={{ maxWidth: '600px' }}>
          <div style={sectionTitle}>配送方式開關</div>
          {[
            { label: '一般宅配', val: shipHomeNormal, set: setShipHomeNormal },
            { label: '低溫宅配', val: shipHomeCold, set: setShipHomeCold },
            { label: '7-11 超商取貨', val: shipCvs711, set: setShipCvs711 },
            { label: '全家超商取貨', val: shipCvsFamily, set: setShipCvsFamily },
            { label: '門市自取', val: shipStore, set: setShipStore },
          ].map(({ label, val, set }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontSize: '13px', color: '#1E1C1A' }}>{label}</span>
              <Toggle val={val} onChange={() => set(!val)} />
            </div>
          ))}

          <div style={{ ...sectionTitle, marginTop: '28px' }}>運費設定</div>
          {[
            { label: '一般宅配運費', val: feeHomeNormal, set: setFeeHomeNormal },
            { label: '低溫宅配運費', val: feeHomeCold, set: setFeeHomeCold },
            { label: '超商取貨運費', val: feeCvs, set: setFeeCvs },
          ].map(({ label, val, set }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <label style={{ ...labelStyle, marginBottom: 0, width: '160px', flexShrink: 0 }}>{label}</label>
              <input type="number" value={val} onChange={e => set(Number(e.target.value))} style={{ ...inputStyle, width: '90px' }} />
              <span style={{ fontSize: '12px', color: '#888580' }}>NT$</span>
            </div>
          ))}

          <div style={{ ...sectionTitle, marginTop: '28px' }}>免運設定</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E8E4DC', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#1E1C1A' }}>啟用免運</span>
            <Toggle val={freeShipEnabled} onChange={() => setFreeShipEnabled(!freeShipEnabled)} />
          </div>
          {freeShipEnabled && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <label style={{ ...labelStyle, marginBottom: 0, width: '160px', flexShrink: 0 }}>免運門檻</label>
                <input type="number" value={freeShip} onChange={e => setFreeShip(Number(e.target.value))} style={{ ...inputStyle, width: '90px' }} />
                <span style={{ fontSize: '12px', color: '#888580' }}>NT$ 以上免一般宅配運費</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E8E4DC', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', color: '#1E1C1A' }}>低溫也免運</span>
                <Toggle val={freeShipCold} onChange={() => setFreeShipCold(!freeShipCold)} />
              </div>
            </>
          )}

          <div style={{ ...sectionTitle, marginTop: '28px' }}>前台側邊欄設定</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <label style={{ ...labelStyle, marginBottom: 0, width: '200px', flexShrink: 0 }}>每個分類顯示商品數</label>
            <input type="number" min={1} max={10} value={sidebarProductLimit} onChange={e => setSidebarProductLimit(Number(e.target.value))} style={{ ...inputStyle, width: '70px' }} />
            <span style={{ fontSize: '12px', color: '#888580' }}>個（超過的折疊至「查看全部」）</span>
          </div>

          <div style={{ ...sectionTitle, marginTop: '28px' }}>出貨日期限制</div>
          {[
            { label: '最早出貨天數', val: shipMinDays, set: setShipMinDays, hint: '天後（下單後至少幾天才能出貨）' },
            { label: '最晚可選天數', val: shipMaxDays, set: setShipMaxDays, hint: '天內（顧客最遠可選幾天後）' },
          ].map(({ label, val, set, hint }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <label style={{ ...labelStyle, marginBottom: 0, width: '160px', flexShrink: 0 }}>{label}</label>
              <input type="number" value={val} onChange={e => set(Number(e.target.value))} style={{ ...inputStyle, width: '70px' }} />
              <span style={{ fontSize: '12px', color: '#888580' }}>{hint}</span>
            </div>
          ))}

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>不出貨的星期</label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
              {DAYS_TW.map((d, i) => (
                <label key={d} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#1E1C1A', cursor: 'pointer' }}>
                  <input type="checkbox" checked={blockedWeekdays.includes(DAYS_EN[i])} onChange={() => toggleWeekday(DAYS_EN[i])} style={{ accentColor: '#1E1C1A' }} />{d}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>特定封鎖日期</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', marginBottom: '8px' }}>
              <input type="date" value={newBlockedDate} onChange={e => setNewBlockedDate(e.target.value)} style={{ ...inputStyle, width: '180px' }} />
              <button onClick={addBlockedDate} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '12px', color: '#555250', cursor: 'pointer' }}>＋ 新增</button>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {blockedDates.map(d => (
                <span key={d} style={{ background: '#EDE9E2', padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {d} <span onClick={() => setBlockedDates(prev => prev.filter(x => x !== d))} style={{ cursor: 'pointer', color: '#888580', fontWeight: 700 }}>×</span>
                </span>
              ))}
              {blockedDates.length === 0 && <span style={{ fontSize: '12px', color: '#888580' }}>尚無封鎖日期</span>}
            </div>
          </div>
        </div>
      )}

      {/* ════ 付款設定 ════ */}
      {tab === 'payment' && (
        <div style={{ maxWidth: '560px' }}>
          <div style={{ background: '#fff8e1', border: '1px solid #f0c040', padding: '14px 20px', marginBottom: '24px', fontSize: '13px', color: '#7a5c00' }}>
            💡 金流串接（綠界 ECPay）需設定以下金鑰，請向綠界申請商家帳號後填入。
          </div>
          <div style={sectionTitle}>付款方式</div>
          {[{ label: '信用卡（Visa / Master / JCB）' }, { label: 'ATM 轉帳' }].map(({ label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontSize: '13px', color: '#1E1C1A' }}>{label}</span>
              <Toggle val={true} onChange={() => {}} />
            </div>
          ))}
          <div style={{ ...sectionTitle, marginTop: '28px' }}>綠界 ECPay 金鑰</div>
          {[
            { label: '商店代號（MerchantID）', ph: '例：3002607' },
            { label: 'HashKey', ph: '請填入綠界 HashKey', type: 'password' },
            { label: 'HashIV', ph: '請填入綠界 HashIV', type: 'password' },
          ].map(({ label, ph, type }) => (
            <div key={label} style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>{label}</label>
              <input type={type ?? 'text'} placeholder={ph} style={{ ...inputStyle, width: '100%', maxWidth: '320px' }} />
            </div>
          ))}
          <div style={{ fontSize: '12px', color: '#888580', marginTop: '8px' }}>金鑰請存放在 .env.local，不要直接輸入在此，避免外洩。</div>
        </div>
      )}

      {/* ════ 前台外觀 ════ */}
      {tab === 'appearance' && (
        <div style={{ maxWidth: '640px' }}>
          <div style={sectionTitle}>品牌文字</div>
          {[
            { label: 'Hero 主標題', val: heroTitle, set: setHeroTitle, ph: '未半甜點', max: '320px' },
            { label: 'Hero 副標題', val: heroSub, set: setHeroSub, ph: '手工甜點 · 2024', max: '400px' },
            { label: 'Hero 說明文字', val: heroDesc, set: setHeroDesc, ph: '以純粹視覺為引...', max: '480px', textarea: true },
            { label: 'Hero 按鈕文字', val: heroBtn, set: setHeroBtn, ph: '立即選購', max: '200px' },
          ].map(({ label, val, set, ph, max, textarea }) => (
            <div key={label} style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>{label}</label>
              {textarea ? <textarea value={val} onChange={e => set(e.target.value)} rows={2} placeholder={ph} style={{ ...inputStyle, width: '100%', maxWidth: max, resize: 'vertical' }} />
                : <input value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{ ...inputStyle, width: '100%', maxWidth: max }} />}
            </div>
          ))}

          <div style={{ ...sectionTitle, marginTop: '28px' }}>品牌故事頁</div>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>品牌故事標題</label>
            <input value={aboutTitle} onChange={e => setAboutTitle(e.target.value)} style={{ ...inputStyle, width: '100%', maxWidth: '320px' }} />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>品牌故事內文</label>
            <textarea value={aboutBody} onChange={e => setAboutBody(e.target.value)} rows={5} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: '28px' }}>
            <label style={labelStyle}>品牌故事圖片</label>
            <div style={{ marginTop: '8px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              {aboutImageUrl && <img src={aboutImageUrl} alt="品牌故事" style={{ width: '80px', height: '80px', objectFit: 'cover', border: '1px solid #E8E4DC' }} />}
              <div style={{ flex: 1 }}>
                <input value={aboutImageUrl} onChange={e => setAboutImageUrl(e.target.value)} placeholder="貼上圖片網址，或點下方按鈕上傳" style={{ ...inputStyle, width: '100%' }} />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ marginTop: '8px', padding: '7px 14px', background: 'transparent', border: '1px solid #E8E4DC', fontSize: '12px', color: '#555250', cursor: 'pointer' }}>
                  {uploading ? '上傳中...' : '📁 從電腦上傳'}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAboutImageUpload} style={{ display: 'none' }} />
              </div>
            </div>
          </div>

          <div style={sectionTitle}>色彩主題</div>
          <ColorRow label="背景色"       val={colorBg}      set={setColorBg} />
          <ColorRow label="表面色"       val={colorSurface} set={setColorSurface} />
          <ColorRow label="深色文字"     val={colorDark}    set={setColorDark} />
          <ColorRow label="強調色（價格）" val={colorPrice}  set={setColorPrice} />
          <ColorRow label="按鈕色"       val={colorBtn}     set={setColorBtn} />

          {/* 即時預覽 */}
          <div style={{ marginBottom: '28px', padding: '20px', border: '1px solid #E8E4DC', background: colorSurface }}>
            <div style={{ fontSize: '10px', color: '#888580', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>即時預覽</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              {[
                { color: colorBg,      label: '背景' },
                { color: colorSurface, label: '表面' },
                { color: colorDark,    label: '文字', light: true },
                { color: colorPrice,   label: '價格', light: true },
              ].map(({ color, label, light }) => (
                <div key={label} style={{ width: '60px', height: '40px', background: color, border: '1px solid #E8E4DC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: light ? '#fff' : '#888' }}>{label}</div>
              ))}
              <button style={{ padding: '8px 20px', background: colorBtn, color: '#fff', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '11px', letterSpacing: '0.2em', cursor: 'default' }}>按鈕</button>
            </div>
          </div>

          <div style={sectionTitle}>字體設定</div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>標題字體</label>
            <select value={fontTitle} onChange={e => setFontTitle(e.target.value)} style={{ ...inputStyle, width: '100%', maxWidth: '320px' }}>
              <option value="'Noto Serif TC', serif">Noto Serif TC（宋體，目前使用）</option>
              <option value="'Noto Sans TC', sans-serif">Noto Sans TC（黑體）</option>
              <option value="Georgia, serif">Georgia（英文襯線）</option>
            </select>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>內文字體</label>
            <select value={fontBody} onChange={e => setFontBody(e.target.value)} style={{ ...inputStyle, width: '100%', maxWidth: '320px' }}>
              <option value="'Noto Sans TC', sans-serif">Noto Sans TC（目前使用）</option>
              <option value="'Noto Serif TC', serif">Noto Serif TC（宋體）</option>
            </select>
          </div>

          {/* 字體預覽 */}
          <div style={{ marginBottom: '28px', padding: '16px', border: '1px solid #E8E4DC', background: '#fff' }}>
            <div style={{ fontFamily: fontTitle, fontSize: '22px', marginBottom: '8px', color: colorDark }}>未半甜點 — 品牌故事</div>
            <div style={{ fontFamily: fontBody, fontSize: '14px', color: '#555250', lineHeight: 1.8 }}>以純粹視覺為引，將甜點的細膩質地融入潔白空間。</div>
          </div>

          <div style={sectionTitle}>頁尾版面</div>
          {[
            { label: '顯示電話',     val: footerShowTel,       set: setFooterShowTel },
            { label: '顯示 Email',  val: footerShowEmail,     set: setFooterShowEmail },
            { label: '顯示地址',     val: footerShowAddress,   set: setFooterShowAddress },
            { label: '顯示版權文字', val: footerShowCopyright, set: setFooterShowCopyright },
          ].map(({ label, val, set }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #E8E4DC' }}>
              <span style={{ fontSize: '13px', color: '#1E1C1A' }}>{label}</span>
              <Toggle val={val} onChange={() => set(!val)} />
            </div>
          ))}
          {footerShowCopyright && (
            <div style={{ marginTop: '16px' }}>
              <label style={labelStyle}>版權文字</label>
              <input value={footerCopyright} onChange={e => setFooterCopyright(e.target.value)} style={{ ...inputStyle, width: '100%', maxWidth: '360px' }} />
            </div>
          )}
        </div>
      )}

      {/* ════ SEO 設定 ════ */}
      {tab === 'seo' && (
        <div style={{ maxWidth: '580px' }}>
          <div style={sectionTitle}>基本 SEO</div>
          {[
            { label: '網站標題', val: seoTitle, set: setSeoTitle, ph: '未半甜點 | 手工甜點', hint: '建議 50–60 字元' },
            { label: 'Meta 描述', val: seoDescription, set: setSeoDescription, ph: '以純粹視覺為引...', hint: '建議 150–160 字元', textarea: true },
            { label: '關鍵字', val: seoKeywords, set: setSeoKeywords, ph: '手工甜點, 杜拜Q餅, 韓系甜點' },
          ].map(({ label, val, set, ph, hint, textarea }) => (
            <div key={label} style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>{label}</label>
              {textarea ? <textarea value={val} onChange={e => set(e.target.value)} rows={3} placeholder={ph} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
                : <input value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{ ...inputStyle, width: '100%' }} />}
              {hint && <div style={{ fontSize: '11px', color: '#888580', marginTop: '4px' }}>{hint}</div>}
            </div>
          ))}

          <div style={{ ...sectionTitle, marginTop: '28px' }}>Open Graph（社群分享預覽）</div>
          <div style={{ background: '#EDE9E2', border: '1px solid #E8E4DC', padding: '12px 16px', marginBottom: '16px', fontSize: '12px', color: '#555250' }}>
            設定分享到 Facebook、LINE 時顯示的預覽圖和標題。
          </div>
          {[
            { label: 'OG 標題', val: ogTitle, set: setOgTitle, ph: '未半甜點 — 手工甜點職人' },
            { label: 'OG 描述', val: ogDescription, set: setOgDescription, ph: '以純粹視覺為引...', textarea: true },
            { label: 'OG 圖片網址', val: ogImageUrl, set: setOgImageUrl, ph: '建議 1200×630px' },
          ].map(({ label, val, set, ph, textarea }) => (
            <div key={label} style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>{label}</label>
              {textarea ? <textarea value={val} onChange={e => set(e.target.value)} rows={2} placeholder={ph} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
                : <input value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{ ...inputStyle, width: '100%' }} />}
            </div>
          ))}

          <div style={{ ...sectionTitle, marginTop: '28px' }}>追蹤代碼</div>
          <div style={{ background: '#fff8e1', border: '1px solid #f0c040', padding: '12px 16px', marginBottom: '16px', fontSize: '12px', color: '#7a5c00' }}>
            ⚠️ 追蹤代碼將注入到前台頁面，請確認代碼正確後再儲存。
          </div>
          {[
            { label: 'FB Pixel ID', val: fbPixelId, set: setFbPixelId, ph: 'xxxxxxxxxxxxxxxxxx', hint: 'Facebook 廣告轉換追蹤' },
            { label: 'GA4 測量 ID', val: ga4Id, set: setGa4Id, ph: 'G-XXXXXXXXXX', hint: 'Google Analytics 4' },
            { label: 'GTM 容器 ID', val: gtmId, set: setGtmId, ph: 'GTM-XXXXXXX', hint: 'Google Tag Manager（選填）' },
          ].map(({ label, val, set, ph, hint }) => (
            <div key={label} style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>{label}</label>
              <input value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{ ...inputStyle, width: '100%', maxWidth: '280px', fontFamily: '"Montserrat", sans-serif' }} />
              <div style={{ fontSize: '11px', color: '#888580', marginTop: '4px' }}>{hint}</div>
            </div>
          ))}
        </div>
      )}

      {/* 儲存按鈕 */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #E8E4DC' }}>
        <button onClick={handleSave} disabled={saving} style={{ padding: '10px 32px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? '儲存中...' : '儲存設定'}
        </button>
      </div>
    </div>
  );
}
