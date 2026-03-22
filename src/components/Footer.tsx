'use client';

// components/Footer.tsx  ──  頁尾（支援商店設定）

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
    <footer style={{
      padding: '40px 48px',
      fontFamily: '"Montserrat", sans-serif',
      fontSize: '12px',
      letterSpacing: '0.25em',
      borderTop: '1px solid #E8E4DC',
      marginTop: '20px',
    }}>
      <div style={{ width: 'min(calc(100% - 60px), 1100px)', margin: '0 auto', display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ textAlign: 'right', lineHeight: 2.6, color: '#1E1C1A', textTransform: 'uppercase' }}>
        {showTel && tel && <div>TEL &nbsp; {tel}</div>}
        {showEmail && email && (
          <div>
            <a href={`mailto:${email}`} style={{ color: '#1E1C1A', textDecoration: 'none' }}
              onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.opacity = '0.6')}
              onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.opacity = '1')}
            >{email}</a>
          </div>
        )}
        {showAddress && address && <div style={{ textTransform: 'none', letterSpacing: '0.08em' }}>{address}</div>}
        {showCopyright && copyright && <div style={{ fontSize: '11px', color: '#888580', marginTop: '8px', textTransform: 'none' }}>{copyright}</div>}
      </div>
      </div>
    </footer>
  );
}
