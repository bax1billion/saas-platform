"use client";

import { useEarlyAccess } from "./EarlyAccessContext";

export default function EarlyAccessButton({
  source = "OTHER",
  className = "",
  children = "Get Early Access",
}: {
  source?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { open } = useEarlyAccess();

  return (
    <button onClick={() => open(source)} className={className}>
      {children}
    </button>
  );
}
