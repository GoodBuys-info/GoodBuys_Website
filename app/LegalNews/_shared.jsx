/** @format */
// Shared between the index page (app/LegalNews/page.jsx) and the per-company
// detail page (app/LegalNews/[company]/page.jsx) — leading underscore keeps
// this folder-colocated file out of Next.js's route table.

export const STATUS_LABELS = {
	Active: "Active",
	Filed: "Filed",
	Settled: "Settled",
	Dismissed: "Dismissed",
	Closed: "Closed",
	Unknown: "Unknown",
};

export function formatDate(iso) {
	if (!iso) return "";
	const d = new Date(iso);
	if (!Number.isFinite(d.getTime())) return "";
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function companySlug(company) {
	return encodeURIComponent(company);
}

export function IssueCard({ issue }) {
	const { summary, status, sourceName, sourceUrl, publishedAt } = issue;
	const dateText = formatDate(publishedAt);
	const statusLabel = STATUS_LABELS[status] || "Unknown";
	const statusClass = `legal-news-status legal-news-status-${statusLabel.toLowerCase()}`;

	return (
		<div className="legal-news-issue-card">
			<div className="legal-news-issue-top">
				<span className={statusClass}>{statusLabel}</span>
			</div>

			{summary && <p className="legal-news-issue-summary">{summary}</p>}

			<div className="legal-news-issue-footer">
				<span className="legal-news-issue-source">
					{sourceName}
					{dateText && <span className="legal-news-issue-date"> • {dateText}</span>}
				</span>

				{sourceUrl && (
					<a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="legal-news-issue-link">
						Read Source ↗
					</a>
				)}
			</div>
		</div>
	);
}

// `showLabel` is true only in the mixed news+court preview on the index
// page — there, a court filing sits among news cards with no section
// heading to explain what it is. On the detail page it renders inside its
// own "Federal court filings" section, so the heading already says so.
export function CourtFilingRow({ filing, showLabel = false }) {
	const { title, status, court, suitNatureLabel, publishedAt, sourceUrl } = filing;
	const dateText = formatDate(publishedAt);
	const statusLabel = STATUS_LABELS[status] || "Active";
	const statusClass = `legal-news-status legal-news-status-${statusLabel.toLowerCase()}`;
	const metaParts = [suitNatureLabel, court, dateText].filter(Boolean);

	return (
		<div className={`legal-news-court-row${showLabel ? " legal-news-court-row-boxed" : ""}`}>
			{showLabel && <span className="legal-news-court-row-label">Federal court filing</span>}
			<div className="legal-news-court-row-top">
				<span className="legal-news-court-case">{title}</span>
				<span className={statusClass}>{statusLabel}</span>
			</div>
			<div className="legal-news-court-row-bottom">
				<span className="legal-news-court-meta">{metaParts.join(" · ")}</span>
				{sourceUrl && (
					<a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="legal-news-issue-link">
						View docket ↗
					</a>
				)}
			</div>
		</div>
	);
}

export function Pagination({ page, totalPages, onPageChange }) {
	if (totalPages <= 1) return null;
	return (
		<div className="legal-news-pagination">
			<button type="button" className="legal-news-page-btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
				‹ Prev
			</button>
			<span className="legal-news-page-indicator">
				Page {page} of {totalPages}
			</span>
			<button
				type="button"
				className="legal-news-page-btn"
				disabled={page >= totalPages}
				onClick={() => onPageChange(page + 1)}
			>
				Next ›
			</button>
		</div>
	);
}
