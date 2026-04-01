// app/shop/promotions/page.tsx  ──  促銷活動商品頁（虛擬分類）

export const revalidate = 0;

import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
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
  // volume / gift 用 promotion_products，bundle 用 promotion_bundle_items
  const { data: promos } = await supabase
    .from('promotions')
    .select('id, type, is_active, start_at, end_at, promotion_products(product_id), promotion_bundle_items(product_id)')
    .eq('is_active', true);

  if (!promos) return [];

  const productIds = new Set<number>();
  for (const p of promos) {
    if (p.start_at && new Date(p.start_at) > new Date(now)) continue;
    if (p.end_at && new Date(p.end_at) < new Date(now)) continue;
    // volume / gift → promotion_products
    ((p as any).promotion_products ?? []).forEach((pp: any) => productIds.add(pp.product_id));
    // bundle → promotion_bundle_items
    ((p as any).promotion_bundle_items ?? []).forEach((bi: any) => productIds.add(bi.product_id));
  }

  if (productIds.size === 0) return [];

  const { data: products } = await supabase
    .from('products')
    .select('id, name, slug, price, image_url, is_sold_out, is_preorder, categories(name)')
    .eq('is_available', true)
    .in('id', Array.from(productIds))
    .order('sort_order');

  const allProducts = products ?? [];
  const preorderIds = allProducts.filter((p: any) => p.is_preorder).map((p: any) => p.id);
  const preorderHasAvail = new Set<number>();
  if (preorderIds.length > 0) {
    const { data: batches } = await supabaseAdmin
      .from('preorder_batches')
      .select('product_id, limit_qty, reserved')
      .in('product_id', preorderIds)
      .eq('is_active', true);
    (batches ?? []).forEach((b: any) => {
      if ((b.limit_qty ?? 0) - (b.reserved ?? 0) > 0) preorderHasAvail.add(b.product_id);
    });
  }

  return allProducts.map((p: any) => {
    const isPreorder = p.is_preorder ?? false;
    let preorderStatus: 'active' | 'no_batch' | undefined;
    if (isPreorder) {
      preorderStatus = preorderHasAvail.has(p.id) ? 'active' : 'no_batch';
    }
    return {
      id:         String(p.id),
      name:       p.name,
      slug:       p.slug,
      price:      p.price,
      imageUrl:   p.image_url ?? undefined,
      category:   p.categories?.name ?? '',
      isSoldOut:  p.is_sold_out  ?? false,
      isPreorder,
      preorderStatus,
    };
  });
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
