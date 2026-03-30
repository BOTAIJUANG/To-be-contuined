// lib/batch-stock.ts  ──  預購批次 & 日期模式預留量管理

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

    // 樂觀鎖：確保 reserved 未被同時修改（NULL 和 0 需分別處理）
    let lockQ = supabaseAdmin
      .from('preorder_batches')
      .update({ reserved: newReserved })
      .eq('id', batchId);
    if (batch.reserved === null || batch.reserved === undefined) {
      lockQ = lockQ.is('reserved', null);
    } else {
      lockQ = lockQ.eq('reserved', currentReserved);
    }
    const { data: updated } = await lockQ.select('id');

    // 樂觀鎖失敗 → 重讀後重試一次
    if (!updated || updated.length === 0) {
      const { data: retry } = await supabaseAdmin
        .from('preorder_batches')
        .select('id, reserved')
        .eq('id', batchId)
        .single();
      if (retry) {
        let retryQ = supabaseAdmin
          .from('preorder_batches')
          .update({ reserved: Math.max(0, (retry.reserved ?? 0) - qty) })
          .eq('id', batchId);
        if (retry.reserved === null || retry.reserved === undefined) {
          retryQ = retryQ.is('reserved', null);
        } else {
          retryQ = retryQ.eq('reserved', retry.reserved);
        }
        const { data: retryResult } = await retryQ.select('id');
        if (!retryResult || retryResult.length === 0) {
          console.error(`[batch-stock] 批次 ${batchId} 預留釋放重試失敗，訂單 ${orderId}`);
        }
      }
    }
  }
}

/**
 * 釋放訂單佔用的日期模式預留量
 * 在訂單取消、付款失敗、退款時呼叫
 */
export async function releaseShipDateReserved(orderId: number) {
  // 查訂單的 ship_date 和商品（含 ship_date_id）
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('ship_date')
    .eq('id', orderId)
    .single();

  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('product_id, variant_id, qty, ship_date_id')
    .eq('order_id', orderId)
    .eq('is_gift', false);
  if (!items || items.length === 0) return;

  // 查哪些商品是 date_mode
  const productIds = [...new Set(items.map(i => i.product_id))];
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, stock_mode')
    .in('id', productIds)
    .eq('stock_mode', 'date_mode');
  if (!products || products.length === 0) return;

  const dateModeIds = new Set(products.map(p => p.id));

  for (const item of items) {
    if (!dateModeIds.has(item.product_id)) continue;

    let rec: any = null;

    // 優先用 ship_date_id 精確查詢
    if ((item as any).ship_date_id) {
      const { data: directRec } = await supabaseAdmin
        .from('product_ship_dates')
        .select('id, reserved')
        .eq('id', (item as any).ship_date_id)
        .single();
      rec = directRec;
    }

    // fallback: 用 order.ship_date + product_id + variant_id 匹配
    if (!rec && order?.ship_date) {
      const { data: fallbackRec } = await supabaseAdmin
        .from('product_ship_dates')
        .select('id, reserved')
        .eq('product_id', item.product_id)
        .eq('ship_date', order.ship_date)
        .is('variant_id', item.variant_id ?? null)
        .single();
      rec = fallbackRec;
    }

    if (!rec) continue;

    const currentReserved = rec.reserved ?? 0;
    const newReserved = Math.max(0, currentReserved - item.qty);

    let lockQ = supabaseAdmin
      .from('product_ship_dates')
      .update({ reserved: newReserved })
      .eq('id', rec.id);
    // NULL safe 樂觀鎖
    if (rec.reserved === null || rec.reserved === undefined) {
      lockQ = lockQ.is('reserved', null);
    } else {
      lockQ = lockQ.eq('reserved', currentReserved);
    }
    const { data: updated } = await lockQ.select('id');

    if (!updated || updated.length === 0) {
      // 樂觀鎖失敗 → 重讀重試一次
      const { data: retry } = await supabaseAdmin
        .from('product_ship_dates')
        .select('id, reserved')
        .eq('id', rec.id)
        .single();
      if (retry) {
        let retryQ = supabaseAdmin
          .from('product_ship_dates')
          .update({ reserved: Math.max(0, (retry.reserved ?? 0) - item.qty) })
          .eq('id', retry.id);
        if (retry.reserved === null || retry.reserved === undefined) {
          retryQ = retryQ.is('reserved', null);
        } else {
          retryQ = retryQ.eq('reserved', retry.reserved);
        }
        const { data: retryResult } = await retryQ.select('id');
        if (!retryResult || retryResult.length === 0) {
          console.error(`[batch-stock] 日期預留 ${rec.id} 釋放重試失敗，訂單 ${orderId}`);
        }
      }
    }
  }
}
