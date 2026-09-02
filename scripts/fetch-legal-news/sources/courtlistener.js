/** @format */

// CourtListener (Free Law Project) — free, public federal-court docket
// search. Added after the initial 6-source build turned out to badly
// under-cover large companies: none of the original sources is a general
// legal-case database, so a company like Amazon showed up with essentially
// one lawsuit. CourtListener's `party_name` filter gives real, precisely
// party-attributed federal cases (confirmed: 3,400 real cases naming
// "Amazon.com, Inc." — not a fuzzy text match like EEOC/HTS, an actual
// structured party field), which is exactly the gap.
//
// Two things make this source fundamentally different from the other 6,
// both handled here rather than upstream:
//
//   1. No company-matcher pass needed. `party_name` is already a precise
//      structured filter — unlike EEOC/HTS keyword search (proven to be
//      fuzzy relevance ranking, not literal match), so there's no title-
//      match step to run here.
//
//   2. No narrative summary exists. A docket entry is case name + court +
//      date + a "nature of suit" code — never a paragraph describing what
//      happened. Pulling the actual complaint text would require PACER
//      access (paid) for most filings, so we don't try; the UI shows
//      structured fields instead of a summary, in a visually distinct
//      "Federal court filings" section.
//
// Volume is the other real problem: CourtListener returns EVERY case ever
// docketed, undifferentiated — including the ordinary commercial litigation
// (patent, personal injury, insurance) any large company generates
// constantly, unrelated to labor/environmental/consumer-protection conduct.
// ALLOWLIST below keeps only nature-of-suit categories aligned with
// GoodBuys' actual scope (checked against labels.json's own categories —
// Labor, Environment, Governance, etc. — patent/injury/insurance appear in
// none of them). Cases with no suitNature at all are dropped too: about half
// of very recent filings aren't classified yet, and this pipeline leans
// precision-over-recall everywhere else (the title-boundary guard in
// matcher.js is the same trade-off), so an unclassified case is excluded
// rather than risking noise.

import { fetchHtml, delayFor } from "../../scrape-company-labels/http.js";
import { ENV } from "../config.js";

const API_BASE = "https://www.courtlistener.com/api/rest/v4/search/";
const SITE_BASE = "https://www.courtlistener.com";
export const SOURCE_ID = "courtlistener";
export const SOURCE_NAME = "CourtListener";

// Substring match against the raw suitNature string (e.g. "410 Anti-Trust",
// "4442 Civil Rights Employment") rather than exact code lookup — robust to
// CourtListener's exact code formatting, which doesn't cleanly match the
// standard federal Nature-of-Suit numbering in the raw field.
const ALLOWLIST_KEYWORDS = [
	"civil rights",
	"anti-trust",
	"antitrust",
	"labor",
	"fair labor standards",
	"employee retirement income security",
	"environmental",
	"consumer credit",
	"racketeer",
	"false claims",
];

export async function fetchForCompany(company) {
	const url = `${API_BASE}?type=r&party_name=${encodeURIComponent(company)}&order_by=dateFiled%20desc`;
	const host = new URL(url).host;
	await delayFor(host);

	// Accept: application/json is required here — the shared fetchHtml
	// Accept header lists text/html first (for the HTML-scraping sources),
	// and CourtListener's Django REST Framework backend honors that by
	// returning its browsable-API HTML page instead of JSON. Confirmed by
	// testing: without this override, `data` comes back as an HTML string
	// and the whole response silently looks like zero results.
	const headers = { Accept: "application/json" };
	if (ENV.COURTLISTENER_API_TOKEN) headers.Authorization = `Token ${ENV.COURTLISTENER_API_TOKEN}`;
	const data = await fetchHtml(url, 0, headers);
	if (!data || typeof data !== "object") return { records: [], totalCount: 0 };

	// axios auto-parses JSON responses; fetchHtml just hands back
	// response.data, so `data` here is already the parsed object.
	const results = Array.isArray(data.results) ? data.results : [];
	const totalCount = typeof data.count === "number" ? data.count : results.length;

	const relevant = results.filter((r) => isAllowlisted(r.suitNature));
	const capped = relevant.slice(0, ENV.COURTLISTENER_CAP);

	const viewAllUrl = `${SITE_BASE}/?q=&type=r&party_name=${encodeURIComponent(company)}`;

	const records = capped.map((r) => ({
		sourceId: SOURCE_ID,
		sourceName: SOURCE_NAME,
		company,
		title: cleanCaseName(r.caseName),
		summary: "",
		status: r.dateTerminated ? "Closed" : "Active",
		sourceUrl: r.docket_absolute_url ? `${SITE_BASE}${r.docket_absolute_url}` : SITE_BASE,
		publishedAt: parseDate(r.dateFiled),
		fetchedAt: new Date().toISOString(),
		court: r.court || null,
		suitNatureLabel: formatSuitNature(r.suitNature),
		// Same on every record for this company — the frontend reads it off
		// whichever record it renders first. Total is the count of ALL
		// results before the allowlist filter, so "view all" isn't
		// misleadingly scoped to just the relevant subset.
		totalMatchingCount: totalCount,
		viewAllUrl,
	}));

	return { records, totalCount };
}

function isAllowlisted(suitNature) {
	if (!suitNature) return false;
	const lower = suitNature.toLowerCase();
	return ALLOWLIST_KEYWORDS.some((k) => lower.includes(k));
}

// "410 Anti-Trust" -> "Anti-Trust". Strips the leading numeric code, which
// is meaningless to a site visitor.
function formatSuitNature(suitNature) {
	if (!suitNature) return null;
	return suitNature.replace(/^\d+\s*/, "").trim() || null;
}

function cleanCaseName(name) {
	return String(name || "").replace(/\s+/g, " ").trim();
}

function parseDate(dateStr) {
	if (!dateStr) return null;
	const t = Date.parse(dateStr);
	return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
