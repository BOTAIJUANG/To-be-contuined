// ════════════════════════════════════════════════
// GET /api/orders/search?no=xxx&contact=xxx
// 公開訂單查詢 API（使用 supabaseAdmin 繞過 RLS）
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const no = req.nextUrl.searchParams.get('no')?.trim().toUpperCase();
  const contact = req.nextUrl.searchParams.get('contact')?.trim();

  if (!no || !contact) {
    return NextResponse.json({ error: '請提供訂單編號與聯絡資訊' }, { status: 400 });
  }

  // 清除 contact 中的特殊字元，防止 PostgREST filter injection
  const safeContact = contact.replace(/[,()."\\]/g, '');

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(`
      order_no, status, created_at, total,
      ship_method, ship_date,
      tracking_no, carrier, shipped_at,
      cvs_store_name, cvs_store_address, cvs_store_brand,
      atm_bank_code, atm_vaccount, atm_expire_date,
      pay_status, pay_method,
      order_items ( name, price, qty )
    `)
    .eq('order_no', no)
    .or(`buyer_email.eq.${safeContact},buyer_phone.eq.${safeContact},customer_email.eq.${safeContact},customer_phone.eq.${safeContact}`)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ data: null });
  }

  return NextResponse.json({ data });
}
