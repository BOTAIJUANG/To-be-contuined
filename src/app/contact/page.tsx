'use client';

// app/contact/page.tsx  ──  聯絡資訊（串接 store_settings）

import { useSettings } from '@/lib/useSettings';
import Footer from '@/components/Footer';

export default function ContactPage() {
  const { settings } = useSettings();

  const socials = [
    { label: 'Instagram', url: settings.instagram_url },
    { label: 'Facebook',  url: settings.facebook_url  },
    { label: 'LINE',      url: settings.line_id ? `https://line.me/R/ti/p/${settings.line_id}` : '' },
  ].filter(s => s.url);

  return (
    <>
      <div style={{ width: 'min(calc(100% - 60px), 1100px)', margin: 'auto', padding: '72px 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '600px' }}>
          <h2 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '19px', letterSpacing: '0.28em', color: '#1E1C1A', margin: '0 0 12px' }}>
            聯絡資訊
          </h2>
          <p style={{ fontSize: '13px', color: '#888580', marginBottom: '40px', lineHeight: 2, fontWeight: 300 }}>
            歡迎透過以下方式與我們聯繫，我們將盡快回覆您。
          </p>

          {[
            { label: 'TEL',     value: settings.phone,   href: `tel:${settings.phone?.replace(/-/g,'')}` },
            { label: 'EMAIL',   value: settings.email,   href: `mailto:${settings.email}` },
            { label: 'ADDRESS', value: settings.address, href: undefined },
          ].filter(r => r.value).map(({ label, value, href }) => (
            <div key={label} style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', padding: '16px 0', borderBottom: '1px solid #E8E4DC' }}>
              <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '11px', fontWeight: 600, letterSpacing: '0.3em', color: '#888580', textTransform: 'uppercase', minWidth: '80px', paddingTop: '2px' }}>
                {label}
              </div>
              <div style={{ fontSize: '13px', color: '#1E1C1A', lineHeight: 1.8 }}>
                {href
                  ? <a href={href} style={{ color: '#1E1C1A', textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.5')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>{value}</a>
                  : value}
              </div>
            </div>
          ))}

          {socials.length > 0 && (
            <div style={{ display: 'flex', gap: '12px', paddingTop: '24px' }}>
              {socials.map(s => (
                <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '12px', color: '#555250', letterSpacing: '0.1em', textDecoration: 'none', padding: '8px 16px', border: '1px solid #E8E4DC' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.6')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                  {s.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer tel={settings.phone} email={settings.email} address={settings.address} />
    </>
  );
}
