// app/page.tsx  ──  首頁（responsive）

export const revalidate = 0;

import { supabase } from '@/lib/supabase';
import HeroCarousel from '@/components/HeroCarousel';
import ProductCard, { Product } from '@/components/ProductCard';
import Footer from '@/components/Footer';
import HomeHero from '@/components/HomeHero';
import s from './page.module.css';

async function getFeaturedProducts(): Promise<Product[]> {
  const { data } = await supabase
    .from('products')
    .select('id, name, slug, price, image_url, is_sold_out, is_preorder, categories(name)')
    .eq('is_featured', true)
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
      {/* Hero */}
      <div className={s.hero}>
        <div className={s.heroText}>
          <span className={s.heroSub}>{heroSub}</span>
          <h1 className={s.heroTitle}>
            {heroTitle.length > 2 ? (
              <>
                <span className={s.heroTitleLine}>{heroTitle.slice(0, Math.ceil(heroTitle.length / 2))}</span>
                <span className={s.heroTitleLine}>{heroTitle.slice(Math.ceil(heroTitle.length / 2))}</span>
              </>
            ) : heroTitle}
          </h1>
          <p className={s.heroDesc}>{heroDesc}</p>
          <HomeHero btnText={heroBtn} />
        </div>

        <div className={s.heroVisual}>
          {heroSlides.length > 0 ? (
            <HeroCarousel slides={heroSlides} />
          ) : (
            <div className={s.heroPlaceholder}>上傳商品圖片後將顯示於此</div>
          )}
        </div>
      </div>

      {/* 熱銷商品 */}
      <div className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>熱銷商品</h2>
          <p className={s.sectionDesc}>每週最受歡迎的手工甜點，限量供應。</p>
        </div>

        {hotProducts.length > 0 ? (
          <div className={s.productGrid}>
            {hotProducts.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        ) : (
          <p className={s.emptyMsg}>尚未設定熱銷商品</p>
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
