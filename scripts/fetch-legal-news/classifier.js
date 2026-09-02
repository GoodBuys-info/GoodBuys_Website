/** @format */

// Deterministic legal-relevance gate and status classifier. Applied to every
// matched (company, article) pair regardless of source — EEOC and OECD Watch
// are inherently legal content so the gate is nearly a no-op there, but NPR
// and Triple Pundit publish plenty of non-legal sustainability coverage that
// would otherwise ride a company-name match straight into the feed.
//
// Two independent jobs:
//   isLegallyRelevant — keyword gate. Cheap, run before spending an LLM call.
//   classifyStatus    — keyword-rule status classification for the sources
//                        with predictable, formal phrasing (EEOC press
//                        releases, OECD Watch's own status field). Freeform
//                        news (NPR/Triple Pundit/Reuters) is classified by
//                        the LLM pass instead — see llm.js — because ordinary
//                        journalism doesn't reliably say "the case was
//                        dismissed" in a fixed shape these rules can catch.

const RELEVANCE_KEYWORDS = [
	"lawsuit", "lawsuits", "sue", "sued", "sues", "suing",
	"complaint", "complaints", "class action", "class-action",
	"settlement", "settled", "settles",
	"investigation", "investigated", "investigates", "probe",
	"fined", "fine", "penalty", "penalties", "sanction", "sanctioned",
	"violation", "violations", "violated",
	"court", "tribunal", "litigation", "legal action",
	"discrimination", "retaliation", "harassment",
	"forced labor", "forced labour", "human trafficking", "trafficking",
	"child labor", "child labour", "modern slavery",
	"human rights abuse", "human rights violation",
	"regulatory", "regulator", "enforcement action",
	"charge", "charges", "charged",
	"dismissed", "dismissal",
];

const RELEVANCE_RE = new RegExp(
	`\\b(${RELEVANCE_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
	"i",
);

export function isLegallyRelevant(article) {
	const text = `${article.title || ""} ${article.summary || ""}`;
	return RELEVANCE_RE.test(text);
}

// Ordered rules — first match wins. Order matters: "settled" must be checked
// before a generic "filed" match, since a settled case's article often still
// mentions the original filing.
const STATUS_RULES = [
	{ status: "Settled", re: /\b(settlement|settled|settles|agrees? to pay|to pay \$|reached an agreement)\b/i },
	{ status: "Dismissed", re: /\b(dismissed|dismissal|thrown out|rejected the (complaint|claim|suit))\b/i },
	{ status: "Closed", re: /\b(closed the (case|investigation|complaint)|concluded|resolved|case closed)\b/i },
	{ status: "Active", re: /\b(investigation|investigating|ongoing|pending trial|court hearing|trial (begins|underway))\b/i },
	{ status: "Filed", re: /\b(files? (a |an )?(lawsuit|complaint|suit|charge)|sues?\b|sued|filed (a |an )?(lawsuit|complaint))\b/i },
];

export function classifyStatus(article) {
	const text = `${article.title || ""} ${article.summary || ""}`;
	for (const rule of STATUS_RULES) {
		if (rule.re.test(text)) return rule.status;
	}
	return "Unknown";
}

// OECD Watch's own status badge is authoritative when present — its
// complaints database tags each entry's process stage directly, so prefer
// that over inferring from the summary text. Substring-matched rather than
// an exact lookup table: the site's exact stage vocabulary (e.g. "Concluded
// - agreement reached" vs "Concluded – no agreement") isn't fully known from
// the unfiltered listing sample this was built against, and a substring
// match degrades gracefully to Unknown instead of throwing on an unseen
// exact string.
const OECD_STATUS_RULES = [
	{ status: "Filed", re: /\bfiled\b/i },
	{ status: "Active", re: /\b(under review|ongoing|mediation|initial assessment|in progress)\b/i },
	{ status: "Dismissed", re: /\b(rejected|not accepted|no agreement)\b/i },
	{ status: "Closed", re: /\b(concluded|closed|agreement reached|final statement)\b/i },
];

export function mapOecdStatus(rawStatus) {
	if (!rawStatus) return "Unknown";
	const text = String(rawStatus).trim();
	for (const rule of OECD_STATUS_RULES) {
		if (rule.re.test(text)) return rule.status;
	}
	return "Unknown";
}
