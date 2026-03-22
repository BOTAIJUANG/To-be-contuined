// ════════════════════════════════════════════════
// src/lib/api.ts  ──  前端呼叫後端 API 的工具
//
// 【為什麼需要這個？】
// 加了身份驗證之後，每次呼叫 /api/* 都要帶上登入的 token。
// 每次都手動寫 headers: { Authorization: `Bearer ${token}` } 很煩，
// 所以統一用這個 fetchApi 函式，自動幫你加上 token。
//
// 【使用方式】
//   import { fetchApi } from '@/lib/api'
//
//   // 自動帶上登入 token
//   const res = await fetchApi('/api/redeem?action=cancel', {
//     method: 'POST',
//     body: JSON.stringify({ redemption_id: 123 }),
//   })
// ════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';

// ── fetchApi：帶上 token 的 fetch ─────────────────
// 跟原生的 fetch 用法一模一樣，只是自動幫你加上 Authorization header
export async function fetchApi(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  // 1. 取得目前登入的 token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  // 2. 把 token 加到 headers 裡
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // 3. 呼叫原生的 fetch
  return fetch(url, {
    ...options,
    headers,
  });
}
