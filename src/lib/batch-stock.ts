// lib/batch-stock.ts  ──  預購批次預留量管理

import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * 釋放訂單佔用的批次預留量
 * 在訂單取消、付款失敗、退款時呼叫
 */
export async function releaseBatchReserved(orderId: number) {
  // 查詢此訂單有哪些預購批次 item
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('preorder_batch_id, qty')
    .eq('order_id', orderId)
    .not('preorder_batch_id', 'is', null);

  if (!items || items.length === 0) return;

  // 按 batch_id 加總
  const batchQtyMap: Record<number, number> = {};
  items.forEach(i => {
    if (!i.preorder_batch_id) return;
    batchQtyMap[i.preorder_batch_id] = (batchQtyMap[i.preorder_batch_id] ?? 0) + i.qty;
  });

  for (const [batchIdStr, qty] of Object.entries(batchQtyMap)) {
    const batchId = Number(batchIdStr);
    const { data: batch } = await supabaseAdmin
      .from('preorder_batches')
      .select('id, reserved')
      .eq('id', batchId)
      .single();

    if (!batch) continue;

    const currentReserved = batch.reserved ?? 0;
    const newReserved = Math.max(0, currentReserved - qty);

    // 樂觀鎖：確保 reserved 未被同時修改
    const { data: updated } = await supabaseAdmin
      .from('preorder_batches')
      .update({ reserved: newReserved })
      .eq('id', batchId)
      .eq('reserved', currentReserved)
      .select('id');

    // 樂觀鎖失敗 → 重讀後重試一次
    if (!updated || updated.length === 0) {
      const { data: retry } = await supabaseAdmin
        .from('preorder_batches')
        .select('id, reserved')
        .eq('id', batchId)
        .single();
      if (retry) {
        const { data: retryResult } = await supabaseAdmin
          .from('preorder_batches')
          .update({ reserved: Math.max(0, (retry.reserved ?? 0) - qty) })
          .eq('id', batchId)
          .eq('reserved', retry.reserved)
          .select('id');
        if (!retryResult || retryResult.length === 0) {
          console.error(`[batch-stock] 批次 ${batchId} 預留釋放重試失敗，訂單 ${orderId}`);
        }
      }
    }
  }
}
