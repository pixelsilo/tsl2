(() => {
	const TENURE_COOKIE = "parksideTenureQuery";
	const TENURE_PARAM = "tenure_equal";
	const COOKIE_DAYS = 365;

	const PATH_MATCHERS = [
		(path) => path === "/",
		(path) => path === "/apartment" || path.startsWith("/apartment/")
	];

	const isTargetPath = (path = window.location.pathname) =>
		PATH_MATCHERS.some((matches) => matches(path));

	const getCookie = (name) => {
		const cookie = document.cookie
			.split(";")
			.map((part) => part.trim())
			.find((part) => part.startsWith(`${name}=`));

		return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : "";
	};

	const setCookie = (name, value, days) => {
		const expires = new Date(Date.now() + days * 86400000).toUTCString();
		document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
	};

	const getTenureParam = (href = window.location.href) => {
		const url = new URL(href, window.location.origin);
		return url.searchParams.get(TENURE_PARAM) || "";
	};

	const buildUrl = (tenureValue, href = window.location.href) => {
		const url = new URL(href, window.location.origin);
		url.searchParams.set(TENURE_PARAM, tenureValue);
		return url.toString();
	};

	const preserveTenureInHistory = () => {
		if (!isTargetPath()) return;

		const originalPushState = history.pushState.bind(history);
		const originalReplaceState = history.replaceState.bind(history);

		const withTenure = (url) => {
			const candidate = url == null ? window.location.href : String(url);
			const nextUrl = new URL(candidate, window.location.href);
			if (!isTargetPath(nextUrl.pathname)) return url;

			const tenureValue = nextUrl.searchParams.get(TENURE_PARAM) || getCookie(TENURE_COOKIE);
			if (!tenureValue) return url;

			nextUrl.searchParams.set(TENURE_PARAM, tenureValue);
			return nextUrl.toString();
		};

		history.pushState = (state, unused, url) => {
			const nextUrl = withTenure(url);
			const result = originalPushState(state, unused, nextUrl);
			const tenureValue = getTenureParam(nextUrl || window.location.href);
			if (tenureValue) setCookie(TENURE_COOKIE, tenureValue, COOKIE_DAYS);
			return result;
		};

		history.replaceState = (state, unused, url) => {
			const nextUrl = withTenure(url);
			const result = originalReplaceState(state, unused, nextUrl);
			const tenureValue = getTenureParam(nextUrl || window.location.href);
			if (tenureValue) setCookie(TENURE_COOKIE, tenureValue, COOKIE_DAYS);
			return result;
		};
	};

	const syncTenureFromState = () => {
		const tenureFromUrl = getTenureParam();
		if (tenureFromUrl) {
			setCookie(TENURE_COOKIE, tenureFromUrl, COOKIE_DAYS);
			return;
		}

		const tenureFromCookie = getCookie(TENURE_COOKIE);
		if (!tenureFromCookie) return;

		window.location.replace(buildUrl(tenureFromCookie));
	};

	const init = () => {
		if (!isTargetPath()) return;

		preserveTenureInHistory();
		syncTenureFromState();

		window.addEventListener("popstate", () => {
			const tenureValue = getTenureParam();
			if (tenureValue) {
				setCookie(TENURE_COOKIE, tenureValue, COOKIE_DAYS);
				return;
			}

			const persisted = getCookie(TENURE_COOKIE);
			if (persisted) {
				history.replaceState(history.state, document.title, buildUrl(persisted));
			}
		});
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init, { once: true });
	} else {
		init();
	}
})();
