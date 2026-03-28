// GET /api/batch-stock?batch_ids=1,2,3
// 回傳每個預購批次的剩餘可訂數量

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('batch_ids');
  if (!ids) return NextResponse.json({ data: [] });

  const batchIds = ids.split(',').map(Number).filter(n => !isNaN(n));
  if (batchIds.length === 0) return NextResponse.json({ data: [] });

  // 查詢批次基本資訊
  const { data: batches } = await supabaseAdmin
    .from('preorder_batches')
    .select('id, limit_qty')
    .in('id', batchIds);

  if (!batches || batches.length === 0) return NextResponse.json({ data: [] });

  // 查詢每個批次已被訂購的數量（排除已取消的訂單）
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('preorder_batch_id, qty, order_id')
    .in('preorder_batch_id', batchIds);

  // 取得相關訂單的狀態，排除已取消
  const orderIds = [...new Set((items ?? []).map(i => i.order_id))];
  let cancelledIds = new Set<number>();
  if (orderIds.length > 0) {
    const { data: cancelled } = await supabaseAdmin
      .from('orders')
      .select('id')
      .in('id', orderIds)
      .eq('status', 'cancelled');
    cancelledIds = new Set((cancelled ?? []).map(o => o.id));
  }

  // 計算每批次已訂數量
  const orderedByBatch: Record<number, number> = {};
  (items ?? []).forEach(i => {
    if (!i.preorder_batch_id || cancelledIds.has(i.order_id)) return;
    orderedByBatch[i.preorder_batch_id] = (orderedByBatch[i.preorder_batch_id] ?? 0) + i.qty;
  });

  const result = batches.map(b => ({
    batch_id:  b.id,
    limit_qty: b.limit_qty ?? 0,
    ordered:   orderedByBatch[b.id] ?? 0,
    remaining: Math.max(0, (b.limit_qty ?? 0) - (orderedByBatch[b.id] ?? 0)),
  }));

  return NextResponse.json({ data: result });
}
