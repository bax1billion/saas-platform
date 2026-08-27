import type { ModuleDef } from "@/lib/modules/types";

const sizes = {
  sm: { box: "h-7 w-7 rounded-md", icon: "h-4 w-4" },
  md: { box: "h-9 w-9 rounded-lg", icon: "h-5 w-5" },
  lg: { box: "h-11 w-11 rounded-lg", icon: "h-6 w-6" },
} as const;

/** The module's icon in a tile tinted with the module accent. */
export default function ModuleIcon({
  module,
  size = "md",
  className = "",
}: {
  module: ModuleDef;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const Icon = module.icon;
  const s = sizes[size];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${s.box} ${className}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${module.accent} 14%, transparent)`,
        color: module.accent,
      }}
    >
      <Icon className={s.icon} strokeWidth={1.75} />
    </span>
  );
}
