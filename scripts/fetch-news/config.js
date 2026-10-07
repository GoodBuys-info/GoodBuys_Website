/** @format */

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

export const PATHS = {
	ROOT,
	SCRIPT_DIR: __dirname,
	LABELS_PATH: path.join(ROOT, "public", "data", "labels.json"),
	OUTPUT_PATH: path.join(ROOT, "public", "data", "news-preview.json"),
	HOST_STATS_PATH: path.join(ROOT, "public", "data", "news-preview.host-stats.json"),
	// Committed (NOT gitignored, unlike news-preview.json): matched articles
	// accumulate here across runs. A single RSS snapshot holds only ~10-25
	// items per outlet and ecolabels are rarely named in them, so without
	// memory the page showed 0-1 results.
	ARCHIVE_PATH: path.join(ROOT, "public", "data", "news-archive.json"),
};

function envFlag(name) {
	const v = process.env[name];
	if (!v) return false;
	const lower = String(v).toLowerCase();
	return lower === "1" || lower === "true" || lower === "yes";
}

export const ENV = {
	CONCURRENCY: parseInt(process.env.NEWS_CONCURRENCY || "5", 10),
	REQUEST_TIMEOUT: parseInt(process.env.NEWS_REQUEST_TIMEOUT || "15000", 10),
	MAX_ITEMS_PER_FEED: parseInt(process.env.NEWS_MAX_ITEMS_PER_FEED || "50", 10),
	BASE_DELAY_MS: parseInt(process.env.NEWS_BASE_DELAY_MS || "800", 10),
	JITTER_MS: parseInt(process.env.NEWS_JITTER_MS || "500", 10),
	// Feed pages fetched per paged outlet. 2 is enough for the daily refresh
	// (catches anything newer than the last run); a one-time backfill uses
	// e.g. NEWS_PAGES=15.
	PAGES: parseInt(process.env.NEWS_PAGES || "2", 10),
	// Newest-first cap on the committed archive so it can't grow unbounded.
	ARCHIVE_MAX: parseInt(process.env.NEWS_ARCHIVE_MAX || "400", 10),
	// Per-label Google News search (google-news.js). On by default; NEWS_GOOGLE=0
	// turns it off. GOOGLE_DAYS is the lookback: 14 is plenty for a daily run
	// (the archive de-dupes overlap); a one-time backfill can use e.g. 60.
	GOOGLE_NEWS: process.env.NEWS_GOOGLE !== "0",
	GOOGLE_DAYS: parseInt(process.env.NEWS_GOOGLE_DAYS || "14", 10),
	DRY_RUN: envFlag("DRY_RUN"),
};
