// ════════════════════════════════════════════════
// lib/useSettings.ts  ──  讀取商店設定的 hook
//
// 所有前台頁面都可以用這個 hook 讀取商店設定
// 資料從 Supabase store_settings 表（id=1）讀取
// 會 cache 在 module 層級，避免每頁重複查詢
// ════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { supabase } from "./supabase";

export interface StoreSettings {
  name: string;
  description: string;
  email: string;
  phone: string;
  address: string;
  instagram_url: string;
  facebook_url: string;
  line_id: string;
  hero_title: string;
  hero_sub: string;
  hero_desc: string;
  hero_btn: string;
  about_title: string;
  about_body: string;
  about_image_url: string;
  ship_home_normal: boolean;
  ship_home_cold: boolean;
  ship_cvs_711: boolean;
  ship_cvs_family: boolean;
  ship_store: boolean;
  fee_home_normal: number;
  fee_home_cold: number;
  fee_cvs: number;
  free_ship_amount: number;
  stamp_enabled: boolean;
  stamp_threshold: number;
  stamp_goal: number;
  stamp_expiry: number;
  stamp_card_name: string;
}

// 預設值（載入前的佔位）
export const DEFAULT_SETTINGS: StoreSettings = {
  name: "未半甜點",
  description: "以純粹視覺為引，將甜點的細膩質地融入潔白空間。",
  email: "",
  phone: "039-381-241",
  address: "260 宜蘭縣宜蘭市神農路二段 96 號",
  instagram_url: "",
  facebook_url: "",
  line_id: "",
  hero_title: "未半甜點",
  hero_sub: "手工甜點 · 2024",
  hero_desc: "以純粹視覺為引，將甜點的細膩質地融入潔白空間。",
  hero_btn: "立即選購",
  about_title: "關於未半",
  about_body: "未半甜點希望讓甜點從複雜回到純粹。",
  about_image_url: "",
  ship_home_normal: true,
  ship_home_cold: true,
  ship_cvs_711: true,
  ship_cvs_family: true,
  ship_store: true,
  fee_home_normal: 100,
  fee_home_cold: 200,
  fee_cvs: 60,
  free_ship_amount: 0,
  stamp_enabled: true,
  stamp_threshold: 200,
  stamp_goal: 8,
  stamp_expiry: 365,
  stamp_card_name: "未半甜點護照",
};

// 全域 cache（避免重複請求）
let settingsCache: StoreSettings | null = null;

export function useSettings() {
  const [settings, setSettings] = useState<StoreSettings>(
    settingsCache ?? DEFAULT_SETTINGS,
  );
  const [loading, setLoading] = useState(!settingsCache);

  useEffect(() => {
    if (settingsCache) return; // 已有 cache，不重新請求

    const load = async () => {
      const { data } = await supabase
        .from("store_settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (data) {
        const merged = { ...DEFAULT_SETTINGS, ...data };
        settingsCache = merged;
        setSettings(merged);
      }
      setLoading(false);
    };
    load();
  }, []);

  return { settings, loading };
}
