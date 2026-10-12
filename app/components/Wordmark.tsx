import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * The product mark: the logo from public/ (config/site.ts lists the
 * assets a product supplies). The sidebar's compact state shows it alone.
 */
export function Mark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={cn("shrink-0 rounded-md", className)}
    />
  );
}

/** The wordmark: the mark and the product name, linking home. */
export function Wordmark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label={`${siteConfig.product.name} home`}
      className={cn("inline-flex items-center gap-2.5 text-lg font-bold no-underline", className)}
    >
      <Mark />
      {siteConfig.product.name}
    </Link>
  );
}
