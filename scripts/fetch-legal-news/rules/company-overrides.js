/** @format */

// Editorial escape hatch for the company matcher — mirrors
// scripts/fetch-news/rules/label-overrides.js. Company names that read as
// ordinary English words or generic terms must be forced AMBIGUOUS so
// prose-substring matching doesn't produce systematic false positives
// (e.g. "Target" the retailer vs. "target" the noun, "Shell" the oil major
// vs. "shell" of a building).
//
// initMatcher()'s startup guard throws if any id here doesn't match a
// company name in company-labels.json — keep this list pruned when the
// registry changes.

export const FORCE_AMBIGUOUS = new Set([
	"Article",
	"Bird",
	"Boots",
	"Champion",
	"Discover",
	"Dove",
	"FAIR",
	"Habitat",
	"Honest",
	"Honor",
	"Kong",
	"Lime",
	"Method",
	"Mightly",
	"Native",
	"Progressive",
	"Render",
	"Ritual",
	"Scott",
	"Shell",
	"Simple",
	"Spin",
	"Staples",
	"Target",
	"Vivo",
	"Instagram", // common enough as a verb/reference ("shared on Instagram") to warrant canonical-only matching
]);

// Company names that must never auto-classify SAFE even though they don't
// hit FORCE_AMBIGUOUS — short/acronym-shaped names that could still collide.
// Kept separate from FORCE_AMBIGUOUS because these want case-sensitive
// acronym matching, not canonical-only prose matching.
export const FORCE_ACRONYM = new Set(["3M", "GSK", "SC Johnson"]);
