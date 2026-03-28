// ════════════════════════════════════════════════
// app/api/payment/notify/route.ts  ──  綠界付款結果通知（Webhook）
//
// 【什麼是 Webhook？】
// 當使用者在綠界完成付款後，綠界會「主動」打這個 API 來通知我們。
// 這跟使用者被導回我們網站是兩件事：
//   - Webhook（這個 API）：server 對 server，一定會送到
//   - 使用者導回：使用者可能中途關掉瀏覽器，不一定會到
// 所以付款狀態更新一定要靠 Webhook，不能靠使用者導回。
//
// 【流程】
//   1. 綠界用 POST 打這個 API，送來付款結果
//   2. 我們先驗證 CheckMacValue（確認是綠界送的，不是偽造的）
//   3. 根據付款結果更新訂單狀態
//   4. 回傳 "1|OK"（綠界要求的固定格式，代表我們收到了）
//
// 【注意】
// 這個 API 不需要使用者登入驗證（因為是綠界打的，不是使用者打的）
// 但是我們用 CheckMacValue 來確認通知的真實性
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { verifyEcpayCallback } from '@/lib/ecpay';
import { awardStampsForOrder } from '@/lib/stamps';

export async function POST(req: NextRequest) {
  console.log('=== ECPay Notify 收到請求 ===');

  // ── 1. 解析綠界送來的資料 ──────────────────────────
  // 綠界用 application/x-www-form-urlencoded 格式送資料
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  console.log('ECPay Notify 參數:', JSON.stringify(params));

  // ── 2. 驗證 CheckMacValue ─────────────────────────
  // 確認這個通知真的是從綠界來的，不是有人偽造的
  if (!verifyEcpayCallback(params)) {
    console.error('ECPay 通知驗證失敗 - CheckMacValue 不符');
    // 就算驗證失敗也要回傳 "0|error"，不然綠界會一直重發
    return new NextResponse('0|CheckMacValue Error', { status: 200 });
  }

  // ── 3. 取出重要資訊 ──────────────────────────────
  const merchantTradeNo = params.MerchantTradeNo;  // 我們的訂單編號（不含 -）
  const rtnCode         = params.RtnCode;          // 付款結果代碼（1 = 成功）
  const rtnMsg          = params.RtnMsg;           // 付款結果訊息
  const tradeNo         = params.TradeNo;          // 綠界的交易編號
  const paymentDate     = params.PaymentDate;      // 付款時間
  const paymentType     = params.PaymentType;      // 付款方式
  const tradeAmt        = params.TradeAmt;         // 交易金額

  console.log(`ECPay 通知: 訂單=${merchantTradeNo}, 結果=${rtnCode}, 訊息=${rtnMsg}`);

  // ── 4. 用訂單編號找到我們的訂單 ──────────────────
  // 送給綠界時我們把 order_no 的 - 去掉了（例：WB20260321-A3K9X2 → WB20260321A3K9X2）
  // 重試時可能加了 4 碼後綴（例：WB20260321A3K9X21234）
  // 格式是 WB(2碼) + YYYYMMDD(8碼) = 前10碼 + '-' + 接下來6碼（忽略後綴）
  const orderNo = merchantTradeNo.slice(0, 10) + '-' + merchantTradeNo.slice(10, 16);

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, order_no, total, status, pay_status, member_id')
    .eq('order_no', orderNo)
    .single();

  if (!order) {
    console.error(`找不到訂單: ${merchantTradeNo}`);
    return new NextResponse('0|Order not found', { status: 200 });
  }

  // 確認金額一致（防止有人竄改金額）
  if (String(order.total) !== tradeAmt) {
    console.error(`金額不符: 訂單=${order.total}, 綠界=${tradeAmt}`);
    return new NextResponse('0|Amount mismatch', { status: 200 });
  }

  // 已經處理過的不要重複處理（綠界可能會重發通知）
  // 也跳過已取消的訂單，避免延遲到的 webhook 把取消的訂單改回 paid
  if (order.pay_status === 'paid' || order.status === 'cancelled') {
    return new NextResponse('1|OK', { status: 200 });
  }

  // ── 5. 更新訂單付款狀態 ──────────────────────────
  // ATM 取號成功的 RtnCode（2, 10100058 等）不是失敗，不能取消訂單
  const ATM_INFO_CODES = ['2', '800', '10100058', '10100073'];
  const isAtmInfo = ATM_INFO_CODES.includes(rtnCode);

  if (rtnCode === '1') {
    // 付款成功！
    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({
        pay_status:     'paid',
        ecpay_trade_no: tradeNo,        // 記錄綠界交易編號（對帳用）
        paid_at:        paymentDate,     // 記錄付款時間
      })
      .eq('id', order.id);

    if (updateErr) {
      console.error('訂單付款狀態更新失敗:', updateErr);
      return new NextResponse('0|DB update error', { status: 200 });
    }

    // 付款成功後自動集章（如果有會員帳號）
    // 用共用函式，內建防重複機制（避免 webhook 和 return 同時集章）
    if (order.member_id) {
      await awardStampsForOrder(order.id, order.member_id, order.total);
    }

    console.log(`訂單 ${order.order_no} 付款成功`);
  } else if (isAtmInfo) {
    // ATM 取號成功 → 儲存虛擬帳號資訊，但不取消訂單
    const bankCode  = params.BankCode ?? null;
    const vAccount  = params.vAccount ?? null;
    const expireDate = params.ExpireDate ?? null;

    await supabaseAdmin.from('orders').update({
      atm_bank_code:   bankCode,
      atm_vaccount:    vAccount,
      atm_expire_date: expireDate,
      ecpay_trade_no:  tradeNo || undefined,
    }).eq('id', order.id);

    console.log(`訂單 ${order.order_no} ATM 取號成功: 銀行=${bankCode}, 帳號=${vAccount}, 期限=${expireDate}`);
  } else {
    // 確定是付款失敗 → 取消訂單 + 釋放預留庫存（記錄錯誤碼供除錯）
    await supabaseAdmin
      .from('orders')
      .update({
        pay_status: 'failed',
        status: 'cancelled',
        ecpay_error_code: rtnCode ?? null,
        ecpay_error_msg:  rtnMsg ?? null,
      })
      .eq('id', order.id);

    // 釋放預留庫存
    const { data: orderItems } = await supabaseAdmin
      .from('order_items')
      .select('product_id, variant_id, qty')
      .eq('order_id', order.id);

    if (orderItems) {
      const inventoryLogs: any[] = [];

      for (const item of orderItems) {
        let query = supabaseAdmin
          .from('inventory')
          .select('*')
          .eq('product_id', item.product_id);
        if (item.variant_id) query = query.eq('variant_id', item.variant_id);
        else query = query.is('variant_id', null);

        const { data: inv } = await query.single();
        if (!inv) continue;

        let qtyBefore: number;
        let qtyAfter: number;

        if (inv.inventory_mode === 'stock') {
          qtyBefore = inv.reserved;
          qtyAfter = Math.max(0, inv.reserved - item.qty);
          await supabaseAdmin.from('inventory')
            .update({ reserved: qtyAfter, updated_at: new Date().toISOString() })
            .eq('id', inv.id);
        } else if (inv.inventory_mode === 'preorder') {
          qtyBefore = inv.reserved_preorder;
          qtyAfter = Math.max(0, inv.reserved_preorder - item.qty);
          await supabaseAdmin.from('inventory')
            .update({ reserved_preorder: qtyAfter, updated_at: new Date().toISOString() })
            .eq('id', inv.id);
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

    console.log(`訂單 ${order.order_no} 付款失敗，已取消並釋放庫存: ${rtnCode} ${rtnMsg}`);
  }

  // ── 6. 回傳 "1|OK" 給綠界 ─────────────────────────
  // 這是綠界要求的固定回傳格式
  // 如果我們不回傳這個，綠界會每隔幾分鐘重新發送通知
  return new NextResponse('1|OK', { status: 200 });
}
