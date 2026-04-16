// lib/export-shipping.ts  ──  黑貓宅急便多筆匯入 Excel 產生器
import * as XLSX from 'xlsx';

// 宅配溫層代碼
const HOME_TEMP: Record<string, number> = {
  home_ambient:      1,
  home_refrigerated: 2,
  home_frozen:       3,
  home:              1, // 舊格式相容
};

// 超商溫層代碼
const CVS_TEMP: Record<string, string> = {
  cvs_ambient: '0001',
  cvs_frozen:  '0003',
  cvs_711:     '0001', // 舊格式相容
};

// 固定寄件人
const SENDER_NAME    = '雷湘婷';
const SENDER_PHONE   = '0963418306';
const SENDER_ADDRESS = '宜蘭縣宜蘭市神農路二段96號';

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  return d.replace(/-/g, '/'); // YYYY-MM-DD → YYYY/MM/DD
}

// 強制文字格式的 cell（避免 Excel 把電話號碼的開頭 0 吃掉）
function textCell(v: string) {
  return { v, t: 's' };
}

function phoneCell(v: string | null | undefined) {
  return textCell(v ?? '');
}

// ── 內部建檔函式 ──────────────────────────────────

function _buildHomeExcel(homeOrders: any[], dateStr: string) {
  const headers = [
    '收件人姓名', '收件人電話', '收件人手機', '收件人地址',
    '代收金額或到付', '件數', '品名(詳參數表)', '備註', '訂單編號',
    '希望配達時間(詳參數表)', '出貨日期(YYYY/MM/DD)', '預定配達日期(YYYY/MM/DD)',
    '溫層(詳參數表)', '尺寸(詳參數表)',
    '寄件人姓名', '寄件人電話', '寄件人手機', '寄件人地址',
    '保值金額(20001~10萬之間)-會產生額外費用-不需要請空白',
    '品名說明', '是否列印(Y/N)', '是否捐贈(Y/N)',
    '統一編號', '手機載具', '愛心碼',
    '可刷卡(Y/N)', '手機支付(Y/N)',
  ];
  const rows = homeOrders.map(o => [
    o.customer_name || o.buyer_name || '',        // 1 收件人姓名
    '',                                           // 2 收件人電話（市話，留空）
    phoneCell(o.customer_phone || o.buyer_phone), // 3 收件人手機
    o.address || '',                          // 4 收件人地址
    '',                                       // 5 代收金額（平台付款，留空）
    1,                                        // 6 件數
    2,                                        // 7 品名類別（名特產/甜點）
    o.note || '',                             // 8 備註
    o.order_no,                               // 9 訂單編號
    '',                                       // 10 希望配達時間（留空）
    fmtDate(o.ship_date),                     // 11 出貨日期
    '',                                       // 12 預定配達日期（留空）
    HOME_TEMP[o.ship_method] ?? 1,            // 13 溫層
    1,                                        // 14 尺寸（60cm）
    SENDER_NAME,                              // 15 寄件人姓名
    SENDER_PHONE,                             // 16 寄件人電話
    SENDER_PHONE,                             // 17 寄件人手機
    SENDER_ADDRESS,                           // 18 寄件人地址
    '',                                       // 19 保值金額（留空）
    '',                                       // 20 品名說明（留空）
    'Y',                                      // 21 是否列印
    'N',                                      // 22 是否捐贈
    '',                                       // 23 統一編號（留空）
    '',                                       // 24 手機載具（留空）
    '',                                       // 25 愛心碼（留空）
    'N',                                      // 26 可刷卡
    'N',                                      // 27 手機支付
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '宅配');
  XLSX.writeFile(wb, `宅配出貨_黑貓_${dateStr}.xlsx`);
}

function _buildCvsExcel(cvsOrders: any[], dateStr: string) {
  const headers = [
    '訂單編號',
    '收件人姓名(必填)',
    '收件人手機(必填)',
    'FB名稱',
    '訂單備註',
    '代收金額(匯款帳戶若填寫，則該欄位不需填寫)',
    '門市編號(必填)',
    '匯款帳戶後五碼(代收金額若填寫，則該欄位不需填寫)',
    '列印張數(範圍為1～10，若有代收金額將會平均分配在託運單上)',
    '溫層(常溫：0001、冷凍：0003、冷藏：0002)',
  ];
  const rows = cvsOrders.map(o => [
    o.order_no,
    o.customer_name || o.buyer_name || '',
    phoneCell(o.customer_phone || o.buyer_phone),
    '',                                      // FB名稱（留空）
    o.note || '',
    '',                                      // 代收金額（留空）
    o.cvs_store_id || '',
    '',                                      // 匯款帳戶後五碼（留空）
    1,                                       // 列印張數
    CVS_TEMP[o.ship_method] ?? '0001',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '超商');
  XLSX.writeFile(wb, `超商出貨_711_${dateStr}.xlsx`);
}

// ── 公開匯出函式 ──────────────────────────────────

/** 宅配出貨單（27 欄）— 僅處理 ship_method 以 home 開頭的訂單 */
export function exportHomeShippingExcel(orders: any[]) {
  const homeOrders = orders.filter(o => (o.ship_method ?? '').startsWith('home'));
  if (homeOrders.length === 0) return;
  _buildHomeExcel(homeOrders, new Date().toISOString().split('T')[0]);
}

/** 超商出貨單（10 欄）— 僅處理 ship_method 以 cvs 開頭的訂單 */
export function exportCvsShippingExcel(orders: any[]) {
  const cvsOrders = orders.filter(o => (o.ship_method ?? '').startsWith('cvs'));
  if (cvsOrders.length === 0) return;
  _buildCvsExcel(cvsOrders, new Date().toISOString().split('T')[0]);
}
