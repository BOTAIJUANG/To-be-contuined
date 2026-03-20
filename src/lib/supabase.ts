// ════════════════════════════════════════════════
// src/lib/supabase.ts  ──  Supabase 連線設定
//
// 整個專案只需要這一個檔案來連接資料庫
// 使用方式：
//   import { supabase } from '@/lib/supabase'
//   const { data } = await supabase.from('products').select('*')
// ════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

// 從 .env.local 讀取連線設定
const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 建立並匯出 Supabase client
// 整個專案 import 這個 supabase 物件來操作資料庫
export const supabase = createClient(supabaseUrl, supabaseKey);
