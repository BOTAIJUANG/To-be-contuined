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

  // 不再過濾 is_gift，因為 date_mode 贈品也有 ship_date_id 需要釋放
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('product_id, variant_id, qty, ship_date_id')
    .eq('order_id', orderId);
  if (!items || items.length === 0) return;

  // 只處理有 ship_date_id 的項目（不靠 products.stock_mode，因為商品可能已切回總量模式）
  const dateModeItems = items.filter(i => (i as any).ship_date_id);
  if (dateModeItems.length === 0) return;

  for (const item of dateModeItems) {

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
      let fbQuery = supabaseAdmin
        .from('product_ship_dates')
        .select('id, reserved')
        .eq('product_id', item.product_id)
        .eq('ship_date', order.ship_date);
      if (item.variant_id) fbQuery = fbQuery.eq('variant_id', item.variant_id);
      else fbQuery = fbQuery.is('variant_id', null);
      const { data: fallbackRec } = await fbQuery.single();
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
