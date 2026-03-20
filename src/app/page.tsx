// ════════════════════════════════════════════════
// app/page.tsx  ──  首頁（串接 store_settings）
//
// Hero 文字從 store_settings 讀取
// 商品從 Supabase products 讀取
// ════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import HeroCarousel from '@/components/HeroCarousel';
import ProductCard, { Product } from '@/components/ProductCard';
import Footer from '@/components/Footer';
import HomeHero from '@/components/HomeHero';

// 從資料庫取得熱銷商品
async function getFeaturedProducts(): Promise<Product[]> {
  const { data } = await supabase
    .from('products')
    .select('id, name, slug, price, image_url, is_sold_out, is_preorder, categories(name)')
    .eq('is_featured',  true)
    .eq('is_available', true)
    .order('sort_order');

  return (data ?? []).map((p: any) => ({
    id:         String(p.id),
    name:       p.name,
    slug:       p.slug,
    price:      p.price,
    imageUrl:   p.image_url ?? undefined,
    category:   p.categories?.name ?? '',
    isSoldOut:  p.is_sold_out  ?? false,
    isPreorder: p.is_preorder  ?? false,
  }));
}

// 從資料庫取得商店設定
async function getStoreSettings() {
  const { data } = await supabase
    .from('store_settings')
    .select('name, phone, email, address, hero_title, hero_sub, hero_desc, hero_btn')
    .eq('id', 1)
    .single();
  return data;
}

export default async function HomePage() {
  const [hotProducts, storeSettings] = await Promise.all([
    getFeaturedProducts(),
    getStoreSettings(),
  ]);

  const heroSlides = hotProducts
    .filter(p => p.imageUrl)
    .slice(0, 5)
    .map(p => ({ src: p.imageUrl!, alt: p.name, caption: p.name }));

  const heroSub   = storeSettings?.hero_sub  ?? '手工甜點 · 2024';
  const heroTitle = storeSettings?.hero_title ?? '未半甜點';
  const heroDesc  = storeSettings?.hero_desc  ?? '以純粹視覺為引，將甜點的細膩質地融入潔白空間。';
  const heroBtn   = storeSettings?.hero_btn   ?? '立即選購';

  return (
    <>
      {/* ════ HERO ════ */}
      <div style={{
        width: 'min(calc(100% - 60px), 1100px)',
        margin: 'auto',
        display: 'grid',
        gridTemplateColumns: '0.72fr 1.28fr',
        gap: '52px',
        alignItems: 'start',
        minHeight: '88vh',
        padding: '40px 0 72px',
      }}>
        {/* 左側文案 */}
        <div style={{ maxWidth: '340px', paddingTop: '80px' }}>
          <span style={{ display: 'block', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 500, letterSpacing: '0.5em', color: '#888580', textTransform: 'uppercase', marginBottom: '14px' }}>
            {heroSub}
          </span>

          <h1 style={{ fontFamily: '"Noto Serif TC", serif', fontWeight: 200, fontSize: '44px', lineHeight: 1.2, letterSpacing: '0.15em', color: '#1E1C1A', margin: '0 0 32px' }}>
            {/* 把 hero_title 拆成兩行顯示（取前半和後半）*/}
            {heroTitle.length > 2 ? (
              <>
                <span style={{ display: 'block', transform: 'translateX(-12px)' }}>{heroTitle.slice(0, Math.ceil(heroTitle.length / 2))}</span>
                <span style={{ display: 'block', transform: 'translateX(48px)' }}>{heroTitle.slice(Math.ceil(heroTitle.length / 2))}</span>
              </>
            ) : heroTitle}
          </h1>

          <p style={{ fontSize: '13px', lineHeight: 2.4, fontWeight: 300, color: '#555250', marginBottom: '44px' }}>
            {heroDesc}
          </p>

          {/* 立即選購按鈕（Client Component 因為需要 router）*/}
          <HomeHero btnText={heroBtn} />
        </div>

        {/* 右側輪播 */}
        <div style={{ paddingTop: '32px' }}>
          {heroSlides.length > 0 ? (
            <HeroCarousel slides={heroSlides} />
          ) : (
            <div style={{ width: '85%', height: '480px', marginLeft: 'auto', background: '#EDE9E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: '#888580', letterSpacing: '0.15em' }}>
              上傳商品圖片後將顯示於此
            </div>
          )}
        </div>
      </div>

      {/* ════ 熱銷商品 ════ */}
      <div style={{ width: 'min(calc(100% - 60px), 1100px)', margin: 'auto', padding: '16px 0 72px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '30px', marginBottom: '52px' }}>
          <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.28em', color: '#1E1C1A', margin: 0 }}>
            熱銷商品
          </h2>
          <p style={{ fontSize: '13px', lineHeight: 2.4, fontWeight: 300, color: '#555250', maxWidth: '460px', margin: 0 }}>
            每週最受歡迎的手工甜點，限量供應。
          </p>
        </div>

        {hotProducts.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px 24px' }}>
            {hotProducts.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        ) : (
          <p style={{ color: '#888580', fontSize: '13px', textAlign: 'center', padding: '52px 0' }}>尚未設定熱銷商品</p>
        )}
      </div>

      <Footer
        tel={storeSettings?.phone}
        email={storeSettings?.email}
        address={storeSettings?.address}
      />
    </>
  );
}
