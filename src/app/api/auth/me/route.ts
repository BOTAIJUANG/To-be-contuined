// app/api/auth/me/route.ts  ──  取得目前登入者身份 + 角色
//
// GET /api/auth/me
// Header: Authorization: Bearer <token>
// 回傳: { id, name, role }
//
// 1. requireAuth 從 JWT token 驗證「你是誰」（不接受前端傳 userId）
// 2. 用 supabaseAdmin 繞過 RLS 查 members 表的 role
// 3. 前端無法偽造身份，只能查自己的 role

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error; // 401 → token 無效或過期

  const { data: member } = await supabaseAdmin
    .from('members')
    .select('name, role')
    .eq('id', auth.userId)
    .single();

  return NextResponse.json({
    id:   auth.userId,
    name: member?.name ?? null,
    role: member?.role ?? 'user',
  });
}
