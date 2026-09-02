/** @format */

// Config for the legal-news fetcher. Mirrors scripts/fetch-news/config.js —
// same PATHS/ENV shape, same DRY_RUN convention.

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

export const PATHS = {
	ROOT,
	SCRIPT_DIR: __dirname,
	COMPANIES_PATH: path.join(ROOT, "public", "data", "company-labels.json"),
	OUTPUT_PATH: path.join(ROOT, "public", "data", "legal-news.json"),
	HOST_STATS_PATH: path.join(ROOT, "public", "data", "legal-news.host-stats.json"),
	// node-llama-cpp downloads/caches the GGUF model here. Gitignored; restored
	// from actions/cache in CI so the ~2GB download only happens once.
	MODELS_DIR: path.join(ROOT, ".models"),
};

function envFlag(name) {
	const v = process.env[name];
	if (!v) return false;
	const lower = String(v).toLowerCase();
	return lower === "1" || lower === "true" || lower === "yes";
}

export const ENV = {
	// Targeted-search sources (EEOC, Human Trafficking Search) issue one
	// request per company — keep this conservative, it's a single host taking
	// repeated hits.
	SEARCH_CONCURRENCY: parseInt(process.env.LEGAL_SEARCH_CONCURRENCY || "3", 10),
	REQUEST_TIMEOUT: parseInt(process.env.LEGAL_REQUEST_TIMEOUT || "15000", 10),
	BASE_DELAY_MS: parseInt(process.env.LEGAL_BASE_DELAY_MS || "900", 10),
	JITTER_MS: parseInt(process.env.LEGAL_JITTER_MS || "600", 10),

	// LLM extraction pass (NPR / Triple Pundit / Reuters candidates only).
	// CPU-bound local inference — sequential by design, no benefit to
	// concurrency, and it keeps the model's memory footprint singular.
	LLM_MODEL_URI: process.env.LEGAL_LLM_MODEL_URI || "hf:Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M",
	LLM_MAX_CANDIDATES: parseInt(process.env.LEGAL_LLM_MAX_CANDIDATES || "300", 10),
	SKIP_LLM: envFlag("LEGAL_SKIP_LLM"),

	// CourtListener (Free Law Project) federal-court search. Works
	// unauthenticated (confirmed working at low volume), but a free API token
	// gives a much higher rate limit — needed for a real 205-company run.
	// Get one at courtlistener.com (Profile -> API Token) and set it locally
	// / as a CI secret; unset is fine for casual testing.
	COURTLISTENER_API_TOKEN: process.env.COURTLISTENER_API_TOKEN || null,
	// Cap on how many allowlist-passing filings we keep per company, newest
	// first — CourtListener returns undifferentiated case volume (thousands
	// for a company the size of Amazon), so this is a hard display/cost cap,
	// not a "there just aren't more" signal. The UI links out to the full
	// CourtListener result set for anyone who wants more.
	COURTLISTENER_CAP: parseInt(process.env.LEGAL_COURTLISTENER_CAP || "5", 10),

	// Local testing only — process just the first N companies instead of the
	// full registry, so a smoke test doesn't issue 400+ requests. Unset in
	// production (the monthly workflow never sets this).
	COMPANY_LIMIT: process.env.LEGAL_COMPANY_LIMIT ? parseInt(process.env.LEGAL_COMPANY_LIMIT, 10) : null,

	// Local testing only — target specific companies by name instead of "the
	// first N in file order" (which is what COMPANY_LIMIT gives you, and can
	// easily land on companies with no real hits). Comma-separated, matched
	// case-insensitively against the registry. Takes priority over
	// COMPANY_LIMIT when both are set.
	TEST_COMPANIES: process.env.LEGAL_TEST_COMPANIES
		? process.env.LEGAL_TEST_COMPANIES.split(",").map((s) => s.trim()).filter(Boolean)
		: null,

	DRY_RUN: envFlag("DRY_RUN"),
};
