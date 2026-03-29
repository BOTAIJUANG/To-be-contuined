// GET /api/batch-stock?batch_ids=1,2,3
// 回傳每個預購批次的剩餘可訂數量（從 order_items 實際計算，排除取消訂單）

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('batch_ids');
  if (!ids) return NextResponse.json({ data: [] });

  const batchIds = ids.split(',').map(Number).filter(n => !isNaN(n));
  if (batchIds.length === 0) return NextResponse.json({ data: [] });

  // 查批次上限
  const { data: batches } = await supabaseAdmin
    .from('preorder_batches')
    .select('id, limit_qty')
    .in('id', batchIds);

  // 從 order_items 計算實際已訂量（排除取消訂單）
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('preorder_batch_id, qty, orders!inner(status)')
    .in('preorder_batch_id', batchIds)
    .neq('orders.status', 'cancelled');

  const orderedMap: Record<number, number> = {};
  (items ?? []).forEach((i: any) => {
    orderedMap[i.preorder_batch_id] = (orderedMap[i.preorder_batch_id] ?? 0) + (i.qty ?? 0);
  });

  const result = (batches ?? []).map(b => {
    const ordered = orderedMap[b.id] ?? 0;
    return {
      batch_id:  b.id,
      limit_qty: b.limit_qty ?? 0,
      ordered,
      remaining: Math.max(0, (b.limit_qty ?? 0) - ordered),
    };
  });

  return NextResponse.json({ data: result });
}
