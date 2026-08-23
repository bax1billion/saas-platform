import { getAllPosts } from "@/lib/blog";
import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig, pageTitle } from "@/config/site";

const blogDescription = `Guides, insights, and product updates from the ${siteConfig.product.name} team.`;

export const metadata: Metadata = {
  title: pageTitle("Blog"),
  description: blogDescription,
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    title: pageTitle("Blog"),
    description: blogDescription,
    siteName: siteConfig.product.name,
    type: "website",
  },
};

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="font-serif text-4xl font-bold text-foreground">Blog</h1>
      <p className="mt-3 text-lg text-foreground/70">{blogDescription}</p>

      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group rounded-xl border border-muted p-6 transition-shadow hover:shadow-lg"
          >
            <time className="text-sm text-foreground/50">{post.date}</time>
            <h2 className="mt-2 font-serif text-xl font-bold text-foreground group-hover:text-primary transition-colors">
              {post.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70">
              {post.description}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
