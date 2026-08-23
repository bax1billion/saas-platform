import { getAllPosts, getPostBySlug } from "@/lib/blog";
import { evaluate } from "@mdx-js/mdx";
import { Fragment } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import type { EvaluateOptions } from "@mdx-js/mdx";
import type { Metadata } from "next";
import Link from "next/link";
import EarlyAccessButton from "@/app/components/EarlyAccessButton";
import { siteConfig, pageTitle, absoluteUrl } from "@/config/site";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  return {
    title: pageTitle(post.title),
    description: post.description,
    alternates: {
      canonical: `/blog/${slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  const { default: MDXContent } = await evaluate(post.content, {
    Fragment,
    jsx: jsx as unknown as EvaluateOptions["jsx"],
    jsxs: jsxs as unknown as EvaluateOptions["jsxs"],
  });

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: {
      "@type": "Organization",
      name: post.author,
    },
    publisher: {
      "@type": "Organization",
      name: siteConfig.company.brandName,
      url: siteConfig.urls.base,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": absoluteUrl(`/blog/${slug}`),
    },
    keywords: post.tags.join(", "),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: absoluteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: absoluteUrl("/blog"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: absoluteUrl(`/blog/${slug}`),
      },
    ],
  };

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <Link
        href="/blog"
        className="text-sm font-medium text-primary hover:text-foreground transition-colors"
      >
        &larr; Back to blog
      </Link>

      <header className="mt-8">
        <time className="text-sm text-foreground/50">{post.date}</time>
        <h1 className="mt-2 font-serif text-4xl font-bold text-foreground">
          {post.title}
        </h1>
        <p className="mt-2 text-sm text-foreground/60">By {post.author}</p>
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
      </header>

      <div className="prose mt-12 max-w-none">
        <MDXContent />
      </div>

      <div className="mt-16 rounded-xl bg-muted p-8 text-center">
        <h2 className="font-serif text-2xl font-bold text-foreground">
          Ready to get started with {siteConfig.product.name}?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-foreground/70">
          {siteConfig.product.description}
        </p>
        <EarlyAccessButton
          source="BLOG"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          Get Early Access
        </EarlyAccessButton>
      </div>
    </article>
  );
}
