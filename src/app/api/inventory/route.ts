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
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';

// 【安全說明】
// 這個 API 使用 supabaseAdmin（有完整權限），
// 所以一定要先驗證呼叫者是 admin，否則任何人都能操作庫存。
// requireAdmin 會檢查：1. 有沒有登入 2. 是不是 admin 角色

interface OrderItem {
  product_id:   number;
  variant_id?:  number | null;
  qty:          number;
  ship_date_id?: number | null;
}

export async function POST(req: NextRequest) {
  // ── 身份驗證：只有 admin 可以操作庫存 ────────────
  // 注意：建立訂單時的庫存預留已經移到 /api/orders 裡面，
  // 由後端直接處理，不再從前端呼叫這個 API。
  // 這個 API 現在只給 admin 後台使用（出貨、取消等）
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (!action || !['reserve', 'ship', 'cancel'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const body = await req.json();
  const { order_id, items: clientItems, admin_id, admin_name } = body as {
    order_id:   number;
    items?:     OrderItem[];
    admin_id?:  string;
    admin_name?: string;
  };

  if (!order_id) {
    return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });
  }

  // 優先用 server 端查 order_items（避免 RLS 讀不到）
  let items: OrderItem[] = clientItems ?? [];
  if (!items.length) {
    const { data } = await supabaseAdmin
      .from('order_items')
      .select('product_id, variant_id, qty, ship_date_id')
      .eq('order_id', order_id);
    items = (data ?? []) as OrderItem[];
  }

  if (!items.length) {
    return NextResponse.json({ error: `找不到訂單 #${order_id} 的明細` }, { status: 400 });
  }

  const errors: string[] = [];

  for (const item of items) {
    // ── date_mode 商品：由 product_ship_dates 管理 ──
    if (item.ship_date_id) {
      const { data: sd } = await supabaseAdmin
        .from('product_ship_dates')
        .select('id, ship_date, capacity, reserved')
        .eq('id', item.ship_date_id)
        .single();

      if (!sd) {
        errors.push(`找不到日期模式記錄 ship_date_id=${item.ship_date_id}`);
        continue;
      }

      const oldReserved = sd.reserved ?? 0;
      let newReserved = oldReserved;
      let changeType = '';

      if (action === 'reserve') {
        newReserved = oldReserved + item.qty;
        if (newReserved > sd.capacity) {
          errors.push(`日期 ${sd.ship_date} 容量不足（剩餘 ${sd.capacity - oldReserved}，需要 ${item.qty}）`);
          continue;
        }
        changeType = 'order';
      } else if (action === 'ship' || action === 'cancel') {
        newReserved = Math.max(0, oldReserved - item.qty);
        changeType = action === 'ship' ? 'ship' : 'cancel';
      }

      const { error: sdErr } = await supabaseAdmin
        .from('product_ship_dates')
        .update({ reserved: newReserved })
        .eq('id', sd.id)
        .eq('reserved', oldReserved);

      if (sdErr) {
        errors.push(`更新日期模式庫存失敗：${sdErr.message}`);
      }
      continue;
    }

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
