// api/stock  ──  查詢商品可售庫存（公開 API，不需登入）

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('product_ids');
  if (!ids) return NextResponse.json({ data: [] });

  const productIds = ids.split(',').map(Number).filter(n => !isNaN(n));
  if (productIds.length === 0) return NextResponse.json({ data: [] });

  // 查詢商品的 stock_mode 以區分 date_mode
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, stock_mode')
    .in('id', productIds);

  const dateModeIds = (products ?? []).filter((p: any) => p.stock_mode === 'date_mode').map((p: any) => p.id);
  const normalIds   = productIds.filter(id => !dateModeIds.includes(id));

  // 一般商品（stock / preorder）走 inventory 表
  let normalResult: any[] = [];
  if (normalIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('inventory')
      .select('product_id, variant_id, stock, reserved, inventory_mode, max_preorder, reserved_preorder')
      .in('product_id', normalIds);

    normalResult = (data ?? []).map((inv: any) => ({
      product_id: inv.product_id,
      variant_id: inv.variant_id,
      available: Math.max(0,
        inv.inventory_mode === 'preorder'
          ? (inv.max_preorder ?? 0) - (inv.reserved_preorder ?? 0)
          : (inv.stock ?? 0) - (inv.reserved ?? 0)
      ),
    }));
  }

  // date_mode 商品走 product_ship_dates 表
  let dateResult: any[] = [];
  if (dateModeIds.length > 0) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
    const { data: sdData } = await supabaseAdmin
      .from('product_ship_dates')
      .select('id, product_id, variant_id, ship_date, capacity, reserved')
      .in('product_id', dateModeIds)
      .eq('is_open', true)
      .gte('ship_date', today);

    dateResult = (sdData ?? []).map((d: any) => ({
      product_id:   d.product_id,
      variant_id:   d.variant_id,
      ship_date:    d.ship_date,
      ship_date_id: d.id,
      available:    Math.max(0, (d.capacity ?? 0) - (d.reserved ?? 0)),
    }));
  }

  return NextResponse.json({ data: [...normalResult, ...dateResult] });
}
