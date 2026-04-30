// app/product/[slug]/page.tsx  ──  商品詳細頁（responsive）

export const dynamic = 'force-dynamic';

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
    allow_home_ambient, allow_home_refrigerated, allow_home_frozen,
    allow_cvs_ambient, allow_cvs_frozen, allow_store_pickup, stock_mode,
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
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
  const { data } = await supabaseAdmin
    .from('preorder_batches')
    .select('*')
    .eq('product_id', productId)
    .eq('is_active', true)
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
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).trim();
  const [product, storeSettings] = await Promise.all([getProduct(slug), getStoreSettings()]);
  const promos = product ? await getProductPromotions(product.id) : [];
  if (!product) notFound();

  const activeBatches = product.is_preorder ? await getActiveBatches(product.id) : [];
  const hasBatches    = activeBatches.length > 0;

  // 直接用 preorder_batches.reserved 計算剩餘量（與 shop 頁、下單 API 一致）
  // limit_qty = 0 / null 代表無限額，remaining 留 undefined，讓 AddToCartButton 視為不限量
  const batchRemainingMap: Record<number, number | undefined> = {};
  activeBatches.forEach((b: any) => {
    if ((b.limit_qty ?? 0) > 0) {
      batchRemainingMap[b.id] = Math.max(0, (b.limit_qty as number) - (b.reserved ?? 0));
    }
  });
  const preorderStatus = (() => {
    if (!product.is_preorder) return null;
    if (!hasBatches) return 'no_batch';
    // 所有批次皆已額滿 → 視為暫停接單
    const anyAvail = activeBatches.some((b: any) =>
      (b.limit_qty ?? 0) === 0 || ((b.limit_qty as number) - (b.reserved ?? 0)) > 0
    );
    return anyAvail ? 'active' : 'no_batch';
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
  if (rawVariants.length === 0 && !product.is_preorder && (product as any).stock_mode !== 'date_mode') {
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

  // 依實際庫存計算是否已完售（避免單一規格售完就封鎖整個商品）
  const allVariantsSoldOut = (() => {
    if (product.is_preorder) return product.is_sold_out; // 預購商品沿用資料庫旗標
    if (variants.length > 0) return variants.every(v => (variantStockMap[v.id] ?? 0) <= 0);
    if (productStock !== null) return productStock <= 0;
    return product.is_sold_out;
  })();

  // 日期模式：載入 product_ship_dates（套用 ship_min_days / ship_max_days）
  // 預購商品走批次管理，不走 date_mode，避免兩個日期區塊同時出現
  const isDateMode = !product.is_preorder && (product as any).stock_mode === 'date_mode';
  let shipDates: { id: number; ship_date: string; capacity: number; remaining: number }[] = [];
  if (isDateMode) {
    const { data: shipSettings } = await supabaseAdmin
      .from('store_settings')
      .select('ship_min_days, ship_max_days')
      .eq('id', 1)
      .single();
    const minDays = shipSettings?.ship_min_days ?? 1;
    const maxDays = shipSettings?.ship_max_days ?? 30;

    const twDate  = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d);
    const todayTW = twDate(new Date());
    const minDate = new Date(todayTW + 'T12:00:00'); minDate.setDate(minDate.getDate() + minDays);
    const maxDate = new Date(todayTW + 'T12:00:00'); maxDate.setDate(maxDate.getDate() + maxDays);
    const minStr  = twDate(minDate);
    const maxStr  = twDate(maxDate);

    const { data: sdData } = await supabaseAdmin
      .from('product_ship_dates')
      .select('id, ship_date, capacity, reserved')
      .eq('product_id', product.id)
      .is('variant_id', null)
      .eq('is_open', true)
      .gte('ship_date', minStr)
      .lte('ship_date', maxStr)
      .order('ship_date');
    shipDates = (sdData ?? [])
      .map((d: any) => ({
        id: d.id,
        ship_date: d.ship_date,
        capacity: d.capacity ?? 0,
        remaining: Math.max(0, (d.capacity ?? 0) - (d.reserved ?? 0)),
      }))
      .filter(d => d.remaining > 0);
  }

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

          {allVariantsSoldOut && (
            <div className={`${s.badge} ${s.badgeSoldOut}`}>已完售</div>
          )}
          {!allVariantsSoldOut && product.is_preorder && preorderStatus === 'no_batch' && (
            <div className={`${s.badge} ${s.badgeSoldOut}`}>暫停接單</div>
          )}
          {!allVariantsSoldOut && product.is_preorder && preorderStatus !== 'no_batch' && (
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

          {product.is_preorder && preorderStatus !== 'no_batch' && (
            <div className={s.preorderMixNotice}>
              此商品為預購商品。若與一般商品一同結帳，將統一出貨；實際可選日期將於結帳時確認。
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
            if ((product as any).allow_home_ambient)      methods.push('宅配（常溫）');
            if ((product as any).allow_home_refrigerated) methods.push('宅配（冷藏）');
            if ((product as any).allow_home_frozen)       methods.push('宅配（冷凍）');
            if ((product as any).allow_cvs_ambient)       methods.push('7-11 取貨（常溫）');
            if ((product as any).allow_cvs_frozen)        methods.push('7-11 取貨（冷凍）');
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
              isSoldOut:        allVariantsSoldOut,
              isPreorder:       product.is_preorder,
              isDateMode:       isDateMode,
              shipDates:        shipDates,
              preorderBatches:  activeBatches.map((b: any) => ({
                ...b,
                remaining: batchRemainingMap[b.id], // undefined = 不限量
              })),
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
