'use client';

// components/CartDrawer.tsx  ──  購物車側邊欄

import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';

export default function CartDrawer() {
  const router = useRouter();
  const { items, totalPrice, totalCount, removeItem, updateQty, clearCart, isOpen, closeCart, cartType, mixedShipDate } = useCart();

  const hasMixed = items.some(i => i.isPreorder) && items.some(i => !i.isPreorder);

  const handleCancelRedeem = async (item: any) => {
    if (!confirm(`確定要取消「${item.name}」的兌換嗎？章數將立即歸還。`)) return;
    if (item.redemptionId) {
      await fetch('/api/redeem?action=cancel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ redemption_id: item.redemptionId }),
      });
    }
    removeItem(item.id, item.variantId);
  };

  return (
    <>
      {/* 遮罩 */}
      <div
        onClick={closeCart}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300, opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none', transition: 'opacity 0.3s' }}
      />

      {/* 抽屜 */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '400px', maxWidth: '90vw',
        background: '#F7F4EF', zIndex: 301,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
      }}>
        {/* 標題 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E8E4DC', background: '#fff' }}>
          <div>
            <span style={{ fontFamily: '"Montserrat", sans-serif', fontSize: '9px', letterSpacing: '0.35em', color: '#888580', textTransform: 'uppercase' }}>CART</span>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1E1C1A' }}>
              購物車 {totalCount > 0 && <span style={{ fontSize: '12px', color: '#888580', fontWeight: 400 }}>（{totalCount} 件）</span>}
            </div>
          </div>
          <button onClick={closeCart} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888580', padding: '4px 8px' }}>×</button>
        </div>

        {/* 混購提示條 */}
        {hasMixed && mixedShipDate && (
          <div style={{ padding: '10px 16px', background: '#fff8e1', borderBottom: '1px solid #f0c040', fontSize: '12px', color: '#7a5c00', lineHeight: 1.8 }}>
            ⚠️ 此購物車包含預購商品，若一起結帳，將於 <strong>{mixedShipDate}</strong> 統一出貨。
          </div>
        )}

        {/* 商品列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
          {items.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🛍</div>
              <p style={{ fontSize: '13px', color: '#888580' }}>購物車是空的</p>
            </div>
          ) : items.map(item => {
            const key = item.variantId ? `${item.id}_${item.variantId}` : item.id;
            return (
              <div key={key} style={{ display: 'flex', gap: '14px', padding: '12px 20px', borderBottom: '1px solid #E8E4DC' }}>
                {/* 商品圖 */}
                <div style={{ width: '60px', height: '60px', background: '#EDE9E2', flexShrink: 0, overflow: 'hidden' }}>
                  {item.imageUrl && <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                {/* 商品資訊 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: '#1E1C1A', marginBottom: '2px', letterSpacing: '0.05em' }}>
                    {item.name}
                    {item.isRedeemItem && <span style={{ fontSize: '10px', color: '#2ab85a', border: '1px solid #2ab85a', padding: '1px 6px', marginLeft: '6px', fontFamily: '"Montserrat", sans-serif' }}>兌換品</span>}
                  </div>
                  {item.variantName && <div style={{ fontSize: '11px', color: '#888580', marginBottom: '4px' }}>{item.variantName}</div>}
                  {item.isPreorder && item.preorderShipDate && (
                    <div style={{ fontSize: '10px', color: '#2a5a8c', marginBottom: '4px', fontFamily: '"Montserrat", sans-serif' }}>預購 · 出貨 {item.preorderShipDate}</div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* 數量調整（兌換品鎖定不能改數量）*/}
                    {item.isRedeemItem ? (
                      <span style={{ fontSize: '12px', color: '#888580' }}>× 1（兌換品）</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #E8E4DC' }}>
                        <button onClick={() => updateQty(item.id, item.qty - 1, item.variantId)} style={{ width: '28px', height: '28px', background: 'transparent', border: 'none', fontSize: '14px', cursor: 'pointer', color: '#1E1C1A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <span style={{ width: '32px', textAlign: 'center', fontSize: '12px', color: '#1E1C1A', borderLeft: '1px solid #E8E4DC', borderRight: '1px solid #E8E4DC', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.qty}</span>
                        <button onClick={() => updateQty(item.id, item.qty + 1, item.variantId)} style={{ width: '28px', height: '28px', background: 'transparent', border: 'none', fontSize: '14px', cursor: 'pointer', color: '#1E1C1A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      </div>
                    )}
                    <span style={{ fontFamily: '"Noto Serif TC", serif', fontSize: '14px', fontWeight: 200, color: item.isRedeemItem ? '#2ab85a' : '#1E1C1A' }}>
                      {item.isRedeemItem ? '免費' : `NT$ ${(item.price * item.qty).toLocaleString()}`}
                    </span>
                  </div>
                </div>
                {/* 刪除按鈕 / 取消兌換按鈕 */}
                {item.isRedeemItem ? (
                  <button onClick={() => handleCancelRedeem(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', fontSize: '11px', alignSelf: 'flex-start', padding: '2px', fontFamily: '"Noto Sans TC", sans-serif', whiteSpace: 'nowrap' }}>取消</button>
                ) : (
                  <button onClick={() => removeItem(item.id, item.variantId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888580', fontSize: '16px', alignSelf: 'flex-start', padding: '2px' }}>×</button>
                )}
              </div>
            );
          })}
        </div>

        {/* 底部 */}
        {items.length > 0 && (
          <div style={{ padding: '20px 24px', borderTop: '1px solid #E8E4DC', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', color: '#888580' }}>小計</span>
              <span style={{ fontFamily: '"Noto Serif TC", serif', fontSize: '18px', fontWeight: 200, color: '#1E1C1A' }}>NT$ {totalPrice.toLocaleString()}</span>
            </div>
            <button
              onClick={() => { closeCart(); router.push('/checkout'); }}
              style={{ width: '100%', padding: '14px', background: '#1E1C1A', color: '#F7F4EF', border: 'none', fontFamily: '"Montserrat", sans-serif', fontSize: '12px', fontWeight: 600, letterSpacing: '0.35em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: '10px' }}
            >
              前往結帳
            </button>
            <button
              onClick={() => { if (confirm('確定要清空購物車嗎？')) clearCart(); }}
              style={{ width: '100%', padding: '10px', background: 'transparent', color: '#888580', border: '1px solid #E8E4DC', fontFamily: '"Montserrat", sans-serif', fontSize: '11px', letterSpacing: '0.2em', cursor: 'pointer' }}
            >
              清空購物車
            </button>
          </div>
        )}
      </div>
    </>
  );
}
