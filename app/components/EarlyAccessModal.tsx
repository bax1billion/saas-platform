"use client";

import { useState, FormEvent, useEffect } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { useEarlyAccess } from "./EarlyAccessContext";
import { siteConfig } from "@/config/site";

const client = generateClient<Schema>({ authMode: "apiKey" });

export default function EarlyAccessModal() {
  const { isOpen, source, close } = useEarlyAccess();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    try {
      await client.models.NewsletterSubscriber.create({
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        company: company.trim(),
        source: source as Schema["NewsletterSubscriber"]["type"]["source"],
        status: "PENDING",
        sortDate: new Date().toISOString(),
      });
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    }
  };

  const handleClose = () => {
    close();
    // Reset form after animation
    setTimeout(() => {
      setFirstName("");
      setLastName("");
      setEmail("");
      setCompany("");
      setStatus("idle");
      setErrorMsg("");
    }, 200);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-dark/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl bg-background p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-foreground/40 transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M15 5L5 15M5 5l10 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {status === "success" ? (
          <div className="text-center py-4">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="var(--primary)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="font-serif text-2xl font-bold text-foreground">
              You&apos;re on the list
            </h3>
            <p className="mt-2 text-foreground/60">
              We&apos;ll be in touch soon with early access details.
            </p>
            <button
              onClick={handleClose}
              className="mt-6 rounded-lg bg-brand-dark px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark/90"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h3 className="font-serif text-2xl font-bold text-foreground">
              Get early access
            </h3>
            <p className="mt-1 text-sm text-foreground/60">
              Be among the first to use {siteConfig.product.name}.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="ea-first-name"
                    className="block text-sm font-medium text-foreground/70"
                  >
                    First name
                  </label>
                  <input
                    id="ea-first-name"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-foreground/15 px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label
                    htmlFor="ea-last-name"
                    className="block text-sm font-medium text-foreground/70"
                  >
                    Last name
                  </label>
                  <input
                    id="ea-last-name"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-foreground/15 px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="ea-email"
                  className="block text-sm font-medium text-foreground/70"
                >
                  Work email
                </label>
                <input
                  id="ea-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-foreground/15 px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="jane@company.com"
                />
              </div>

              <div>
                <label
                  htmlFor="ea-company"
                  className="block text-sm font-medium text-foreground/70"
                >
                  Company
                </label>
                <input
                  id="ea-company"
                  type="text"
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-foreground/15 px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Acme Inc."
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className="w-full rounded-lg bg-primary px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {status === "submitting" ? "Submitting..." : "Request early access"}
              </button>

              <p className="text-center text-xs text-foreground/40">
                No spam. We&apos;ll only email you about early access.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
