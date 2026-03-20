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

async function getProduct(slug: string) {
  const { data } = await supabase
    .from('products')
    .select(`
      id, name, name_en, slug, price, description, image_url,
      is_available, is_sold_out, is_preorder, preorder_note,
      categories(name),
      product_specs(label, value),
      product_variants(id, name, price_diff, is_available)
    `)
    .eq('slug', slug)
    .eq('is_available', true)
    .single();
  return data;
}

async function getActiveBatch(productId: number) {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('preorder_batches')
    .select('*')
    .eq('product_id', productId)
    .eq('is_active', true)
    .or(`starts_at.is.null,starts_at.lte.${today}`)
    .or(`ends_at.is.null,ends_at.gte.${today}`)
    .order('ship_date')
    .limit(1)
    .single();
  return data;
}

async function getStoreSettings() {
  const { data } = await supabase.from('store_settings').select('phone, email, address').eq('id', 1).single();
  return data;
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [product, storeSettings] = await Promise.all([getProduct(slug), getStoreSettings()]);
  if (!product) notFound();

  // 如果是預購商品，取得進行中的批次
  const activeBatch = product.is_preorder ? await getActiveBatch(product.id) : null;

  // 預購狀態
  const today = new Date().toISOString().split('T')[0];
  const preorderStatus = (() => {
    if (!product.is_preorder) return null;
    if (!activeBatch) return 'no_batch';
    if (activeBatch.starts_at && activeBatch.starts_at > today) return 'upcoming';
    if (activeBatch.ends_at   && activeBatch.ends_at   < today) return 'ended';
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
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '52px' }}>🍰</div>
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
            <div style={{ fontFamily: '"Noto Serif TC", serif', fontWeight: 200, fontSize: '24px', color: '#b35252', letterSpacing: '0.1em', marginBottom: '24px' }}>
              NT$ {product.price.toLocaleString()}
            </div>

            {/* 預購批次資訊 */}
            {product.is_preorder && (
              <div style={{ marginBottom: '24px' }}>
                {preorderStatus === 'active' && activeBatch && (
                  <div style={{ padding: '16px 20px', background: '#e8f0fb', border: '1px solid #b5d4f4' }}>
                    <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.3em', color: '#2a5a8c', textTransform: 'uppercase', marginBottom: '8px' }}>
                      {activeBatch.name} — 預購進行中
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#1E1C1A', marginBottom: '4px' }}>
                      本批次預計 <span style={{ color: '#2a5a8c' }}>{activeBatch.ship_date}</span> 出貨
                    </div>
                    {activeBatch.ends_at && (
                      <div style={{ fontSize: '12px', color: '#888580', marginTop: '4px' }}>
                        預購截止：{activeBatch.ends_at}
                      </div>
                    )}
                    {activeBatch.limit_qty > 0 && (
                      <div style={{ fontSize: '12px', color: '#b87a2a', marginTop: '4px' }}>
                        本批次限量 {activeBatch.limit_qty} 份
                      </div>
                    )}
                    {product.preorder_note && (
                      <div style={{ fontSize: '12px', color: '#555250', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #b5d4f4' }}>
                        {product.preorder_note}
                      </div>
                    )}
                  </div>
                )}
                {preorderStatus === 'upcoming' && activeBatch && (
                  <div style={{ padding: '16px 20px', background: '#EDE9E2', border: '1px solid #E8E4DC' }}>
                    <div style={{ fontSize: '14px', color: '#1E1C1A', fontWeight: 600, marginBottom: '4px' }}>即將開放預購</div>
                    <div style={{ fontSize: '13px', color: '#888580' }}>預購將於 {activeBatch.starts_at} 開放，敬請期待</div>
                  </div>
                )}
                {(preorderStatus === 'ended' || preorderStatus === 'no_batch') && (
                  <div style={{ padding: '16px 20px', background: '#fef0f0', border: '1px solid #f5c6c6' }}>
                    <div style={{ fontSize: '14px', color: '#c0392b', fontWeight: 600 }}>本次預購已結束</div>
                  </div>
                )}
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
                preorderShipDate: activeBatch?.ship_date ?? undefined,
                preorderStatus:   (preorderStatus as any) ?? undefined,
                preorderStartsAt: activeBatch?.starts_at ?? undefined,
                preorderEndsAt:   activeBatch?.ends_at ?? undefined,
              }}
            />
          </div>
        </div>
      </div>
      <Footer tel={storeSettings?.phone} email={storeSettings?.email} address={storeSettings?.address} />
    </>
  );
}
