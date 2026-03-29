// GET /api/batch-stock?batch_ids=1,2,3
// 回傳每個預購批次的剩餘可訂數量（使用 reserved 欄位，與下單樂觀鎖一致）

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('batch_ids');
  if (!ids) return NextResponse.json({ data: [] });

  const batchIds = ids.split(',').map(Number).filter(n => !isNaN(n));
  if (batchIds.length === 0) return NextResponse.json({ data: [] });

  const { data: batches } = await supabaseAdmin
    .from('preorder_batches')
    .select('id, limit_qty, reserved')
    .in('id', batchIds);

  const result = (batches ?? []).map(b => ({
    batch_id:  b.id,
    limit_qty: b.limit_qty ?? 0,
    ordered:   b.reserved ?? 0,
    remaining: Math.max(0, (b.limit_qty ?? 0) - (b.reserved ?? 0)),
  }));

  return NextResponse.json({ data: result });
}
