// ════════════════════════════════════════════════
// app/api/inventory/route.ts
//
// 庫存異動 API
// 被以下事件呼叫：
// - POST /api/inventory?action=reserve   → 新增訂單時預留庫存
// - POST /api/inventory?action=ship      → 出貨時扣庫存
// - POST /api/inventory?action=cancel    → 取消訂單時釋放庫存
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 使用 service role key（繞過 RLS，只在 server 端使用）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface OrderItem {
  product_id:  number;
  variant_id?: number | null;
  qty:         number;
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (!action || !['reserve', 'ship', 'cancel'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const body = await req.json();
  const { order_id, items, admin_id, admin_name } = body as {
    order_id:   number;
    items:      OrderItem[];
    admin_id?:  string;
    admin_name?: string;
  };

  if (!order_id || !items?.length) {
    return NextResponse.json({ error: 'Missing order_id or items' }, { status: 400 });
  }

  const errors: string[] = [];

  for (const item of items) {
    // 找對應的庫存記錄
    let query = supabaseAdmin
      .from('inventory')
      .select('*')
      .eq('product_id', item.product_id);

    if (item.variant_id) query = query.eq('variant_id', item.variant_id);
    else                 query = query.is('variant_id', null);

    const { data: inv, error: fetchErr } = await query.single();

    if (fetchErr || !inv) {
      errors.push(`找不到商品 ${item.product_id} 的庫存記錄`);
      continue;
    }

    const isStock    = inv.inventory_mode === 'stock';
    const isPreorder = inv.inventory_mode === 'preorder';

    let updateData: any = {};
    let changeType = '';
    let qtyBefore  = 0;
    let qtyAfter   = 0;
    let logField   = '';

    // ── reserve（新增訂單預留）──────────────────
    if (action === 'reserve') {
      if (isStock) {
        const available = inv.stock - inv.reserved;
        if (available < item.qty) {
          errors.push(`商品 ${inv.product_id} 庫存不足（可售 ${available}，需要 ${item.qty}）`);
          continue;
        }
        updateData  = { reserved: inv.reserved + item.qty };
        changeType  = 'order';
        qtyBefore   = inv.reserved;
        qtyAfter    = inv.reserved + item.qty;
        logField    = 'reserved';
      } else if (isPreorder) {
        if (inv.max_preorder > 0 && inv.reserved_preorder + item.qty > inv.max_preorder) {
          errors.push(`商品 ${inv.product_id} 預購名額不足`);
          continue;
        }
        updateData  = { reserved_preorder: inv.reserved_preorder + item.qty };
        changeType  = 'order';
        qtyBefore   = inv.reserved_preorder;
        qtyAfter    = inv.reserved_preorder + item.qty;
        logField    = 'reserved_preorder';
      }
    }

    // ── ship（出貨扣庫存）──────────────────────
    else if (action === 'ship') {
      if (isStock) {
        updateData  = { stock: inv.stock - item.qty, reserved: Math.max(0, inv.reserved - item.qty) };
        changeType  = 'ship';
        qtyBefore   = inv.stock;
        qtyAfter    = inv.stock - item.qty;
        logField    = 'stock';
      } else if (isPreorder) {
        updateData  = { reserved_preorder: Math.max(0, inv.reserved_preorder - item.qty) };
        changeType  = 'ship';
        qtyBefore   = inv.reserved_preorder;
        qtyAfter    = Math.max(0, inv.reserved_preorder - item.qty);
        logField    = 'reserved_preorder';
      }
    }

    // ── cancel（取消釋放庫存）─────────────────
    else if (action === 'cancel') {
      if (isStock) {
        updateData  = { reserved: Math.max(0, inv.reserved - item.qty) };
        changeType  = 'cancel';
        qtyBefore   = inv.reserved;
        qtyAfter    = Math.max(0, inv.reserved - item.qty);
        logField    = 'reserved';
      } else if (isPreorder) {
        updateData  = { reserved_preorder: Math.max(0, inv.reserved_preorder - item.qty) };
        changeType  = 'cancel';
        qtyBefore   = inv.reserved_preorder;
        qtyAfter    = Math.max(0, inv.reserved_preorder - item.qty);
        logField    = 'reserved_preorder';
      }
    }

    if (!changeType) continue;

    // 更新庫存（Trigger 會自動更新 is_sold_out）
    const { error: updateErr } = await supabaseAdmin
      .from('inventory')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', inv.id);

    if (updateErr) { errors.push(`更新庫存失敗：${updateErr.message}`); continue; }

    // 寫入異動 log
    await supabaseAdmin.from('inventory_logs').insert({
      inventory_id: inv.id,
      product_id:   item.product_id,
      variant_id:   item.variant_id ?? null,
      change_type:  changeType,
      qty_before:   qtyBefore,
      qty_after:    qtyAfter,
      qty_change:   qtyAfter - qtyBefore,
      reason:       `訂單 #${order_id}`,
      admin_id:     admin_id ?? null,
      admin_name:   admin_name ?? '系統',
      order_id,
    });
  }

  if (errors.length > 0) {
    return NextResponse.json({ success: false, errors }, { status: 207 });
  }

  return NextResponse.json({ success: true });
}
