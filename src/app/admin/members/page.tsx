'use client';

// ════════════════════════════════════════════════
// app/admin/members/page.tsx  ──  會員管理（完整版）
//
// 分頁：會員列表 / 集章設定 / 兌換商品 / 顧客統計
// ════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import s from '../_shared/admin-shared.module.css';
import p from './members.module.css';
import AdminDatePicker from '../_shared/AdminDatePicker';

type MemberTab = 'list' | 'stamps' | 'redeem' | 'stats';
type DetailTab = 'profile' | 'stamp_logs' | 'redemptions';

interface Member { id: string; name: string; phone: string; birthday: string; stamps: number; stamps_frozen?: number; role: string; created_at: string; email?: string; }
interface RedeemItem { id: number; name: string; description: string | null; stamps: number; monthly_limit: number; redeemed_count: number; starts_at: string | null; ends_at: string | null; is_active: boolean; }
interface StampLog { id: number; change: number; stamps_before: number; stamps_after: number; reason: string; admin_id: string | null; created_at: string; admin_name?: string; }
interface RedemptionLog { id: number; type: string; status: string; stamps_cost: number; redeem_code: string | null; created_at: string; used_at: string | null; reward_name?: string; }

const Toggle = ({ val, onChange }: { val: boolean; onChange: () => void }) => (
  <div onClick={onChange} className={`${s.toggle} ${val ? p.toggleOn : p.toggleOff}`}>
    <div className={`${s.toggleDot} ${val ? p.toggleDotOn : p.toggleDotOff}`} />
  </div>
);

const EMPTY_REDEEM = { name: '', description: '', stamps: 8, monthly_limit: 0, starts_at: '', ends_at: '', is_active: true, product_id: 0, variant_id: 0 };

export default function AdminMembersPage() {
  const [tab,     setTab]     = useState<MemberTab>('list');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  // 集章設定
  const [stampEnabled,    setStampEnabled]    = useState(true);
  const [stampThreshold,  setStampThreshold]  = useState(200);
  const [stampGoal,       setStampGoal]       = useState(8);
  const [stampTotalSlots, setStampTotalSlots] = useState(10);
  const [stampExpiry,     setStampExpiry]     = useState(365);
  const [stampCardName,   setStampCardName]   = useState('未半甜點護照');
  const [stampIconUrl,    setStampIconUrl]    = useState('');
  const [uploadingIcon,   setUploadingIcon]   = useState(false);
  const stampIconRef = useRef<HTMLInputElement>(null);
  const [notifySuccess,   setNotifySuccess]   = useState(true);
  const [notifyFull,      setNotifyFull]      = useState(true);
  const [notifyExpiryDays,setNotifyExpiryDays]= useState(30);
  const [savingStamp,     setSavingStamp]     = useState(false);

  // 兌換商品
  const [redeemItems,   setRedeemItems]   = useState<RedeemItem[]>([]);
  const [showRedeem,    setShowRedeem]    = useState(false);
  const [editingRedeem, setEditingRedeem] = useState<number | null>(null);
  const [redeemForm,    setRedeemForm]    = useState({ ...EMPTY_REDEEM });
  const [savingRedeem,  setSavingRedeem]  = useState(false);
  const [products,      setProducts]      = useState<{ id: number; name: string; slug: string }[]>([]);

  // 顧客統計
  const [stats, setStats] = useState({ total: 0, newThisMonth: 0, withOrders: 0, avgStamps: 0, stampsFull: 0, stampsInProgress: 0, topSpenders: [] as any[] });

  // 會員詳情面板
  const [showDetail,    setShowDetail]    = useState(false);
  const [detailMember,  setDetailMember]  = useState<Member | null>(null);
  const [detailTab,     setDetailTab]     = useState<DetailTab>('profile');
  const [stampLogs,     setStampLogs]     = useState<StampLog[]>([]);
  const [redemptionLogs,setRedemptionLogs]= useState<RedemptionLog[]>([]);
  const [detailAddresses, setDetailAddresses] = useState<any[]>([]);
  const [logsLoading,   setLogsLoading]   = useState(false);

  const loadMembers = async () => {
    setLoading(true);
    const { data } = await supabase.from('members').select('*').order('created_at', { ascending: false });
    setMembers(data ?? []);
    setLoading(false);
  };

  const loadStampSettings = async () => {
    const { data } = await supabase.from('store_settings').select('stamp_enabled,stamp_threshold,stamp_goal,stamp_total_slots,stamp_expiry,stamp_card_name,stamp_icon_url,stamp_notify_success,stamp_notify_full,stamp_notify_expiry_days').eq('id', 1).single();
    if (data) {
      setStampEnabled(data.stamp_enabled ?? true);
      setStampThreshold(data.stamp_threshold ?? 200);
      setStampGoal(data.stamp_goal ?? 8);
      setStampTotalSlots(data.stamp_total_slots ?? 10);
      setStampExpiry(data.stamp_expiry ?? 365);
      setStampCardName(data.stamp_card_name ?? '未半甜點護照');
      setStampIconUrl(data.stamp_icon_url ?? '');
      setNotifySuccess(data.stamp_notify_success ?? true);
      setNotifyFull(data.stamp_notify_full ?? true);
      setNotifyExpiryDays(data.stamp_notify_expiry_days ?? 30);
    }
  };

  const loadRedeemItems = async () => {
    const { data } = await supabase.from('redeem_items').select('*').order('created_at', { ascending: false });
    setRedeemItems(data ?? []);
  };

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, name, slug').eq('is_available', true).order('sort_order');
    setProducts(data ?? []);
  };

  const loadStats = async () => {
    const now       = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const [{ count: total }, { count: newThisMonth }, { data: memberData }] = await Promise.all([
      supabase.from('members').select('*', { count: 'exact', head: true }),
      supabase.from('members').select('*', { count: 'exact', head: true }).gte('created_at', thisMonth),
      supabase.from('members').select('id, name, stamps'),
    ]);
    const { data: orderData } = await supabase.from('orders').select('member_id, total').not('member_id', 'is', null).eq('pay_status', 'paid');
    const memberOrderMap: Record<string, { total: number; orders: number }> = {};
    (orderData ?? []).forEach((o: any) => { if (!memberOrderMap[o.member_id]) memberOrderMap[o.member_id] = { total: 0, orders: 0 }; memberOrderMap[o.member_id].total += o.total; memberOrderMap[o.member_id].orders++; });
    const withOrders = Object.keys(memberOrderMap).length;
    const avgStamps  = memberData && memberData.length > 0 ? Math.round(memberData.reduce((sum: number, m: any) => sum + (m.stamps ?? 0), 0) / memberData.length) : 0;
    const stampsFull = (memberData ?? []).filter((m: any) => m.stamps >= stampGoal).length;
    const stampsInProgress = (memberData ?? []).filter((m: any) => m.stamps > 0 && m.stamps < stampGoal).length;
    const topSpenders = (memberData ?? []).filter((m: any) => memberOrderMap[m.id]).map((m: any) => ({ name: m.name ?? '—', ...memberOrderMap[m.id] })).sort((a, b) => b.total - a.total).slice(0, 5);
    setStats({ total: total ?? 0, newThisMonth: newThisMonth ?? 0, withOrders, avgStamps, stampsFull, stampsInProgress, topSpenders });
  };

  useEffect(() => { loadMembers(); loadStampSettings(); loadRedeemItems(); loadProducts(); }, []);
  useEffect(() => { if (tab === 'stats') loadStats(); }, [tab]);

  // 集章手動調整 Modal
  const [showStampModal,  setShowStampModal]  = useState(false);
  const [stampModalMember, setStampModalMember] = useState<Member | null>(null);
  const [stampDelta,       setStampDelta]       = useState(0);
  const [stampReason,      setStampReason]      = useState('');
  const [stampReasonOther, setStampReasonOther] = useState('');
  const [savingStampAdj,   setSavingStampAdj]   = useState(false);

  const STAMP_REASONS = ['手動補登', '補償', '退款', '活動', '其他'];

  const openDetail = async (m: Member) => {
    setDetailMember(m);
    setDetailTab('profile');
    setShowDetail(true);
    setDetailAddresses([]);
    setLogsLoading(true);

    // 載入會員地址
    supabase.from('addresses').select('*').eq('member_id', m.id).order('is_default', { ascending: false }).then(({ data }) => {
      setDetailAddresses(data ?? []);
    });

    const { data: logs } = await supabase
      .from('stamp_logs')
      .select('*')
      .eq('member_id', m.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const adminIds = [...new Set((logs ?? []).filter((l: any) => l.admin_id).map((l: any) => l.admin_id))];
    let adminMap: Record<string, string> = {};
    if (adminIds.length > 0) {
      const { data: admins } = await supabase.from('members').select('id, name').in('id', adminIds);
      (admins ?? []).forEach((a: any) => { adminMap[a.id] = a.name; });
    }
    setStampLogs((logs ?? []).map((l: any) => ({ ...l, admin_name: l.admin_id ? (adminMap[l.admin_id] ?? '管理員') : null })));

    const { data: redemptions } = await supabase
      .from('redemptions')
      .select('id, type, status, stamps_cost, redeem_code, created_at, used_at, redeem_items(name)')
      .eq('member_id', m.id)
      .order('created_at', { ascending: false })
      .limit(50);

    setRedemptionLogs((redemptions ?? []).map((r: any) => ({ ...r, reward_name: r.redeem_items?.name ?? '—' })));
    setLogsLoading(false);
  };

  const openStampModal = (m: Member, delta: number) => {
    setStampModalMember(m);
    setStampDelta(delta);
    setStampReason('手動補登');
    setStampReasonOther('');
    setShowStampModal(true);
  };

  const handleStampAdjust = async () => {
    if (!stampModalMember) return;
    const reason = stampReason === '其他' ? stampReasonOther : stampReason;
    if (!reason.trim()) { alert('請填寫原因'); return; }

    const newStamps = Math.max(0, stampModalMember.stamps + stampDelta);
    setSavingStampAdj(true);

    await supabase.from('members').update({ stamps: newStamps }).eq('id', stampModalMember.id);

    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('stamp_logs').insert({
      member_id:     stampModalMember.id,
      change:        stampDelta,
      stamps_before: stampModalMember.stamps,
      stamps_after:  newStamps,
      reason:        `手動調整（${reason}）`,
      admin_id:      session?.user?.id ?? null,
    });

    setMembers(prev => prev.map(m => m.id === stampModalMember.id ? { ...m, stamps: newStamps } : m));
    setSavingStampAdj(false);
    setShowStampModal(false);
  };

  const saveStampSettings = async () => {
    setSavingStamp(true);
    await supabase.from('store_settings').upsert({ id: 1, stamp_enabled: stampEnabled, stamp_threshold: stampThreshold, stamp_goal: stampGoal, stamp_total_slots: stampTotalSlots, stamp_expiry: stampExpiry, stamp_card_name: stampCardName, stamp_icon_url: stampIconUrl || null, stamp_notify_success: notifySuccess, stamp_notify_full: notifyFull, stamp_notify_expiry_days: notifyExpiryDays, updated_at: new Date().toISOString() });
    setSavingStamp(false);
    alert('集章設定已儲存');
  };

  const handleStampIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    const ext      = file.name.split('.').pop();
    const fileName = `store/stamp-icon-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('images').upload(fileName, file, { cacheControl: '3600', upsert: true, contentType: file.type });
    if (error) { alert('上傳失敗：' + error.message); setUploadingIcon(false); return; }
    const { data: urlData } = supabase.storage.from('images').getPublicUrl(fileName);
    setStampIconUrl(urlData.publicUrl);
    setUploadingIcon(false);
  };

  const openAddRedeem  = () => { setRedeemForm({ ...EMPTY_REDEEM, stamps: stampGoal }); setEditingRedeem(null); setShowRedeem(true); };
  const openEditRedeem = (item: RedeemItem) => { setRedeemForm({ name: item.name, description: item.description ?? '', stamps: item.stamps, monthly_limit: item.monthly_limit, starts_at: item.starts_at ?? '', ends_at: item.ends_at ?? '', is_active: item.is_active, product_id: (item as any).product_id ?? 0, variant_id: (item as any).variant_id ?? 0 }); setEditingRedeem(item.id); setShowRedeem(true); };

  const saveRedeemItem = async () => {
    if (!redeemForm.name) { alert('請填寫兌換品名稱'); return; }
    if (!redeemForm.product_id) { alert('請選擇對應商品'); return; }
    setSavingRedeem(true);
    const data = {
      ...redeemForm,
      description: redeemForm.description || null,
      starts_at:   redeemForm.starts_at   || null,
      ends_at:     redeemForm.ends_at     || null,
      product_id:  redeemForm.product_id  || null,
      variant_id:  redeemForm.variant_id  || null,
    };
    if (editingRedeem) await supabase.from('redeem_items').update(data).eq('id', editingRedeem);
    else               await supabase.from('redeem_items').insert(data);
    setSavingRedeem(false);
    setShowRedeem(false);
    loadRedeemItems();
  };

  const toggleRedeemActive = async (item: RedeemItem) => {
    await supabase.from('redeem_items').update({ is_active: !item.is_active }).eq('id', item.id);
    setRedeemItems(prev => prev.map(x => x.id === item.id ? { ...x, is_active: !x.is_active } : x));
  };

  const deleteRedeem = async (id: number) => {
    if (!confirm('確定要刪除？')) return;
    const { error } = await supabase.from('redeem_items').delete().eq('id', id);
    if (error) { alert('刪除失敗：' + error.message); return; }
    setRedeemItems(prev => prev.filter(r => r.id !== id));
  };

  const filtered = members.filter(m => (m.name ?? '').includes(search) || (m.phone ?? '').includes(search));

  if (loading && tab === 'list') return <p className={s.loadingText}>載入中...</p>;

  return (
    <div>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>會員管理</h1>
        <div className={p.memberCountHint}>共 {members.length} 位會員</div>
      </div>

      <div className={s.tabBar}>
        <div className={tab === 'list'   ? s.tabActive : s.tab} onClick={() => setTab('list')}>會員列表</div>
        <div className={tab === 'stamps' ? s.tabActive : s.tab} onClick={() => setTab('stamps')}>集章設定</div>
        <div className={tab === 'redeem' ? s.tabActive : s.tab} onClick={() => setTab('redeem')}>兌換商品</div>
        <div className={tab === 'stats'  ? s.tabActive : s.tab} onClick={() => setTab('stats')}>顧客統計</div>
      </div>

      {/* ════ 會員列表 ════ */}
      {tab === 'list' && (
        <>
          <div className={s.filterRow}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋姓名或手機..." className={s.searchInput} />
          </div>
          <div className={s.tableWrap}>
            {/* Desktop table */}
            <table className={s.table}>
              <thead><tr>{['姓名', '手機', '生日', '集章數', '身份', '加入時間'].map(h => <th key={h} className={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className={s.emptyRow}>沒有符合條件的會員</td></tr>
                ) : filtered.map(m => (
                  <tr key={m.id} className={s.tr}>
                    <td className={s.td}>
                      <span onClick={() => openDetail(m)} className={p.nameLink}>{m.name ?? '—'}</span>
                    </td>
                    <td className={`${s.td} ${p.cellSmallMuted}`}>{m.phone ?? '—'}</td>
                    <td className={`${s.td} ${p.cellSmallMuted}`}>{m.birthday ?? '—'}</td>
                    <td className={s.td}>
                      <div className={p.stampControls}>
                        <button onClick={() => openStampModal(m, -1)} disabled={m.stamps <= 0} className={`${p.stampBtn}${m.stamps <= 0 ? ` ${p.stampBtnDisabled}` : ''}`}>−</button>
                        <span className={`${p.stampCount} ${m.stamps >= stampTotalSlots ? p.stampCountFull : p.stampCountNormal}`}>{m.stamps}</span>
                        <button onClick={() => openStampModal(m, +1)} className={p.stampBtn}>+</button>
                        <span className={p.cellTinyLight}>/ {stampTotalSlots}</span>
                        {m.stamps >= stampTotalSlots && <span className={p.stampFull}>集滿</span>}
                      </div>
                    </td>
                    <td className={s.td}>
                      <span className={m.role === 'admin' ? p.roleBadgeAdmin : p.roleBadgeMember}>
                        {m.role === 'admin' ? 'ADMIN' : 'MEMBER'}
                      </span>
                    </td>
                    <td className={`${s.td} ${p.cellSmallLight}`}>{new Date(m.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile card list */}
            <div className={s.cardList}>
              {filtered.length === 0 ? (
                <div className={s.emptyRow}>沒有符合條件的會員</div>
              ) : filtered.map(m => (
                <div key={m.id} className={s.card}>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>姓名</span>
                    <span className={`${s.cardValue} ${p.nameLink}`} onClick={() => openDetail(m)}>{m.name ?? '—'}</span>
                  </div>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>手機</span>
                    <span className={s.cardValue}>{m.phone ?? '—'}</span>
                  </div>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>集章</span>
                    <div className={p.stampControls}>
                      <button onClick={() => openStampModal(m, -1)} disabled={m.stamps <= 0} className={`${p.stampBtn}${m.stamps <= 0 ? ` ${p.stampBtnDisabled}` : ''}`}>−</button>
                      <span className={p.stampCount}>{m.stamps}</span>
                      <button onClick={() => openStampModal(m, +1)} className={p.stampBtn}>+</button>
                      <span className={p.cellTinyLight}>/ {stampTotalSlots}</span>
                    </div>
                  </div>
                  <div className={s.cardRow}>
                    <span className={s.cardLabel}>身份</span>
                    <span className={m.role === 'admin' ? p.roleBadgeAdmin : p.roleBadgeMember}>
                      {m.role === 'admin' ? 'ADMIN' : 'MEMBER'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ════ 集章設定 ════ */}
      {tab === 'stamps' && (
        <div className={p.maxWidthForm}>
          <div className={s.sectionTitleBordered}>集章規則</div>
          <div className={p.settingRowMb20}>
            <span className={p.settingRowLabel}>啟用集章系統</span>
            <Toggle val={stampEnabled} onChange={() => setStampEnabled(!stampEnabled)} />
          </div>
          <div className={`${s.grid1} ${s.mb28}`}>
            <div>
              <label className={s.label}>蓋章門檻</label>
              <div className={p.inlineField}>
                <span className={p.fieldHint}>每消費 NT$</span>
                <input type="number" value={stampThreshold} onChange={e => setStampThreshold(Number(e.target.value))} className={p.inputNarrow} />
                <span className={p.fieldHint}>得 1 章</span>
              </div>
            </div>
            <div>
              <label className={s.label}>集章卡總格數</label>
              <div className={p.inlineField}>
                <input type="number" value={stampTotalSlots} onChange={e => setStampTotalSlots(Number(e.target.value))} className={p.inputNarrow} />
                <span className={p.fieldHint}>格（集章卡顯示的總格數）</span>
              </div>
            </div>
            <div className={s.infoBar}>
              <div className={`${s.label} ${p.labelMb12}`}>兌換門檻設定</div>
              <div className={p.infoHint}>
                在「兌換商品」分頁，每個商品可以各自設定需要幾章才能兌換。<br/>
                例如：總格數 10 格，集 3 章換A、集 6 章換B、集 10 章換C。
              </div>
              <div className={p.inlineField}>
                <span className={p.fieldHint}>集滿</span>
                <input type="number" value={stampGoal} onChange={e => setStampGoal(Number(e.target.value))} className={p.inputNarrow} />
                <span className={p.fieldHint}>章可兌換（最高門檻，用於顯示「集滿」提示）</span>
              </div>
            </div>
            <div>
              <label className={s.label}>章的有效期限</label>
              <div className={p.inlineField}>
                <input type="number" value={stampExpiry} onChange={e => setStampExpiry(Number(e.target.value))} className={p.inputNarrow} />
                <span className={p.fieldHint}>天（從最後一次消費日起算）</span>
              </div>
            </div>
            <div>
              <label className={s.label}>集章卡名稱</label>
              <input value={stampCardName} onChange={e => setStampCardName(e.target.value)} className={p.inputMedium} />
            </div>
            <div>
              <label className={s.label}>章的圖示（建議使用去背 PNG，約 100x100px）</label>
              <div className={`${s.flex} ${s.itemsCenter} ${s.gap16} ${p.iconUploadWrap}`}>
                <div className={p.iconPreview}>
                  {stampIconUrl
                    ? <img src={stampIconUrl} alt="章圖示" className={p.iconImg} />
                    : <span className={p.emojiDefault}>🌸</span>
                  }
                </div>
                <div>
                  <div className={`${s.flex} ${s.gap8} ${s.itemsCenter} ${s.mb8}`}>
                    <button onClick={() => stampIconRef.current?.click()} disabled={uploadingIcon} className={s.btnSmall}>
                      {uploadingIcon ? '上傳中...' : '上傳圖示'}
                    </button>
                    {stampIconUrl && (
                      <button onClick={() => setStampIconUrl('')} className={s.btnDanger}>移除</button>
                    )}
                  </div>
                  <div className={p.fieldHint}>建議使用去背 PNG，圖示會顯示在深色格子上</div>
                </div>
                <input ref={stampIconRef} type="file" accept="image/*" onChange={handleStampIconUpload} className={p.hidden} />
              </div>
            </div>
          </div>

          <div className={s.sectionTitleBordered}>通知設定</div>
          {[
            { label: '集章成功通知',   val: notifySuccess, set: setNotifySuccess },
            { label: '集滿提醒通知',   val: notifyFull,    set: setNotifyFull    },
          ].map(({ label, val, set }) => (
            <div key={label} className={p.settingRow}>
              <span className={p.settingRowLabel}>{label}</span>
              <Toggle val={val} onChange={() => set(!val)} />
            </div>
          ))}
          <div className={p.settingRowMb24}>
            <span className={p.settingRowLabelFlex}>即將到期提醒</span>
            <div className={p.inlineField}>
              <span className={p.fieldHint}>到期前</span>
              <input type="number" value={notifyExpiryDays} onChange={e => setNotifyExpiryDays(Number(e.target.value))} className={p.inputNarrowSm} />
              <span className={p.fieldHint}>天發送提醒</span>
            </div>
          </div>

          <button onClick={saveStampSettings} disabled={savingStamp} className={s.btnSave}>
            {savingStamp ? '儲存中...' : '儲存設定'}
          </button>
        </div>
      )}

      {/* ════ 兌換商品 ════ */}
      {tab === 'redeem' && (
        <div>
          <div className={p.redeemInfoBar}>
            <div className={p.infoBarNoMb}>
              集滿 <strong>{stampGoal}</strong> 章可兌換以下任一商品。
            </div>
            <button onClick={openAddRedeem} className={s.btnPrimary}>＋ 新增</button>
          </div>

          {/* Modal */}
          {showRedeem && (
            <>
              <div onClick={() => setShowRedeem(false)} className={s.modalOverlay} />
              <div className={s.modal}>
                <div className={s.modalHeader}>
                  <span className={s.modalTitle}>{editingRedeem ? '編輯兌換商品' : '新增兌換商品'}</span>
                  <button onClick={() => setShowRedeem(false)} className={s.modalClose}>×</button>
                </div>
                <div className={s.modalBody}>
                  <div><label className={s.label}>商品名稱 *</label><input value={redeemForm.name} onChange={e => setRedeemForm({...redeemForm, name: e.target.value})} placeholder="例：法式可麗露" className={s.input} /></div>
                  <div><label className={s.label}>說明（選填）</label><input value={redeemForm.description} onChange={e => setRedeemForm({...redeemForm, description: e.target.value})} placeholder="例：任選口味一入" className={s.input} /></div>

                  <div>
                    <label className={s.label}>對應商品 *（用於結帳、出貨日計算、庫存扣除）</label>
                    <select
                      value={redeemForm.product_id}
                      onChange={e => setRedeemForm({...redeemForm, product_id: Number(e.target.value), variant_id: 0})}
                      className={s.select}
                    >
                      <option value={0}>請選擇商品</option>
                      {products.map(prod => <option key={prod.id} value={prod.id}>{prod.name}</option>)}
                    </select>
                    <div className={p.hintMt4}>
                      選擇對應的實際商品，顧客結帳時會以此商品計算出貨日期與庫存
                    </div>
                  </div>
                  <div className={s.grid2}>
                    <div>
                      <label className={s.label}>所需章數</label>
                      <input type="number" value={redeemForm.stamps} onChange={e => setRedeemForm({...redeemForm, stamps: Number(e.target.value)})} className={s.input} />
                    </div>
                    <div>
                      <label className={s.label}>每月限量（0 = 不限）</label>
                      <input type="number" value={redeemForm.monthly_limit} onChange={e => setRedeemForm({...redeemForm, monthly_limit: Number(e.target.value)})} className={s.input} />
                    </div>
                    <div>
                      <label className={s.label}>開始日期（留空 = 立即）</label>
                      <AdminDatePicker value={redeemForm.starts_at} onChange={val => setRedeemForm({...redeemForm, starts_at: val})} className={s.input} />
                    </div>
                    <div>
                      <label className={s.label}>結束日期（留空 = 長期）</label>
                      <AdminDatePicker value={redeemForm.ends_at} onChange={val => setRedeemForm({...redeemForm, ends_at: val})} className={s.input} />
                    </div>
                  </div>
                  <label className={s.checkLabel}>
                    <input type="checkbox" checked={redeemForm.is_active} onChange={e => setRedeemForm({...redeemForm, is_active: e.target.checked})} className={s.checkbox} />
                    啟用此兌換品
                  </label>
                  <div className={s.btnActions}>
                    <button onClick={saveRedeemItem} disabled={savingRedeem} className={s.btnSave}>{savingRedeem ? '儲存中...' : '儲存'}</button>
                    <button onClick={() => setShowRedeem(false)} className={s.btnCancel}>取消</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 兌換商品列表 */}
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>{['商品名稱', '所需章數', '每月限量', '已兌換', '有效期間', '啟用', '操作'].map(h => <th key={h} className={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {redeemItems.length === 0 ? (
                  <tr><td colSpan={7} className={s.emptyRow}>尚無兌換商品</td></tr>
                ) : redeemItems.map(item => (
                  <tr key={item.id} className={`${s.tr}${!item.is_active ? ` ${p.redeemRowInactive}` : ''}`}>
                    <td className={s.td}>
                      <div>{item.name}</div>
                      {item.description && <div className={p.descriptionHint}>{item.description}</div>}
                    </td>
                    <td className={s.td}>{item.stamps} 章</td>
                    <td className={`${s.td} ${p.cellSmallMuted}`}>{item.monthly_limit === 0 ? '不限' : `${item.monthly_limit} 份`}</td>
                    <td className={`${s.td} ${p.cellSmallMuted}`}>{item.redeemed_count} 次</td>
                    <td className={`${s.td} ${p.cellTinyLight}`}>
                      {item.starts_at ?? '立即'} ～ {item.ends_at ?? '長期'}
                    </td>
                    <td className={s.td}>
                      <input type="checkbox" checked={item.is_active} onChange={() => toggleRedeemActive(item)} className={s.checkbox} />
                    </td>
                    <td className={s.td}>
                      <div className={`${s.flex} ${s.gap8}`}>
                        <button onClick={() => openEditRedeem(item)} className={s.btnSmall}>編輯</button>
                        <button onClick={() => deleteRedeem(item.id)} className={s.btnDanger}>刪除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className={s.cardList}>
              {redeemItems.length === 0 ? (
                <div className={s.emptyRow}>尚無兌換商品</div>
              ) : redeemItems.map(item => (
                <div key={item.id} className={`${s.card}${!item.is_active ? ` ${p.redeemRowInactive}` : ''}`}>
                  <div className={s.cardTitle}>{item.name}</div>
                  {item.description && <div className={s.cardSub}>{item.description}</div>}
                  <div className={s.cardRow}><span className={s.cardLabel}>章數</span><span className={s.cardValue}>{item.stamps} 章</span></div>
                  <div className={s.cardRow}><span className={s.cardLabel}>限量</span><span className={s.cardValue}>{item.monthly_limit === 0 ? '不限' : `${item.monthly_limit}/月`}</span></div>
                  <div className={s.cardRow}><span className={s.cardLabel}>已兌換</span><span className={s.cardValue}>{item.redeemed_count} 次</span></div>
                  <div className={s.cardActions}>
                    <button onClick={() => openEditRedeem(item)} className={s.btnSmall}>編輯</button>
                    <button onClick={() => deleteRedeem(item.id)} className={s.btnDanger}>刪除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════ 顧客統計 ════ */}
      {tab === 'stats' && (
        <div>
          <div className={s.statGrid}>
            {[
              { label: '總會員數',   value: stats.total },
              { label: '本月新增',   value: stats.newThisMonth },
              { label: '有消費記錄', value: stats.withOrders },
              { label: '平均集章數', value: stats.avgStamps },
            ].map(({ label, value }) => (
              <div key={label} className={s.statCard}>
                <div className={s.statLabel}>{label}</div>
                <div className={s.statValue}>{value}</div>
              </div>
            ))}
          </div>

          {/* 集章統計 */}
          <div className={s.sectionTitle}>集章統計</div>
          <div className={`${s.statGrid} ${p.stampStatMb}`}>
            {[
              { label: '已集滿可兌換', value: stats.stampsFull,      colorClass: p.statValueGreen },
              { label: '集章中（未滿）',value: stats.stampsInProgress, colorClass: p.statValueAmber },
            ].map(({ label, value, colorClass }) => (
              <div key={label} className={s.statCard}>
                <div className={s.statLabel}>{label}</div>
                <div className={`${s.statValue} ${colorClass}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* 消費前五名 */}
          <div className={s.sectionTitle}>消費前五名</div>
          <div className={s.tableWrap}>
            <table className={`${s.table} ${p.tableAlwaysVisible}`}>
              <thead><tr>{['排名', '姓名', '訂單數', '消費總額'].map((h, i) => <th key={h} className={i > 1 ? s.thRight : s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {stats.topSpenders.length === 0 ? (
                  <tr><td colSpan={4} className={s.emptyRow}>尚無消費記錄</td></tr>
                ) : stats.topSpenders.map((sp, i) => (
                  <tr key={sp.name} className={s.tr}>
                    <td className={`${s.td} ${i < 3 ? p.rankTop : p.rankOther}`}>#{i+1}</td>
                    <td className={s.td}>{sp.name}</td>
                    <td className={`${s.td} ${p.tdRight}`}>{sp.orders} 筆</td>
                    <td className={`${s.td} ${p.tdRightGreen}`}>NT$ {sp.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className={s.cardList}>
              {stats.topSpenders.length === 0 ? (
                <div className={s.emptyRow}>尚無消費記錄</div>
              ) : stats.topSpenders.map((sp, i) => (
                <div key={sp.name} className={s.card}>
                  <div className={s.cardRow}><span className={i < 3 ? p.rankMobileTop : p.rankMobileOther}>#{i+1}</span><span className={s.cardValue}>{sp.name}</span></div>
                  <div className={s.cardRow}><span className={s.cardLabel}>訂單</span><span className={s.cardValue}>{sp.orders} 筆</span></div>
                  <div className={s.cardRow}><span className={s.cardLabel}>總額</span><span className={p.spenderTotal}>NT$ {sp.total.toLocaleString()}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════ 會員詳情側邊面板 ════ */}
      {showDetail && detailMember && (
        <>
          <div onClick={() => setShowDetail(false)} className={s.sidePanelOverlay} />
          <div className={s.sidePanel}>
            {/* 頭部 */}
            <div className={p.detailHeader}>
              <div>
                <div className={p.detailName}>{detailMember.name ?? '—'}</div>
                <div className={p.detailPhone}>{detailMember.phone ?? '無電話'}</div>
              </div>
              <button onClick={() => setShowDetail(false)} className={s.modalClose}>×</button>
            </div>

            {/* 頁籤 */}
            <div className={p.detailTabs}>
              {([
                { key: 'profile',      label: '基本資料' },
                { key: 'stamp_logs',   label: '集章記錄' },
                { key: 'redemptions',  label: '兌換記錄' },
              ] as { key: DetailTab; label: string }[]).map(({ key, label }) => (
                <div key={key} onClick={() => setDetailTab(key)} className={detailTab === key ? p.detailTabActive : p.detailTab}>
                  {label}
                </div>
              ))}
            </div>

            {/* 內容 */}
            <div className={p.detailContent}>
              {/* 基本資料 */}
              {detailTab === 'profile' && (
                <div>
                  {[
                    { label: '姓名',     value: detailMember.name },
                    { label: 'Email',    value: detailMember.email },
                    { label: '手機',     value: detailMember.phone },
                    { label: '生日',     value: detailMember.birthday },
                    { label: '身份',     value: detailMember.role === 'admin' ? 'Admin' : 'Member' },
                    { label: '集章數',   value: `${detailMember.stamps} 章${(detailMember.stamps_frozen ?? 0) > 0 ? `（凍結 ${detailMember.stamps_frozen} 章）` : ''}` },
                    { label: '加入時間', value: new Date(detailMember.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) },
                  ].map(({ label, value }) => (
                    <div key={label} className={p.profileRow}>
                      <span className={p.profileLabel}>{label}</span>
                      <span className={p.profileValue}>{value ?? '—'}</span>
                    </div>
                  ))}

                  {/* 地址 */}
                  <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
                    <span className={p.profileLabel}>收件地址</span>
                    {detailAddresses.length === 0 ? (
                      <div className={p.profileValue} style={{ marginTop: 4 }}>尚未設定地址</div>
                    ) : (
                      detailAddresses.map((addr: any, i: number) => (
                        <div key={addr.id ?? i} style={{ marginTop: i === 0 ? 4 : 10, padding: '8px 0', borderBottom: i < detailAddresses.length - 1 ? '1px solid #f2f2f2' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.9em' }}>{addr.label || `地址 ${i + 1}`}</span>
                            {addr.is_default && <span style={{ fontSize: '0.75em', background: '#e8d5b0', color: '#6b5430', padding: '1px 6px', borderRadius: 4 }}>預設</span>}
                            {addr.type === 'cvs' && <span style={{ fontSize: '0.75em', background: '#d0e8f0', color: '#2a5a6b', padding: '1px 6px', borderRadius: 4 }}>超商</span>}
                          </div>
                          <div style={{ fontSize: '0.85em', color: '#555' }}>
                            {addr.name} {addr.phone}
                          </div>
                          <div style={{ fontSize: '0.85em', color: '#333' }}>
                            {addr.type === 'cvs'
                              ? `${addr.cvs_brand === '711' ? '7-11' : addr.cvs_brand} ${addr.store_name ?? ''} ${addr.store_address ?? ''}`
                              : `${addr.city ?? ''}${addr.district ?? ''}${addr.address ?? ''}`
                            }
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* 集章記錄 */}
              {detailTab === 'stamp_logs' && (
                logsLoading ? <div className={s.loadingText}>載入中...</div> :
                stampLogs.length === 0 ? <div className={s.loadingText}>尚無集章記錄</div> : (
                  <div>
                    {stampLogs.map(log => (
                      <div key={log.id} className={p.logItem}>
                        <div className={p.logContentFlex}>
                          <div className={p.logReason}>{log.reason ?? '—'}</div>
                          <div className={p.logMeta}>
                            {new Date(log.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
                            {log.admin_name && <span className={p.adminNameTag}>· {log.admin_name}</span>}
                          </div>
                        </div>
                        <div className={p.logChangeRight}>
                          <div className={`${p.logChange} ${log.change > 0 ? p.logChangePositive : p.logChangeNegative}`}>
                            {log.change > 0 ? '+' : ''}{log.change}
                          </div>
                          <div className={p.logRemain}>餘 {log.stamps_after} 章</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* 兌換記錄 */}
              {detailTab === 'redemptions' && (
                logsLoading ? <div className={s.loadingText}>載入中...</div> :
                redemptionLogs.length === 0 ? <div className={s.loadingText}>尚無兌換記錄</div> : (
                  <div>
                    {redemptionLogs.map(r => {
                      const statusLabelMap: Record<string, string> = { pending_cart: '等待中', pending_order: '訂單中', used: '已完成', released: '已取消', expired: '已過期', refunded: '已退還' };
                      const statusColorMap: Record<string, string> = { pending_cart: '#b87a2a', pending_order: '#2a7ab8', used: '#2ab85a', released: '#888580', expired: '#888580', refunded: '#c0392b' };
                      return (
                        <div key={r.id} className={p.redemptionItem}>
                          <div className={p.redemptionTop}>
                            <div className={p.redemptionName}>{r.reward_name}</div>
                            <span className={s.badge} style={{ color: statusColorMap[r.status] ?? 'var(--text-light)', border: `1px solid ${statusColorMap[r.status] ?? 'var(--text-light)'}` }}>
                              {statusLabelMap[r.status] ?? r.status}
                            </span>
                          </div>
                          <div className={p.redemptionMeta}>
                            <span>{new Date(r.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</span>
                            <span className={p.stampCostRed}>−{r.stamps_cost} 章</span>
                            <span>{r.type === 'code' ? `兌換碼：${r.redeem_code}` : '線上兌換'}</span>
                          </div>
                          {r.used_at && <div className={p.usedAtGreen}>核銷時間：{new Date(r.used_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</div>}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        </>
      )}

      {/* ════ 集章手動調整 Modal ════ */}
      {showStampModal && stampModalMember && (
        <>
          <div onClick={() => setShowStampModal(false)} className={s.modalOverlay} />
          <div className={`${s.modal} ${p.stampModalNarrow}`}>
            <h3 className={`${s.modalTitle} ${p.stampModalTitleMb}`}>
              手動{stampDelta > 0 ? '增加' : '扣除'}集章
            </h3>

            <div className={p.stampModalInfo}>
              <strong className={p.stampModalMemberName}>{stampModalMember.name}</strong>
              <span className={p.stampModalCurrentLabel}>目前 {stampModalMember.stamps} 章</span>
              <span className={`${p.stampModalResultLabel} ${stampDelta > 0 ? p.stampModalResultPositive : p.stampModalResultNegative}`}>
                → {Math.max(0, stampModalMember.stamps + stampDelta)} 章（{stampDelta > 0 ? '+' : ''}{stampDelta}）
              </span>
            </div>

            <div className={s.mb16}>
              <label className={s.label}>調整原因 *</label>
              <div className={p.reasonBtns}>
                {STAMP_REASONS.map(r => (
                  <button key={r} onClick={() => setStampReason(r)} className={stampReason === r ? p.reasonBtnActive : p.reasonBtn}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {stampReason === '其他' && (
              <div className={s.mb16}>
                <label className={s.label}>請說明原因</label>
                <input value={stampReasonOther} onChange={e => setStampReasonOther(e.target.value)} placeholder="請輸入原因" className={`${s.input} ${p.stampModalInputMt}`} />
              </div>
            )}

            <div className={`${s.btnActions} ${p.btnActionsMt24}`}>
              <button onClick={handleStampAdjust} disabled={savingStampAdj} className={`${s.btnSave} ${p.btnFlex1}`}>
                {savingStampAdj ? '處理中...' : '確認'}
              </button>
              <button onClick={() => setShowStampModal(false)} className={`${s.btnCancel} ${p.btnFlex1}`}>
                取消
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
