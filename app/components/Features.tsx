import { constructIcons } from "./icons";
import type { ComponentType, SVGProps } from "react";

const features: {
  title: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number }>;
}[] = [
  {
    title: "Multi-tenant workspaces",
    description:
      "Give every customer an isolated workspace with its own members, data and settings. Clean separation by default.",
    icon: constructIcons.workspaces,
  },
  {
    title: "Role-based access",
    description:
      "Invite teammates with the right level of permission. Owners, admins and members work out of the box.",
    icon: constructIcons.access,
  },
  {
    title: "Billing & plans",
    description:
      "Subscriptions, upgrades and invoices handled end to end. Customers change plans without a support ticket.",
    icon: constructIcons.billing,
  },
  {
    title: "Audit trail",
    description:
      "Every important action is logged with who, what and when. A complete history you can rely on.",
    icon: constructIcons.auditTrail,
  },
];

export default function Features() {
  return (
    <section id="features" className="bg-muted py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
            Everything you need to launch
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-foreground/60">
            Four modules. One solid foundation. No enterprise bloat.
          </p>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-xl border border-foreground/5 bg-background p-8 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4">
                  <Icon className="h-8 w-8 text-primary" strokeWidth={1.5} />
                </div>
                <h3 className="font-serif text-xl font-bold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-3 leading-relaxed text-foreground/60">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
