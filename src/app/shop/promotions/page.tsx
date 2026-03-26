// app/shop/promotions/page.tsx  ──  促銷活動商品頁（虛擬分類）

export const revalidate = 0;

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import ShopSidebar from '@/components/ShopSidebar';
import ProductCard, { Product } from '@/components/ProductCard';
import Footer from '@/components/Footer';
import s from '../shop.module.css';

async function getStoreSettings() {
  const { data } = await supabase.from('store_settings').select('phone, email, address').eq('id', 1).single();
  return data;
}

async function getCategories() {
  const { data } = await supabase.from('categories').select('id, name, slug').order('sort_order');
  return data ?? [];
}

async function getPromotionProducts(): Promise<Product[]> {
  const now = new Date().toISOString();

  // 取得所有啟用中的活動及其關聯商品
  const { data: promos } = await supabase
    .from('promotions')
    .select('id, is_active, start_at, end_at, promotion_products(product_id)')
    .eq('is_active', true);

  if (!promos) return [];

  const productIds = new Set<number>();
  for (const p of promos) {
    if (p.start_at && new Date(p.start_at) > new Date(now)) continue;
    if (p.end_at && new Date(p.end_at) < new Date(now)) continue;
    ((p as any).promotion_products ?? []).forEach((pp: any) => productIds.add(pp.product_id));
  }

  if (productIds.size === 0) return [];

  const { data: products } = await supabase
    .from('products')
    .select('id, name, slug, price, image_url, is_sold_out, is_preorder, categories(name)')
    .eq('is_available', true)
    .in('id', Array.from(productIds))
    .order('sort_order');

  return (products ?? []).map((p: any) => ({
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

export default async function PromotionsPage() {
  const [products, categories, storeSettings] = await Promise.all([
    getPromotionProducts(),
    getCategories(),
    getStoreSettings(),
  ]);

  return (
    <>
      <div className={s.layout}>
        <ShopSidebar categories={categories} activeSlug="promotions" />
        <div className={s.main}>
          <Link href="/shop" className={s.backLink}>← SHOP ALL</Link>
          <div className={s.head}>
            <h2 className={s.title}>促銷活動</h2>
            <p className={s.subtitle}>共 {products.length} 件促銷商品</p>
          </div>
          {products.length > 0 ? (
            <div className={s.grid}>
              {products.map(product => <ProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <p className={s.empty}>目前沒有進行中的促銷活動。</p>
          )}
        </div>
      </div>
      <Footer tel={storeSettings?.phone} email={storeSettings?.email} address={storeSettings?.address} />
    </>
  );
}
