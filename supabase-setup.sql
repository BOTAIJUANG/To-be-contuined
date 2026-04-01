-- ════════════════════════════════════════════════
-- TOBE 烘焙坊 ── Supabase 完整設定
--
-- 這份 SQL 包含所有需要在 Supabase SQL Editor 執行的設定。
-- 分成四大區塊：
--   A. Helper 函數 ── is_admin() 避免 RLS 遞迴
--   B. RLS Policy ── 每張表的讀寫權限
--   C. RPC 函數 ── 後端呼叫的原子操作
--   D. GRANT 權限 ── 角色基本表級權限
--
-- 【使用方式】
-- 登入 Supabase Dashboard → SQL Editor → 貼上執行
-- ════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════╗
-- ║  A. Helper 函數                              ║
-- ╚══════════════════════════════════════════════╝

-- 用 SECURITY DEFINER 繞過 RLS 檢查 admin 身份
-- 避免 policy 裡查 members → members 的 RLS 又查 members → 無限遞迴
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM members WHERE id = auth.uid() AND role = 'admin'
  );
$$;


-- ╔══════════════════════════════════════════════╗
-- ║  B. RLS Policy                               ║
-- ╚══════════════════════════════════════════════╝
-- 規則只有三種模式：
--   公開讀取：所有人能看（商品、分類、公告...）
--   本人限定：只能看/改自己的（訂單、地址...）
--   僅 Admin：只有管理員能操作（原料、庫存異動...）
--
-- 所有 admin 檢查都用 is_admin()，不直接查 members


-- ── 1. products ── 公開讀取 ─────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "公開讀取" ON products FOR SELECT USING (true);
CREATE POLICY "admin 管理" ON products FOR ALL USING (is_admin());

-- ── 2. categories ── 公開讀取 ───────────────────
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "公開讀取" ON categories FOR SELECT USING (true);
CREATE POLICY "admin 管理" ON categories FOR ALL USING (is_admin());

-- ── 3. product_variants ── 公開讀取 ─────────────
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "公開讀取" ON product_variants FOR SELECT USING (true);
CREATE POLICY "admin 管理" ON product_variants FOR ALL USING (is_admin());

-- ── 4. product_specs ── 公開讀取 ────────────────
ALTER TABLE product_specs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "公開讀取" ON product_specs FOR SELECT USING (true);
CREATE POLICY "admin 管理" ON product_specs FOR ALL USING (is_admin());

-- ── 5. orders ── 本人 + Admin ───────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "本人或 admin 讀取" ON orders FOR SELECT USING (member_id = auth.uid() OR is_admin());
CREATE POLICY "admin 管理" ON orders FOR ALL USING (is_admin());

-- ── 6. order_items ── 跟著訂單走 ────────────────
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "本人或 admin 讀取" ON order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.member_id = auth.uid())
  OR is_admin()
);
CREATE POLICY "admin 管理" ON order_items FOR ALL USING (is_admin());

-- ── 7. members ── 本人 + Admin ──────────────────
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "本人讀取" ON members FOR SELECT USING (id = auth.uid() OR is_admin());
CREATE POLICY "本人修改" ON members FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "新會員註冊" ON members FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "admin 管理" ON members FOR ALL USING (is_admin());

-- ── 8. addresses ── 純本人 ──────────────────────
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "本人讀取" ON addresses FOR SELECT USING (member_id = auth.uid());
CREATE POLICY "本人管理" ON addresses FOR ALL USING (member_id = auth.uid());

-- ── 9. inventory ── 公開讀取 ────────────────────
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "公開讀取" ON inventory FOR SELECT USING (true);
CREATE POLICY "admin 管理" ON inventory FOR ALL USING (is_admin());

-- ── 10. inventory_logs ── 僅 Admin ──────────────
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin 讀取" ON inventory_logs FOR SELECT USING (is_admin());
CREATE POLICY "admin 管理" ON inventory_logs FOR ALL USING (is_admin());

-- ── 11. ingredients ── 僅 Admin ─────────────────
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin 讀取" ON ingredients FOR SELECT USING (is_admin());
CREATE POLICY "admin 管理" ON ingredients FOR ALL USING (is_admin());

-- ── 12. ingredient_logs ── 僅 Admin ─────────────
ALTER TABLE ingredient_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin 讀取" ON ingredient_logs FOR SELECT USING (is_admin());
CREATE POLICY "admin 管理" ON ingredient_logs FOR ALL USING (is_admin());

-- ── 13. ingredient_products ── 僅 Admin ─────────
ALTER TABLE ingredient_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin 讀取" ON ingredient_products FOR SELECT USING (is_admin());
CREATE POLICY "admin 管理" ON ingredient_products FOR ALL USING (is_admin());

-- ── 14. store_settings ── 公開讀取 ──────────────
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "公開讀取" ON store_settings FOR SELECT USING (true);
CREATE POLICY "admin 管理" ON store_settings FOR ALL USING (is_admin());

-- ── 15. coupons ── 啟用中公開讀取 ───────────────
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "啟用中公開讀取" ON coupons FOR SELECT USING (is_active = true);
CREATE POLICY "admin 管理" ON coupons FOR ALL USING (is_admin());

-- ── 16. stamp_logs ── 本人 + Admin ──────────────
ALTER TABLE stamp_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "本人或 admin 讀取" ON stamp_logs FOR SELECT USING (member_id = auth.uid() OR is_admin());
CREATE POLICY "admin 管理" ON stamp_logs FOR ALL USING (is_admin());

-- ── 17. redemptions ── 本人 + Admin ─────────────
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "本人或 admin 讀取" ON redemptions FOR SELECT USING (member_id = auth.uid() OR is_admin());
CREATE POLICY "admin 管理" ON redemptions FOR ALL USING (is_admin());

-- ── 18. redeem_items ── 公開讀取 ────────────────
ALTER TABLE redeem_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "公開讀取" ON redeem_items FOR SELECT USING (true);
CREATE POLICY "admin 管理" ON redeem_items FOR ALL USING (is_admin());

-- ── 19. announcements ── 公開讀取 ───────────────
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "公開讀取" ON announcements FOR SELECT USING (true);
CREATE POLICY "admin 管理" ON announcements FOR ALL USING (is_admin());

-- ── 20. faqs ── 公開讀取 ────────────────────────
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "公開讀取" ON faqs FOR SELECT USING (true);
CREATE POLICY "admin 管理" ON faqs FOR ALL USING (is_admin());

-- ── 21. preorder_batches ── 公開讀取 ────────────
ALTER TABLE preorder_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "公開讀取" ON preorder_batches FOR SELECT USING (true);
CREATE POLICY "admin 管理" ON preorder_batches FOR ALL USING (is_admin());

-- ── 22. preorders ── 公開讀取 ───────────────────
ALTER TABLE preorders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "公開讀取" ON preorders FOR SELECT USING (true);
CREATE POLICY "admin 管理" ON preorders FOR ALL USING (is_admin());

-- ── 23. product_ship_dates ── 公開讀取 ──────────
ALTER TABLE product_ship_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "公開讀取" ON product_ship_dates FOR SELECT USING (true);
CREATE POLICY "admin 管理" ON product_ship_dates FOR ALL USING (is_admin());


-- ╔══════════════════════════════════════════════╗
-- ║  B2. Index ── 唯一索引                       ║
-- ╚══════════════════════════════════════════════╝

-- 訂單編號唯一，防止極端併發產生重複編號
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_no_unique ON orders (order_no);


-- ╔══════════════════════════════════════════════╗
-- ║  C. RPC 函數 ── 後端原子操作                ║
-- ╚══════════════════════════════════════════════╝

-- 折扣碼扣額度（原子性：不可能併發超賣）
CREATE OR REPLACE FUNCTION claim_coupon_usage(p_coupon_id bigint)
RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  rows_affected int;
BEGIN
  UPDATE coupons
  SET used_count = used_count + 1
  WHERE id = p_coupon_id
    AND is_active = true
    AND (max_uses IS NULL OR used_count < max_uses);
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$;

-- 折扣碼退回額度（訂單建立失敗時用）
CREATE OR REPLACE FUNCTION release_coupon_usage(p_coupon_id bigint)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE coupons
  SET used_count = GREATEST(used_count - 1, 0)
  WHERE id = p_coupon_id;
END;
$$;


-- ╔══════════════════════════════════════════════╗
-- ║  D. GRANT 權限                               ║
-- ╚══════════════════════════════════════════════╝

-- anon（未登入）能讀取公開表
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- authenticated（已登入）能操作所有表（RLS 再控制細節）
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

-- 序列權限（INSERT 自動生成 ID 用）
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
