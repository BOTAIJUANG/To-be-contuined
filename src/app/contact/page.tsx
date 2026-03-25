'use client';

// app/contact/page.tsx  ──  聯絡資訊（串接 store_settings）

import { useSettings } from '@/lib/useSettings';
import Footer from '@/components/Footer';
import s from './contact.module.css';

export default function ContactPage() {
  const { settings } = useSettings();

  const socials = [
    { label: 'Instagram', url: settings.instagram_url },
    { label: 'Facebook',  url: settings.facebook_url  },
    { label: 'LINE',      url: settings.line_id ? `https://line.me/R/ti/p/${settings.line_id}` : '' },
  ].filter(x => x.url);

  return (
    <>
      <div className={s.container}>
        <div className={s.inner}>
          <h2 className={s.title}>聯絡資訊</h2>
          <p className={s.subtitle}>
            歡迎透過以下方式與我們聯繫，我們將盡快回覆您。
          </p>

          {[
            { label: 'TEL',     value: settings.phone,   href: `tel:${settings.phone?.replace(/-/g,'')}` },
            { label: 'EMAIL',   value: settings.email,   href: `mailto:${settings.email}` },
            { label: 'ADDRESS', value: settings.address, href: undefined },
          ].filter(r => r.value).map(({ label, value, href }) => (
            <div key={label} className={s.row}>
              <div className={s.rowLabel}>{label}</div>
              <div className={s.rowValue}>
                {href
                  ? <a href={href} className={s.rowLink}>{value}</a>
                  : value}
              </div>
            </div>
          ))}

          {socials.length > 0 && (
            <div className={s.socials}>
              {socials.map(item => (
                <a
                  key={item.label}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={s.socialLink}
                >
                  {item.label}
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
