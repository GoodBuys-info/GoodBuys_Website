/** @format */

// OECD Watch complaints database. FacetWP (the site's filter widget) is
// AJAX-only — there's no URL-queryable per-company filter — so this does a
// single scrape of the unfiltered listing (most-recent-first, ~10 items on
// the default page; the site doesn't expose pagination without the AJAX
// contract) and lets the shared company matcher find registry hits in the
// title/summary, same as every other "fetch once" source here.
//
// This is deliberately scoped to "recent complaints," not the full
// historical archive — consistent with this being a news-style feed rather
// than a complete database mirror.
//
// Markup (confirmed against a live fetch, 2026):
//   li.list-complaint-results__item
//     .teaser-complaint__title a       -> "<complainant> vs. <company>" + URL
//     .teaser-complaint__issue dd      -> summary
//     .teaser-complaint__status span   -> status badge text, e.g. "Filed"
//     .teaser-complaint__date          -> "Date filed: 27 July 2026"

import * as cheerio from "cheerio";
import { fetchHtml, delayFor } from "../../scrape-company-labels/http.js";

const URL_ = "https://www.oecdwatch.org/complaints-database/";
export const SOURCE_ID = "oecd-watch";
export const SOURCE_NAME = "OECD Watch";

export async function fetchAll() {
	const host = new URL(URL_).host;
	await delayFor(host);

	const html = await fetchHtml(URL_);
	if (!html) return [];

	const $ = cheerio.load(html);
	const articles = [];

	$("li.list-complaint-results__item").each((_, el) => {
		const $el = $(el);
		const titleEl = $el.find(".teaser-complaint__title a").first();
		const title = titleEl.text().replace(/\s+/g, " ").trim();
		const href = titleEl.attr("href");
		if (!title || !href) return;

		const summary = $el.find(".teaser-complaint__issue dd").first().text().replace(/\s+/g, " ").trim();
		const oecdStatus = $el.find(".teaser-complaint__status span").first().text().trim();
		const dateText = $el.find(".teaser-complaint__date").first().text().replace(/^Date filed:\s*/i, "").trim();

		articles.push({
			sourceId: SOURCE_ID,
			sourceName: SOURCE_NAME,
			url: href,
			title,
			summary,
			publishedAt: parseOecdDate(dateText),
			oecdStatus,
		});
	});

	return articles;
}

function parseOecdDate(text) {
	if (!text) return null;
	const t = Date.parse(text);
	return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
