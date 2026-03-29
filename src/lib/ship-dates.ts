// ════════════════════════════════════════════════
// lib/ship-dates.ts — 出貨日期計算共用函式
//
// 由 /api/available-dates 和 /api/orders 共用
// ════════════════════════════════════════════════

/** 把日期字串 (YYYY-MM-DD) 轉成 Date */
export const toDate = (s: string) => new Date(s + 'T00:00:00');

/** 格式化 Date 成 YYYY-MM-DD */
export const fmt = (d: Date) => d.toISOString().split('T')[0];

/**
 * 產生「總量模式」商品的可選出貨日期集合
 *
 * 根據店家出貨設定（最少/最多天數、封鎖星期、封鎖日期）
 * 以及商品層級覆蓋（ship_start_date, ship_end_date, ship_blocked_dates）
 * 算出所有合法日期的 Set<string>
 */
export function generateStockModeDates(
  today:           Date,
  shipMinDays:     number,
  shipMaxDays:     number,
  blockedWeekdays: string[],  // ['0','6'] = 週日、週六
  blockedDates:    string[],  // ['2026-04-04']
  productStartDate?: string | null,
  productEndDate?:   string | null,
  productBlockedDates?: string[],
): Set<string> {
  const result = new Set<string>();

  // 計算起訖日
  const start = new Date(today);
  start.setDate(start.getDate() + shipMinDays);

  const end = new Date(today);
  end.setDate(end.getDate() + shipMaxDays);

  // 商品層級覆蓋
  const effectiveStart = productStartDate ? toDate(productStartDate) : start;
  const effectiveEnd   = productEndDate   ? toDate(productEndDate)   : end;

  // 合併封鎖日期
  const allBlocked = new Set([...blockedDates, ...(productBlockedDates ?? [])]);

  // 逐日生成
  const cur = new Date(Math.max(effectiveStart.getTime(), start.getTime()));
  while (cur <= effectiveEnd && cur <= end) {
    const dateStr   = fmt(cur);
    const weekday   = String(cur.getDay()); // 0=週日, 6=週六
    const isBlocked = blockedWeekdays.includes(weekday) || allBlocked.has(dateStr);
    if (!isBlocked) result.add(dateStr);
    cur.setDate(cur.getDate() + 1);
  }

  return result;
}
