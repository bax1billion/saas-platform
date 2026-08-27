"use client";

import { useEffect, useState } from "react";
import { useEntitlements } from "@/app/components/EntitlementsContext";
import { getDataClient, type Schema } from "@/lib/data-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type UserRecord = Schema["User"]["type"];

export default function OrganizationSettingsPage() {
  const { org, userRecord } = useEntitlements();
  const [members, setMembers] = useState<UserRecord[]>([]);

  useEffect(() => {
    if (!org?.id) return;
    getDataClient()
      .models.User.usersByOrg({ orgId: org.id })
      .then(({ data }) => setMembers(data ?? []))
      .catch((err) => console.error("usersByOrg failed", err));
  }, [org?.id]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="font-serif text-3xl font-bold text-foreground">
        Organization
      </h1>

      <section className="mt-8 rounded-xl border border-border bg-background p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Name
            </dt>
            <dd className="mt-1 text-foreground">{org?.name}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Slug
            </dt>
            <dd className="mt-1 font-mono text-sm text-foreground">
              {org?.slug}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Your role
            </dt>
            <dd className="mt-1 text-foreground">{userRecord?.role ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-xl font-bold text-foreground">Members</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.email}</TableCell>
                  <TableCell>
                    {[m.firstName, m.lastName].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell>{m.role ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={m.isActive === false ? "outline" : "secondary"}>
                      {m.isActive === false ? "Inactive" : "Active"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No members yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Inviting members is on the roadmap (docs/ROADMAP.md §2).
        </p>
      </section>
    </div>
  );
}
