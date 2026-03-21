// ════════════════════════════════════════════════
// app/layout.tsx  ──  全站共用版型
//
// - 從 store_settings 動態讀取 SEO metadata
// - 注入 GA4 / FB Pixel / GTM 追蹤代碼
// - 套用色彩主題和字體設定
// ════════════════════════════════════════════════

import type { Metadata } from 'next';
import './globals.css';
import { CartProvider } from '@/context/CartContext';
import ClientShell from '@/components/ClientShell';
import { supabase } from '@/lib/supabase';
import Script from 'next/script';

// 動態產生 metadata（從 store_settings 讀取）
export async function generateMetadata(): Promise<Metadata> {
  const { data } = await supabase
    .from('store_settings')
    .select('seo_title, seo_description, seo_keywords, og_title, og_description, og_image_url, name')
    .eq('id', 1)
    .single();

  return {
    title: {
      default:  data?.seo_title       ?? '未半甜點',
      template: `%s | ${data?.name ?? '未半甜點'}`,
    },
    description: data?.seo_description ?? '以純粹視覺為引，將甜點的細膩質地融入潔白空間。',
    keywords:    data?.seo_keywords    ?? '手工甜點',
    openGraph: {
      title:       data?.og_title       ?? data?.seo_title ?? '未半甜點',
      description: data?.og_description ?? data?.seo_description ?? '',
      images:      data?.og_image_url   ? [{ url: data.og_image_url }] : [],
      locale:      'zh_TW',
      type:        'website',
    },
  };
}

// 取得追蹤代碼和色彩設定
async function getAppConfig() {
  const { data } = await supabase
    .from('store_settings')
    .select('ga4_id, fb_pixel_id, gtm_id, color_bg, color_surface, color_dark, color_price, color_btn, font_title, font_body')
    .eq('id', 1)
    .single();
  return data;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await getAppConfig();

  const ga4Id      = config?.ga4_id      ?? '';
  const fbPixelId  = config?.fb_pixel_id ?? '';
  const gtmId      = config?.gtm_id      ?? '';

  // 色彩主題 CSS 變數
  const colorVars = config ? `
    :root {
      --bg:         ${config.color_bg      ?? '#F7F4EF'};
      --surface:    ${config.color_surface ?? '#EDE9E2'};
      --text-dark:  ${config.color_dark    ?? '#1E1C1A'};
      --price:      ${config.color_price   ?? '#b35252'};
      --btn:        ${config.color_btn     ?? '#1E1C1A'};
      --font-title: ${config.font_title    ?? "'Noto Serif TC', serif"};
      --font-body:  ${config.font_body     ?? "'Noto Sans TC', sans-serif"};
    }
    body { font-family: var(--font-body); background: var(--bg); }
    h1   { font-family: var(--font-title); }
  ` : '';

  return (
    <html lang="zh-TW">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@200;300;400&family=Noto+Sans+TC:wght@300;400;500;700&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet" />
        {colorVars && <style dangerouslySetInnerHTML={{ __html: colorVars }} />}

        {/* FB Pixel */}
        {fbPixelId && (
          <script dangerouslySetInnerHTML={{ __html: `
            !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${fbPixelId}');fbq('track','PageView');
          ` }} />
        )}

        {/* GTM */}
        {gtmId && (
          <script dangerouslySetInnerHTML={{ __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');` }} />
        )}
      </head>
      <body>
        {/* GTM noscript */}
        {gtmId && (
          <noscript dangerouslySetInnerHTML={{ __html: `<iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}" height="0" width="0" style="display:none;visibility:hidden"></iframe>` }} />
        )}

        {/* GA4 */}
        {ga4Id && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4Id}');` }} />
          </>
        )}

        <CartProvider>
          <ClientShell>
            {children}
          </ClientShell>
        </CartProvider>
      </body>
    </html>
  );
}
