'use client';

// components/ShopSidebar.tsx  ──  商店左側分類欄

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Category { id: number; name: string; slug: string; }
interface Product   { id: number; name: string; slug: string; }

interface ShopSidebarProps {
  categories: Category[];
  activeSlug?: string;
}

export default function ShopSidebar({ categories, activeSlug }: ShopSidebarProps) {
  const [openSlugs,   setOpenSlugs]   = useState<string[]>(() => categories.map(c => c.slug));
  const [productMap,  setProductMap]  = useState<Record<number, Product[]>>({});
  const [limit,       setLimit]       = useState(3);

  useEffect(() => {
    if (categories.length === 0) return;
    const load = async () => {
      const [{ data: products }, { data: settings }] = await Promise.all([
        supabase.from('products').select('id, name, slug, category_id').eq('is_available', true).order('sort_order'),
        supabase.from('store_settings').select('sidebar_product_limit').eq('id', 1).single(),
      ]);

      if (settings?.sidebar_product_limit) setLimit(settings.sidebar_product_limit);

      if (products) {
        const map: Record<number, Product[]> = {};
        products.forEach((p: any) => {
          if (!map[p.category_id]) map[p.category_id] = [];
          map[p.category_id].push({ id: p.id, name: p.name, slug: p.slug });
        });
        setProductMap(map);
      }
    };
    load();
  }, [categories]);

  const toggle = (slug: string) => {
    setOpenSlugs(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  };

  return (
    <aside>
      {categories.map(cat => {
        const isOpen    = openSlugs.includes(cat.slug);
        const isActive  = cat.slug === activeSlug;
        const allProds  = productMap[cat.id] ?? [];
        const shown     = allProds.slice(0, limit);
        const hasMore   = allProds.length > limit;

        return (
          <div key={cat.slug} style={{ borderBottom: '1px solid #E8E4DC', padding: '18px 0' }}>
            <div
              onClick={() => toggle(cat.slug)}
              style={{
                display: 'flex', justifyContent: 'space-between',
                fontFamily: '"Noto Sans TC", sans-serif',
                fontSize: '13px', fontWeight: isActive ? 700 : 600,
                letterSpacing: '0.15em',
                color: isActive ? '#1E1C1A' : '#555250',
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              <span>{cat.name}</span>
              <span style={{ display: 'inline-block', transition: 'transform 0.3s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', fontSize: '11px' }}>⌄</span>
            </div>

            {isOpen && (
              <div style={{ paddingTop: '12px', display: 'grid', gap: '8px' }}>
                {shown.map(p => (
                  <Link
                    key={p.id}
                    href={`/product/${p.slug}`}
                    style={{
                      fontSize: '12px', color: '#555250', fontWeight: 300,
                      textDecoration: 'none', letterSpacing: '0.05em',
                      lineHeight: 1.8, paddingLeft: '8px',
                      borderLeft: '2px solid transparent', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#1E1C1A'; (e.currentTarget as HTMLElement).style.borderLeftColor = '#1E1C1A'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#555250'; (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent'; }}
                  >
                    {p.name}
                  </Link>
                ))}

                <Link
                  href={`/shop/${cat.slug}`}
                  style={{
                    fontSize: '11px', color: isActive ? '#1E1C1A' : '#888580',
                    fontWeight: isActive ? 500 : 300, textDecoration: 'none',
                    letterSpacing: '0.1em', fontFamily: '"Montserrat", sans-serif',
                    paddingLeft: '8px', marginTop: allProds.length > 0 ? '4px' : '0',
                  }}
                >
                  {hasMore ? `查看全部（${allProds.length} 件）→` : allProds.length > 0 ? '查看全部 →' : '查看全部'}
                </Link>

                {isActive && (
                  <Link href="/shop" style={{ fontSize: '11px', color: '#888580', textDecoration: 'none', letterSpacing: '0.1em', fontFamily: '"Montserrat", sans-serif', paddingLeft: '8px' }}>
                    ← 所有商品
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
