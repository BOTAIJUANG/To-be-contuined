'use client';

// ════════════════════════════════════════════════
// app/admin/redeem/page.tsx  ──  兌換碼核銷
// ════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #E8E4DC', background: '#fff', fontFamily: 'inherit', fontSize: '13px', color: '#1E1C1A', outline: 'none' };
const labelStyle: React.CSSProperties = { fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', display: 'block', marginBottom: '6px' };

export default function AdminRedeemPage() {
  const [code,       setCode]       = useState('');
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<any | null>(null);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');
  const [adminId,    setAdminId]    = useState('');
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) setAdminId(data.session.user.id);
      loadRecentLogs();
    };
    init();
    inputRef.current?.focus();
  }, []);

  const loadRecentLogs = async () => {
    const { data } = await supabase
      .from('redemptions')
      .select('*, members(name, phone), redeem_items(name)')
      .eq('type', 'code')
      .eq('status', 'used')
      .order('used_at', { ascending: false })
      .limit(10);
    setRecentLogs(data ?? []);
  };

  // 查詢兌換碼（先查詢，不立即核銷）
  const handleSearch = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    setSuccess('');
    setResult(null);

    const { data: redemption } = await supabase
      .from('redemptions')
      .select('*, members(name, phone, stamps, stamps_frozen), redeem_items(name, stamps, description)')
      .eq('redeem_code', code.trim().toUpperCase())
      .single();

    if (!redemption) {
      setError('找不到此兌換碼，請確認輸入是否正確');
      setLoading(false);
      return;
    }

    setResult(redemption);
    setLoading(false);
  };

  // 確認核銷
  const handleVerify = async () => {
    if (!result) return;
    setLoading(true);
    setError('');

    const res  = await fetch('/api/redeem?action=verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ redeem_code: code.trim().toUpperCase(), admin_id: adminId }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? '核銷失敗');
      setLoading(false);
      return;
    }

    setSuccess(`✓ 核銷成功！${data.member_name} 的「${data.reward_name}」已核銷，扣除 ${data.stamps_used} 章`);
    setResult(null);
    setCode('');
    loadRecentLogs();
    inputRef.current?.focus();
    setLoading(false);
  };

  // 狀態顏色
  const statusLabel: Record<string, { label: string; color: string }> = {
    pending_cart:  { label: '等待中', color: '#b87a2a' },
    pending_order: { label: '訂單中', color: '#2a7ab8' },
    used:          { label: '已核銷', color: '#2ab85a' },
    released:      { label: '已取消', color: '#888580' },
    expired:       { label: '已過期', color: '#c0392b' },
  };

  const getStatusInfo = (status: string) => statusLabel[status] ?? { label: status, color: '#888580' };

  return (
    <div>
      <h1 style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 700, fontSize: '22px', letterSpacing: '0.2em', color: '#1E1C1A', margin: '0 0 32px' }}>兌換碼核銷</h1>

      {/* 輸入區 */}
      <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '28px', marginBottom: '24px', maxWidth: '500px' }}>
        <label style={labelStyle}>輸入兌換碼</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            ref={inputRef}
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); setResult(null); setSuccess(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="例：WB-K7X2M9QP"
            style={{ ...inputStyle, flex: 1, fontFamily: '"Montserrat", sans-serif', fontSize: '16px', letterSpacing: '0.2em' }}
          />
          <button onClick={handleSearch} disabled={loading || !code.trim()} style={{ padding: '10px 24px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', cursor: 'pointer', opacity: loading || !code.trim() ? 0.5 : 1 }}>
            {loading ? '查詢中...' : '查詢'}
          </button>
        </div>
        <div style={{ fontSize: '11px', color: '#888580', marginTop: '8px' }}>按 Enter 或點查詢按鈕搜尋</div>
      </div>

      {/* 錯誤訊息 */}
      {error && (
        <div style={{ padding: '14px 20px', background: '#fef0f0', border: '1px solid #f5c6c6', marginBottom: '24px', fontSize: '13px', color: '#c0392b', maxWidth: '500px' }}>
          ✗ {error}
        </div>
      )}

      {/* 成功訊息 */}
      {success && (
        <div style={{ padding: '14px 20px', background: '#f0faf4', border: '1px solid #b2dfdb', marginBottom: '24px', fontSize: '13px', color: '#2ab85a', maxWidth: '500px' }}>
          {success}
        </div>
      )}

      {/* 查詢結果 */}
      {result && (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '28px', marginBottom: '24px', maxWidth: '500px' }}>
          <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#888580', marginBottom: '20px' }}>兌換碼資訊</div>

          {/* 狀態 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '12px 16px', background: '#F7F4EF' }}>
            <span style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '18px', fontWeight: 700, letterSpacing: '0.2em', color: '#1E1C1A' }}>{result.redeem_code}</span>
            <span style={{ fontSize: '12px', color: getStatusInfo(result.status).color, border: `1px solid ${getStatusInfo(result.status).color}`, padding: '3px 10px', fontFamily: '"Montserrat", sans-serif' }}>
              {getStatusInfo(result.status).label}
            </span>
          </div>

          {/* 會員資訊 */}
          <div style={{ display: 'grid', gap: '10px', marginBottom: '20px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888580' }}>會員姓名</span>
              <span style={{ color: '#1E1C1A', fontWeight: 500 }}>{result.members?.name ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888580' }}>手機</span>
              <span style={{ color: '#1E1C1A' }}>{result.members?.phone ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888580' }}>目前章數</span>
              <span style={{ color: '#1E1C1A' }}>
                {result.members?.stamps ?? 0} 章
                {(result.members?.stamps_frozen ?? 0) > 0 && <span style={{ color: '#b87a2a', fontSize: '11px', marginLeft: '6px' }}>（凍結 {result.members?.stamps_frozen} 章）</span>}
              </span>
            </div>
          </div>

          {/* 兌換獎勵 */}
          <div style={{ padding: '14px 16px', background: '#EDE9E2', marginBottom: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1E1C1A', marginBottom: '4px' }}>{result.redeem_items?.name}</div>
            {result.redeem_items?.description && <div style={{ fontSize: '12px', color: '#888580' }}>{result.redeem_items.description}</div>}
            <div style={{ fontSize: '12px', color: '#555250', marginTop: '6px' }}>需要 {result.stamps_cost} 章</div>
          </div>

          {/* 有效期限 */}
          <div style={{ fontSize: '12px', color: new Date(result.expires_at) < new Date() ? '#c0392b' : '#888580', marginBottom: '20px' }}>
            有效期限：{new Date(result.expires_at).toLocaleString('zh-TW')}
            {new Date(result.expires_at) < new Date() && ' ⚠️ 已過期'}
          </div>

          {/* 核銷按鈕 */}
          {result.status === 'pending_cart' && new Date(result.expires_at) >= new Date() ? (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleVerify} disabled={loading} style={{ flex: 1, padding: '12px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
                {loading ? '核銷中...' : '✓ 確認核銷'}
              </button>
              <button onClick={() => { setResult(null); setCode(''); inputRef.current?.focus(); }} style={{ padding: '12px 20px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', cursor: 'pointer' }}>
                取消
              </button>
            </div>
          ) : (
            <div style={{ padding: '12px 16px', background: '#fef0f0', border: '1px solid #f5c6c6', fontSize: '13px', color: '#c0392b', textAlign: 'center' }}>
              {result.status === 'used'    && '此兌換碼已核銷，無法重複使用'}
              {result.status === 'expired' && '此兌換碼已過期'}
              {result.status === 'released'&& '此兌換碼已取消'}
            </div>
          )}
        </div>
      )}

      {/* 最近核銷記錄 */}
      <div>
        <div style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#888580', marginBottom: '12px' }}>最近核銷記錄</div>
        {recentLogs.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#888580' }}>尚無核銷記錄</p>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['核銷時間', '兌換碼', '會員', '兌換獎勵', '扣章'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: '"Montserrat", sans-serif', fontSize: '10px', letterSpacing: '0.25em', color: '#888580', textTransform: 'uppercase', borderBottom: '1px solid #E8E4DC', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #E8E4DC' }}>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#888580', whiteSpace: 'nowrap' }}>{new Date(log.used_at).toLocaleString('zh-TW')}</td>
                    <td style={{ padding: '12px 16px', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', color: '#1E1C1A', letterSpacing: '0.1em' }}>{log.redeem_code}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A' }}>{log.members?.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1E1C1A' }}>{log.redeem_items?.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#c0392b', fontWeight: 600 }}>−{log.stamps_cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
