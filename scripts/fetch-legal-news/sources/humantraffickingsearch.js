/** @format */

// Human Trafficking Search — the other source with a real per-company query.
// Its WordPress search page also publishes a per-query RSS feed at
// /search/<term>/feed/rss2/ (confirmed by testing: the HTML search-results
// page advertises this via a <link rel="alternate" type="application/rss+xml">
// tag), so this reuses the fetch-news RSS parser rather than scraping HTML.

import { fetchHtml, delayFor } from "../../scrape-company-labels/http.js";
import { parseFeed } from "../../fetch-news/parse.js";

const BASE = "https://humantraffickingsearch.org";
export const SOURCE_ID = "human-trafficking-search";
export const SOURCE_NAME = "Human Trafficking Search";

export async function fetchForCompany(company) {
	const url = `${BASE}/search/${encodeURIComponent(company)}/feed/rss2/`;
	const host = new URL(url).host;
	await delayFor(host);

	const xml = await fetchHtml(url);
	if (!xml) return [];

	const { articles, error } = parseFeed(xml, { outletId: SOURCE_ID, outletName: SOURCE_NAME });
	if (error) {
		console.warn(`[${SOURCE_ID}] parse error for "${company}": ${error}`);
		return [];
	}

	return articles.map((a) => ({
		sourceId: SOURCE_ID,
		sourceName: SOURCE_NAME,
		url: a.url,
		title: a.title,
		summary: cleanSummary(a.summary),
		publishedAt: a.publishedAt,
		matchedCompany: company,
	}));
}

// This feed's <description> is HTML-escaped inside the XML (e.g. "&lt;p&gt;"),
// so the shared RSS parser's tag-stripping regex — which runs before entity
// decoding — never sees a literal "<p>" to strip; it only appears after
// decodeEntities runs afterward. The result is literal "<p>...</p>" text
// surviving into the summary, plus WordPress's standard "The post X first
// appeared on Y" full-content-feed footer. Both are source-specific noise,
// not something to fix in the shared parser (scripts/fetch-news/parse.js is
// also used by the ecolabel news fetcher, and its feeds don't have this
// double-escaping).
function cleanSummary(text) {
	if (!text) return "";
	return String(text)
		.replace(/<[^>]+>/g, " ")
		.replace(/The post .*? first appeared on Human Trafficking Search\s*\.?/i, "")
		.replace(/\s+/g, " ")
		.trim();
}
