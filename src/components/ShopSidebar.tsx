'use client';

// components/ShopSidebar.tsx  ──  商店分類欄（responsive）

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import s from './ShopSidebar.module.css';

interface Category { id: number; name: string; slug: string; }
interface Product   { id: number; name: string; slug: string; }

interface ShopSidebarProps {
  categories: Category[];
  activeSlug?: string;
}

export default function ShopSidebar({ categories, activeSlug }: ShopSidebarProps) {
  const [filterOpen,  setFilterOpen]  = useState(false);
  const [openSlugs,   setOpenSlugs]   = useState<string[]>(() => categories.map(c => c.slug));
  const [productMap,  setProductMap]   = useState<Record<number, Product[]>>({});
  const [limit,       setLimit]        = useState(3);

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
    setOpenSlugs(prev => prev.includes(slug) ? prev.filter(x => x !== slug) : [...prev, slug]);
  };

  return (
    <aside className={s.sidebar}>
      {/* 手機篩選開關 */}
      <button className={s.filterToggle} onClick={() => setFilterOpen(v => !v)}>
        <span className={s.filterIcon}>☰</span>
        分類篩選
        <span className={`${s.filterArrow} ${filterOpen ? s.open : ''}`}>⌄</span>
      </button>

      {/* 分類列表 */}
      <div className={`${s.catList} ${filterOpen ? s.open : ''}`}>
        {categories.map(cat => {
          const isOpen   = openSlugs.includes(cat.slug);
          const isActive = cat.slug === activeSlug;
          const allProds = productMap[cat.id] ?? [];
          const shown    = allProds.slice(0, limit);
          const hasMore  = allProds.length > limit;

          return (
            <div key={cat.slug} className={s.catItem}>
              <button
                className={`${s.catHeader} ${isActive ? s.active : ''}`}
                onClick={() => toggle(cat.slug)}
              >
                <span>{cat.name}</span>
                <span className={`${s.catChevron} ${isOpen ? s.open : ''}`}>⌄</span>
              </button>

              {isOpen && (
                <div className={s.catBody}>
                  {shown.map(p => (
                    <Link key={p.id} href={`/product/${p.slug}`} className={s.prodLink}>
                      {p.name}
                    </Link>
                  ))}
                  <Link
                    href={`/shop/${cat.slug}`}
                    className={`${s.viewAll} ${isActive ? s.active : ''}`}
                  >
                    {hasMore ? `查看全部（${allProds.length} 件）→` : allProds.length > 0 ? '查看全部 →' : '查看全部'}
                  </Link>
                  {isActive && (
                    <Link href="/shop" className={s.backAll}>← 所有商品</Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
