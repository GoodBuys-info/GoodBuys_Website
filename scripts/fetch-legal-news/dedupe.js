/** @format */

// Dedupe pass. The same lawsuit routinely surfaces from more than one
// source (a Triple Pundit recap of an EEOC filing, an HTS post syndicating
// the same complaint OECD Watch already tracks), and EEOC itself sometimes
// republishes a case update. Two passes, both scoped within a single
// company — a title collision across different companies is not a dup:
//
//   1. Exact sourceUrl match — cheap, unambiguous.
//   2. Title-similarity match (Jaccard over normalized tokens) — catches the
//      cross-outlet recap case where the URL differs but the story is the
//      same.
//
// Keeps the more detailed record on a collision: longer summary wins, ties
// broken by most recent publishedAt.

const SIMILARITY_THRESHOLD = 0.6;

export function dedupe(records) {
	const byCompany = new Map();
	for (const r of records) {
		if (!byCompany.has(r.company)) byCompany.set(r.company, []);
		byCompany.get(r.company).push(r);
	}

	const out = [];
	for (const group of byCompany.values()) {
		out.push(...dedupeGroup(group));
	}
	return out;
}

function dedupeGroup(records) {
	const kept = [];

	for (const record of records) {
		const existingIdx = kept.findIndex((k) => isDuplicate(k, record));
		if (existingIdx === -1) {
			kept.push(record);
			continue;
		}
		kept[existingIdx] = pickBetter(kept[existingIdx], record);
	}

	return kept;
}

function isDuplicate(a, b) {
	if (a.sourceUrl && b.sourceUrl && a.sourceUrl === b.sourceUrl) return true;
	return titleSimilarity(a.title, b.title) >= SIMILARITY_THRESHOLD;
}

function pickBetter(a, b) {
	const aLen = (a.summary || "").length;
	const bLen = (b.summary || "").length;
	if (aLen !== bLen) return aLen > bLen ? a : b;

	const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
	const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
	return bTime > aTime ? b : a;
}

function titleSimilarity(a, b) {
	const tokensA = new Set(normalizeTokens(a));
	const tokensB = new Set(normalizeTokens(b));
	if (!tokensA.size || !tokensB.size) return 0;

	let intersection = 0;
	for (const t of tokensA) if (tokensB.has(t)) intersection++;
	const union = tokensA.size + tokensB.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

function normalizeTokens(s) {
	return String(s || "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter(Boolean);
}
