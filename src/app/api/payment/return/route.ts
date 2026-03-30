// ════════════════════════════════════════════════
// app/api/payment/return/route.ts  ──  綠界付款後使用者導回
//
// 【為什麼需要這個？】
// 使用者在綠界完成付款後，會被導回這個頁面。
// 綠界會用 POST 送來付款結果（跟 webhook 一樣的資料）。
//
// 【跟 notify 有什麼不同？】
// - notify（webhook）：綠界 server → 我們 server（一定會到）
// - return（這個）：透過使用者瀏覽器導回（使用者可能關掉瀏覽器就不會到）
//
// 但是在本地測試時，webhook 打不到 localhost，
// 所以這個 return 就變成更新付款狀態的備案。
//
// 【流程】
//   1. 綠界用 POST 把使用者導回這裡，帶著付款結果
//   2. 我們驗證 CheckMacValue
//   3. 如果付款成功且訂單還沒更新，就更新訂單狀態
//   4. 把使用者 redirect 到訂單查詢頁面
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { verifyEcpayCallback, ATM_INFO_CODES } from '@/lib/ecpay';
import { awardStampsForOrder } from '@/lib/stamps';
import { releaseBatchReserved, releaseShipDateReserved } from '@/lib/batch-stock';

// 綠界「返回商店」有時用 GET 導回，直接轉到訂單查詢頁
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return NextResponse.redirect(`${baseUrl}/order-search`, 303);
}

// ATM_INFO_CODES 從 @/lib/ecpay 匯入

export async function POST(req: NextRequest) {
  // ── 1. 解析綠界送來的資料 ────────────────────────
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  const merchantTradeNo = params.MerchantTradeNo ?? '';
  const rtnCode         = params.RtnCode;
  const tradeNo         = params.TradeNo ?? '';
  const paymentDate     = params.PaymentDate ?? '';

  // 還原訂單編號（加回 -）
  // 格式是 WB(2碼) + YYYYMMDD(8碼) = 前10碼 + '-' + 後6碼（忽略重試後綴）
  const orderNo = merchantTradeNo.slice(0, 10) + '-' + merchantTradeNo.slice(10, 16);

  const isAtmInfo = ATM_INFO_CODES.includes(rtnCode);

  // ── 2. 驗證 CheckMacValue ───────────────────────
  // 當作 webhook 的備案，尤其在本地測試時很有用
  if (verifyEcpayCallback(params)) {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, order_no, total, pay_status, status, member_id, coupon_code')
      .eq('order_no', orderNo)
      .single();

    if (order) {
      // 驗證金額一致（防止竄改；TradeAmt 缺失時也視為不符）
      const tradeAmt = params.TradeAmt;
      const amountMismatch = !tradeAmt || String(order.total) !== tradeAmt;
      if (amountMismatch) {
        console.error(`[return] 金額不符或缺失: 訂單=${order.total}, 綠界=${tradeAmt ?? '(missing)'}`);
      } else if (rtnCode === '1' && order.pay_status !== 'paid') {
        // 付款成功
        await supabaseAdmin
          .from('orders')
          .update({
            pay_status:     'paid',
            ecpay_trade_no: tradeNo,
            paid_at:        paymentDate,
          })
          .eq('id', order.id);

        // 自動集章（用共用函式，內建防重複機制）
        if (order.member_id) {
          await awardStampsForOrder(order.id, order.member_id, order.total);
        }

        console.log(`[return] 訂單 ${orderNo} 付款成功`);
      } else if (isAtmInfo && order.pay_status !== 'paid' && order.status !== 'cancelled') {
        // ATM 取號成功 → 儲存虛擬帳號資訊（不取消訂單，等待轉帳）
        await supabaseAdmin.from('orders').update({
          atm_bank_code:   params.BankCode ?? null,
          atm_vaccount:    params.vAccount ?? null,
          atm_expire_date: params.ExpireDate ?? null,
          ecpay_trade_no:  tradeNo || undefined,
        }).eq('id', order.id);

        console.log(`[return] 訂單 ${orderNo} ATM 取號成功，等待轉帳`);
      } else if (rtnCode !== '1' && !isAtmInfo && order.pay_status !== 'paid' && order.status !== 'cancelled') {
        // 確定付款失敗 → 取消訂單 + 釋放預留庫存（記錄錯誤碼供除錯）
        await supabaseAdmin
          .from('orders')
          .update({
            pay_status: 'failed',
            status: 'cancelled',
            ecpay_error_code: rtnCode ?? null,
            ecpay_error_msg:  params.RtnMsg ?? null,
          })
          .eq('id', order.id);

        const { data: orderItems } = await supabaseAdmin
          .from('order_items')
          .select('product_id, variant_id, qty, ship_date_id')
          .eq('order_id', order.id);

        if (orderItems) {
          const inventoryLogs: any[] = [];

          for (const item of orderItems) {
            // 有 ship_date_id 的項目由 product_ship_dates 管理，跳過 inventory 釋放
            if ((item as any).ship_date_id) continue;

            let query = supabaseAdmin.from('inventory').select('*').eq('product_id', item.product_id);
            if (item.variant_id) query = query.eq('variant_id', item.variant_id);
            else query = query.is('variant_id', null);

            const { data: inv } = await query.single();
            if (!inv) continue;

            let qtyBefore: number;
            let qtyAfter: number;

            if (inv.inventory_mode === 'stock') {
              qtyBefore = inv.reserved;
              qtyAfter = Math.max(0, inv.reserved - item.qty);
              const { data: updated } = await supabaseAdmin.from('inventory')
                .update({ reserved: qtyAfter, updated_at: new Date().toISOString() })
                .eq('id', inv.id)
                .eq('reserved', inv.reserved)
                .select('id');
              if (!updated || updated.length === 0) {
                console.error(`[return] 庫存釋放衝突 inv.id=${inv.id}`);
                continue;
              }
            } else if (inv.inventory_mode === 'preorder') {
              qtyBefore = inv.reserved_preorder;
              qtyAfter = Math.max(0, inv.reserved_preorder - item.qty);
              const { data: updated } = await supabaseAdmin.from('inventory')
                .update({ reserved_preorder: qtyAfter, updated_at: new Date().toISOString() })
                .eq('id', inv.id)
                .eq('reserved_preorder', inv.reserved_preorder)
                .select('id');
              if (!updated || updated.length === 0) {
                console.error(`[return] 庫存釋放衝突 inv.id=${inv.id}`);
                continue;
              }
            } else {
              continue;
            }

            inventoryLogs.push({
              inventory_id: inv.id,
              product_id:   item.product_id,
              variant_id:   item.variant_id ?? null,
              change_type:  'cancel',
              qty_before:   qtyBefore,
              qty_after:    qtyAfter,
              qty_change:   qtyAfter - qtyBefore,
              reason:       `訂單 #${order.id} 付款失敗自動取消`,
              admin_name:   '系統',
              order_id:     order.id,
            });
          }

          if (inventoryLogs.length > 0) {
            await supabaseAdmin.from('inventory_logs').insert(inventoryLogs);
          }
        }

        // 釋放預購批次預留量
        await releaseBatchReserved(order.id);

        // 釋放日期模式預留量
        await releaseShipDateReserved(order.id);

        // 釋放折價券使用次數
        if (order.coupon_code) {
          const { data: coupon } = await supabaseAdmin
            .from('coupons').select('id, used_count').eq('code', order.coupon_code).maybeSingle();
          if (coupon && (coupon.used_count ?? 0) > 0) {
            const { data: couponUpdated } = await supabaseAdmin.from('coupons')
              .update({ used_count: coupon.used_count - 1 })
              .eq('id', coupon.id).eq('used_count', coupon.used_count)
              .select('id');
            if (!couponUpdated || couponUpdated.length === 0) {
              console.error(`[return] 折價券釋放衝突 coupon=${coupon.id}，訂單=${order.order_no}`);
            }
          }
        }

        console.log(`[return] 訂單 ${orderNo} 付款失敗，已取消並釋放庫存`);
      }
    }
  }

  // ── 3. 導回訂單查詢頁面 ─────────────────────────
  // 不管驗證成功與否，都把使用者導回訂單頁面
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const redirectUrl = `${baseUrl}/order-search?no=${encodeURIComponent(orderNo)}`;

  return NextResponse.redirect(redirectUrl, 303);
}
