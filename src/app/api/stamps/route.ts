// ════════════════════════════════════════════════
// app/api/stamps/route.ts
//
// 自動集章 API
// POST /api/stamps?action=add    → 訂單完成時加章
// POST /api/stamps?action=deduct → 取消/退款時扣章
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';

// 【安全說明】
// 集章 API 只能由 admin 或系統內部呼叫。
// 一般使用者的集章已經在付款成功的 webhook (/api/payment/notify) 裡自動處理了。
// 這個 API 現在保留給 admin 手動加/扣章使用。

// 為了不影響現有程式碼，把 supabaseAdmin 也叫做 supabase
const supabase = supabaseAdmin;

export async function POST(req: NextRequest) {
  // ── 身份驗證：只有 admin 可以手動操作集章 ─────────
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action'); // 'add' | 'deduct'

  if (!action || !['add', 'deduct'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const { order_id } = await req.json();
  if (!order_id) return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });

  // ── 1. 取得訂單資料 ──────────────────────────────
  const { data: order } = await supabase
    .from('orders')
    .select('id, member_id, total, pay_status')
    .eq('id', order_id)
    .single();

  if (!order || !order.member_id) {
    return NextResponse.json({ ok: false, reason: '無會員帳號，不計算集章' });
  }

  // ── 2. 取得集章設定 ──────────────────────────────
  const { data: settings } = await supabase
    .from('store_settings')
    .select('stamp_enabled, stamp_threshold, stamp_total_slots')
    .eq('id', 1)
    .single();

  if (!settings?.stamp_enabled) {
    return NextResponse.json({ ok: false, reason: '集章系統未啟用' });
  }

  const threshold = settings.stamp_threshold ?? 200;
  const maxStamps = settings.stamp_total_slots ?? 10;  // 集章卡總格數上限

  // ── 3. 計算章數 ──────────────────────────────────
  let stampsToChange = Math.floor(order.total / threshold);
  if (stampsToChange <= 0) {
    return NextResponse.json({ ok: false, reason: '消費金額不足一章' });
  }

  // ── 4. 取得會員目前章數 ──────────────────────────
  const { data: member } = await supabase
    .from('members')
    .select('id, stamps')
    .eq('id', order.member_id)
    .single();

  if (!member) return NextResponse.json({ error: '找不到會員' }, { status: 404 });

  const stampsBefore = member.stamps ?? 0;
  let   stampsAfter: number;

  if (action === 'add') {
    // 不能超過集章卡上限
    if (stampsBefore >= maxStamps) {
      return NextResponse.json({ ok: false, reason: `章數已達上限 ${maxStamps}` });
    }
    stampsToChange = Math.min(stampsToChange, maxStamps - stampsBefore);
    stampsAfter = stampsBefore + stampsToChange;
  } else {
    // deduct：扣回章數，最低為 0
    stampsAfter = Math.max(0, stampsBefore - stampsToChange);
  }

  // ── 5. 更新會員章數 ──────────────────────────────
  await supabase.from('members').update({
    stamps:             stampsAfter,
    stamp_last_updated: new Date().toISOString(),
  }).eq('id', order.member_id);

  // ── 6. 寫入集章記錄 ──────────────────────────────
  await supabase.from('stamp_logs').insert({
    member_id:     order.member_id,
    order_id:      order_id,
    change:        action === 'add' ? stampsToChange : -stampsToChange,
    stamps_before: stampsBefore,
    stamps_after:  stampsAfter,
    reason:        action === 'add' ? '訂單完成自動集章' : '訂單取消／退款扣章',
  });

  return NextResponse.json({
    ok:            true,
    stamps_before: stampsBefore,
    stamps_after:  stampsAfter,
    change:        action === 'add' ? stampsToChange : -stampsToChange,
  });
}
