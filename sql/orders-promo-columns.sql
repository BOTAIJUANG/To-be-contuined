-- ════════════════════════════════════════════════
-- 訂單表新增優惠活動欄位
--
-- 請到 Supabase Dashboard → SQL Editor 執行此檔案
-- （在 promotions-schema.sql 之後執行）
-- ════════════════════════════════════════════════

-- orders 表新增「活動折扣」欄位
alter table orders add column if not exists promo_discount int not null default 0;

-- order_items 表新增「贈品」標記
alter table order_items add column if not exists is_gift boolean not null default false;
