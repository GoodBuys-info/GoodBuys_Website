"use client";

import { useState } from "react";
import Link from "next/link";
import "../styles/navigation-bar.css";

export default function NavigationBar() {
	const [isOpen, setIsOpen] = useState(false);
	const [isNewsOpen, setIsNewsOpen] = useState(false);

	const handleToggle = () => {
		setIsOpen((prev) => !prev);
	};

	const handleClose = () => {
		setIsOpen(false);
		setIsNewsOpen(false);
	};

	const handleNewsToggle = () => {
		setIsNewsOpen((prev) => !prev);
	};

	return (
		<header id="navigation-bar">
			<Link href="/" className="nav-logo" onClick={handleClose}>
				<img src="/images/GoodBuysLogo.png" alt="GoodBuys logo" />
				<span className="nav-logo-text">GoodBuys</span>
			</Link>

			{/* Mobile menu button */}
			<button
				type="button"
				className={`nav-toggle ${isOpen ? "nav-toggle-open" : ""}`}
				onClick={handleToggle}
				aria-label="Toggle navigation"
			>
				<span />
				<span />
				<span />
			</button>

			<nav className={`nav-links ${isOpen ? "nav-links-open" : ""}`} aria-hidden={!isOpen}>
				<Link href="/Search" className="navigation-bar-button" onClick={handleClose}>
					Search
				</Link>
				<div className={`nav-dropdown ${isNewsOpen ? "nav-dropdown-open" : ""}`}>
					<div className="nav-dropdown-trigger">
						<Link href="/News" className="navigation-bar-button" onClick={handleClose}>
							News
						</Link>
						<button
							type="button"
							className="nav-dropdown-caret"
							onClick={handleNewsToggle}
							aria-expanded={isNewsOpen}
							aria-haspopup="true"
							aria-label="Toggle News submenu"
						>
							<span className="nav-dropdown-caret-icon" />
						</button>
					</div>

					<div className="nav-dropdown-menu">
						<div className="nav-dropdown-menu-inner">
							<Link href="/LegalNews" className="nav-dropdown-link" onClick={handleClose}>
								Legal News
							</Link>
						</div>
					</div>
				</div>
				<Link href="/About" className="navigation-bar-button" onClick={handleClose}>
					About
				</Link>
				<Link href="/OurTeam" className="navigation-bar-button" onClick={handleClose}>
					Our Team
				</Link>
				<Link href="/ContactUs" className="navigation-bar-button" onClick={handleClose}>
					Contact Us
				</Link>
				<Link href="/Publications" className="navigation-bar-button" onClick={handleClose}>
					Publications
				</Link>
			</nav>
		</header>
	);
}
