// app/shop/[slug]/page.tsx  ──  分類頁（responsive）

export const revalidate = 0;

import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
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

async function getCategoryWithProducts(slug: string) {
  const { data: category } = await supabase.from('categories').select('id, name, slug').eq('slug', slug).single();
  if (!category) return null;

  const { data: products } = await supabase
    .from('products')
    .select('id, name, slug, price, image_url, is_sold_out, is_preorder, categories(name)')
    .eq('category_id', category.id)
    .eq('is_available', true)
    .order('sort_order');

  return { category, products: products ?? [] };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [result, categories, storeSettings] = await Promise.all([
    getCategoryWithProducts(slug),
    getCategories(),
    getStoreSettings(),
  ]);

  if (!result) notFound();
  const { category, products } = result;

  // 查詢即時庫存，判斷真實售完狀態
  const soldOutSet = new Set<number>();
  const productIds = products.map((p: any) => p.id);
  if (productIds.length > 0) {
    const { data: invData } = await supabaseAdmin
      .from('inventory')
      .select('product_id, stock, reserved, inventory_mode, max_preorder, reserved_preorder')
      .in('product_id', productIds);

    const availableByProduct: Record<number, number> = {};
    (invData ?? []).forEach((inv: any) => {
      const avail = inv.inventory_mode === 'stock'
        ? (inv.stock ?? 0) - (inv.reserved ?? 0)
        : (inv.max_preorder ?? 0) - (inv.reserved_preorder ?? 0);
      availableByProduct[inv.product_id] = (availableByProduct[inv.product_id] ?? 0) + Math.max(0, avail);
    });

    // 預購商品不走庫存判斷（由詳情頁的批次邏輯決定能不能買）
    const preorderIds = new Set(products.filter((p: any) => p.is_preorder).map((p: any) => p.id));
    for (const pid of productIds) {
      if (!preorderIds.has(pid) && (availableByProduct[pid] ?? 0) <= 0) soldOutSet.add(pid);
    }
  }

  const productList: Product[] = products.map((p: any) => ({
    id:         String(p.id),
    name:       p.name,
    slug:       p.slug,
    price:      p.price,
    imageUrl:   p.image_url ?? undefined,
    category:   p.categories?.name ?? '',
    isSoldOut:  p.is_sold_out || soldOutSet.has(p.id),
    isPreorder: p.is_preorder  ?? false,
  }));

  return (
    <>
      <div className={s.layout}>
        <ShopSidebar categories={categories} activeSlug={slug} />
        <div className={s.main}>
          <Link href="/shop" className={s.backLink}>← SHOP ALL</Link>
          <div className={s.head}>
            <h2 className={s.title}>{category.name}</h2>
            <p className={s.subtitle}>共 {productList.length} 件商品</p>
          </div>
          {productList.length > 0 ? (
            <div className={s.grid}>
              {productList.map(product => <ProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <p className={s.empty}>此分類目前沒有商品。</p>
          )}
        </div>
      </div>
      <Footer tel={storeSettings?.phone} email={storeSettings?.email} address={storeSettings?.address} />
    </>
  );
}
