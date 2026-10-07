/** @format */

// News fetcher pipeline: retrieve → parse → match → write.
// Produces a preview JSON dump of all fetched articles with their match
// results, plus a host-stats file for debugging rate limits / 403s. See
// scripts/scrape-company-labels/run.js for the architectural pattern this
// mirrors, and the README-adjacent comment in matcher.js for the matching
// design. This session's scope ends at the preview file; no DB writes,
// no API exposure, no frontend.

import pLimit from "p-limit";
import fs from "fs/promises";

import FEEDS from "./rules/feeds.js";
import { ENV, PATHS } from "./config.js";
import { fetchFeed } from "./fetch.js";
import { parseFeed } from "./parse.js";
import { initMatcher, matchArticle } from "./matcher.js";
import { searchLabel, OUTLET_ID as GOOGLE_ID, OUTLET_NAME as GOOGLE_NAME } from "./google-news.js";
import { writePreview, writeHostStats, readArchive, writeArchive } from "./io.js";
import { getHostStatsSnapshot } from "../scrape-company-labels/http.js";

async function main() {
	console.log("=======================================");
	console.log("      GoodBuys News Fetcher            ");
	console.log("=======================================");
	console.log(`Feeds: ${FEEDS.length}   Concurrency: ${ENV.CONCURRENCY}`);

	// Init the matcher before any fetches so any guard violations throw early
	// (same principle as the crawler: fail loud at startup).
	const labels = JSON.parse(await fs.readFile(PATHS.LABELS_PATH, "utf8"));
	initMatcher({ labels });
	console.log("");

	const limit = pLimit(ENV.CONCURRENCY);
	const results = [];

	const tasks = FEEDS.map((feed) =>
		limit(async () => {
			const started = Date.now();
			try {
				// Page 1 is the normal feed; paged feeds also serve older items
				// at ?paged=N. A failed first page fails the feed (as before); a
				// failed later page just ends paging for that feed.
				const pages = feed.paged ? Math.max(1, ENV.PAGES) : 1;
				const allArticles = [];
				let feedMeta = null;
				let totalBytes = 0;
				for (let p = 1; p <= pages; p++) {
					const pageUrl = p === 1 ? feed.url : `${feed.url}${feed.url.includes("?") ? "&" : "?"}paged=${p}`;
					const xml = await fetchFeed(pageUrl);
					if (!xml) {
						if (p === 1) {
							const elapsed = Date.now() - started;
							console.error(`[${feed.id}] FAIL — fetch returned null (see host-stats)`);
							results.push({ feed, ok: false, error: "empty-response", elapsed });
							return;
						}
						break;
					}
					const parsed = parseFeed(xml, { outletId: feed.id, outletName: feed.name });
					if (parsed.error) {
						if (p === 1) {
							const elapsed = Date.now() - started;
							console.error(`[${feed.id}] parse-error: ${parsed.error}`);
							results.push({ feed, ok: false, error: `parse: ${parsed.error}`, elapsed });
							return;
						}
						break;
					}
					totalBytes += xml.length;
					feedMeta = feedMeta || parsed.feedMeta;
					if (!parsed.articles.length) break;
					allArticles.push(...parsed.articles);
				}
				const elapsed = Date.now() - started;

				// De-dupe across pages (a new post landing mid-run shifts page boundaries).
				const seenUrls = new Set();
				const articles = allArticles.filter((a) => {
					const key = a.url || a.guid;
					if (!key || seenUrls.has(key)) return false;
					seenUrls.add(key);
					return true;
				});

				// Truncate to MAX_ITEMS_PER_FEED per page fetched to cap memory / log volume.
				const capped = articles.slice(0, ENV.MAX_ITEMS_PER_FEED * pages);

				// Match each article.
				const annotated = capped.map((a) => ({ ...a, matches: matchArticle(a) }));
				const matchedCount = annotated.filter((a) => a.matches.length).length;

				console.log(
					`[${feed.id}] ok — ${totalBytes.toLocaleString()} bytes in ${elapsed}ms, ${pages > 1 ? `${pages} pages, ` : ""}parsed ${capped.length}/${articles.length} items, ` +
						`${matchedCount} matched`,
				);
				results.push({ feed, ok: true, bytes: totalBytes, elapsed, articles: annotated, feedMeta });
			} catch (err) {
				const elapsed = Date.now() - started;
				console.error(`[${feed.id}] FAIL — ${err.message || err}`);
				results.push({ feed, ok: false, error: err.message || String(err), elapsed });
			}
		}),
	);

	await Promise.all(tasks);

	// --- Per-label Google News search ---
	// One query per tracked label, run one at a time to stay polite. Only
	// articles whose headline actually names a tracked label are kept (the
	// matcher is the relevance gate); the rest never enter the results.
	if (ENV.GOOGLE_NEWS) {
		const started = Date.now();
		const seenTitles = new Set();
		const seenUrls = new Set();
		const matchedFromGoogle = [];
		let fetched = 0;
		let queried = 0;
		for (const label of labels) {
			let found = [];
			try {
				found = await searchLabel(label);
			} catch (err) {
				console.error(`[${GOOGLE_ID}] ${label.id}: ${err.message || err}`);
			}
			queried++;
			fetched += found.length;
			for (const a of found) {
				const titleKey = a.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
				if (seenUrls.has(a.url) || seenTitles.has(titleKey)) continue; // same story syndicated by several outlets
				const matches = matchArticle(a);
				if (!matches.length) continue;
				seenUrls.add(a.url);
				seenTitles.add(titleKey);
				matchedFromGoogle.push({ ...a, matches });
			}
		}
		console.log(
			`[${GOOGLE_ID}] ok — ${queried} label queries, ${fetched} headlines (last ${ENV.GOOGLE_DAYS}d), ` +
				`${matchedFromGoogle.length} named a tracked label, in ${Date.now() - started}ms`,
		);
		results.push({
			feed: { id: GOOGLE_ID, name: GOOGLE_NAME },
			ok: true,
			bytes: 0,
			elapsed: Date.now() - started,
			articles: matchedFromGoogle,
			feedMeta: null,
		});
	}

	console.log("");
	console.log("--- Summary ---");
	let totalArticles = 0;
	let totalMatched = 0;
	for (const r of results) {
		if (r.ok) {
			totalArticles += r.articles.length;
			const matched = r.articles.filter((a) => a.matches.length).length;
			totalMatched += matched;
			console.log(
				`  OK    ${r.feed.id.padEnd(20)} ${String(r.articles.length).padStart(3)} items   ${String(matched).padStart(3)} matched`,
			);
		} else {
			console.log(`  FAIL  ${r.feed.id.padEnd(20)} ${r.error}`);
		}
	}
	console.log(`  ------------------------------------------`);
	console.log(`  TOTAL: ${totalArticles} articles, ${totalMatched} matched to ≥1 label`);

	// Every matched article, per feed, with the specific matches inline.
	console.log("");
	console.log("--- All matched articles ---");
	for (const r of results) {
		if (!r.ok) continue;
		const matched = r.articles.filter((a) => a.matches.length);
		if (!matched.length) continue;
		console.log(`  [${r.feed.id}] ${matched.length} matched:`);
		for (const a of matched) {
			console.log(`    "${a.title.slice(0, 85)}${a.title.length > 85 ? "..." : ""}"`);
			for (const m of a.matches) {
				console.log(`       → ${m.labelId.padEnd(28)} ${m.bucket.padEnd(10)} ${m.tier.padEnd(17)} @${m.where}   [${String(m.matchedText).slice(0, 40)}]`);
			}
		}
		console.log("");
	}

	// Unmatched sample (so we can eyeball whether we missed anything we should have caught).
	console.log("--- Unmatched sample (first 3 per feed) ---");
	for (const r of results) {
		if (!r.ok) continue;
		const unmatched = r.articles.filter((a) => !a.matches.length).slice(0, 3);
		if (!unmatched.length) continue;
		console.log(`  [${r.feed.id}]`);
		for (const a of unmatched) {
			console.log(`    - ${a.title.slice(0, 100)}${a.title.length > 100 ? "..." : ""}`);
		}
	}
	console.log("");

	console.log("--- Host stats ---");
	const hs = getHostStatsSnapshot();
	if (Object.keys(hs).length === 0) {
		console.log("  (no errors recorded)");
	} else {
		console.log(JSON.stringify(hs, null, 2));
	}
	console.log("");

	// --- Writes ---
	if (ENV.DRY_RUN) {
		console.log("[DRY_RUN] Skipping preview + host-stats writes.");
	} else {
		const fetchedAt = new Date().toISOString();
		const flat = [];
		for (const r of results) {
			if (!r.ok) continue;
			for (const a of r.articles) flat.push({ ...a, fetchedAt });
		}

		// Merge matched articles into the committed archive. Existing archive
		// entries win over a fresh copy of the same article so an unchanged
		// day produces a byte-identical file (no commit, no deploy).
		const keyOf = (a) => a.url || a.guid;
		const archive = await readArchive();
		const byKey = new Map();
		for (const a of archive) if (keyOf(a)) byKey.set(keyOf(a), a);
		let added = 0;
		for (const a of flat) {
			if (!a.matches?.length || !keyOf(a) || byKey.has(keyOf(a))) continue;
			byKey.set(keyOf(a), a);
			added++;
		}
		const ts = (a) => (a.publishedAt ? new Date(a.publishedAt).getTime() : 0);
		const mergedArchive = Array.from(byKey.values())
			.sort((a, b) => ts(b) - ts(a))
			.slice(0, ENV.ARCHIVE_MAX);
		console.log(`[archive] ${archive.length} existing + ${added} new matched -> ${mergedArchive.length} kept`);

		// The page reads news-preview.json, so it gets the archived matches too
		// (anything already present fresh is not duplicated).
		const freshKeys = new Set(flat.map(keyOf));
		const preview = [...flat, ...mergedArchive.filter((x) => !freshKeys.has(keyOf(x)))];

		// Each write isolated so one failure doesn't lose the other output.
		await tryWrite("news-archive.json", () => writeArchive(mergedArchive));
		await tryWrite("news-preview.json", () => writePreview(preview));
		await tryWrite("news-preview.host-stats.json", () => writeHostStats(hs));
	}

	console.log("");
	console.log("Done.");
}

async function tryWrite(label, fn) {
	try {
		await fn();
	} catch (err) {
		console.error(`[news] FAIL write ${label}: ${err.message || err}`);
	}
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
