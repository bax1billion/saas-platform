# Security & Compliance Readiness Playbook

A phased playbook for taking any product built on this foundation (Next.js + AWS Amplify Gen 2 + Cognito + AppSync/DynamoDB + S3 + Lambda + Stripe) to **SOC 2 Type II** and **ISO 27001** readiness. An optional final section covers **21 CFR Part 11** technical controls for regulated-industry verticals (pharma, biotech, medical device, healthcare).

Why bother: SOC 2 Type II is table stakes for B2B SaaS — enterprise procurement teams won't sign without it. ISO 27001 carries international weight (especially with buyers already steeped in ISO standards). Part 11 support opens FDA-regulated segments.

---

## What the Foundation Already Provides

These capabilities are inherited by every product built on the stack. Verify each is actually wired up in the new product before claiming it to an auditor.

| Capability | How | Notes |
|------------|-----|-------|
| Immutable audit trail | `EventLog` model: append-only, written exclusively by a dedicated `eventLogger` Lambda; captures actor + timestamp + entity + payload | No update/delete mutations exposed; verify IAM prevents modification by any other principal |
| File integrity | SHA-256 hashes computed server-side on S3 upload (Lambda trigger), stored on the owning record | |
| Record version control | Draft → in-review → approved → superseded lifecycle; old versions preserved | Applies to any versioned entity |
| Approval workflows | Approval model: approver, decision, comments, timestamp | |
| Role-based access | Cognito groups with schema-level (AppSync) authorization rules | Typical baseline: Admin / Manager / Viewer |
| Multi-tenant isolation | All models scoped by `orgId`, enforced in GraphQL resolvers | |
| Encryption at rest | DynamoDB and S3 default encryption (AWS-managed keys) | Consider KMS CMKs for sensitive data — see CC5 |
| Encryption in transit | TLS enforced by all AWS services; AppSync and Amplify Hosting are HTTPS-only | |
| Unique user IDs / sessions | Cognito individual email accounts, JWT tokens with auto-expiry | No shared logins |
| Soft deletes | `isDeleted` flag on user-facing records; EventLog preserves history | |
| Password policy | Cognito: 8+ chars, upper/lower/numbers/symbols | Already meets SOC 2 expectations |
| Physical security | Inherited from AWS (their SOC 2 report covers data centers) | Cite AWS's report as a subservice organization |
| S3 isolation | Path-based prefixes per data category with scoped access rules | |

---

## Part 1: SOC 2 Type II

### Scoping

SOC 2 evaluates controls against five Trust Services Criteria: **Security** (required), Availability, Processing Integrity, Confidentiality, Privacy.

- **Type I** = controls designed correctly at a point in time.
- **Type II** = controls operated effectively over a period (typically 3–12 months).
- **Recommended scope:** Security + Availability + Confidentiality. That's what procurement teams expect. Add Processing Integrity and Privacy later if buyers demand them.

### Gap Checklist by Common Criteria

Statuses reflect a fresh product on this foundation; re-assess per product.

**CC1 — Control Environment (organizational)**

| Requirement | Typical state | Action |
|-------------|--------------|--------|
| Documented security policies | Missing | Write: Information Security Policy, Acceptable Use Policy, Data Classification Policy, Incident Response Plan, Business Continuity Plan |
| Defined roles/responsibilities | Cognito groups exist | Document role definitions and access privileges in a formal RBAC policy |
| Code of conduct | Missing | Write a brief code of conduct (required even for tiny teams) |
| Management oversight | Often solo founder | Document a management review process (quarterly security review — valid even if one person) |

**CC2 — Communication and Information**

| Requirement | Action |
|-------------|--------|
| Security awareness training | Annual training; can be lightweight for a solo/small team — document completion |
| External communication of practices | Public Trust/Security page on the product website |
| System description | Formal document (architecture, boundaries, data flows) for the auditor |

**CC3 — Risk Assessment**

| Requirement | Action |
|-------------|--------|
| Formal risk assessment | Conduct and document, covering infrastructure, application, and data risks |
| Risk treatment plan | Risk register with mitigations and owners |
| Annual review | Schedule the cadence |

**CC4 — Monitoring Activities**

| Requirement | Typical state | Action |
|-------------|--------------|--------|
| Logging and monitoring | EventLog (app-level) + CloudWatch (infra) | Enable **AWS CloudTrail** for API-level audit logging; configure CloudWatch alarms for anomalies |
| Vulnerability scanning | Missing | Enable AWS Inspector or equivalent; run `npm audit` in CI |
| Penetration testing | Missing | Annual third-party pentest (AWS permits pentesting your own resources) |

**CC5 — Control Activities (logical access)**

| Requirement | Typical state | Action |
|-------------|--------------|--------|
| MFA for infrastructure | Often unset | Enable MFA on AWS root + all IAM users; offer MFA option in Cognito |
| Password policy | Done (Cognito defaults) | — |
| Access reviews | Missing | Document quarterly access review (Cognito users, IAM policies, Amplify access) |
| Change management | Git-based Amplify deploys | Document: feature branch → PR review → merge → auto-deploy; enable branch protections |
| Key management | AWS-managed keys | Consider customer-managed keys (KMS CMKs) for sensitive data; document a key management policy either way |

**CC6 — Logical and Physical Access**

| Requirement | State | Action |
|-------------|-------|--------|
| Unique user IDs | Done (Cognito) | — |
| Session management | Done (JWT expiry) | — |
| Network security | Default Amplify | Document network architecture; confirm no public-facing DynamoDB/S3 endpoints |
| Physical security | Done (inherited from AWS) | Cite AWS SOC 2 report |

**CC7 — System Operations**

| Requirement | Action |
|-------------|--------|
| Incident response plan | Write it: detection, containment, eradication, recovery, lessons learned |
| Backup and recovery | Verify **DynamoDB point-in-time recovery (PITR)** is enabled; enable **S3 versioning**; document recovery procedures and *test them* |
| Capacity monitoring | CloudWatch dashboards for Lambda concurrency, DynamoDB throughput, S3 storage |

**CC8 — Change Management**

| Requirement | Action |
|-------------|--------|
| Formal process | Document the Git + Amplify CI/CD flow as the change management process |
| Environment separation | Confirm dev/staging/prod separation in Amplify; document promotion process |

**CC9 — Vendor Management**

| Requirement | Action |
|-------------|--------|
| Vendor risk assessment | Document third parties (AWS, Stripe, SES, any others) and link their SOC 2 reports |
| Subservice monitoring | Maintain a vendor register; review vendor SOC reports annually |

**Availability (A1)**

| Requirement | Action |
|-------------|--------|
| Uptime SLA | Define and publish a target (e.g., 99.9%) |
| Disaster recovery | Document DR: DynamoDB/Lambda are regional multi-AZ by default; S3 cross-region replication optional; set RTO/RPO targets |
| Incident communication | Public status page (Instatus, Statuspage, etc.) |

**Confidentiality (C1)**

| Requirement | Action |
|-------------|--------|
| Data classification | Define levels (Public / Internal / Confidential / Restricted); classify all data types |
| Retention and disposal | Define retention periods per data type; implement automated purge of expired data (soft deletes alone are not a retention policy) |
| Confidentiality agreements | NDAs/confidentiality clauses in customer contracts and vendor agreements |

### SOC 2 Timeline

| Phase | Duration | Activities |
|-------|----------|------------|
| Preparation | 2–3 months | Write policies, enable monitoring, risk assessment, close technical gaps |
| Type I readiness | 1 month | Engage auditor, system description, demonstrate controls in place |
| Observation period | 3–6 months | Operate controls consistently; auditor may request evidence throughout |
| Type II audit | 1 month | Auditor reviews observation-period evidence, issues report |
| **Total** | **7–11 months** | |

### Evidence Collection

For a startup, use a SOC 2 automation platform — they auto-collect evidence from AWS (CloudTrail, IAM, config), track policy acknowledgments, and prepare auditor-ready packages, often bundling the audit at a discount:

- **Vanta** — popular with startups, good AWS integration
- **Drata** — similar automation
- **Secureframe** — lighter-weight option

Cost: roughly $10–20K/yr including the audit.

---

## Part 2: ISO 27001

ISO 27001 requires establishing and continually improving an Information Security Management System (ISMS).

### Overlap with SOC 2: ~70–80%

Pursue both in parallel — the ISMS documentation (policies, risk register, Statement of Applicability) satisfies both.

| Aspect | SOC 2 | ISO 27001 |
|--------|-------|-----------|
| Origin | AICPA (US) | ISO (international) |
| Focus | Trust services criteria | Risk-based ISMS |
| Deliverable | Auditor's attestation report | Certificate (3-year, annual surveillance audits) |
| Structure | 5 TSC categories | 93 Annex A controls in 4 themes |
| Risk approach | Implicit | Explicit documented methodology required |
| Market signal | US B2B SaaS standard | International; strong with ISO-familiar industries |

### Requirements Beyond SOC 2

| Requirement | Notes |
|-------------|-------|
| Statement of Applicability (SoA) | Map each of the 93 Annex A controls: applicable/not, with justification |
| Risk assessment methodology | Formal, documented (likelihood × impact matrix; asset- or threat-based) |
| Risk treatment plan | Per risk: accept / mitigate / transfer / avoid, with owner and timeline |
| ISMS scope document | Which systems, data, people, locations are in scope |
| Internal audit | Annual; self-audit acceptable for year 1 if documented |
| Management review | Annual meeting with documented minutes and decisions |
| Continual improvement | Evidence of corrective actions over time |

### Annex A Themes vs. This Stack

| Theme | Controls | Typical status on this foundation |
|-------|----------|-----------------------------------|
| Organizational | 37 | Partially covered — needs formal policies and documentation |
| People | 8 | Needs HR policies (screening, terms, awareness, disciplinary, post-employment — even solo) |
| Physical | 14 | Data centers inherited from AWS; document office/remote-work security practices |
| Technological | 34 | Strong foundation via AWS (encryption, logging, backup); needs documenting and formalizing |

### ISO 27001 Timeline

| Phase | Duration |
|-------|----------|
| ISMS development (policies, risk assessment, SoA, controls) | 2–3 months |
| ISMS operation (evidence, internal audit) | 3+ months |
| Stage 1 audit (documentation/desktop review) | 1–2 weeks |
| Stage 2 audit (implementation/effectiveness) | 1–2 weeks |
| **Total** | **6–9 months** — run concurrently with SOC 2 prep |

---

## Combined Phased Roadmap

### Phase 1: Foundation (Months 1–3)
Documentation, policies, and technical quick wins that serve everything.

| Task | Effort |
|------|--------|
| Write Information Security Policy | 1 week |
| Write Acceptable Use Policy | 2 days |
| Write Incident Response Plan | 1 week |
| Write Data Classification Policy | 3 days |
| Write Change Management Policy | 3 days |
| Write Data Retention Policy | 3 days |
| Conduct formal risk assessment | 1 week |
| Create risk register + treatment plan | 3 days |
| Enable CloudTrail | 1 day |
| Enable MFA on AWS root + IAM | 1 day |
| Verify DynamoDB PITR enabled | 1 day |
| Verify S3 versioning enabled | 1 day |
| Set up CloudWatch alarms | 2 days |
| Add `npm audit` to CI | 1 day |
| Enable branch protections (require PR review) | 1 day |
| Write formal system architecture document | 1 week |

### Phase 2: Audit Preparation (Months 3–6)

| Task | Effort |
|------|--------|
| Select and connect a SOC 2 automation platform (Vanta/Drata) | ~1 week |
| Write ISO 27001 Statement of Applicability | 1 week |
| Conduct internal ISMS audit | 1 week |
| Write management review minutes | 1 day |
| Schedule penetration test | 1 day + vendor timeline |
| Build public Trust/Security page | 2 days |
| Create vendor risk register (AWS, Stripe, SES, …) | 2 days |

### Phase 3: Certification (Months 6–12)

| Milestone | When |
|-----------|------|
| SOC 2 Type I audit | Month 6–7 |
| SOC 2 observation period | Months 7–12 |
| ISO 27001 Stage 1 audit | Month 7 |
| ISO 27001 Stage 2 audit | Month 8–9 |
| SOC 2 Type II audit | Month 12 |
| Publish certifications | Post-audit |

(If the product also needs Part 11 support, slot that engineering work into Months 2–4 — see the optional section below.)

---

## Cost Expectations

| Item | Estimated cost | Frequency |
|------|---------------|-----------|
| SOC 2 automation platform | $10,000–$20,000/yr | Annual |
| SOC 2 Type II audit (via platform partner) | $15,000–$30,000 | Annual |
| ISO 27001 certification audit | $10,000–$20,000 year 1; ~$5–10K/yr surveillance | Annual |
| Penetration test | $5,000–$15,000 | Annual |
| CloudTrail + enhanced monitoring | ~$100–500/mo | Monthly |
| KMS CMKs (if adopted) | ~$1–3/key/mo + $0.03/10K requests | Monthly |
| **Total Year 1** | **~$40,000–$85,000** | |
| **Total Year 2+** | **~$30,000–$65,000** | |

**Cost optimization for a solo founder / early stage:**
- Start with SOC 2 only; defer ISO 27001 to Year 2 (saves ~$15K in Year 1)
- Use an automation platform — bundled audits are cheaper
- Part 11 support (below) is a product feature, not a certification cost — the investment is engineering time
- Scope the Year 1 pentest narrowly (web app + API only)

**Sequencing priority** if choosing one path first: (1) any regulated-vertical product features (revenue-enabling, engineering time only), (2) SOC 2 Type II — start the observation period as early as possible, (3) ISO 27001 in parallel since the overlap is large.

---

## Optional: 21 CFR Part 11 (Regulated-Industry Verticals)

*Include this only for products serving FDA-regulated customers (pharma, biotech, medical device, some healthcare). Skip entirely otherwise.*

Part 11 is the FDA regulation governing electronic records and electronic signatures. **There is no certification** — the vendor doesn't get "Part 11 certified." Instead, the product must **provide the technical controls** that let regulated customers use it in a Part 11-compliant manner; the customer owns their own compliance, but only achievable if the software supports it.

### Subpart B: Electronic Records — gap checklist

| Requirement | Reg | Foundation coverage | Action |
|-------------|-----|--------------------|--------|
| System validation | §11.10(a) | None by default | Create an IQ/OQ/PQ validation package; provide customers a validation toolkit (test scripts, expected results, traceability matrix) |
| Record generation/copying | §11.10(b) | Export (zip + manifest) if built | Exports must be accurate, complete, human-readable; add per-record PDF export |
| Record protection | §11.10(c) | Covered (encryption + EventLog immutability) | Document retention capabilities for customers |
| Access controls | §11.10(d) | Cognito groups | Add granular permissions within roles (approve vs. edit vs. view); enforce session timeout; offer IP allowlisting |
| Audit trail | §11.10(e) | EventLog covers it | Verify payload captures **before/after values**; confirm no user (including admins) can modify it |
| Operational system checks | §11.10(f) | Hash-on-upload | Add sequence verification (chronological ordering) and integrity checks on retrieval (compare stored hash) |
| Authority checks | §11.10(g) | Group-based auth | Add field-level authority checks (e.g., only designated approvers per record type); document the authority matrix |
| Device checks | §11.10(h) | Covered | Unique credentials per individual — no action |
| Training | §11.10(i) | Product-dependent | Users must be trained on the system itself; customers need training records for it |
| Written policies | §11.10(j) | None | Provide customers a **template SOP set** (Electronic Records Policy, E-Signature Policy, System Access Policy) |
| Open systems | §11.10(k) | N/A | Authenticated SaaS = closed system; doesn't apply |
| Signature display | §11.10 | Not built | Signed records must display signer's printed name, date/time, and meaning ("approved", "reviewed", …) |

### Subpart C: Electronic Signatures — gap checklist

| Requirement | Reg | Action |
|-------------|-----|--------|
| Unique to one individual | §11.100(a) | Covered by Cognito unique accounts |
| Identity verification before issuance | §11.100(b) | Admin confirms user identity before granting signing privileges; document the process |
| Two-component signatures | §11.200(a) | User ID + **password re-entry at time of signing** — every signing event prompts for credentials, never just an active session |
| Non-repudiation | §11.200(a) | Log the signature event to the immutable EventLog: signer identity, what was signed, meaning, timestamp |
| Continuous session signing | §11.200(a)(2) | First signing uses both components; subsequent signings in the same session may use one (password only). Optional for v1 |
| Biometrics | §11.200(b) | N/A for non-biometric signatures |
| Signature/record linking | §11.70 | Cryptographically bind signature to record (e.g., HMAC of record content + signer identity + timestamp) so it can't be copied to another record |
| Certification to FDA | §11.100(c) | Customers must certify to FDA that e-signatures are legally binding equivalents of handwritten ones; provide a **template certification letter** |

### Part 11 Implementation Plan

**Phase A — core controls (engineering, ~4–6 weeks):**

1. **Electronic signature system** — a signing workflow for approvals and any formal sign-off:
   - Re-authentication at signing (password re-entry, not a button click)
   - Signature meaning selection: Authored / Reviewed / Approved / Verified
   - Signature block rendered on the record: printed name, date/time, meaning
   - Immutable EventLog write of every signature event
   - Data model (append-only; only the signer, validated via Cognito identity, can create; no updates/deletes):

   ```
   ElectronicSignature
     - id, orgId
     - signerUserId, signerEmail (denormalized), signerName (denormalized)
     - entityType, entityId
     - meaning (AUTHORED | REVIEWED | APPROVED | VERIFIED)
     - signedAt (ISO 8601 UTC)
     - signatureHash (HMAC of entityType + entityId + signerUserId + signedAt + meaning)
     - ipAddress
   ```

2. **Audit trail enhancements** — before/after diffs in EventLog payloads; IAM review confirming no route/Lambda can modify or delete EventLog records; audit trail viewer UI with filters (entity, user, date range, action type).

3. **Session hardening** — configurable inactivity timeout (default 15 min for regulated orgs), auto-logout with notification, prevent or at least log concurrent sessions per user.

4. **PDF export of signed records** — server-side Lambda generation (`@react-pdf/renderer` or `puppeteer`), signature block and file hash printed on the PDF.

5. **"Part 11 mode" org-level toggle** — when enabled: e-signatures required for approvals, session timeout enforced, password re-entry per signing, enhanced audit display, signature metadata in exports. When disabled: standard single-click approve with logged action (default for non-regulated customers). This keeps one codebase serving both markets.

**Phase B — customer enablement (documentation, ~3 weeks):**

- **Validation toolkit** (downloadable): system description; IQ/OQ/PQ protocol (IQ: system reachable, login works, data loads; OQ: features work as specified; PQ: customer's real-world scenario end to end); traceability matrix mapping Part 11 requirements to product features; validation summary report template.
- **Template SOP package**: Electronic Records & Signatures Policy, System Access & User Management SOP, Audit Trail Review SOP, System Validation SOP, Backup & Recovery SOP, Change Control SOP, FDA Certification Letter template (§11.100(c)).
