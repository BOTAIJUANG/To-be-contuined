// ════════════════════════════════════════════════
// app/shop/[slug]/page.tsx  ──  分類頁
//
// 網址格式：/shop/q-bing、/shop/dessert、/shop/cake
// [slug] 對應 categories 表的 slug 欄位
// ════════════════════════════════════════════════

import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import ShopSidebar from "@/components/ShopSidebar";
import ProductCard, { Product } from "@/components/ProductCard";
import Footer from "@/components/Footer";

// ── 取得商店設定 ────────────────────────────────
async function getStoreSettings() {
  const { data } = await supabase.from("store_settings").select("phone, email, address").eq("id", 1).single();
  return data;
}

// ── 取得所有分類（側欄用）────────────────────────
async function getCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug")
    .order("sort_order");
  if (error) {
    console.error("取得分類失敗：", error);
    return [];
  }
  return data ?? [];
}

// ── 取得單一分類 + 該分類底下的商品 ──────────────
async function getCategoryWithProducts(slug: string) {
  // 先找到這個分類
  const { data: category, error: catError } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (catError || !category) return null;

  // 再取這個分類底下的商品
  const { data: products, error: prodError } = await supabase
    .from("products")
    .select("id, name, slug, price, image_url, is_sold_out, is_preorder, categories(name)")
    .eq("category_id", category.id)
    .eq("is_available", true)
    .order("sort_order");

  if (prodError) {
    console.error("取得商品失敗：", prodError);
  }

  return { category, products: products ?? [] };
}

// ── 頁面元件 ──────────────────────────────────────
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // 同時取分類資料和側欄分類
  const [result, categories, storeSettings] = await Promise.all([
    getCategoryWithProducts(slug),
    getCategories(),
    getStoreSettings(),
  ]);

  // 找不到分類 → 404
  if (!result) notFound();

  const { category, products } = result;

  // 把資料庫格式轉換成 ProductCard 需要的格式
  const productList: Product[] = products.map((p: any) => ({
    id:         String(p.id),
    name:       p.name,
    slug:       p.slug,
    price:      p.price,
    imageUrl:   p.image_url ?? undefined,
    category:   p.categories?.name ?? '',
    isSoldOut:  p.is_sold_out  ?? false,
    isPreorder: p.is_preorder  ?? false,
  }));

  return (
    <>
      <div
        style={{
          width: "min(calc(100% - 60px), 1100px)",
          margin: "auto",
          display: "grid",
          gridTemplateColumns: "160px 1fr",
          gap: "64px",
          padding: "72px 0",
        }}
      >
        {/* 左側分類側欄 */}
        <ShopSidebar categories={categories} activeSlug={slug} />

        {/* 右側商品區 */}
        <div>
          {/* 返回按鈕 */}
          <Link
            href="/shop"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontFamily: '"Montserrat", sans-serif',
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "#555250",
              textDecoration: "none",
              marginBottom: "44px",
            }}
          >
            ← SHOP ALL
          </Link>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: "30px",
              marginBottom: "52px",
            }}
          >
            <h2
              style={{
                fontFamily: '"Noto Sans TC", sans-serif',
                fontWeight: 700,
                fontSize: "19px",
                letterSpacing: "0.28em",
                color: "#1E1C1A",
                margin: 0,
              }}
            >
              {category.name}
            </h2>
            <p
              style={{
                fontSize: "13px",
                lineHeight: 2.4,
                fontWeight: 300,
                color: "#555250",
                margin: 0,
              }}
            >
              共 {productList.length} 件商品
            </p>
          </div>

          {/* 商品格線 */}
          {productList.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "44px 26px",
              }}
            >
              {productList.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <p style={{ color: "#888580", fontSize: "13px" }}>
              此分類目前沒有商品。
            </p>
          )}
        </div>
      </div>

      <Footer tel={storeSettings?.phone} email={storeSettings?.email} address={storeSettings?.address} />
    </>
  );
}
