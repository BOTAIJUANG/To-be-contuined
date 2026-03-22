// ════════════════════════════════════════════════
// src/lib/auth.ts  ──  API 路由的身份驗證工具
//
// 【用途】
// 在 API route 裡面驗證「誰在呼叫這個 API」。
// 沒有這個驗證，任何人都能直接打你的 API 來竄改資料。
//
// 【使用方式】
//   import { requireAuth, requireAdmin } from '@/lib/auth'
//
//   // 在 API route 裡：
//   const auth = await requireAuth(req)     // 要求登入
//   const auth = await requireAdmin(req)    // 要求 admin
//
//   if (auth.error) return auth.error       // 沒通過就直接回傳錯誤
//   const userId = auth.userId              // 通過後就能拿到使用者 ID
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 建立一個有 admin 權限的 Supabase client（只在 server 端使用）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── 驗證結果的型別 ───────────────────────────────
// 成功時回傳 userId，失敗時回傳 error（一個可以直接 return 的 Response）
type AuthResult =
  | { userId: string; error?: undefined }
  | { userId?: undefined; error: NextResponse };

// ── requireAuth：要求使用者必須登入 ──────────────
// 從 request header 裡讀取 Authorization token，
// 然後用 Supabase 驗證這個 token 是否有效。
export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  // 1. 從 header 取得 token（格式：Bearer xxxxx）
  const token = req.headers.get('authorization')?.replace('Bearer ', '');

  if (!token) {
    // 沒帶 token → 代表沒有登入
    return {
      error: NextResponse.json(
        { error: '請先登入' },
        { status: 401 },  // 401 = 未授權
      ),
    };
  }

  // 2. 用 Supabase 驗證這個 token 對應的使用者
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    // token 無效或過期
    return {
      error: NextResponse.json(
        { error: '登入已過期，請重新登入' },
        { status: 401 },
      ),
    };
  }

  // 3. 驗證通過，回傳使用者 ID
  return { userId: user.id };
}

// ── requireAdmin：要求使用者必須是管理員 ─────────
// 先檢查有沒有登入，再去 members 表查這個人是不是 admin。
export async function requireAdmin(req: NextRequest): Promise<AuthResult> {
  // 1. 先做一般登入驗證
  const auth = await requireAuth(req);
  if (auth.error) return auth;  // 沒登入就直接擋

  // 2. 查這個人在 members 表的角色
  const { data: member } = await supabaseAdmin
    .from('members')
    .select('role')
    .eq('id', auth.userId)
    .single();

  if (member?.role !== 'admin') {
    // 不是 admin → 沒有權限
    return {
      error: NextResponse.json(
        { error: '權限不足，需要管理員身份' },
        { status: 403 },  // 403 = 禁止存取（有登入但沒權限）
      ),
    };
  }

  // 3. 是 admin，通過
  return { userId: auth.userId };
}
