-- ════════════════════════════════════════════════
-- 訪客結帳支援
--
-- 請到 Supabase Dashboard → SQL Editor 執行此檔案
-- ════════════════════════════════════════════════

-- 1. member_id 改為可 null（訪客訂單沒有會員）
alter table orders alter column member_id drop not null;

-- 2. 新增訪客用欄位（會員訂單也冗餘填入，方便後台查詢不需 join）
alter table orders add column if not exists customer_name  text;
alter table orders add column if not exists customer_email text;
alter table orders add column if not exists customer_phone text;

-- 3. 更新 RLS：訪客訂單透過 order_no + email 查詢（order-search 頁面）
-- 原本 select policy 可能只允許 member_id = auth.uid()，需要放寬
-- 如果你目前沒有 select policy（用 service role 查），這步可跳過
