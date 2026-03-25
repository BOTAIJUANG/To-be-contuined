// app/product/[slug]/page.tsx  ──  商品詳細頁（responsive）

import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import AddToCartButton from '@/components/AddToCartButton';
import Footer from '@/components/Footer';
import { getProductPromotions } from '@/lib/getProductPromotions';
import s from './product.module.css';

async function getProduct(slug: string) {
  const { data } = await supabase
    .from('products')
    .select(`
      id, name, name_en, slug, price, description, image_url,
      is_available, is_sold_out, is_preorder, preorder_note, variant_label,
      categories(name),
      product_specs(label, value),
      product_variants(id, name, price, price_diff, sku, stock, is_available, sort_order)
    `)
    .eq('slug', slug)
    .eq('is_available', true)
    .single();
  return data;
}

async function getActiveBatches(productId: number) {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('preorder_batches')
    .select('*')
    .eq('product_id', productId)
    .eq('status', 'active')
    .or(`starts_at.is.null,starts_at.lte.${today}`)
    .or(`ends_at.is.null,ends_at.gte.${today}`)
    .order('ship_date');
  return data ?? [];
}

async function getStoreSettings() {
  const { data } = await supabase.from('store_settings').select('phone, email, address').eq('id', 1).single();
  return data;
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [product, storeSettings] = await Promise.all([getProduct(slug), getStoreSettings()]);
  const promos = product ? await getProductPromotions(product.id) : [];
  if (!product) notFound();

  const activeBatches = product.is_preorder ? await getActiveBatches(product.id) : [];
  const hasBatches    = activeBatches.length > 0;
  const preorderStatus = (() => {
    if (!product.is_preorder) return null;
    if (!hasBatches) return 'no_batch';
    return 'active';
  })();

  const specs    = (product.product_specs   ?? []) as { label: string; value: string }[];
  const variants = (product.product_variants ?? []).filter((v: any) => v.is_available) as { id: number; name: string; price_diff: number }[];

  return (
    <>
      <div className={s.container}>
        {/* 圖片 */}
        <div className={s.imageSection}>
          <div className={s.imageRatio}>
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} className={s.image} />
            ) : (
              <div className={s.imagePlaceholder}>
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#B8B5B0" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05" /><path d="M12 22.08V12" />
                </svg>
              </div>
            )}
          </div>

          {product.is_sold_out && (
            <div className={`${s.badge} ${s.badgeSoldOut}`}>已完售</div>
          )}
          {!product.is_sold_out && product.is_preorder && (
            <div className={`${s.badge} ${s.badgePreorder}`}>預購中</div>
          )}
        </div>

        {/* 商品資訊 */}
        <div className={s.infoSection}>
          <div className={s.category}>{(product.categories as any)?.name ?? ''}</div>

          {product.name_en && <div className={s.nameEn}>{product.name_en}</div>}

          <h1 className={s.name}>{product.name}</h1>

          <div className={s.price}>NT$ {product.price.toLocaleString()}</div>

          {promos.length > 0 && (
            <div className={s.promoBox}>
              <div className={s.promoTitle}>優惠</div>
              {promos.map(promo => (
                <div key={promo.id} className={s.promoItem}>· {promo.name}</div>
              ))}
            </div>
          )}

          {product.is_preorder && preorderStatus === 'no_batch' && (
            <div className={s.noBatchBox}>
              <div className={s.noBatchText}>目前暫無開放預購批次</div>
            </div>
          )}

          {product.description && (
            <p className={s.description}>{product.description}</p>
          )}

          {specs.length > 0 && (
            <div className={s.specs}>
              {specs.map((spec, i) => (
                <div key={i} className={s.specRow}>
                  <span className={s.specLabel}>{spec.label}</span>
                  <span className={s.specValue}>{spec.value}</span>
                </div>
              ))}
            </div>
          )}

          <AddToCartButton
            product={{
              id:               String(product.id),
              name:             product.name,
              price:            product.price,
              imageUrl:         product.image_url ?? undefined,
              slug:             product.slug,
              isSoldOut:        product.is_sold_out,
              isPreorder:       product.is_preorder,
              preorderBatches:  activeBatches,
              preorderShipDate: activeBatches[0]?.ship_date ?? undefined,
              preorderStatus:   (preorderStatus as any) ?? undefined,
              variantLabel:     (product as any).variant_label ?? '規格',
              variants:         ((product.product_variants ?? []) as any[])
                .filter(v => v.is_available)
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                .map(v => ({
                  id:    v.id,
                  name:  v.name,
                  price: v.price ?? (product.price + (v.price_diff ?? 0)),
                })),
            }}
          />
        </div>
      </div>
      <Footer tel={storeSettings?.phone} email={storeSettings?.email} address={storeSettings?.address} />
    </>
  );
}
