'use client';

// ════════════════════════════════════════════════
// app/admin/redeem/page.tsx  ──  兌換碼核銷
// ════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchApi } from '@/lib/api';
import s from '../_shared/admin-shared.module.css';
import p from './redeem.module.css';

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

    // 用 fetchApi 自動帶上 admin token
    const res  = await fetchApi('/api/redeem?action=verify', {
      method:  'POST',
      body:    JSON.stringify({ redeem_code: code.trim().toUpperCase(), admin_id: adminId }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? '核銷失敗');
      setLoading(false);
      return;
    }

    setSuccess(`核銷成功 — ${data.member_name} 的「${data.reward_name}」已核銷，扣除 ${data.stamps_used} 章`);
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
      <h1 className={`${s.pageTitle} ${p.pageTitleMb}`}>兌換碼核銷</h1>

      {/* 輸入區 */}
      <div className={`${s.formPanel} ${p.codePanel}`}>
        <label className={s.label}>輸入兌換碼</label>
        <div className={`${s.flex} ${s.gap12}`}>
          <input
            ref={inputRef}
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); setResult(null); setSuccess(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="例：WB-K7X2M9QP"
            className={`${s.input} ${p.codeInput}`}
          />
          <button onClick={handleSearch} disabled={loading || !code.trim()} className={s.btnPrimary}>
            {loading ? '查詢中...' : '查詢'}
          </button>
        </div>
        <div className={p.hint}>按 Enter 或點查詢按鈕搜尋</div>
      </div>

      {/* 錯誤訊息 */}
      {error && (
        <div className={`${s.errorBar} ${p.resultPanel}`}>{error}</div>
      )}

      {/* 成功訊息 */}
      {success && (
        <div className={`${s.successBar} ${p.resultPanel}`}>{success}</div>
      )}

      {/* 查詢結果 */}
      {result && (
        <div className={`${s.formPanel} ${p.resultPanel}`}>
          <div className={p.resultSectionLabel}>兌換碼資訊</div>

          {/* 狀態 */}
          <div className={p.codeDisplay}>
            <span className={p.codeText}>{result.redeem_code}</span>
            <span className={s.badge} style={{ color: getStatusInfo(result.status).color, border: `1px solid ${getStatusInfo(result.status).color}` }}>
              {getStatusInfo(result.status).label}
            </span>
          </div>

          {/* 會員資訊 */}
          <div className={p.infoGrid}>
            <div className={p.infoRow}>
              <span className={p.infoLabel}>會員姓名</span>
              <span className={`${p.infoValue} ${p.infoValueBold}`}>{result.members?.name ?? '—'}</span>
            </div>
            <div className={p.infoRow}>
              <span className={p.infoLabel}>手機</span>
              <span className={p.infoValue}>{result.members?.phone ?? '—'}</span>
            </div>
            <div className={p.infoRow}>
              <span className={p.infoLabel}>目前章數</span>
              <span className={p.infoValue}>
                {result.members?.stamps ?? 0} 章
                {(result.members?.stamps_frozen ?? 0) > 0 && <span className={p.stampsFrozenNote}>（凍結 {result.members?.stamps_frozen} 章）</span>}
              </span>
            </div>
          </div>

          {/* 兌換獎勵 */}
          <div className={p.rewardBox}>
            <div className={p.rewardName}>{result.redeem_items?.name}</div>
            {result.redeem_items?.description && <div className={p.rewardDesc}>{result.redeem_items.description}</div>}
            <div className={p.rewardCost}>需要 {result.stamps_cost} 章</div>
          </div>

          {/* 有效期限 */}
          <div className={p.expiryText} style={{ color: new Date(result.expires_at) < new Date() ? '#c0392b' : 'var(--text-light)' }}>
            有效期限：{new Date(result.expires_at).toLocaleString('zh-TW')}
            {new Date(result.expires_at) < new Date() && ' （已過期）'}
          </div>

          {/* 核銷按鈕 */}
          {result.status === 'pending_cart' && new Date(result.expires_at) >= new Date() ? (
            <div className={p.verifyActions}>
              <button onClick={handleVerify} disabled={loading} className={`${s.btnPrimary} ${p.verifyBtnFlex}`}>
                {loading ? '核銷中...' : '確認核銷'}
              </button>
              <button onClick={() => { setResult(null); setCode(''); inputRef.current?.focus(); }} className={`${s.btnCancel} ${p.cancelBtnPad}`}>
                取消
              </button>
            </div>
          ) : (
            <div className={p.statusError}>
              {result.status === 'used'    && '此兌換碼已核銷，無法重複使用'}
              {result.status === 'expired' && '此兌換碼已過期'}
              {result.status === 'released'&& '此兌換碼已取消'}
            </div>
          )}
        </div>
      )}

      {/* 最近核銷記錄 */}
      <div>
        <div className={p.recentTitle}>最近核銷記錄</div>
        {recentLogs.length === 0 ? (
          <p className={s.loadingText}>尚無核銷記錄</p>
        ) : (
          <div className={s.tableWrap}>
            {/* Desktop table */}
            <table className={s.table}>
              <thead>
                <tr>
                  {['核銷時間', '兌換碼', '會員', '兌換獎勵', '扣章'].map(h => (
                    <th key={h} className={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentLogs.map(log => (
                  <tr key={log.id} className={s.tr}>
                    <td className={`${s.td} ${p.tdDateLight}`}>{new Date(log.used_at).toLocaleString('zh-TW')}</td>
                    <td className={`${s.td} ${p.tdCodeMono}`}>{log.redeem_code}</td>
                    <td className={s.td}>{log.members?.name ?? '—'}</td>
                    <td className={s.td}>{log.redeem_items?.name ?? '—'}</td>
                    <td className={`${s.td} ${p.stampsCostTd}`}>−{log.stamps_cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile card list */}
            <div className={s.cardList}>
              {recentLogs.map(log => (
                <div key={log.id} className={s.card}>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>兌換碼</span>
                    <span className={`${s.cardValue} ${p.cardCodeMono}`}>{log.redeem_code}</span>
                  </div>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>會員</span>
                    <span className={s.cardValue}>{log.members?.name ?? '—'}</span>
                  </div>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>獎勵</span>
                    <span className={s.cardValue}>{log.redeem_items?.name ?? '—'}</span>
                  </div>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>扣章</span>
                    <span className={`${s.cardValue} ${p.cardStampsCost}`}>−{log.stamps_cost}</span>
                  </div>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>時間</span>
                    <span className={`${s.cardValue} ${p.cardDateLight}`}>{new Date(log.used_at).toLocaleString('zh-TW')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
