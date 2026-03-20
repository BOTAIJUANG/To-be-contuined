"use client";

import Link from "next/link";

export default function ShopButton() {
  return (
    <Link
      href="/shop"
      style={{
        display: "inline-flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "12px 44px",
        border: "1px solid rgba(0,0,0,0.18)",
        background: "transparent",
        fontFamily: '"Montserrat", sans-serif',
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.35em",
        textTransform: "uppercase" as const,
        color: "#1E1C1A",
        textDecoration: "none",
        cursor: "pointer",
        transition: "all 0.5s cubic-bezier(0.6,0,0.2,1)",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.background = "#1E1C1A";
        el.style.color = "#F7F4EF";
        el.style.transform = "translateY(-2px)";
        el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.12)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.background = "transparent";
        el.style.color = "#1E1C1A";
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "none";
      }}
    >
      立即選購
    </Link>
  );
}
