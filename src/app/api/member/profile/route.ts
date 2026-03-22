// app/api/member/profile/route.ts  ──  會員資料 API
//
// GET  → 取得自己的會員資料
// POST → 更新自己的會員資料

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  const { data, error } = await supabaseAdmin
    .from('members')
    .select('name, phone, birthday, stamps, stamps_frozen')
    .eq('id', auth.userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: '找不到會員資料' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  const { name, phone, birthday } = await req.json();

  const { error } = await supabaseAdmin
    .from('members')
    .update({ name, phone: phone || null, birthday: birthday || null })
    .eq('id', auth.userId);

  if (error) {
    return NextResponse.json({ error: '更新失敗' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
