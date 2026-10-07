/** @format */

// Editorial overrides for the news matcher's label classification.
//
// The matcher auto-classifies each label alias into one of three buckets
// (SAFE / AMBIGUOUS / ACRONYM) based on the alias's shape:
//   - All-caps letters/digits → ACRONYM (case-sensitive match only)
//   - Contains a DANGER_WORD → AMBIGUOUS (canonical-only match in prose)
//   - Else → SAFE (padded-substring match, case-insensitive)
//
// When the automation's judgement is wrong for a specific label, override it
// here. The override applies to ALL aliases of the labelled label.
//
// Keep this file small. Overrides are editorial judgement — every one should
// be traceable to a specific false-positive or false-negative incident.

// Labels whose entire alias set should be treated as ACRONYM (case-sensitive
// match in prose). Use when auto-detection misses an all-caps label or when
// we specifically want the stricter treatment.
export const FORCE_ACRONYM = new Set([
	// (empty at launch — add as issues surface)
]);

// Labels whose entire alias set should be treated as AMBIGUOUS (canonical-only
// match in prose, aliases suppressed). Use when a label's name happens to
// collide with common prose even though DANGER_WORDS didn't flag it.
export const FORCE_AMBIGUOUS = new Set([
	// (empty at launch — add as issues surface)
]);

// Labels whose entire alias set should be treated as SAFE (regular padded
// substring match). Use sparingly to promote a label that automation flagged
// too strictly — only when the full canonical is distinctive enough that
// substring matching won't collide with prose.
export const FORCE_SAFE = new Set([
	// (empty at launch — add as issues surface)
]);

// Extra aliases for specific labels. Auto-derivation (parenthetical + slash
// splitting) handles the common cases; use this only when an outlet uses a
// name form that auto-derivation doesn't produce.
export const LABEL_ALIASES = {
	// labelId: [ "Alias 1", "Alias 2" ]
	// Headlines say "B Corp", rarely "B Corp Certification" in full.
	"b-corp": ["B Corp", "Certified B Corporation"],
	// Outlets spell out the council far more often than the acronym.
	fsc: ["Forest Stewardship Council"],
	// Matched case-insensitively (SAFE), unlike the all-caps canonical form.
	"oeko-tex": ["Oeko-Tex"],
};

// Some labels collide with a different organisation or phrase, so a bare name
// match is not enough: the article must ALSO contain one of these context
// words. Every entry should trace to a real false positive.
export const CONTEXT_REQUIRED = {
	// WRAP here is the apparel-factory certification (Worldwide Responsible
	// Accredited Production). Observed false positive: "BSI and ISO launch
	// global standard to tackle food waste" is about WRAP the UK waste charity.
	wrap: /\b(factory|factories|apparel|garments?|textiles?|sewing|clothing|footwear)\b/i,
	// "gold standard" is also a generic idiom ("the gold standard of ..."). Observed
	// false positive: a Grist article on the EU climate law.
	"gold-standard": /\b(carbon (offsets?|credits?|markets?|projects?)|voluntary carbon|offset projects?|carbon-credit)\b/i,
};

// Google News per-label search (see google-news.js). By default a label is
// searched by its name without the parenthetical. Override here when the
// default is an ambiguous acronym or an awkward phrase.
export const SEARCH_TERMS = {
	"b-corp": "B Corp certification",
	fsc: "Forest Stewardship Council",
	gots: "Global Organic Textile Standard",
	"better-cotton": "Better Cotton Initiative",
	rws: "Responsible Wool Standard",
	"fair-wear": "Fair Wear Foundation",
	"fairtrade-international": "Fairtrade International",
	"blue-flag": "Blue Flag beach",
	"green-key": "Green Key certification",
	"green-globe": "Green Globe certification",
	"green-seal": "Green Seal certified",
	"energy-star": "ENERGY STAR certified",
	leed: "LEED certification",
	wrap: "WRAP certified factory",
	sa8000: "SA8000 certification",
};

// Labels not worth a Google News query: the name is too generic to search.
// They are still matched in the RSS feeds. (Gold Standard is a financial idiom.)
export const SEARCH_SKIP = new Set(["gold-standard", "wildlife-friendly"]);
