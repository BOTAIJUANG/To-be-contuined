// app/product/[slug]/page.tsx  ──  商品詳細頁（responsive）

import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import AddToCartButton from '@/components/AddToCartButton';
import Footer from '@/components/Footer';
import { getProductPromotions } from '@/lib/getProductPromotions';
import s from './product.module.css';

async function getProduct(slug: string) {
  // 先嘗試含 shipping 欄位的查詢，若欄位不存在則 fallback
  const cols = `
    id, name, name_en, slug, price, description, image_url,
    is_available, is_sold_out, is_preorder, preorder_note, variant_label,
    categories(name),
    product_specs(label, value),
    product_variants(id, name, price, price_diff, sku, stock, is_available, sort_order)
  `;
  const shipCols = `
    id, name, name_en, slug, price, description, image_url,
    is_available, is_sold_out, is_preorder, preorder_note, variant_label,
    allow_home_delivery, allow_cvs_711, allow_store_pickup,
    categories(name),
    product_specs(label, value),
    product_variants(id, name, price, price_diff, sku, stock, is_available, sort_order)
  `;
  const { data, error } = await supabase
    .from('products').select(shipCols).eq('slug', slug).eq('is_available', true).single();
  if (!error) return data;
  // fallback：欄位不存在時用舊查詢
  const { data: fallback } = await supabase
    .from('products').select(cols).eq('slug', slug).eq('is_available', true).single();
  return fallback;
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
  const rawVariants = (product.product_variants ?? []).filter((v: any) => v.is_available) as { id: number; name: string; price_diff: number; stock: number }[];

  // 載入各規格的庫存量（用 supabaseAdmin 繞過 RLS）
  let variantStockMap: Record<number, number> = {};
  if (rawVariants.length > 0) {
    const { data: invData } = await supabaseAdmin
      .from('inventory')
      .select('variant_id, stock, reserved')
      .eq('product_id', product.id)
      .in('variant_id', rawVariants.map(v => v.id));
    if (invData) {
      invData.forEach((inv: any) => {
        variantStockMap[inv.variant_id] = Math.max(0, (inv.stock ?? 0) - (inv.reserved ?? 0));
      });
    }
  }

  // 載入無規格商品的庫存量
  let productStock: number | null = null;
  if (rawVariants.length === 0 && !product.is_preorder) {
    const { data: invData } = await supabaseAdmin
      .from('inventory')
      .select('stock, reserved')
      .eq('product_id', product.id)
      .is('variant_id', null)
      .single();
    if (invData) {
      productStock = Math.max(0, (invData.stock ?? 0) - (invData.reserved ?? 0));
    }
  }
  const variants = rawVariants;

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
              <div className={s.promoTitle}>優惠活動</div>
              {promos.map(promo => (
                <div key={promo.id} className={s.promoItem}>
                  <div className={s.promoText}>{promo.name}</div>
                  {promo.type === 'volume' && promo.volume_tiers && promo.volume_tiers.length > 0 && (
                    <div className={s.promoSub}>
                      {promo.volume_tiers.map((t, i) => (
                        <span key={i}>
                          {i > 0 && '、'}
                          買 {t.min_qty} 件 <span className={s.promoHighlight}>NT$ {t.price.toLocaleString()}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {promo.type === 'bundle' && promo.bundle_price != null && (
                    <div className={s.promoSub}>
                      組合優惠價 <span className={s.promoHighlight}>NT$ {promo.bundle_price.toLocaleString()}</span>
                    </div>
                  )}
                  {promo.type === 'gift' && (
                    <div className={s.promoSub}>
                      滿 {promo.gift_condition_qty} 件贈送 {promo.gift_qty} 份
                    </div>
                  )}
                </div>
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

          {/* 運送方式 */}
          {(() => {
            const methods: string[] = [];
            if ((product as any).allow_home_delivery !== false) methods.push('一般宅配');
            if ((product as any).allow_cvs_711 !== false) methods.push('7-11 取貨');
            if ((product as any).allow_store_pickup !== false) methods.push('門市自取');
            return methods.length > 0 ? (
              <div className={s.specs}>
                <div className={s.specRow}>
                  <span className={s.specLabel}>運送方式</span>
                  <span className={s.specValue}>{methods.join('、')}</span>
                </div>
              </div>
            ) : null;
          })()}

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
              stock:            productStock,
              variants:         ((product.product_variants ?? []) as any[])
                .filter(v => v.is_available)
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                .map(v => ({
                  id:    v.id,
                  name:  v.name,
                  price: v.price ?? (product.price + (v.price_diff ?? 0)),
                  stock: variantStockMap[v.id] ?? null,
                })),
            }}
          />
        </div>
      </div>
      <Footer tel={storeSettings?.phone} email={storeSettings?.email} address={storeSettings?.address} />
    </>
  );
}
