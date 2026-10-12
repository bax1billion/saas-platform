import type { OutboxExecutor } from "@/lib/offline/types";

/**
 * Which modules save through the device outbox (lib/offline,
 * docs/offline.md), and the sender for each. Registered once for the whole
 * signed-in app, so a module's queued work keeps sending while the person
 * is on any screen. Downstream-owned: a module joins by adding its sender
 * here, keyed by its outbox scope.
 *
 *   import { WIDGETS_SCOPE, widgetsSender } from "@/modules/widgets/offline";
 *   export const offlineSenders = { [WIDGETS_SCOPE]: widgetsSender };
 */
export const offlineSenders: Readonly<Record<string, OutboxExecutor>> = {};
