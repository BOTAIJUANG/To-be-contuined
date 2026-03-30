// ════════════════════════════════════════════════
// src/lib/ecpay.ts  ──  綠界 ECPay 金流工具
//
// 【綠界 ECPay 是什麼？】
// 台灣最常用的第三方支付服務之一，
// 幫你處理信用卡、ATM 虛擬帳號等付款方式。
// 你不需要自己跟銀行簽約，綠界幫你代收款項。
//
// 【串接流程簡單說明】
//   1. 使用者按下「確認下單」
//   2. 我們的後端產生一組加密過的付款資料
//   3. 把使用者導向綠界的付款頁面
//   4. 使用者在綠界頁面完成付款
//   5. 綠界「主動」打我們的 API 通知付款結果（這叫 webhook / 回呼）
//   6. 使用者被導回我們的網站
//
// 【CheckMacValue 是什麼？】
// 這是一個「數位簽章」，用來確保資料沒有被竄改。
// 做法：把所有參數排序 → 組成字串 → 加上密鑰 → SHA256 雜湊
// 綠界收到後會用同樣的方法算一次，如果結果一樣就代表資料沒被竄改。
//
// 【重要】
// 下面的 MERCHANT_ID, HASH_KEY, HASH_IV 是測試用的。
// 上線前必須換成你在綠界申請的正式金鑰！
// ════════════════════════════════════════════════

import crypto from 'crypto';

// ── 綠界設定（從環境變數讀取）─────────────────────
// 這些值要去綠界後台申請：https://www.ecpay.com.tw/
// 本地開發時使用測試值；正式環境必須設定環境變數，否則啟動時直接報錯
const isProd = process.env.NODE_ENV === 'production';
const MERCHANT_ID = (process.env.ECPAY_MERCHANT_ID ?? (isProd ? '' : '3002607')).trim();
const HASH_KEY    = (process.env.ECPAY_HASH_KEY    ?? (isProd ? '' : 'pwFHCqoQZGmho4w6')).trim();
const HASH_IV     = (process.env.ECPAY_HASH_IV     ?? (isProd ? '' : 'EkRm7iFT261dpevs')).trim();

if (isProd && (!MERCHANT_ID || !HASH_KEY || !HASH_IV)) {
  throw new Error('ECPay 環境變數未設定（ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV）');
}

// 綠界 API 網址（測試 vs 正式）
const ECPAY_URL = process.env.ECPAY_API_URL
  ?? (isProd ? '' : 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');

if (isProd && !ECPAY_URL) {
  throw new Error('ECPay 環境變數未設定（ECPAY_API_URL）');
}

// ── 產生 CheckMacValue（數位簽章）──────────────────
// 這是綠界要求的加密方式，步驟如下：
//   1. 把所有參數按照 key 的英文字母排序
//   2. 用 & 連接成 key=value 的字串
//   3. 前面加上 HashKey=xxx&，後面加上 &HashIV=xxx
//   4. 做 URL encode（轉換特殊字元）
//   5. 全部轉小寫
//   6. 用 SHA256 雜湊
//   7. 全部轉大寫
export function generateCheckMacValue(params: Record<string, string>): string {
  // 步驟 1：按照 key 排序
  const sorted = Object.keys(params)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(key => `${key}=${params[key]}`)
    .join('&');

  // 步驟 2-3：加上 HashKey 和 HashIV
  const raw = `HashKey=${HASH_KEY}&${sorted}&HashIV=${HASH_IV}`;

  // 步驟 4：URL encode（綠界用的是 .NET 的 URL encode 規則）
  let encoded = encodeURIComponent(raw)
    .replace(/%20/g, '+')
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');

  // 步驟 5：全部轉小寫
  encoded = encoded.toLowerCase();

  // 步驟 6-7：SHA256 雜湊 → 轉大寫
  return crypto
    .createHash('sha256')
    .update(encoded)
    .digest('hex')
    .toUpperCase();
}

// ── 產生綠界付款表單參數 ────────────────────────────
// 這些參數會被送到綠界，綠界會根據這些資料顯示付款頁面
export function buildEcpayParams(options: {
  orderNo:     string;    // 我們的訂單編號
  total:       number;    // 應付金額
  description: string;    // 商品描述（會顯示在綠界付款頁）
  payMethod:   'credit' | 'atm';  // 付款方式
  returnUrl:   string;    // 付款完成後，綠界「主動通知」我們的網址（webhook）
  clientBackUrl: string;  // 付款完成後，使用者「被導回」的網址
  paymentInfoUrl?: string; // ATM/CVS 取號成功時，綠界通知我們的網址
}): { url: string; params: Record<string, string> } {
  // 產生交易時間（格式：yyyy/MM/dd HH:mm:ss）
  const now = new Date();
  const tradeDate = [
    now.getFullYear(),
    '/',
    String(now.getMonth() + 1).padStart(2, '0'),
    '/',
    String(now.getDate()).padStart(2, '0'),
    ' ',
    String(now.getHours()).padStart(2, '0'),
    ':',
    String(now.getMinutes()).padStart(2, '0'),
    ':',
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  // 根據付款方式設定 ChoosePayment
  // Credit = 信用卡，ATM = ATM 虛擬帳號
  const choosePayment = options.payMethod === 'credit' ? 'Credit' : 'ATM';

  // 組合所有參數
  const params: Record<string, string> = {
    MerchantID:        MERCHANT_ID,
    MerchantTradeNo:   options.orderNo.replace(/-/g, ''),  // 綠界不接受 -
    MerchantTradeDate: tradeDate,
    PaymentType:       'aio',           // 固定值，代表 All-In-One
    TotalAmount:       String(options.total),
    TradeDesc:         options.description,
    ItemName:          options.description,
    ReturnURL:         options.returnUrl,       // 綠界通知我們的網址
    ClientBackURL:     options.clientBackUrl,    // 使用者導回的網址
    ChoosePayment:     choosePayment,
    EncryptType:       '1',             // 固定值，代表 SHA256
  };

  // ATM 付款要設定「付款期限」和「取號通知網址」
  if (options.payMethod === 'atm') {
    params.ExpireDate = '3';  // 3 天內要轉帳，否則訂單自動取消
    if (options.paymentInfoUrl) {
      params.PaymentInfoURL = options.paymentInfoUrl;  // ATM 取號成功通知
    }
  }

  // 產生 CheckMacValue（數位簽章）
  params.CheckMacValue = generateCheckMacValue(params);

  return {
    url:    ECPAY_URL,
    params,
  };
}

// ── ATM 取號成功的 RtnCode（不是失敗，不能取消訂單）──
export const ATM_INFO_CODES = ['2', '800', '10100058', '10100073'];

// ── 驗證綠界回傳的 CheckMacValue ────────────────────
// 當綠界通知我們付款結果時，我們要驗證這個通知是真的來自綠界
// （而不是有人偽造的假通知）
export function verifyEcpayCallback(params: Record<string, string>): boolean {
  // 取出綠界傳來的 CheckMacValue
  const receivedMac = params.CheckMacValue;
  if (!receivedMac) return false;

  // 把 CheckMacValue 從參數中移除，然後自己算一次
  const paramsWithoutMac = { ...params };
  delete paramsWithoutMac.CheckMacValue;

  // 用同樣的方法計算，看結果是否一致
  const calculatedMac = generateCheckMacValue(paramsWithoutMac);

  return calculatedMac === receivedMac;
}
