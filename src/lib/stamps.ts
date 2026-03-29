// ════════════════════════════════════════════════
// src/lib/stamps.ts  ──  付款成功後自動集章
//
// 【為什麼要抽成獨立函式？】
// 付款完成時有兩個地方會觸發：
//   1. webhook（notify） — 綠界 server 主動通知
//   2. 使用者導回（return）— 透過瀏覽器回來
// 這兩個可能幾乎同時發生，如果各自寫集章邏輯，
// 可能會重複集章。所以統一在這裡處理，並加上防重複檢查。
//
// 【防重複機制】
// 在集章前，先檢查 stamp_logs 有沒有這筆訂單的記錄。
// 如果已經有了，代表另一邊已經處理過，就跳過。
// ════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase-server';

export async function awardStampsForOrder(orderId: number, memberId: string, orderTotal: number) {
  try {
    // ── 防重複：檢查這筆訂單是否已經集過章 ─────────
    const { data: existingLog } = await supabaseAdmin
      .from('stamp_logs')
      .select('id')
      .eq('order_id', orderId)
      .eq('reason', '訂單付款完成自動集章')
      .maybeSingle();

    if (existingLog) {
      // 已經集過了，跳過
      console.log(`訂單 ${orderId} 已經集過章，跳過`);
      return;
    }

    // ── 取得集章設定 ──────────────────────────────
    const { data: settings } = await supabaseAdmin
      .from('store_settings')
      .select('stamp_enabled, stamp_threshold, stamp_total_slots')
      .eq('id', 1)
      .single();

    if (!settings?.stamp_enabled) return;

    const threshold = settings.stamp_threshold ?? 200;
    const maxStamps = settings.stamp_total_slots ?? 10;  // 集章卡總格數上限
    let stampsToAdd = Math.floor(orderTotal / threshold);
    if (stampsToAdd <= 0) return;

    // ── 更新會員章數 ──────────────────────────────
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('stamps')
      .eq('id', memberId)
      .single();

    const stampsBefore = member?.stamps ?? 0;

    // 不能超過集章卡上限（例如上限 10，目前 9，要加 3 → 只加到 10）
    if (stampsBefore >= maxStamps) {
      console.log(`會員 ${memberId} 章數已達上限 ${maxStamps}，跳過集章`);
      return;
    }
    stampsToAdd = Math.min(stampsToAdd, maxStamps - stampsBefore);
    const stampsAfter = stampsBefore + stampsToAdd;

    const { data: updated } = await supabaseAdmin
      .from('members')
      .update({ stamps: stampsAfter, stamp_last_updated: new Date().toISOString() })
      .eq('id', memberId)
      .eq('stamps', stampsBefore)
      .select('id');

    if (!updated || updated.length === 0) {
      console.error(`訂單 ${orderId} 集章衝突，跳過`);
      return;
    }

    // ── 寫入集章記錄 ──────────────────────────────
    await supabaseAdmin.from('stamp_logs').insert({
      member_id:     memberId,
      order_id:      orderId,
      change:        stampsToAdd,
      stamps_before: stampsBefore,
      stamps_after:  stampsAfter,
      reason:        '訂單付款完成自動集章',
    });

    console.log(`訂單 ${orderId} 集章成功：+${stampsToAdd} 章`);
  } catch (err) {
    // 集章失敗不影響付款結果
    console.error('自動集章失敗:', err);
  }
}
