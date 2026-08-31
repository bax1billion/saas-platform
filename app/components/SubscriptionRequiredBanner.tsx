import Link from "next/link";
import { CreditCard } from "lucide-react";

/**
 * Shown in the app shell when the org has no access-granting subscription.
 * Reads still work (data stays viewable/exportable after a lapse); the
 * backend rejects writes with SubscriptionRequired until a plan is active.
 */
export default function SubscriptionRequiredBanner() {
  return (
    <div className="flex items-center gap-3 border-b border-info/40 bg-info/10 px-4 py-2.5 text-sm text-foreground">
      <CreditCard className="h-4 w-4 shrink-0 text-info" />
      <span className="flex-1">
        No active plan — you can view existing records, but creating or
        editing needs a subscription.
      </span>
      <Link
        href="/subscribe"
        className="font-semibold text-primary hover:underline"
      >
        Choose a plan
      </Link>
    </div>
  );
}
