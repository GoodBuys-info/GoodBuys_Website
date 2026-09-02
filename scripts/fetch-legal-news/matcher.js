/** @format */

// Company matcher for the legal-news pipeline. Same architectural shape as
// scripts/fetch-news/matcher.js (bucket classification, two-tier match path,
// startup guards) but keyed to company-labels.json company names instead of
// ecolabel names, and simpler: a company record has one name, not a set of
// derived aliases.
//
// Brand names collide with ordinary English far more than ecolabel names do
// ("Target", "Shell", "Dove", "Discover"), so the bucket split matters more
// here, not less:
//   SAFE       — multi-word or distinctive names. Padded-substring match,
//                case-insensitive.
//   AMBIGUOUS  — names that double as common words. Matched case-insensitively
//                but ONLY as a whole-name substring (no partial-alias
//                leniency — there are no aliases) — see rules/company-overrides.js.
//   ACRONYM    — short, mostly-uppercase names ("3M", "GSK", "H-E-B"). Matched
//                case-sensitively so "gsk" in prose doesn't false-match.
//
// Two tiers, same as the news matcher:
//   Tier 1 — structured field match (URL slug, categories) — token subsequence.
//   Tier 2 — text match in title + summary, per-bucket rules above.

import { FORCE_ACRONYM, FORCE_AMBIGUOUS } from "./rules/company-overrides.js";

export const BUCKETS = Object.freeze({ SAFE: "SAFE", AMBIGUOUS: "AMBIGUOUS", ACRONYM: "ACRONYM" });

// Curated set mirroring the news matcher's DANGER_WORDS — company names
// containing one of these tokens are auto-classified AMBIGUOUS even without
// an explicit override, so a new company added to the registry doesn't
// silently ship as a false-positive machine.
const DANGER_WORDS = new Set([
	"target", "shell", "discover", "dove", "honest", "honor", "native",
	"simple", "method", "champion", "progressive", "ritual", "render",
	"bird", "kong", "lime", "spin", "staples", "habitat", "boots", "scott",
	"article", "vivo", "fair", "instagram", "mightly",
]);

let state = {
	companies: [], // [{ name, bucket, paddedLower, paddedCaseSensitive }]
	isInitialized: false,
};

export function initMatcher({ companies }) {
	if (state.isInitialized) return;
	const names = Array.isArray(companies) ? companies : [];
	if (names.length === 0) {
		throw new Error("[legal-matcher] initMatcher called with no companies");
	}

	const nameSet = new Set(names);
	guardOverrideDrift(nameSet);

	const records = names.map((name) => {
		const bucket = resolveForcedBucket(name) || autoBucket(name);
		return {
			name,
			bucket,
			paddedLower: ` ${normaliseForMatch(name)} `,
			paddedCaseSensitive: ` ${normaliseForMatchPreserveCase(name)} `,
			tokens: tokensOf(name),
		};
	});

	state = { companies: records, isInitialized: true };

	const byBucket = { SAFE: 0, AMBIGUOUS: 0, ACRONYM: 0 };
	for (const c of records) byBucket[c.bucket]++;
	console.log(
		`[Legal Matcher] Initialized: ${records.length} companies ` +
			`(SAFE=${byBucket.SAFE}, AMBIGUOUS=${byBucket.AMBIGUOUS}, ACRONYM=${byBucket.ACRONYM})`,
	);
}

function resolveForcedBucket(name) {
	if (FORCE_ACRONYM.has(name)) return BUCKETS.ACRONYM;
	if (FORCE_AMBIGUOUS.has(name)) return BUCKETS.AMBIGUOUS;
	return null;
}

function autoBucket(name) {
	const t = name.trim();

	// ACRONYM: short, all-caps-or-digits (allowing spaces/hyphens/&/.), e.g.
	// "3M", "GSK", "H-E-B". Requires no lowercase letters at all.
	if (/^[A-Z0-9][A-Z0-9\s\-&.']{0,9}$/.test(t) && !/[a-z]/.test(t)) {
		return BUCKETS.ACRONYM;
	}

	const words = t
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter(Boolean);
	if (words.some((w) => DANGER_WORDS.has(w))) return BUCKETS.AMBIGUOUS;

	// Single-word names under 5 characters are risky even off the curated
	// list — short common nouns/verbs slip through DANGER_WORDS easily.
	if (words.length === 1 && words[0].length <= 4) return BUCKETS.AMBIGUOUS;

	return BUCKETS.SAFE;
}

function guardOverrideDrift(nameSet) {
	const missing = [];
	for (const n of FORCE_ACRONYM) if (!nameSet.has(n)) missing.push({ which: "FORCE_ACRONYM", n });
	for (const n of FORCE_AMBIGUOUS) if (!nameSet.has(n)) missing.push({ which: "FORCE_AMBIGUOUS", n });
	if (!missing.length) return;

	const lines = missing.map((m) => `  - ${m.which}: "${m.n}" (not in company-labels.json)`).join("\n");
	throw new Error(
		[
			`[legal-matcher] Override-drift guard failed.`,
			`${missing.length} override(s) reference a company name that doesn't exist in company-labels.json:`,
			lines,
			``,
			`Fix: remove the stale name(s) from rules/company-overrides.js, or confirm the registry's current spelling.`,
		].join("\n"),
	);
}

// --- matching ---

/**
 * @param {{ title: string, summary: string, urlSlug: string|null, categories?: string[] }} article
 * @returns {Array<{company: string, bucket: string, tier: string, where: string}>}
 */
export function matchArticle(article) {
	if (!state.isInitialized) throw new Error("[legal-matcher] matchArticle called before initMatcher");

	const seen = new Set();
	const matches = [];

	for (const hit of matchStructuredFields(article)) {
		const key = `${hit.company}:${hit.where}`;
		if (seen.has(key)) continue;
		seen.add(key);
		matches.push(hit);
	}
	for (const hit of matchTextFields(article)) {
		const key = `${hit.company}:${hit.where}`;
		if (seen.has(key)) continue;
		seen.add(key);
		matches.push(hit);
	}

	return matches;
}

function matchStructuredFields(article) {
	const out = [];
	const haystacks = [];
	for (const c of article.categories || []) haystacks.push({ tokens: tokensOf(c), where: "category" });
	if (article.urlSlug) haystacks.push({ tokens: tokensOf(article.urlSlug), where: "urlSlug" });

	for (const { tokens, where } of haystacks) {
		for (const company of state.companies) {
			if (!company.tokens.length) continue;
			if (company.bucket === BUCKETS.ACRONYM && where === "urlSlug") {
				// Slugs are lowercase; require an exact token match, no subsequence leniency.
				if (tokens.length !== company.tokens.length) continue;
			}
			if (hasTokenSubsequence(tokens, company.tokens)) {
				out.push({ company: company.name, bucket: company.bucket, tier: "structured-field", where });
			}
		}
	}
	return out;
}

function matchTextFields(article) {
	const out = [];
	const fields = [];
	if (article.title) fields.push({ raw: article.title, where: "title" });
	if (article.summary) fields.push({ raw: article.summary, where: "summary" });

	for (const { raw, where } of fields) {
		const paddedLower = ` ${normaliseForMatch(raw)} `;
		const paddedCaseSensitive = ` ${normaliseForMatchPreserveCase(raw)} `;
		const lowerTokens = tokensOf(raw);
		const caseTokens = normaliseForMatchPreserveCase(raw).split(" ").filter(Boolean);

		for (const company of state.companies) {
			if (company.bucket === BUCKETS.ACRONYM) {
				if (paddedCaseSensitive.includes(company.paddedCaseSensitive)) {
					out.push({ company: company.name, bucket: company.bucket, tier: "text-acronym", where });
				}
				continue;
			}

			if (!paddedLower.includes(company.paddedLower)) continue;

			// AMBIGUOUS names need a real word-boundary check, not just a
			// substring match: "Champion" is a substring of "Champion Media"
			// and "Champion Fiberglass" — unrelated small businesses that
			// happen to start with the same word, confirmed as a live false
			// match against real EEOC press releases during build. Reject an
			// occurrence when the word immediately following it (in the
			// ORIGINAL case) is capitalized — the signature of it being a
			// prefix of a longer, different proper noun rather than a
			// reference to the registry company itself ("Champion settles...",
			// "Champion, LLC" both still match; "Champion Media" doesn't).
			// SAFE names skip this check — it would wrongly reject legitimate
			// "<Company> Inc" / "<Company> Corp" phrasing for names that
			// aren't collision-prone in the first place.
			if (company.bucket === BUCKETS.AMBIGUOUS && !hasCleanWordBoundary(lowerTokens, caseTokens, company.tokens)) {
				continue;
			}

			out.push({
				company: company.name,
				bucket: company.bucket,
				tier: company.bucket === BUCKETS.AMBIGUOUS ? "text-ambiguous" : "text-substring",
				where,
			});
		}
	}
	return out;
}

// --- normalisation helpers (same as the news matcher) ---

function normaliseForMatch(s) {
	return String(s || "")
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normaliseForMatchPreserveCase(s) {
	return String(s || "")
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^A-Za-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function tokensOf(s) {
	if (!s) return [];
	return normaliseForMatch(s).split(" ").filter(Boolean);
}

function hasTokenSubsequence(haystack, needle) {
	if (!needle.length || needle.length > haystack.length) return false;
	outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
		for (let j = 0; j < needle.length; j++) {
			if (haystack[i + j] !== needle[j]) continue outer;
		}
		return true;
	}
	return false;
}

// Legal-entity suffixes that legitimately follow a bare company name
// ("Champion, LLC", "Champion Inc") — these must not trip the
// different-proper-noun rejection below just because they're conventionally
// capitalized/all-caps.
const CORPORATE_SUFFIXES = new Set([
	"llc", "inc", "incorporated", "corp", "corporation", "co", "company",
	"ltd", "limited", "plc", "group", "holdings", "gmbh", "nv", "sa", "ag",
]);

// EEOC/OECD Watch headlines are Title Case — "Champion Settles EEOC Suit"
// capitalizes "Settles" exactly like "Champion Media" capitalizes "Media",
// so raw capitalization alone can't tell a headline verb/preposition from a
// second company-name word. This is a closed, bounded vocabulary (legal
// enforcement-action headline verbs and prepositions), unlike company names
// themselves, so a curated allowlist is tractable here in a way a general
// "every possible business word" list wouldn't be.
const HEADLINE_WORDS = new Set([
	"sues", "sued", "sue", "suing", "settles", "settled", "settlement",
	"agrees", "agreed", "wins", "won", "loses", "lost", "files", "filed",
	"faces", "faced", "pays", "paid", "reaches", "resolves", "resolved",
	"fires", "fired", "discriminates", "discriminated", "violates", "violated",
	"charged", "accused", "denies", "denied", "orders", "ordered", "rules",
	"ruled", "announces", "announced", "reports", "reported", "investigates",
	"investigated", "probes", "probed", "retaliates", "retaliated",
	"harasses", "harassed", "fined", "fines", "alleges", "alleged", "breaches",
	"breached", "fails", "failed", "refuses", "refused", "terminates",
	"terminated", "for", "over", "after", "with", "amid", "under",
	"in", "on", "of", "and", "to", "will",
]);

// Scans every occurrence of `needle` (company tokens, lowercase) within
// `lowerTokens`, and accepts if AT LEAST ONE occurrence isn't immediately
// followed by a capitalized, non-suffix word in the original text — i.e.
// isn't a prefix of a longer, different proper noun. `caseTokens` must be
// positionally aligned with `lowerTokens` (both derived from the same source
// text via the two normalise* functions, which only differ in casing, not in
// where they insert token boundaries).
function hasCleanWordBoundary(lowerTokens, caseTokens, needle) {
	if (!needle.length || needle.length > lowerTokens.length) return false;
	outer: for (let i = 0; i <= lowerTokens.length - needle.length; i++) {
		for (let j = 0; j < needle.length; j++) {
			if (lowerTokens[i + j] !== needle[j]) continue outer;
		}
		const nextToken = caseTokens[i + needle.length];
		const nextLower = lowerTokens[i + needle.length];
		const looksLikeDifferentEntity =
			nextToken && /^[A-Z]/.test(nextToken) && !CORPORATE_SUFFIXES.has(nextLower) && !HEADLINE_WORDS.has(nextLower);
		if (looksLikeDifferentEntity) continue; // prefix of a different proper noun — keep scanning
		return true;
	}
	return false;
}
