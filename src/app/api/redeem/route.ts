// ════════════════════════════════════════════════
// app/api/redeem/route.ts
//
// 兌換系統 API
//
// POST /api/redeem?action=create   → 建立兌換（線上或現場）
// POST /api/redeem?action=cancel   → 取消兌換（released）
// POST /api/redeem?action=use      → 訂單完成後正式扣章
// POST /api/redeem?action=refund   → 已完成訂單退款歸還章
// POST /api/redeem?action=verify   → 核銷現場兌換碼
// GET  /api/redeem?member_id=xxx   → 取得會員目前兌換狀態
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";

// 【安全說明】
// 兌換 API 有些操作需要登入（create, cancel），
// 有些操作需要 admin 權限（verify, refund）。
// 每個 action 裡面會做不同等級的驗證。

// 為了不影響現有程式碼，把 supabaseAdmin 也叫做 supabase
const supabase = supabaseAdmin;

// ── 產生現場兌換碼 ────────────────────────────────
function generateRedeemCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 排除易混淆字元 0/O/1/I
  let code = "WB-";
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  array.forEach((b) => {
    code += chars[b % chars.length];
  });
  return code;
}

// ── GET：取得會員目前兌換狀態 ────────────────────
// 需要登入，而且只能查自己的兌換記錄
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  const memberId = req.nextUrl.searchParams.get("member_id");
  if (!memberId)
    return NextResponse.json({ error: "Missing member_id" }, { status: 400 });

  // 只能查自己的兌換記錄（防止偷看別人的）
  if (memberId !== auth.userId) {
    return NextResponse.json({ error: "無權查看" }, { status: 403 });
  }

  const { data } = await supabase
    .from("redemptions")
    .select("*, redeem_items(name, stamps)")
    .eq("member_id", memberId)
    .in("status", ["pending_cart", "pending_order"])
    .order("created_at", { ascending: false });

  return NextResponse.json({ redemptions: data ?? [] });
}

// ── POST ──────────────────────────────────────────
// 不同的 action 需要不同的權限等級：
//   - create, cancel：需要登入（一般會員就可以）
//   - verify, refund：需要 admin（只有管理員可以核銷和退款）
//   - use, update_order：需要登入（系統內部呼叫）
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  const body = await req.json();

  // 需要 admin 權限的操作
  if (action === "verify" || action === "refund") {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;
  }
  // 其他操作至少需要登入
  else {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
  }

  switch (action) {
    case "create":
      return handleCreate(body);
    case "cancel":
      return handleCancel(body);
    case "use":
      return handleUse(body);
    case "refund":
      return handleRefund(body);
    case "verify":
      return handleVerify(body);
    case "update_order":
      return handleUpdateOrder(body);
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}

// ── create：建立兌換 ─────────────────────────────
async function handleCreate({
  member_id,
  reward_id,
  type,
}: {
  member_id: string;
  reward_id: number;
  type: "online" | "code";
}) {
  if (!member_id || !reward_id || !type) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  // 1. 取得兌換獎勵
  const { data: reward } = await supabase
    .from("redeem_items")
    .select("id, name, stamps, is_active")
    .eq("id", reward_id)
    .single();

  if (!reward?.is_active) {
    return NextResponse.json(
      { error: "此兌換獎勵不存在或已停用" },
      { status: 400 },
    );
  }

  // 2. 取得會員章數
  const { data: member } = await supabase
    .from("members")
    .select("id, stamps, stamps_frozen")
    .eq("id", member_id)
    .single();

  if (!member)
    return NextResponse.json({ error: "找不到會員" }, { status: 404 });

  // 3. 檢查可用章數是否足夠
  const availableStamps = (member.stamps ?? 0) - (member.stamps_frozen ?? 0);
  if (availableStamps < reward.stamps) {
    return NextResponse.json(
      {
        error: `可用章數不足（可用 ${availableStamps} 章，需要 ${reward.stamps} 章）`,
      },
      { status: 400 },
    );
  }

  // 4. 取得商店設定
  const { data: settings } = await supabase
    .from("store_settings")
    .select("redeem_online_expiry_days, redeem_code_expiry_minutes")
    .eq("id", 1)
    .single();

  // 5. 計算 expires_at
  const now = new Date();
  const expiresAt = new Date(now);
  if (type === "online") {
    expiresAt.setDate(
      expiresAt.getDate() + (settings?.redeem_online_expiry_days ?? 30),
    );
  } else {
    expiresAt.setMinutes(
      expiresAt.getMinutes() + (settings?.redeem_code_expiry_minutes ?? 120),
    );
  }

  // 6. 產生兌換碼（現場用）
  const redeemCode = type === "code" ? generateRedeemCode() : null;

  // 7. 建立 redemption
  const { data: redemption, error } = await supabase
    .from("redemptions")
    .insert({
      member_id,
      reward_id,
      stamps_cost: reward.stamps,
      status: "pending_cart",
      type,
      redeem_code: redeemCode,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    // unique index 衝突
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "您已有此獎勵的未完成兌換" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 8. 凍結章數
  await supabase
    .from("members")
    .update({ stamps_frozen: (member.stamps_frozen ?? 0) + reward.stamps })
    .eq("id", member_id);

  return NextResponse.json({
    ok: true,
    redemption_id: redemption.id,
    redeem_code: redeemCode,
    expires_at: expiresAt.toISOString(),
    stamps_cost: reward.stamps,
    reward_name: reward.name,
  });
}

// ── cancel：主動取消兌換 ─────────────────────────
async function handleCancel({ redemption_id }: { redemption_id: number }) {
  if (!redemption_id)
    return NextResponse.json(
      { error: "Missing redemption_id" },
      { status: 400 },
    );

  const { data: redemption } = await supabase
    .from("redemptions")
    .select("*")
    .eq("id", redemption_id)
    .single();

  if (!redemption)
    return NextResponse.json({ error: "找不到兌換記錄" }, { status: 404 });
  if (!["pending_cart", "pending_order"].includes(redemption.status)) {
    return NextResponse.json({ error: "此兌換無法取消" }, { status: 400 });
  }

  // 更新狀態
  await supabase
    .from("redemptions")
    .update({ status: "released", updated_at: new Date().toISOString() })
    .eq("id", redemption_id);

  // 解凍章數
  const { data: member } = await supabase
    .from("members")
    .select("stamps_frozen")
    .eq("id", redemption.member_id)
    .single();
  await supabase
    .from("members")
    .update({
      stamps_frozen: Math.max(
        0,
        (member?.stamps_frozen ?? 0) - redemption.stamps_cost,
      ),
    })
    .eq("id", redemption.member_id);

  return NextResponse.json({ ok: true });
}

// ── use：訂單完成後正式扣章 ─────────────────────
async function handleUse({
  redemption_id,
  order_id,
}: {
  redemption_id: number;
  order_id: number;
}) {
  if (!redemption_id || !order_id)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const { data: redemption } = await supabase
    .from("redemptions")
    .select("*")
    .eq("id", redemption_id)
    .single();

  if (!redemption)
    return NextResponse.json({ error: "找不到兌換記錄" }, { status: 404 });
  if (redemption.status !== "pending_order") {
    return NextResponse.json(
      { error: `無效狀態：${redemption.status}` },
      { status: 400 },
    );
  }

  // 更新 redemption
  await supabase
    .from("redemptions")
    .update({
      status: "used",
      order_id,
      used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", redemption_id);

  // 正式扣章：stamps -= X，stamps_frozen -= X
  const { data: member } = await supabase
    .from("members")
    .select("stamps, stamps_frozen")
    .eq("id", redemption.member_id)
    .single();
  await supabase
    .from("members")
    .update({
      stamps: Math.max(0, (member?.stamps ?? 0) - redemption.stamps_cost),
      stamps_frozen: Math.max(
        0,
        (member?.stamps_frozen ?? 0) - redemption.stamps_cost,
      ),
    })
    .eq("id", redemption.member_id);

  // 寫入 stamp_log
  await supabase.from("stamp_logs").insert({
    member_id: redemption.member_id,
    order_id,
    change: -redemption.stamps_cost,
    stamps_before: member?.stamps ?? 0,
    stamps_after: Math.max(0, (member?.stamps ?? 0) - redemption.stamps_cost),
    reason: "兌換獎勵扣章",
  });

  return NextResponse.json({ ok: true });
}

// ── refund：已完成訂單退款歸還章 ────────────────
async function handleRefund({ redemption_id }: { redemption_id: number }) {
  if (!redemption_id)
    return NextResponse.json(
      { error: "Missing redemption_id" },
      { status: 400 },
    );

  const { data: redemption } = await supabase
    .from("redemptions")
    .select("*")
    .eq("id", redemption_id)
    .single();

  if (!redemption)
    return NextResponse.json({ error: "找不到兌換記錄" }, { status: 404 });
  if (redemption.status !== "used") {
    return NextResponse.json(
      { error: "此兌換尚未完成，無需退款歸還" },
      { status: 400 },
    );
  }

  // 更新狀態
  await supabase
    .from("redemptions")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("id", redemption_id);

  // 歸還章數（不動 stamps_frozen，因為已經是 used 狀態，frozen 早就歸 0）
  const { data: member } = await supabase
    .from("members")
    .select("stamps")
    .eq("id", redemption.member_id)
    .single();
  await supabase
    .from("members")
    .update({
      stamps: (member?.stamps ?? 0) + redemption.stamps_cost,
    })
    .eq("id", redemption.member_id);

  // 寫入 stamp_log
  await supabase.from("stamp_logs").insert({
    member_id: redemption.member_id,
    order_id: redemption.order_id,
    change: redemption.stamps_cost,
    stamps_before: member?.stamps ?? 0,
    stamps_after: (member?.stamps ?? 0) + redemption.stamps_cost,
    reason: "兌換退款歸還章數",
  });

  return NextResponse.json({ ok: true });
}

// ── update_order：訂單建立後綁定 order_id ────────
async function handleUpdateOrder({
  redemption_id,
  order_id,
}: {
  redemption_id: number;
  order_id: number;
}) {
  if (!redemption_id || !order_id)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const { data: redemption } = await supabase
    .from("redemptions")
    .select("*")
    .eq("id", redemption_id)
    .single();
  if (!redemption)
    return NextResponse.json({ error: "找不到兌換記錄" }, { status: 404 });
  if (redemption.status !== "pending_cart")
    return NextResponse.json(
      { error: `無效狀態：${redemption.status}` },
      { status: 400 },
    );

  await supabase
    .from("redemptions")
    .update({
      status: "pending_order",
      order_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", redemption_id);

  return NextResponse.json({ ok: true });
}

// ── verify：核銷現場兌換碼 ───────────────────────
async function handleVerify({
  redeem_code,
  admin_id,
}: {
  redeem_code: string;
  admin_id: string;
}) {
  if (!redeem_code)
    return NextResponse.json({ error: "Missing redeem_code" }, { status: 400 });

  const { data: redemption } = await supabase
    .from("redemptions")
    .select(
      "*, members(name, phone, stamps, stamps_frozen), redeem_items(name, stamps)",
    )
    .eq("redeem_code", redeem_code.toUpperCase())
    .single();

  if (!redemption)
    return NextResponse.json({ error: "找不到此兌換碼" }, { status: 404 });

  // 檢查狀態
  if (redemption.status === "used")
    return NextResponse.json({ error: "此兌換碼已核銷" }, { status: 400 });
  if (redemption.status === "expired")
    return NextResponse.json({ error: "此兌換碼已過期" }, { status: 400 });
  if (redemption.status === "released")
    return NextResponse.json({ error: "此兌換碼已取消" }, { status: 400 });
  if (redemption.status !== "pending_cart")
    return NextResponse.json(
      { error: `無效狀態：${redemption.status}` },
      { status: 400 },
    );

  // 檢查是否過期
  if (new Date(redemption.expires_at) < new Date()) {
    // 自動過期處理
    await supabase
      .from("redemptions")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", redemption.id);
    const { data: member } = await supabase
      .from("members")
      .select("stamps_frozen")
      .eq("id", redemption.member_id)
      .single();
    await supabase
      .from("members")
      .update({
        stamps_frozen: Math.max(
          0,
          (member?.stamps_frozen ?? 0) - redemption.stamps_cost,
        ),
      })
      .eq("id", redemption.member_id);
    return NextResponse.json({ error: "此兌換碼已過期" }, { status: 400 });
  }

  // 核銷：直接 used（現場不需要 pending_order）
  await supabase
    .from("redemptions")
    .update({
      status: "used",
      used_at: new Date().toISOString(),
      admin_id: admin_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", redemption.id);

  // 正式扣章
  const { data: member } = await supabase
    .from("members")
    .select("stamps, stamps_frozen")
    .eq("id", redemption.member_id)
    .single();
  await supabase
    .from("members")
    .update({
      stamps: Math.max(0, (member?.stamps ?? 0) - redemption.stamps_cost),
      stamps_frozen: Math.max(
        0,
        (member?.stamps_frozen ?? 0) - redemption.stamps_cost,
      ),
    })
    .eq("id", redemption.member_id);

  // 寫入 stamp_log
  await supabase.from("stamp_logs").insert({
    member_id: redemption.member_id,
    change: -redemption.stamps_cost,
    stamps_before: member?.stamps ?? 0,
    stamps_after: Math.max(0, (member?.stamps ?? 0) - redemption.stamps_cost),
    reason: `現場兌換核銷（${redeem_code}）`,
  });

  return NextResponse.json({
    ok: true,
    member_name: (redemption.members as any)?.name,
    reward_name: (redemption.redeem_items as any)?.name,
    stamps_used: redemption.stamps_cost,
  });
}
