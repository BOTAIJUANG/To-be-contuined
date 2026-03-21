// app/shop/page.tsx  ──  線上選購頁

import { supabase } from '@/lib/supabase';
import ShopSidebar from '@/components/ShopSidebar';
import ProductCard, { Product } from '@/components/ProductCard';
import Footer from '@/components/Footer';

async function getCategories() {
  const { data } = await supabase.from('categories').select('id, name, slug').order('sort_order');
  return data ?? [];
}

async function getAllProducts(categories: { id: number; sort_order?: number }[]): Promise<Product[]> {
  const { data } = await supabase
    .from('products')
    .select('id, name, slug, price, image_url, is_sold_out, is_preorder, category_id, categories(name, sort_order)')
    .eq('is_available', true)
    .order('sort_order');

  // 先按分類 sort_order，再按商品 sort_order
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
      <div style={{ width: 'min(calc(100% - 60px), 1100px)', margin: 'auto', padding: '52px 0 72px', display: 'grid', gridTemplateColumns: '200px 1fr', gap: '52px', alignItems: 'start' }}>
        <ShopSidebar categories={categories} />
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '30px', marginBottom: '40px' }}>
            <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.28em', color: '#1E1C1A', margin: 0 }}>SHOP ALL</h2>
            <p style={{ fontSize: '13px', color: '#888580', fontWeight: 300, margin: 0 }}>精選手工甜點，每日限量製作。</p>
          </div>
          {products.length === 0 ? (
            <p style={{ color: '#888580', fontSize: '13px', padding: '52px 0', textAlign: 'center' }}>目前沒有上架商品</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px 24px' }}>
              {products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
      <Footer tel={storeSettings?.phone} email={storeSettings?.email} address={storeSettings?.address} />
    </>
  );
}
