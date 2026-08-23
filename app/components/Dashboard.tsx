const dashboardItems = [
  {
    label: "Active users",
    status: "green" as const,
    count: "128",
  },
  {
    label: "Tasks completed",
    status: "green" as const,
    count: "47/52",
  },
  {
    label: "Projects on track",
    status: "amber" as const,
    count: "9/12",
  },
  {
    label: "Items overdue",
    status: "red" as const,
    count: "3",
  },
];

const statusColors = {
  green: "bg-primary",
  amber: "bg-warning",
  red: "bg-destructive",
};

const statusBgColors = {
  green: "bg-primary/10",
  amber: "bg-warning/10",
  red: "bg-destructive/10",
};

export default function Dashboard() {
  return (
    <section className="bg-background py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
              Know where things stand at a glance
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-foreground/60">
              The overview dashboard shows red, yellow and green across
              everything your team is working on. No more chasing status —
              spot problems early and act with confidence.
            </p>
            <ul className="mt-6 space-y-3">
              <li className="flex items-center gap-3 text-foreground/70">
                <span className="inline-block h-3 w-3 rounded-full bg-primary" />
                On track — everything up to date, nothing to do
              </li>
              <li className="flex items-center gap-3 text-foreground/70">
                <span className="inline-block h-3 w-3 rounded-full bg-warning" />
                Needs attention — action needed soon
              </li>
              <li className="flex items-center gap-3 text-foreground/70">
                <span className="inline-block h-3 w-3 rounded-full bg-destructive" />
                Overdue — past its due date, blocking progress
              </li>
            </ul>
          </div>

          {/* Dashboard mockup */}
          <div className="rounded-xl border border-foreground/10 bg-muted p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-sm font-bold text-foreground">
                Workspace Overview
              </h3>
              <span className="text-xs text-foreground/40">This month</span>
            </div>
            <div className="space-y-3">
              {dashboardItems.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center justify-between rounded-lg ${statusBgColors[item.status]} px-4 py-3`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${statusColors[item.status]}`}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-foreground/5 bg-background px-4 py-3">
              <div className="flex items-center justify-between text-xs text-foreground/50">
                <span>Overall progress</span>
                <span className="font-semibold text-primary">87%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: "87%" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
