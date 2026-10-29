// This repository's own values for the gates (docs/pull-request-gates.md).
// Everything else under scripts/pr-gates/ is foundation code; a product
// fills these two in and never edits the rules to fit.

/**
 * The words a `foundation:` commit may not carry (CLAUDE.md "Commits"): a
 * product's names, brands, customers. The foundation has none, so this
 * matches nothing.
 */
export const PRODUCT_WORDS = /$^/;

/**
 * The branch the default branch is promoted to, when the repository has
 * one (a product with a `staging` default branch and a `main` release
 * branch sets "main"). The promotion PR, default branch into this one, is
 * the one PR allowed to target it. `null` when every PR targets the
 * default branch.
 */
export const RELEASE_BRANCH = null;
