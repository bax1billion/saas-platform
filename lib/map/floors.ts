/**
 * The Field floors as MapLibre needs them: pixel numbers inside a style
 * (a style value cannot read a CSS token), pinned by `floors.test.ts` to
 * the rem tokens in `app/globals.css` so the two never drift. Everything
 * the engine draws itself (buttons, overlays) uses the tokens, not these.
 */

/** `--text-field`: no map text under this on the Field and Station doors. */
export const FIELD_TEXT_PX = 17;

/** `--spacing-target`: a tap target, and the box a tap hits within. */
export const FIELD_TARGET_PX = 48;

/** `--spacing-primary`: the one primary action. */
export const FIELD_PRIMARY_PX = 54;

/** A symbol is never drawn smaller than this, whatever the zoom. */
export const ICON_MIN_PX = 24;

/** The desk may go smaller: a label on the Admin door reads at this. */
export const DESK_TEXT_PX = 12;
