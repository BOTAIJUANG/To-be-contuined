// app/shop/page.tsx  ──  線上選購頁（responsive）

import { supabase } from '@/lib/supabase';
import ShopSidebar from '@/components/ShopSidebar';
import ProductCard, { Product } from '@/components/ProductCard';
import Footer from '@/components/Footer';
import s from './shop.module.css';

async function getCategories() {
  const { data } = await supabase.from('categories').select('id, name, slug').order('sort_order');
  return data ?? [];
}

async function getAllProducts(categories: { id: number }[]): Promise<Product[]> {
  const { data } = await supabase
    .from('products')
    .select('id, name, slug, price, image_url, is_sold_out, is_preorder, category_id, categories(name, sort_order)')
    .eq('is_available', true)
    .order('sort_order');

  const catOrderMap: Record<number, number> = {};
  categories.forEach((c, i) => { catOrderMap[c.id] = i; });

  const sorted = (data ?? []).sort((a: any, b: any) => {
    const catA = catOrderMap[a.category_id] ?? 999;
    const catB = catOrderMap[b.category_id] ?? 999;
    if (catA !== catB) return catA - catB;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  return sorted.map((p: any) => ({
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
  const { data } = await supabase.from('store_settings').select('phone, email, address').eq('id', 1).single();
  return data;
}

export default async function ShopPage() {
  const categories = await getCategories();
  const [products, storeSettings] = await Promise.all([getAllProducts(categories), getStoreSettings()]);

  return (
    <>
      <div className={s.layout}>
        <ShopSidebar categories={categories} />
        <div className={s.main}>
          <div className={s.head}>
            <h2 className={s.title}>SHOP ALL</h2>
            <p className={s.subtitle}>精選手工甜點，每日限量製作。</p>
          </div>
          {products.length === 0 ? (
            <p className={s.empty}>目前沒有上架商品</p>
          ) : (
            <div className={s.grid}>
              {products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
      <Footer tel={storeSettings?.phone} email={storeSettings?.email} address={storeSettings?.address} />
    </>
  );
}
