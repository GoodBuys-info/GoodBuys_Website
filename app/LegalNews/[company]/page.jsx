/** @format */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import "../../../styles/legal-news.css";
import { IssueCard, CourtFilingRow, Pagination, formatDate } from "../_shared.jsx";

const NEWS_PAGE_SIZE = 8;
const COURT_PAGE_SIZE = 8;

export default function CompanyLegalHistory() {
	const params = useParams();
	const companyName = decodeURIComponent(params.company || "");

	const [records, setRecords] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");
	const [newsPage, setNewsPage] = useState(1);
	const [courtPage, setCourtPage] = useState(1);

	useEffect(() => {
		const load = async () => {
			try {
				const res = await fetch("/data/legal-news.json");
				if (!res.ok) throw new Error("Failed to load legal-news.json");
				const data = await res.json();
				setRecords(Array.isArray(data) ? data : []);
			} catch (err) {
				console.error("[LegalNews/company] Error loading:", err);
				setError("Could not load legal news data. Try refreshing the page.");
			} finally {
				setIsLoading(false);
			}
		};

		load();
	}, []);

	const { newsIssues, courtFilings } = useMemo(() => {
		const matched = records.filter((r) => r.company.toLowerCase() === companyName.toLowerCase());
		matched.sort((a, b) => {
			const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
			const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
			return tb - ta;
		});
		return {
			newsIssues: matched.filter((r) => r.sourceId !== "courtlistener"),
			courtFilings: matched.filter((r) => r.sourceId === "courtlistener"),
		};
	}, [records, companyName]);

	const newsTotalPages = Math.max(1, Math.ceil(newsIssues.length / NEWS_PAGE_SIZE));
	const courtTotalPages = Math.max(1, Math.ceil(courtFilings.length / COURT_PAGE_SIZE));
	const pagedNewsIssues = newsIssues.slice((newsPage - 1) * NEWS_PAGE_SIZE, newsPage * NEWS_PAGE_SIZE);
	const pagedCourtFilings = courtFilings.slice((courtPage - 1) * COURT_PAGE_SIZE, courtPage * COURT_PAGE_SIZE);
	const totalMatching = courtFilings[0]?.totalMatchingCount;
	const viewAllUrl = courtFilings[0]?.viewAllUrl;

	const hasAnyRecords = newsIssues.length > 0 || courtFilings.length > 0;

	return (
		<main id="legal-news">
			<div className="legal-news-inner">
				<section className="legal-news-hero legal-news-detail-hero">
					<Link href="/LegalNews" className="legal-news-back-link">
						← All companies
					</Link>
					<p className="legal-news-pill">Lawsuits &amp; Legal Issues</p>
					<h1 className="legal-news-title legal-news-detail-title">{companyName}</h1>
					{!isLoading && (
						<p className="legal-news-lede">
							{newsIssues.length === 1 ? "1 legal issue" : `${newsIssues.length} legal issues`} on record
							{courtFilings.length > 0 &&
								` · ${courtFilings.length} recent federal court filing${courtFilings.length === 1 ? "" : "s"} shown`}
							.
						</p>
					)}
					{error && <p className="legal-news-error">{error}</p>}
				</section>

				<section className="legal-news-feed-section">
					{isLoading ? (
						<div className="legal-news-feed legal-news-feed-skeleton">
							{Array.from({ length: 3 }).map((_, idx) => (
								<div key={idx} className="legal-news-card legal-news-card-skeleton">
									<div className="legal-news-skeleton-meta" />
									<div className="legal-news-skeleton-title" />
									<div className="legal-news-skeleton-line long" />
									<div className="legal-news-skeleton-line short" />
								</div>
							))}
						</div>
					) : !hasAnyRecords ? (
						<p className="legal-news-empty">
							No legal records on file for {companyName}. It may have been removed from the registry, or simply has no
							matches from the approved sources yet.
						</p>
					) : (
						<div className="legal-news-company">
							{newsIssues.length > 0 && (
								<>
									<div className="legal-news-issues">
										{pagedNewsIssues.map((issue, idx) => (
											<IssueCard key={issue.sourceUrl || idx} issue={issue} />
										))}
									</div>
									<Pagination page={newsPage} totalPages={newsTotalPages} onPageChange={setNewsPage} />
								</>
							)}

							{courtFilings.length > 0 && (
								<div className="legal-news-court-section">
									<div className="legal-news-court-heading">
										<span className="legal-news-court-title">Federal court filings</span>
										<span className="legal-news-court-count">
											{courtFilings.length} of {totalMatching ?? courtFilings.length} shown
										</span>
									</div>

									<div className="legal-news-court-rows">
										{pagedCourtFilings.map((filing, idx) => (
											<CourtFilingRow key={filing.sourceUrl || idx} filing={filing} />
										))}
									</div>

									<Pagination page={courtPage} totalPages={courtTotalPages} onPageChange={setCourtPage} />

									{viewAllUrl && (
										<a href={viewAllUrl} target="_blank" rel="noopener noreferrer" className="legal-news-court-viewall">
											View all {totalMatching} filings on CourtListener ↗
										</a>
									)}
								</div>
							)}
						</div>
					)}
				</section>
			</div>
		</main>
	);
}
