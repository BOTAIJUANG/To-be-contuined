// app/shop/page.tsx  ──  線上選購頁（responsive）

export const revalidate = 0;

import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
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
    .select('id, name, slug, price, image_url, is_sold_out, is_preorder, stock_mode, category_id, categories(name, sort_order)')
    .eq('is_available', true)
    .order('sort_order');

  const products = data ?? [];
  const productIds = products.map((p: any) => p.id);

  // 查詢即時庫存，判斷真實售完狀態
  const soldOutSet = new Set<number>();
  const preorderHasBatch = new Set<number>();
  const preorderHasAvail = new Set<number>();
  if (productIds.length > 0) {
    const { data: invData } = await supabaseAdmin
      .from('inventory')
      .select('product_id, stock, reserved, inventory_mode, max_preorder, reserved_preorder')
      .in('product_id', productIds);

    // 按商品分組，計算可售數量
    const availableByProduct: Record<number, number> = {};
    (invData ?? []).forEach((inv: any) => {
      const avail = inv.inventory_mode === 'stock'
        ? (inv.stock ?? 0) - (inv.reserved ?? 0)
        : (inv.max_preorder ?? 0) - (inv.reserved_preorder ?? 0);
      availableByProduct[inv.product_id] = (availableByProduct[inv.product_id] ?? 0) + Math.max(0, avail);
    });

    // 沒有庫存記錄 或 可售數量 <= 0 → 售完
    // 預購商品：若所有批次都已額滿（reserved >= limit_qty）也標為售完
    const preorderIds  = new Set(products.filter((p: any) => p.is_preorder).map((p: any) => p.id));
    const dateModeIds  = new Set(products.filter((p: any) => p.stock_mode === 'date_mode').map((p: any) => p.id));

    // 查詢預購批次
    if (preorderIds.size > 0) {
      const { data: batches } = await supabaseAdmin
        .from('preorder_batches')
        .select('*')
        .in('product_id', [...preorderIds])
        .eq('is_active', true);

      // 按商品分組：有任一批次有餘量就不算售完
      (batches ?? []).forEach((b: any) => {
        preorderHasBatch.add(b.product_id);
        if ((b.limit_qty ?? 0) - (b.reserved ?? 0) > 0) preorderHasAvail.add(b.product_id);
      });

      // 預購商品不加入 soldOutSet（批次售完或無批次都顯示「暫停接單」，由 preorderStatus 控制）
    }

    for (const pid of productIds) {
      if (!preorderIds.has(pid) && !dateModeIds.has(pid) && (availableByProduct[pid] ?? 0) <= 0) soldOutSet.add(pid);
    }
  }

  const catOrderMap: Record<number, number> = {};
  categories.forEach((c, i) => { catOrderMap[c.id] = i; });

  const sorted = products.sort((a: any, b: any) => {
    const catA = catOrderMap[a.category_id] ?? 999;
    const catB = catOrderMap[b.category_id] ?? 999;
    if (catA !== catB) return catA - catB;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  return sorted.map((p: any) => {
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
      isSoldOut:  soldOutSet.has(p.id),
      isPreorder,
      preorderStatus,
    };
  });
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
