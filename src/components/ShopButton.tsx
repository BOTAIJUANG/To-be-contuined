"use client";

import Link from "next/link";
import s from "./ShopButton.module.css";

export default function ShopButton() {
  return (
    <Link href="/shop" className={s.btn}>
      立即選購
    </Link>
  );
}
