// ════════════════════════════════════════════════
// app/api/email/route.ts  ──  Email 發送 API
//
// 【用途】
// 1. 批次發送（後台通知系統）
// 2. 自動通知（訂單確認、出貨通知、退款通知）
//
// 【API 規格】
// POST /api/email
// Header: Authorization: Bearer <token>（需 admin 權限）
// Body:
//   批次模式：{ action: 'batch', recipients: [{ email, name }], subject, body }
//   自動通知：{ action: 'order_confirm' | 'ship_notify' | 'refund_notify', order_id }
// ════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { sendEmail, renderTemplate, textToHtml } from '@/lib/brevo';

// ── Email 範本 ──────────────────────────────────
const TEMPLATES: Record<string, { subject: string; body: string }> = {
  order_confirm: {
    subject: '【未半甜點】訂單確認 #{{訂單編號}}',
    body: '親愛的 {{姓名}}，\n\n感謝您的訂購！您的訂單 #{{訂單編號}} 已成立。\n\n訂購商品：\n{{商品清單}}\n\n應付金額：NT$ {{總金額}}\n\n我們將盡快為您準備，出貨後會再次通知您。\n\n感謝您的支持！\n未半甜點',
  },
  ship_notify: {
    subject: '【未半甜點】您的訂單 #{{訂單編號}} 已出貨',
    body: '親愛的 {{姓名}}，\n\n您的訂單 #{{訂單編號}} 已出貨！\n\n物流業者：{{物流業者}}\n追蹤號碼：{{追蹤號碼}}\n\n感謝您的支持！\n未半甜點',
  },
  refund_notify: {
    subject: '【未半甜點】訂單 #{{訂單編號}} 退款通知',
    body: '親愛的 {{姓名}}，\n\n您的訂單 #{{訂單編號}} 已完成退款處理。\n\n退款金額：NT$ {{退款金額}}\n退款方式：{{退款方式}}\n\n如有任何問題，歡迎聯繫我們。\n\n未半甜點',
  },
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json();
  const { action } = body;

  // ── 批次發送 ──────────────────────────────────
  if (action === 'batch') {
    const { recipients, subject, body: emailBody } = body;
    if (!recipients?.length || !subject || !emailBody) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 });
    }

    const results: { email: string; ok: boolean; error?: string }[] = [];

    // 逐筆發送（Brevo 免費方案建議逐筆，避免被當垃圾信）
    for (const r of recipients) {
      const rendered = renderTemplate(emailBody, {
        '姓名': r.name ?? '',
        '訂單編號': r.order_no ?? '',
        '商品清單': r.items ?? '',
        '總金額': r.total ?? '',
      });

      const res = await sendEmail({
        to: [{ email: r.email, name: r.name }],
        subject: renderTemplate(subject, {
          '姓名': r.name ?? '',
          '訂單編號': r.order_no ?? '',
        }),
        html: textToHtml(rendered),
      });

      results.push({ email: r.email, ok: res.ok, error: res.error });
    }

    // 寫入發送記錄（失敗不影響主流程）
    try {
      await supabaseAdmin.from('email_logs').insert({
        type: 'batch',
        subject,
        recipient_count: recipients.length,
        success_count: results.filter(r => r.ok).length,
        fail_count: results.filter(r => !r.ok).length,
        admin_id: auth.userId,
      });
    } catch {}

    const failCount = results.filter(r => !r.ok).length;
    return NextResponse.json({
      ok: true,
      sent: results.length,
      failed: failCount,
      results,
    });
  }

  // ── 自動通知（order_confirm / ship_notify / refund_notify）──
  if (['order_confirm', 'ship_notify', 'refund_notify'].includes(action)) {
    const { order_id } = body;
    if (!order_id) {
      return NextResponse.json({ error: '缺少 order_id' }, { status: 400 });
    }

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, order_no, buyer_name, buyer_email, total, carrier, tracking_no, refund_amount, pay_method, order_items(name, qty, price)')
      .eq('id', order_id)
      .single();

    if (!order || !order.buyer_email) {
      return NextResponse.json({ error: '找不到訂單或缺少收件信箱' }, { status: 404 });
    }

    const template = TEMPLATES[action];
    if (!template) {
      return NextResponse.json({ error: '無效的通知類型' }, { status: 400 });
    }

    const itemsList = order.order_items
      ?.map((i: any) => `${i.name} × ${i.qty}　NT$ ${(i.price * i.qty).toLocaleString()}`)
      .join('\n') ?? '';

    const refundMethod = order.pay_method === 'credit' ? '信用卡刷退' : '銀行轉帳';

    const vars: Record<string, string> = {
      '姓名': order.buyer_name ?? '',
      '訂單編號': order.order_no,
      '商品清單': itemsList,
      '總金額': order.total?.toLocaleString() ?? '',
      '物流業者': order.carrier ?? '—',
      '追蹤號碼': order.tracking_no ?? '—',
      '退款金額': order.refund_amount?.toLocaleString() ?? order.total?.toLocaleString() ?? '',
      '退款方式': refundMethod,
    };

    const subject = renderTemplate(template.subject, vars);
    const htmlBody = textToHtml(renderTemplate(template.body, vars));

    const result = await sendEmail({
      to: [{ email: order.buyer_email, name: order.buyer_name }],
      subject,
      html: htmlBody,
    });

    // 寫入發送記錄（失敗不影響主流程）
    try {
      await supabaseAdmin.from('email_logs').insert({
        type: action,
        subject,
        recipient_count: 1,
        success_count: result.ok ? 1 : 0,
        fail_count: result.ok ? 0 : 1,
        order_id: order.id,
        admin_id: auth.userId,
      });
    } catch {}

    if (!result.ok) {
      return NextResponse.json({ error: `Email 發送失敗：${result.error}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, messageId: result.messageId });
  }

  return NextResponse.json({ error: '無效的 action' }, { status: 400 });
}
