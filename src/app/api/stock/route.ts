// api/stock  ──  查詢商品可售庫存（公開 API，不需登入）

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('product_ids');
  if (!ids) return NextResponse.json({ data: [] });

  const productIds = ids.split(',').map(Number).filter(n => !isNaN(n));
  if (productIds.length === 0) return NextResponse.json({ data: [] });

  const { data } = await supabaseAdmin
    .from('inventory')
    .select('product_id, variant_id, stock, reserved')
    .in('product_id', productIds);

  const result = (data ?? []).map(inv => ({
    product_id: inv.product_id,
    variant_id: inv.variant_id,
    available: Math.max(0, (inv.stock ?? 0) - (inv.reserved ?? 0)),
  }));

  return NextResponse.json({ data: result });
}
