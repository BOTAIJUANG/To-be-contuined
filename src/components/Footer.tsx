'use client';

// components/Footer.tsx  ──  頁尾（responsive）

import s from './Footer.module.css';

interface FooterProps {
  tel?:             string;
  email?:           string;
  address?:         string;
  showTel?:         boolean;
  showEmail?:       boolean;
  showAddress?:     boolean;
  showCopyright?:   boolean;
  copyright?:       string;
}

export default function Footer({
  tel           = '039-381-241',
  email         = '',
  address       = '260 宜蘭縣宜蘭市神農路二段 96 號',
  showTel       = true,
  showEmail     = true,
  showAddress   = true,
  showCopyright = false,
  copyright     = '© 未半甜點 版權所有',
}: FooterProps) {
  return (
    <footer className={s.footer}>
      <div className={s.inner}>
        <div className={s.content}>
          {showTel && tel && <div>TEL &nbsp; {tel}</div>}
          {showEmail && email && (
            <div><a href={`mailto:${email}`}>{email}</a></div>
          )}
          {showAddress && address && <div className={s.address}>{address}</div>}
          {showCopyright && copyright && <div className={s.copyright}>{copyright}</div>}
        </div>
      </div>
    </footer>
  );
}
