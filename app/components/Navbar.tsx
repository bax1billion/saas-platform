"use client";

import { useState, useEffect, useRef } from "react";
import EarlyAccessButton from "./EarlyAccessButton";
import { useAuth } from "./AuthContext";
import { siteConfig } from "@/config/site";

export default function Navbar() {
  const { user, isAuthenticated, isLoading, openAuthModal, handleSignOut } =
    useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  const initial = user?.email?.charAt(0).toUpperCase() ?? "?";

  return (
    <nav className="sticky top-0 z-50 border-b border-muted bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2 font-serif text-xl font-bold text-foreground">
          <img src="/logo.png" alt={siteConfig.product.name} width={28} height={28} className="h-7 w-7" />
          {siteConfig.product.name}
        </a>
        <div className="flex items-center gap-6">
          {siteConfig.nav.main.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="hidden text-sm font-medium text-foreground/70 transition-colors hover:text-foreground sm:block"
            >
              {item.label}
            </a>
          ))}

          {!isLoading && !isAuthenticated && (
            <button
              onClick={() => openAuthModal("signIn")}
              className="hidden text-sm font-medium text-foreground/70 transition-colors hover:text-foreground sm:block"
            >
              Login
            </button>
          )}

          {!isLoading && isAuthenticated && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white transition-opacity hover:opacity-90"
                aria-label="User menu"
              >
                {initial}
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 min-w-[200px] rounded-lg border border-foreground/10 bg-background p-3 shadow-lg">
                  <p className="truncate text-sm text-foreground/60">
                    {user?.email}
                  </p>
                  <div className="my-2 border-t border-foreground/10" />
                  <a
                    href="/dashboard"
                    className="block w-full text-left text-sm font-medium text-foreground transition-colors hover:text-primary"
                  >
                    Open app
                  </a>
                  <div className="my-2 border-t border-foreground/10" />
                  <button
                    onClick={async () => {
                      setIsDropdownOpen(false);
                      await handleSignOut();
                    }}
                    className="w-full text-left text-sm text-foreground/70 transition-colors hover:text-foreground"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}

          <EarlyAccessButton
            source="HOMEPAGE_HERO"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Get Early Access
          </EarlyAccessButton>
        </div>
      </div>
    </nav>
  );
}
