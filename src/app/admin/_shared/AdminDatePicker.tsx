'use client';

// ════════════════════════════════════════════════
// AdminDatePicker  ──  後台共用日期選擇器
//
// 包裝 react-datepicker，處理 string ↔ Date 轉換
// state 維持 'YYYY-MM-DD' string 格式，與原本 <input type="date"> 一致
// ════════════════════════════════════════════════

import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface Props {
  value: string;                    // 'YYYY-MM-DD' or ''
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;                   // 前台用：鎖住過去日期
  style?: React.CSSProperties;
}

// 'YYYY-MM-DD' → Date (local)
function parseDate(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Date → 'YYYY-MM-DD'
function formatDate(d: Date | null): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AdminDatePicker({ value, onChange, className, placeholder, disabled, minDate, style }: Props) {
  return (
    <DatePicker
      selected={parseDate(value)}
      onChange={(date: Date | null) => onChange(formatDate(date))}
      dateFormat="yyyy-MM-dd"
      className={className}
      placeholderText={placeholder ?? '選擇日期'}
      disabled={disabled}
      minDate={minDate}
      isClearable
      autoComplete="off"
      wrapperClassName="admin-datepicker-wrapper"
      portalId="datepicker-portal"
      popperPlacement="bottom-start"
      {...(style ? { style } : {})}
    />
  );
}
