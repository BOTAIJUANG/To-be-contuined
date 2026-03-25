// ════════════════════════════════════════════════
// app/product/[slug]/page.tsx  ──  商品詳細頁
//
// - 顯示商品圖片、名稱、價格、規格、描述
// - 預購商品顯示批次出貨日
// - AddToCartButton 處理加入購物車
// ════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import AddToCartButton from '@/components/AddToCartButton';
import Footer from '@/components/Footer';
import { getProductPromotions, ProductPromoInfo } from '@/lib/getProductPromotions';

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

  // 如果是預購商品，取得所有開放中的批次
  const activeBatches = product.is_preorder ? await getActiveBatches(product.id) : [];
  const hasBatches    = activeBatches.length > 0;

  // 預購狀態（整體）
  const preorderStatus = (() => {
    if (!product.is_preorder) return null;
    if (!hasBatches) return 'no_batch';
    return 'active';
  })();

  const specs  = (product.product_specs   ?? []) as { label: string; value: string }[];
  const variants = (product.product_variants ?? []).filter((v: any) => v.is_available) as { id: number; name: string; price_diff: number }[];

  return (
    <>
      <div style={{ width: 'min(calc(100% - 60px), 1100px)', margin: 'auto', padding: '52px 0 72px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'start' }}>

          {/* ── 左：圖片 ── */}
          <div style={{ position: 'relative' }}>
            <div style={{ aspectRatio: '1/1', overflow: 'hidden', background: '#EDE9E2' }}>
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#B8B5B0" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05" /><path d="M12 22.08V12" />
                  </svg>
                </div>
              )}
            </div>

            {/* 左上角標籤 */}
            {product.is_sold_out && (
              <div style={{ position: 'absolute', top: '16px', left: '16px', background: '#c0392b', color: '#fff', fontFamily: '"Noto Sans TC", sans-serif', fontSize: '14px', fontWeight: 700, letterSpacing: '0.2em', padding: '8px 16px' }}>
                已完售
              </div>
            )}
            {!product.is_sold_out && product.is_preorder && (
              <div style={{ position: 'absolute', top: '16px', left: '16px', background: '#b87a2a', color: '#fff', fontFamily: '"Noto Sans TC", sans-serif', fontSize: '14px', fontWeight: 700, letterSpacing: '0.2em', padding: '8px 16px' }}>
                預購中
              </div>
            )}
          </div>

          {/* ── 右：商品資訊 ── */}
          <div>
            {/* 分類 */}
            <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 500, letterSpacing: '0.45em', color: '#888580', textTransform: 'uppercase', marginBottom: '12px' }}>
              {(product.categories as any)?.name ?? ''}
            </div>

            {/* 英文名 */}
            {product.name_en && (
              <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '13px', letterSpacing: '0.2em', color: '#888580', textTransform: 'uppercase', marginBottom: '8px' }}>
                {product.name_en}
              </div>
            )}

            {/* 中文名 */}
            <h1 style={{ fontFamily: '"Noto Serif TC", serif', fontWeight: 200, fontSize: '32px', letterSpacing: '0.15em', color: '#1E1C1A', margin: '0 0 16px', lineHeight: 1.3 }}>
              {product.name}
            </h1>

            {/* 價格 */}
            <div style={{ fontFamily: '"Noto Serif TC", serif', fontWeight: 200, fontSize: '24px', color: '#b35252', letterSpacing: '0.1em', marginBottom: promos.length > 0 ? '16px' : '24px' }}>
              NT$ {product.price.toLocaleString()}
            </div>

            {/* 優惠資訊 */}
            {promos.length > 0 && (
              <div style={{ marginBottom: '24px', padding: '12px 16px', background: '#faf8f5', border: '1px solid #E8E4DC' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E1C1A', marginBottom: '6px', letterSpacing: '0.1em' }}>優惠</div>
                {promos.map(promo => (
                  <div key={promo.id} style={{ fontSize: '12px', color: '#555250', lineHeight: 2 }}>
                    · {promo.name}
                  </div>
                ))}
              </div>
            )}

            {/* 預購批次選擇（已在 AddToCartButton 裡顯示，這裡只保留無批次提示）*/}
            {product.is_preorder && preorderStatus === 'no_batch' && (
              <div style={{ marginBottom: '24px', padding: '16px 20px', background: '#fef0f0', border: '1px solid #f5c6c6' }}>
                <div style={{ fontSize: '14px', color: '#c0392b', fontWeight: 600 }}>目前暫無開放預購批次</div>
              </div>
            )}

            {/* 商品描述 */}
            {product.description && (
              <p style={{ fontSize: '13px', lineHeight: 2.4, fontWeight: 300, color: '#555250', marginBottom: '28px', whiteSpace: 'pre-line' }}>
                {product.description}
              </p>
            )}

            {/* 規格列表 */}
            {specs.length > 0 && (
              <div style={{ marginBottom: '28px' }}>
                {specs.map((spec, i) => (
                  <div key={i} style={{ display: 'flex', gap: '24px', padding: '10px 0', borderBottom: '1px solid #E8E4DC', fontSize: '12px' }}>
                    <span style={{ fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.15em', color: '#888580', textTransform: 'uppercase', minWidth: '80px' }}>{spec.label}</span>
                    <span style={{ color: '#555250' }}>{spec.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 加入購物車 */}
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
      </div>
      <Footer tel={storeSettings?.phone} email={storeSettings?.email} address={storeSettings?.address} />
    </>
  );
}
