import { ImageResponse } from "next/og";
import { getPostBySlug, getAllPosts } from "@/lib/blog";
import { siteConfig, ogTheme } from "@/config/site";

export const alt = `${siteConfig.product.name} Blog`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  return new ImageResponse(
    (
      <div
        style={{
          background: ogTheme.background,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "8px",
            }}
          >
            {post.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  background: "rgba(0,122,94,0.3)",
                  border: "1px solid rgba(0,122,94,0.5)",
                  borderRadius: "20px",
                  padding: "4px 14px",
                  fontSize: "16px",
                  color: "rgba(255,255,255,0.8)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
          <h1
            style={{
              fontSize: "56px",
              fontWeight: 700,
              color: "white",
              lineHeight: 1.15,
              margin: 0,
              maxWidth: "900px",
            }}
          >
            {post.title}
          </h1>
          <p
            style={{
              fontSize: "22px",
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.4,
              margin: 0,
              maxWidth: "800px",
            }}
          >
            {post.description}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: ogTheme.accent,
              }}
            />
            <span
              style={{
                fontSize: "20px",
                color: "rgba(255,255,255,0.5)",
                fontWeight: 600,
              }}
            >
              {siteConfig.product.name}
            </span>
          </div>
          <span
            style={{
              fontSize: "18px",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            {post.date}
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
