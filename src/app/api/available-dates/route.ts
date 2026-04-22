// ════════════════════════════════════════════════
// app/api/available-dates/route.ts
//
// 計算購物車所有商品可出貨日期的交集
//
// POST body:
// {
//   items: [{ product_id, variant_id, qty }]
// }
//
// 回傳:
// {
//   dates: ['2026-03-26', '2026-03-30'],  // 可選日期
//   noIntersection: false,
//   reason?: string  // 無交集時的說明
// }
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateStockModeDates, fmt } from '@/lib/ship-dates';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface CartItem {
  product_id: number;
  variant_id: number | null;
  qty:        number;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const items: CartItem[] = body.items ?? [];

  if (!items.length) {
    return NextResponse.json({ dates: [], noIntersection: false });
  }

  // 台灣時區今日日期，用 noon+08:00 確保 fmt()/toISOString() 也回傳正確台灣日期
  const twFmt    = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d);
  const todayTW  = twFmt(new Date());
  const today    = new Date(todayTW + 'T12:00:00+08:00'); // noon TW = UTC 04:00，fmt() 正確

  // ── 1. 取得商店設定 ──────────────────────────────
  const { data: settings } = await supabase
    .from('store_settings')
    .select('ship_min_days, ship_max_days, ship_blocked_weekdays, ship_blocked_dates')
    .eq('id', 1)
    .single();

  const shipMinDays     = settings?.ship_min_days ?? 1;
  const shipMaxDays     = settings?.ship_max_days ?? 14;
  const blockedWeekdays = JSON.parse(settings?.ship_blocked_weekdays ?? '["0","6"]') as string[];
  const blockedDates    = JSON.parse(settings?.ship_blocked_dates    ?? '[]')        as string[];

  // ── 2. 取得所有商品資料 ──────────────────────────
  const productIds = [...new Set(items.map(i => i.product_id))];
  const { data: products } = await supabase
    .from('products')
    .select('id, stock_mode, is_preorder, ship_start_date, ship_end_date, ship_blocked_dates')
    .in('id', productIds);

  // ── 3. 預購批次資料 ──────────────────────────────
  const preorderProductIds = (products ?? [])
    .filter((p: any) => p.is_preorder)
    .map((p: any) => p.id);

  let preorderBatches: any[] = [];
  if (preorderProductIds.length > 0) {
    const todayStr = fmt(today);
    const { data } = await supabase
      .from('preorder_batches')
      .select('product_id, variant_id, ship_date')
      .in('product_id', preorderProductIds)
      .eq('is_active', true)
      .or(`starts_at.is.null,starts_at.lte.${todayStr}`)
      .or(`ends_at.is.null,ends_at.gte.${todayStr}`);
    preorderBatches = data ?? [];
  }

  // ── 4. 日期模式商品的可出貨日資料 ───────────────
  const dateModeProductIds = (products ?? [])
    .filter((p: any) => p.stock_mode === 'date_mode' && !p.is_preorder)
    .map((p: any) => p.id);

  let shipDates: any[] = [];
  if (dateModeProductIds.length > 0) {
    const { data } = await supabase
      .from('product_ship_dates')
      .select('product_id, variant_id, ship_date, capacity, reserved, cutoff_time')
      .in('product_id', dateModeProductIds)
      .eq('is_open', true)
      .gt('capacity', 0);
    // 台灣時區最早可選日期（今日 + ship_min_days）
    const minDateDt = new Date(todayTW + 'T12:00:00+08:00');
    minDateDt.setDate(minDateDt.getDate() + shipMinDays);
    const minDateStr = twFmt(minDateDt);

    shipDates = (data ?? []).filter((d: any) => {
      if (d.capacity - d.reserved <= 0) return false;
      if (d.ship_date < minDateStr) return false; // 過去日期或未達最少提前天數
      return true;
    });
  }

  // ── 5. 各商品算出日期集合 ────────────────────────
  // 從 null 開始做交集（null 表示還沒有任何集合）
  let intersection: Set<string> | null = null;

  const intersect = (set: Set<string>) => {
    if (intersection === null) {
      intersection = new Set(set);
    } else {
      for (const d of intersection) {
        if (!set.has(d)) intersection.delete(d);
      }
    }
  };

  for (const item of items) {
    const product = (products ?? []).find((p: any) => p.id === item.product_id);
    if (!product) continue;

    // ── 預購商品 ──────────────────────────────────
    if (product.is_preorder) {
      const matchedBatches = preorderBatches.filter((b: any) =>
        b.product_id === item.product_id &&
        (b.variant_id ?? null) === (item.variant_id ?? null)
      );
      if (matchedBatches.length === 0) {
        // 此預購商品沒有進行中的批次 → 交集為空
        intersect(new Set<string>());
        continue;
      }
      intersect(new Set(matchedBatches.map((b: any) => b.ship_date)));
      continue;
    }

    // ── 日期模式商品 ──────────────────────────────
    if (product.stock_mode === 'date_mode') {
      const availableDates = shipDates
        .filter((d: any) =>
          d.product_id === item.product_id &&
          (d.variant_id ?? null) === (item.variant_id ?? null) &&
          // 確認當天剩餘數量 >= 顧客要買的數量
          (d.capacity - d.reserved) >= item.qty
        )
        .map((d: any) => d.ship_date as string);
      intersect(new Set(availableDates));
      continue;
    }

    // ── 總量模式商品 ──────────────────────────────
    const productBlockedDates = JSON.parse(product.ship_blocked_dates ?? '[]') as string[];
    const stockDates = generateStockModeDates(
      today, shipMinDays, shipMaxDays,
      blockedWeekdays, blockedDates,
      product.ship_start_date,
      product.ship_end_date,
      productBlockedDates,
    );
    intersect(stockDates);
  }

  // ── 6. 排序並回傳 ─────────────────────────────────
  const dates = [...(intersection ?? new Set<string>())].sort();

  if (dates.length === 0) {
    return NextResponse.json({
      dates: [],
      noIntersection: true,
      reason: '您的購物車商品無法安排在同一天出貨，請分開下單或調整購物車內容。',
    });
  }

  return NextResponse.json({ dates, noIntersection: false });
}
