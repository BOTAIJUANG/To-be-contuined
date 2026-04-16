'use client';

// ════════════════════════════════════════════════
// app/admin/store-settings/page.tsx  ──  商店設定（完整版）
// ════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import s from '../_shared/admin-shared.module.css';
import p from './store-settings.module.css';
import AdminDatePicker from '../_shared/AdminDatePicker';

const DAYS_TW = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const DAYS_EN = ['0', '1', '2', '3', '4', '5', '6'];

const Toggle = ({ val, onChange }: { val: boolean; onChange: () => void }) => (
  <div onClick={onChange} className={s.toggle} style={{ background: val ? '#1E1C1A' : '#E8E4DC' }}>
    <div className={s.toggleDot} style={{ left: val ? '21px' : '3px' }} />
  </div>
);

export default function AdminStoreSettingsPage() {
  const [tab,     setTab]     = useState<'info'|'shipping'|'payment'|'appearance'|'seo'>('info');
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Logo
  const [logoUrl, setLogoUrl] = useState('');

  // 商店資訊
  const [name, setName] = useState('未半甜點');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [lineId, setLineId] = useState('');
  // 配送設定
  const [feeHome, setFeeHome] = useState(100);
  const [feeHomeOuterIsland, setFeeHomeOuterIsland] = useState(250);
  const [feeCvs711, setFeeCvs711] = useState(60);
  const [feeStore, setFeeStore] = useState(0);
  // 各配送方式開關
  const [shipHomeAmbient,      setShipHomeAmbient]      = useState(true);
  const [shipHomeRefrigerated, setShipHomeRefrigerated] = useState(true);
  const [shipHomeFrozen,       setShipHomeFrozen]       = useState(true);
  const [shipCvsAmbient,       setShipCvsAmbient]       = useState(true);
  const [shipCvsFrozen,        setShipCvsFrozen]        = useState(true);
  const [shipStore,            setShipStore]            = useState(true);
  const [freeShipMainland, setFreeShipMainland] = useState(0);
  const [freeShipOuterIsland, setFreeShipOuterIsland] = useState(0);
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
        setLogoUrl(data.logo_url ?? '');
        setName(data.name ?? '未半甜點');
        setDescription(data.description ?? '');
        setEmail(data.email ?? '');
        setPhone(data.phone ?? '');
        setAddress(data.address ?? '');
        setInstagram(data.instagram_url ?? '');
        setFacebook(data.facebook_url ?? '');
        setLineId(data.line_id ?? '');
        setFeeHome(data.fee_home ?? 100);
        setFeeHomeOuterIsland(data.fee_home_outer_island ?? 250);
        setFeeCvs711(data.fee_cvs_711 ?? 60);
        setFeeStore(data.fee_store ?? 0);
        setShipHomeAmbient(data.ship_home_ambient ?? true);
        setShipHomeRefrigerated(data.ship_home_refrigerated ?? true);
        setShipHomeFrozen(data.ship_home_frozen ?? true);
        setShipCvsAmbient(data.ship_cvs_ambient ?? true);
        setShipCvsFrozen(data.ship_cvs_frozen ?? true);
        setShipStore(data.ship_store ?? true);
        setFreeShipMainland(data.free_ship_mainland_amount ?? 0);
        setFreeShipOuterIsland(data.free_ship_outer_island_amount ?? 0);
        setShipMinDays(data.ship_min_days ?? 1);
        setShipMaxDays(data.ship_max_days ?? 14);
        setSidebarProductLimit(data.sidebar_product_limit ?? 3);
        setBlockedWeekdays(JSON.parse(data.ship_blocked_weekdays ?? '["0","6"]'));
        setBlockedDates(JSON.parse(data.ship_blocked_dates ?? '[]'));
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

  // 上傳 Logo
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const ext = file.name.split('.').pop();
    const fileName = `store/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('images').upload(fileName, file, { cacheControl: '3600', upsert: true, contentType: file.type });
    if (error) { alert('上傳失敗：' + error.message); setUploadingLogo(false); return; }
    const { data: urlData } = supabase.storage.from('images').getPublicUrl(fileName);
    setLogoUrl(urlData.publicUrl);
    setUploadingLogo(false);
  };

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
      id: 1, logo_url: logoUrl, name, description, email, phone, address,
      instagram_url: instagram, facebook_url: facebook, line_id: lineId,
      fee_home: feeHome, fee_home_outer_island: feeHomeOuterIsland,
      fee_cvs_711: feeCvs711, fee_store: feeStore,
      ship_home_ambient: shipHomeAmbient, ship_home_refrigerated: shipHomeRefrigerated,
      ship_home_frozen: shipHomeFrozen, ship_cvs_ambient: shipCvsAmbient,
      ship_cvs_frozen: shipCvsFrozen, ship_store: shipStore,
      free_ship_mainland_amount: freeShipMainland, free_ship_outer_island_amount: freeShipOuterIsland,
      ship_min_days: shipMinDays, ship_max_days: shipMaxDays,
      sidebar_product_limit: sidebarProductLimit,
      ship_blocked_weekdays: JSON.stringify(blockedWeekdays),
      ship_blocked_dates: JSON.stringify(blockedDates),
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

  const toggleWeekday = (d: string) => setBlockedWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  const addBlockedDate = () => { if (!newBlockedDate || blockedDates.includes(newBlockedDate)) return; setBlockedDates(prev => [...prev, newBlockedDate].sort()); setNewBlockedDate(''); };

  const ColorRow = ({ label, val, set }: { label: string; val: string; set: (v: string) => void }) => (
    <div className={p.colorRow}>
      <label className={p.colorLabel}>{label}</label>
      <input type="color" value={val} onChange={e => set(e.target.value)} className={p.colorPicker} />
      <input value={val} onChange={e => set(e.target.value)} className={`${s.input} ${p.colorHexInput}`} />
      <button onClick={() => {}} className={p.colorDefaultBtn}>預設</button>
    </div>
  );

  if (loading) return <p className={s.loadingText}>載入中...</p>;

  return (
    <div>
      <h1 className={`${s.pageTitle} ${p.pageTitleMb}`}>商店設定</h1>

      <div className={`${s.tabBar} ${p.tabBarMb32}`}>
        {[{ key: 'info', label: '商店資訊' }, { key: 'shipping', label: '配送設定' }, { key: 'payment', label: '付款設定' }, { key: 'appearance', label: '前台外觀' }, { key: 'seo', label: 'SEO 設定' }].map(({ key, label }) => (
          <div key={key} className={tab === key ? s.tabActive : s.tab} onClick={() => setTab(key as any)}>{label}</div>
        ))}
      </div>

      {/* ════ 商店資訊 ════ */}
      {tab === 'info' && (
        <div className={p.formContainer}>
          <div className={s.sectionTitleBordered}>基本資訊</div>
          {[
            { label: '商店名稱', val: name, set: setName, ph: '未半甜點', max: '320px' },
            { label: '商店描述', val: description, set: setDescription, ph: '以純粹視覺為引...', max: '480px', textarea: true },
            { label: '聯絡 Email', val: email, set: setEmail, ph: 'hello@weiban.tw', max: '320px' },
            { label: '商店電話', val: phone, set: setPhone, ph: '039-381-241', max: '220px' },
            { label: '實體地址', val: address, set: setAddress, ph: '260 台灣宜蘭縣...', max: '480px' },
          ].map(({ label, val, set, ph, max, textarea }) => (
            <div key={label} className={s.mb20}>
              <label className={s.label}>{label}</label>
              {textarea ? <textarea value={val} onChange={e => set(e.target.value)} rows={3} placeholder={ph} className={s.textarea} style={{ maxWidth: max }} />
                : <input value={val} onChange={e => set(e.target.value)} placeholder={ph} className={s.input} style={{ maxWidth: max }} />}
            </div>
          ))}

          <div className={`${s.sectionTitleBordered} ${p.sectionTitleMt28}`}>社群連結</div>
          {[
            { label: 'Instagram', val: instagram, set: setInstagram, ph: 'https://instagram.com/...' },
            { label: 'Facebook', val: facebook, set: setFacebook, ph: 'https://facebook.com/...' },
            { label: 'LINE 官方帳號', val: lineId, set: setLineId, ph: '@weiban' },
          ].map(({ label, val, set, ph }) => (
            <div key={label} className={s.mb16}>
              <label className={s.label}>{label}</label>
              <input value={val} onChange={e => set(e.target.value)} placeholder={ph} className={`${s.input} ${p.inputFullMax400}`} />
            </div>
          ))}
        </div>
      )}

      {/* ════ 配送設定 ════ */}
      {tab === 'shipping' && (
        <div className={p.formContainerMid}>
          <div className={s.sectionTitleBordered}>開放配送方式</div>
          <div className={`${s.flex} ${s.flexWrap} ${s.gap24}`} style={{ marginBottom: 24 }}>
            {[
              { label: '宅配（常溫）',       val: shipHomeAmbient,      set: setShipHomeAmbient },
              { label: '宅配（冷藏）',       val: shipHomeRefrigerated, set: setShipHomeRefrigerated },
              { label: '宅配（冷凍）',       val: shipHomeFrozen,       set: setShipHomeFrozen },
              { label: '7-11 取貨（常溫）',  val: shipCvsAmbient,       set: setShipCvsAmbient },
              { label: '7-11 取貨（冷凍）',  val: shipCvsFrozen,        set: setShipCvsFrozen },
              { label: '門市自取',           val: shipStore,            set: setShipStore },
            ].map(({ label, val, set }) => (
              <label key={label} className={s.checkLabel}>
                <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className={s.checkbox} /> {label}
              </label>
            ))}
          </div>

          <div className={s.sectionTitleBordered}>運費設定</div>
          {[
            { label: '宅配運費（本島）', val: feeHome, set: setFeeHome },
            { label: '宅配運費（離島）', val: feeHomeOuterIsland, set: setFeeHomeOuterIsland },
            { label: '超商取貨運費', val: feeCvs711, set: setFeeCvs711 },
            { label: '門市自取運費', val: feeStore, set: setFeeStore },
          ].map(({ label, val, set }) => (
            <div key={label} className={p.feeRow}>
              <label className={p.feeLabel}>{label}</label>
              <input type="number" value={val} onChange={e => set(Number(e.target.value))} className={`${s.input} ${p.feeInput}`} />
              <span className={p.feeUnit}>NT$</span>
            </div>
          ))}

          <div className={`${s.sectionTitleBordered} ${p.sectionTitleMt28}`}>免運設定</div>
          <div className={p.feeRow}>
            <label className={p.feeLabel}>本島滿額免運</label>
            <input type="number" value={freeShipMainland} onChange={e => setFreeShipMainland(Number(e.target.value))} className={`${s.input} ${p.feeInput}`} />
            <span className={p.feeUnit}>NT$ 以上免運（0 = 不啟用）</span>
          </div>
          <div className={p.feeRow}>
            <label className={p.feeLabel}>離島滿額免運</label>
            <input type="number" value={freeShipOuterIsland} onChange={e => setFreeShipOuterIsland(Number(e.target.value))} className={`${s.input} ${p.feeInput}`} />
            <span className={p.feeUnit}>NT$ 以上免運（0 = 不啟用）</span>
          </div>

          <div className={`${s.sectionTitleBordered} ${p.sectionTitleMt28}`}>前台側邊欄設定</div>
          <div className={p.feeRowMb24}>
            <label className={p.feeLabelWide}>每個分類顯示商品數</label>
            <input type="number" min={1} max={10} value={sidebarProductLimit} onChange={e => setSidebarProductLimit(Number(e.target.value))} className={p.inputNarrow70} />
            <span className={p.feeUnit}>個（超過的折疊至「查看全部」）</span>
          </div>

          <div className={`${s.sectionTitleBordered} ${p.sectionTitleMt28}`}>出貨日期限制</div>
          {[
            { label: '最早出貨天數', val: shipMinDays, set: setShipMinDays, hint: '天後（下單後至少幾天才能出貨）' },
            { label: '最晚可選天數', val: shipMaxDays, set: setShipMaxDays, hint: '天內（顧客最遠可選幾天後）' },
          ].map(({ label, val, set, hint }) => (
            <div key={label} className={p.feeRow}>
              <label className={p.feeLabel}>{label}</label>
              <input type="number" value={val} onChange={e => set(Number(e.target.value))} className={p.inputNarrow70} />
              <span className={p.feeUnit}>{hint}</span>
            </div>
          ))}

          <div className={s.mb16}>
            <label className={s.label}>不出貨的星期</label>
            <div className={p.weekdayGroup}>
              {DAYS_TW.map((d, i) => (
                <label key={d} className={p.weekdayLabel}>
                  <input type="checkbox" checked={blockedWeekdays.includes(DAYS_EN[i])} onChange={() => toggleWeekday(DAYS_EN[i])} className={s.checkbox} />{d}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className={s.label}>特定封鎖日期</label>
            <div className={p.blockedDateRow}>
              <AdminDatePicker value={newBlockedDate} onChange={val => setNewBlockedDate(val)} className={p.blockedDateInputNarrow} />
              <button onClick={addBlockedDate} className={s.btnSmall}>＋ 新增</button>
            </div>
            <div className={p.blockedDateWrap}>
              {blockedDates.map(d => (
                <span key={d} className={p.blockedDateTag}>
                  {d} <span onClick={() => setBlockedDates(prev => prev.filter(x => x !== d))} className={p.blockedDateRemove}>×</span>
                </span>
              ))}
              {blockedDates.length === 0 && <span className={p.emptyHint}>尚無封鎖日期</span>}
            </div>
          </div>
        </div>
      )}

      {/* ════ 付款設定 ════ */}
      {tab === 'payment' && (
        <div className={p.paymentContainer}>
          <div className={`${s.warningBar} ${p.warningBarMb24}`}>
            金流串接（綠界 ECPay）需設定以下金鑰，請向綠界申請商家帳號後填入。
          </div>
          <div className={s.sectionTitleBordered}>付款方式</div>
          {[{ label: '信用卡（Visa / Master / JCB）' }, { label: 'ATM 轉帳' }].map(({ label }) => (
            <div key={label} className={p.toggleRow}>
              <span className={p.toggleRowLabel}>{label}</span>
              <Toggle val={true} onChange={() => {}} />
            </div>
          ))}
          <div className={`${s.sectionTitleBordered} ${p.sectionTitleMt28}`}>綠界 ECPay 金鑰</div>
          {[
            { label: '商店代號（MerchantID）', ph: '例：3002607' },
            { label: 'HashKey', ph: '請填入綠界 HashKey', type: 'password' },
            { label: 'HashIV', ph: '請填入綠界 HashIV', type: 'password' },
          ].map(({ label, ph, type }) => (
            <div key={label} className={s.mb16}>
              <label className={s.label}>{label}</label>
              <input type={type ?? 'text'} placeholder={ph} className={`${s.input} ${p.paymentInputMax320}`} />
            </div>
          ))}
          <div className={p.seoHintMt8}>金鑰請存放在 .env.local，不要直接輸入在此，避免外洩。</div>
        </div>
      )}

      {/* ════ 前台外觀 ════ */}
      {tab === 'appearance' && (
        <div className={p.formContainer}>
          <div className={s.sectionTitleBordered}>品牌 Logo</div>
          <div className={p.aboutImgMb28}>
            <label className={s.label}>Logo 圖片</label>
            <div className={p.aboutImgWrap}>
              {logoUrl && <img src={logoUrl} alt="Logo" className={p.aboutImgPreview} style={{ maxHeight: 64, objectFit: 'contain', background: '#f5f5f5' }} />}
              <div className={p.aboutImgUploadFlex}>
                <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="貼上圖片網址，或點下方按鈕上傳" className={`${s.input} ${p.aboutImgInputFull}`} />
                <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className={`${s.btnSmall} ${p.aboutImgBtnMt8}`}>
                  {uploadingLogo ? '上傳中...' : '從電腦上傳'}
                </button>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className={p.hidden} />
              </div>
              {logoUrl && (
                <button onClick={() => setLogoUrl('')} className={`${s.btnSmall}`} style={{ marginTop: 8, color: '#c0392b' }}>移除 Logo</button>
              )}
            </div>
            <div className={p.seoHint}>建議上傳透明背景 PNG，高度 40–60px。未上傳時顯示商店名稱文字。</div>
          </div>

          <div className={s.sectionTitleBordered}>品牌文字</div>
          {[
            { label: 'Hero 主標題', val: heroTitle, set: setHeroTitle, ph: '未半甜點', max: '320px' },
            { label: 'Hero 副標題', val: heroSub, set: setHeroSub, ph: '手工甜點 · 2024', max: '400px' },
            { label: 'Hero 說明文字', val: heroDesc, set: setHeroDesc, ph: '以純粹視覺為引...', max: '480px', textarea: true },
            { label: 'Hero 按鈕文字', val: heroBtn, set: setHeroBtn, ph: '立即選購', max: '200px' },
          ].map(({ label, val, set, ph, max, textarea }) => (
            <div key={label} className={s.mb20}>
              <label className={s.label}>{label}</label>
              {textarea ? <textarea value={val} onChange={e => set(e.target.value)} rows={2} placeholder={ph} className={s.textarea} style={{ maxWidth: max }} />
                : <input value={val} onChange={e => set(e.target.value)} placeholder={ph} className={s.input} style={{ maxWidth: max }} />}
            </div>
          ))}

          <div className={`${s.sectionTitleBordered} ${p.sectionTitleMt28}`}>品牌故事頁</div>
          <div className={s.mb20}>
            <label className={s.label}>品牌故事標題</label>
            <input value={aboutTitle} onChange={e => setAboutTitle(e.target.value)} className={`${s.input} ${p.inputFullMax320}`} />
          </div>
          <div className={s.mb20}>
            <label className={s.label}>品牌故事內文</label>
            <textarea value={aboutBody} onChange={e => setAboutBody(e.target.value)} rows={5} className={s.textarea} />
          </div>
          <div className={p.aboutImgMb28}>
            <label className={s.label}>品牌故事圖片</label>
            <div className={p.aboutImgWrap}>
              {aboutImageUrl && <img src={aboutImageUrl} alt="品牌故事" className={p.aboutImgPreview} />}
              <div className={p.aboutImgUploadFlex}>
                <input value={aboutImageUrl} onChange={e => setAboutImageUrl(e.target.value)} placeholder="貼上圖片網址，或點下方按鈕上傳" className={`${s.input} ${p.aboutImgInputFull}`} />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className={`${s.btnSmall} ${p.aboutImgBtnMt8}`}>
                  {uploading ? '上傳中...' : '從電腦上傳'}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAboutImageUpload} className={p.hidden} />
              </div>
            </div>
          </div>

          <div className={s.sectionTitleBordered}>色彩主題</div>
          <ColorRow label="背景色"       val={colorBg}      set={setColorBg} />
          <ColorRow label="表面色"       val={colorSurface} set={setColorSurface} />
          <ColorRow label="深色文字"     val={colorDark}    set={setColorDark} />
          <ColorRow label="強調色（價格）" val={colorPrice}  set={setColorPrice} />
          <ColorRow label="按鈕色"       val={colorBtn}     set={setColorBtn} />

          {/* 即時預覽 */}
          <div className={p.previewWrap} style={{ background: colorSurface }}>
            <div className={p.previewLabel}>即時預覽</div>
            <div className={p.previewRow}>
              {[
                { color: colorBg,      label: '背景' },
                { color: colorSurface, label: '表面' },
                { color: colorDark,    label: '文字', light: true },
                { color: colorPrice,   label: '價格', light: true },
              ].map(({ color, label, light }) => (
                <div key={label} className={p.previewSwatch} style={{ background: color, color: light ? '#fff' : '#888' }}>{label}</div>
              ))}
              <button className={p.previewButton} style={{ background: colorBtn }}>按鈕</button>
            </div>
          </div>

          <div className={s.sectionTitleBordered}>字體設定</div>
          <div className={s.mb16}>
            <label className={s.label}>標題字體</label>
            <select value={fontTitle} onChange={e => setFontTitle(e.target.value)} className={`${s.select} ${p.selectMax320}`}>
              <option value="'Noto Serif TC', serif">Noto Serif TC（宋體，目前使用）</option>
              <option value="'Noto Sans TC', sans-serif">Noto Sans TC（黑體）</option>
              <option value="Georgia, serif">Georgia（英文襯線）</option>
            </select>
          </div>
          <div className={s.mb20}>
            <label className={s.label}>內文字體</label>
            <select value={fontBody} onChange={e => setFontBody(e.target.value)} className={`${s.select} ${p.selectMax320}`}>
              <option value="'Noto Sans TC', sans-serif">Noto Sans TC（目前使用）</option>
              <option value="'Noto Serif TC', serif">Noto Serif TC（宋體）</option>
            </select>
          </div>

          {/* 字體預覽 */}
          <div className={p.fontPreviewBox}>
            <div className={p.fontPreviewTitle} style={{ fontFamily: fontTitle, color: colorDark }}>未半甜點 — 品牌故事</div>
            <div className={p.fontPreviewBody} style={{ fontFamily: fontBody }}>以純粹視覺為引，將甜點的細膩質地融入潔白空間。</div>
          </div>

          <div className={s.sectionTitleBordered}>頁尾版面</div>
          {[
            { label: '顯示電話',     val: footerShowTel,       set: setFooterShowTel },
            { label: '顯示 Email',  val: footerShowEmail,     set: setFooterShowEmail },
            { label: '顯示地址',     val: footerShowAddress,   set: setFooterShowAddress },
            { label: '顯示版權文字', val: footerShowCopyright, set: setFooterShowCopyright },
          ].map(({ label, val, set }) => (
            <div key={label} className={p.toggleRowCompact}>
              <span className={p.toggleRowLabel}>{label}</span>
              <Toggle val={val} onChange={() => set(!val)} />
            </div>
          ))}
          {footerShowCopyright && (
            <div className={p.copyrightWrap}>
              <label className={s.label}>版權文字</label>
              <input value={footerCopyright} onChange={e => setFooterCopyright(e.target.value)} className={`${s.input} ${p.copyrightInput}`} />
            </div>
          )}
        </div>
      )}

      {/* ════ SEO 設定 ════ */}
      {tab === 'seo' && (
        <div className={p.formContainerNarrow}>
          <div className={s.sectionTitleBordered}>基本 SEO</div>
          {[
            { label: '網站標題', val: seoTitle, set: setSeoTitle, ph: '未半甜點 | 手工甜點', hint: '建議 50–60 字元' },
            { label: 'Meta 描述', val: seoDescription, set: setSeoDescription, ph: '以純粹視覺為引...', hint: '建議 150–160 字元', textarea: true },
            { label: '關鍵字', val: seoKeywords, set: setSeoKeywords, ph: '手工甜點, 杜拜Q餅, 韓系甜點' },
          ].map(({ label, val, set, ph, hint, textarea }) => (
            <div key={label} className={s.mb20}>
              <label className={s.label}>{label}</label>
              {textarea ? <textarea value={val} onChange={e => set(e.target.value)} rows={3} placeholder={ph} className={s.textarea} />
                : <input value={val} onChange={e => set(e.target.value)} placeholder={ph} className={`${s.input} ${p.seoInputFull}`} />}
              {hint && <div className={p.seoHint}>{hint}</div>}
            </div>
          ))}

          <div className={`${s.sectionTitleBordered} ${p.sectionTitleMt28}`}>Open Graph（社群分享預覽）</div>
          <div className={`${s.infoBar} ${p.infoBarMb16}`}>
            設定分享到 Facebook、LINE 時顯示的預覽圖和標題。
          </div>
          {[
            { label: 'OG 標題', val: ogTitle, set: setOgTitle, ph: '未半甜點 — 手工甜點職人' },
            { label: 'OG 描述', val: ogDescription, set: setOgDescription, ph: '以純粹視覺為引...', textarea: true },
            { label: 'OG 圖片網址', val: ogImageUrl, set: setOgImageUrl, ph: '建議 1200×630px' },
          ].map(({ label, val, set, ph, textarea }) => (
            <div key={label} className={s.mb20}>
              <label className={s.label}>{label}</label>
              {textarea ? <textarea value={val} onChange={e => set(e.target.value)} rows={2} placeholder={ph} className={s.textarea} />
                : <input value={val} onChange={e => set(e.target.value)} placeholder={ph} className={`${s.input} ${p.seoInputFull}`} />}
            </div>
          ))}

          <div className={`${s.sectionTitleBordered} ${p.sectionTitleMt28}`}>追蹤代碼</div>
          <div className={`${s.warningBar} ${p.warningBarMb16}`}>
            追蹤代碼將注入到前台頁面，請確認代碼正確後再儲存。
          </div>
          {[
            { label: 'FB Pixel ID', val: fbPixelId, set: setFbPixelId, ph: 'xxxxxxxxxxxxxxxxxx', hint: 'Facebook 廣告轉換追蹤' },
            { label: 'GA4 測量 ID', val: ga4Id, set: setGa4Id, ph: 'G-XXXXXXXXXX', hint: 'Google Analytics 4' },
            { label: 'GTM 容器 ID', val: gtmId, set: setGtmId, ph: 'GTM-XXXXXXX', hint: 'Google Tag Manager（選填）' },
          ].map(({ label, val, set, ph, hint }) => (
            <div key={label} className={s.mb20}>
              <label className={s.label}>{label}</label>
              <input value={val} onChange={e => set(e.target.value)} placeholder={ph} className={`${s.input} ${p.trackingInput}`} />
              <div className={p.seoHint}>{hint}</div>
            </div>
          ))}
        </div>
      )}

      {/* 儲存按鈕 */}
      <div className={p.saveBar}>
        <button onClick={handleSave} disabled={saving} className={s.btnSave}>
          {saving ? '儲存中...' : '儲存設定'}
        </button>
      </div>
    </div>
  );
}
