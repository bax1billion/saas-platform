import { landing, type PreviewStatus } from "@/config/landing";

const dotColors: Record<PreviewStatus, string> = {
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-destructive",
};

const rowColors: Record<PreviewStatus, string> = {
  green: "bg-success/10",
  amber: "bg-warning/10",
  red: "bg-destructive/10",
};

/** "Product preview" landing section: copy + a static status-board mockup. */
export default function ProductPreview() {
  const { preview } = landing;

  return (
    <section className="bg-background py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
              {preview.headline}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-foreground/60">
              {preview.subheadline}
            </p>
            <ul className="mt-6 space-y-3">
              {preview.legend.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-3 text-foreground/70"
                >
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${dotColors[item.status]}`}
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          {/* Status-board mockup */}
          <div className="rounded-xl border border-foreground/10 bg-muted p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-sm font-bold text-foreground">
                {preview.mock.title}
              </h3>
              <span className="text-xs text-foreground/40">
                {preview.mock.caption}
              </span>
            </div>
            <div className="space-y-3">
              {preview.mock.rows.map((row) => (
                <div
                  key={row.label}
                  className={`flex items-center justify-between rounded-lg ${rowColors[row.status]} px-4 py-3`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${dotColors[row.status]}`}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {row.label}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-foreground/5 bg-background px-4 py-3">
              <div className="flex items-center justify-between text-xs text-foreground/50">
                <span>{preview.mock.progressLabel}</span>
                <span className="font-semibold text-primary">
                  {preview.mock.progressPct}%
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${preview.mock.progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
