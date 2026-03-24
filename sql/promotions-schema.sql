-- ════════════════════════════════════════════════
-- 優惠活動系統 DB Schema
--
-- 請到 Supabase Dashboard → SQL Editor 執行此檔案
-- ════════════════════════════════════════════════

-- ── 1. 活動主表 ──────────────────────────────────
-- 三種活動共用這張表，用 type 區分
create table if not exists promotions (
  id          bigint generated always as identity primary key,
  name        text not null,                            -- 活動名稱（如：蛋塔多件優惠）
  type        text not null check (type in ('volume', 'bundle', 'gift')),
                                                         -- volume=商品數量優惠, bundle=組合優惠, gift=贈品活動
  is_active   boolean not null default true,             -- 啟用 / 停用
  stackable   boolean not null default false,            -- 是否可與其他活動併用
  start_at    timestamptz,                               -- 生效起始時間（null=立即生效）
  end_at      timestamptz,                               -- 生效結束時間（null=永不過期）

  -- bundle 專用欄位
  bundle_price int,                                      -- 組合優惠價（僅 type=bundle 使用）
  bundle_repeatable boolean not null default false,      -- 組合是否可重複套用（買2組打2次折）

  -- gift 專用欄位
  gift_product_id  bigint references products(id),       -- 贈品商品 ID
  gift_qty         int default 1,                        -- 贈品數量
  gift_condition_qty int default 1,                      -- 買幾個條件商品才送

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 2. 商品數量優惠：階梯定價 ───────────────────────
-- 例如：1件=70, 3件=200, 6件=380
create table if not exists promotion_volume_tiers (
  id            bigint generated always as identity primary key,
  promotion_id  bigint not null references promotions(id) on delete cascade,
  min_qty       int not null,          -- 最低數量（如：3）
  price         int not null,          -- 該階梯的總價（如：200）
  sort_order    int not null default 0 -- 排序用
);

-- ── 3. 組合優惠：組合中的商品清單 ────────────────────
-- 例如：美式咖啡×1 + 巴斯克蛋糕×1 = 150
create table if not exists promotion_bundle_items (
  id            bigint generated always as identity primary key,
  promotion_id  bigint not null references promotions(id) on delete cascade,
  product_id    bigint not null references products(id),
  variant_id    bigint,                -- 可選，指定規格
  qty           int not null default 1 -- 組合中需要幾個
);

-- ── 4. 活動適用商品 ─────────────────────────────────
-- volume 和 gift 活動用這張表指定適用哪些商品
-- bundle 活動的商品在 promotion_bundle_items 裡，不用這張
create table if not exists promotion_products (
  id            bigint generated always as identity primary key,
  promotion_id  bigint not null references promotions(id) on delete cascade,
  product_id    bigint not null references products(id),
  unique (promotion_id, product_id)
);

-- ── 索引 ─────────────────────────────────────────
create index if not exists idx_promotions_active on promotions (is_active, type);
create index if not exists idx_promotions_dates  on promotions (start_at, end_at);
create index if not exists idx_promo_volume_tiers on promotion_volume_tiers (promotion_id);
create index if not exists idx_promo_bundle_items on promotion_bundle_items (promotion_id);
create index if not exists idx_promo_products     on promotion_products (promotion_id);
create index if not exists idx_promo_products_pid on promotion_products (product_id);

-- ── RLS（關閉或設置公開讀取）──────────────────────
-- 前端需要讀取活動資料來顯示優惠價
alter table promotions enable row level security;
alter table promotion_volume_tiers enable row level security;
alter table promotion_bundle_items enable row level security;
alter table promotion_products enable row level security;

-- 所有人可讀（前端需要顯示優惠資訊）
create policy "promotions_public_read" on promotions for select using (true);
create policy "volume_tiers_public_read" on promotion_volume_tiers for select using (true);
create policy "bundle_items_public_read" on promotion_bundle_items for select using (true);
create policy "promo_products_public_read" on promotion_products for select using (true);

-- 寫入由 supabaseAdmin (service role) 處理，不需要額外 policy
