import { ImageResponse } from "next/og";
import { siteConfig, ogTheme } from "@/config/site";

export const alt = `${siteConfig.product.name} — ${siteConfig.product.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: ogTheme.background,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "60px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                background: ogTheme.accent,
              }}
            />
            <span
              style={{
                fontSize: "24px",
                color: "rgba(255,255,255,0.6)",
                fontWeight: 400,
              }}
            >
              {new URL(siteConfig.urls.base).host}
            </span>
          </div>
          <h1
            style={{
              fontSize: "72px",
              fontWeight: 700,
              color: "white",
              textAlign: "center",
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            {siteConfig.product.name}
          </h1>
          <p
            style={{
              fontSize: "28px",
              color: "rgba(255,255,255,0.7)",
              textAlign: "center",
              maxWidth: "800px",
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            {siteConfig.product.tagline}
          </p>
        </div>
      </div>
    ),
    { ...size }
  );
}
