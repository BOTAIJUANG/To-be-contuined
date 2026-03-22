// ════════════════════════════════════════════════
// src/lib/supabase-server.ts  ──  後端專用 Supabase client
//
// 【為什麼要分兩個 client？】
//
// 前端用的 supabase.ts：
//   - 使用 ANON_KEY（公開金鑰）
//   - 只能做 RLS 允許的操作（Row Level Security）
//   - 適合：讀取商品、使用者自己的資料
//
// 後端用的 supabase-server.ts（這個檔案）：
//   - 使用 SERVICE_ROLE_KEY（管理員金鑰）
//   - 可以繞過 RLS，做任何操作
//   - 只能在 API route 裡使用，絕對不能暴露到前端
//
// 【使用方式】
//   import { supabaseAdmin } from '@/lib/supabase-server'
// ════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

// 用 SERVICE_ROLE_KEY 建立有完整權限的 client
// 這個 key 絕對不能加 NEXT_PUBLIC_ 前綴，否則會暴露到瀏覽器
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
