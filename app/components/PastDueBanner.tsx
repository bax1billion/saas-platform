import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/** Shown at the top of the app shell while the subscription is PAST_DUE. */
export default function PastDueBanner() {
  return (
    <div className="flex items-center gap-3 border-b border-warning/40 bg-warning/15 px-4 py-2.5 text-sm text-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
      <span className="flex-1">
        Your last payment failed. Update your payment method to keep access.
      </span>
      <Link
        href="/settings/billing"
        className="font-semibold text-primary hover:underline"
      >
        Update billing
      </Link>
    </div>
  );
}
