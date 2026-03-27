// ════════════════════════════════════════════════
// lib/brevo.ts  ──  Brevo (formerly Sendinblue) Email 工具
//
// 使用 Brevo Transactional Email API v3 發送 Email。
// 不需要安裝額外套件，直接用 fetch 呼叫 REST API。
//
// 【使用方式】
//   import { sendEmail } from '@/lib/brevo'
//
//   await sendEmail({
//     to: [{ email: 'buyer@example.com', name: '王小明' }],
//     subject: '訂單確認',
//     html: '<p>感謝您的訂購！</p>',
//   })
// ════════════════════════════════════════════════

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendEmailOptions {
  to: EmailRecipient[];
  subject: string;
  html: string;
  textContent?: string;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey      = (process.env.BREVO_API_KEY ?? '').trim();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL ?? '').trim();
  const senderName  = (process.env.BREVO_SENDER_NAME ?? '未半甜點').trim();

  if (!apiKey) {
    const brevoKeys = Object.keys(process.env).filter(k => k.includes('BREVO'));
    return { ok: false, error: `BREVO_API_KEY 未設定 (found env: ${brevoKeys.join(', ') || 'none'})` };
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: options.to,
        subject: options.subject,
        htmlContent: options.html,
        ...(options.textContent ? { textContent: options.textContent } : {}),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { ok: true, messageId: data.messageId };
    }

    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.message ?? `HTTP ${res.status}`;
    console.error('[brevo] 發送失敗:', errMsg);
    return { ok: false, error: errMsg };
  } catch (err: any) {
    console.error('[brevo] 發送錯誤:', err);
    return { ok: false, error: err.message ?? '未知錯誤' };
  }
}

// ── Email 範本：變數替換 ─────────────────────────
// 把 {{姓名}} {{訂單編號}} 等佔位符替換成實際值
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// ── 純文字 → 簡單 HTML ──────────────────────────
// 把換行轉成 <br>，用於將範本文字轉成 HTML
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.8; color: #333;">${escaped.replace(/\n/g, '<br>')}</div>`;
}
