// Placeholder "trust strip" section. A vertical build typically repurposes
// this (e.g. certifications, integrations, customer logos) or removes it —
// the component keeps the name `Standards` so page.tsx stays unchanged.
const standards = [
  "Next.js",
  "AWS Amplify",
  "Stripe",
  "Amazon Cognito",
  "DynamoDB",
  "Tailwind CSS",
  "TypeScript",
];

export default function Standards() {
  return (
    <section className="border-y border-foreground/5 bg-muted py-16">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="font-serif text-2xl font-bold text-foreground sm:text-3xl">
          Built on a proven stack
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-foreground/60">
          Battle-tested infrastructure and tooling, so you can focus on your
          product instead of plumbing.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {standards.map((standard) => (
            <span
              key={standard}
              className="rounded-full border border-foreground/10 bg-background px-5 py-2 text-sm font-medium text-foreground"
            >
              {standard}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
