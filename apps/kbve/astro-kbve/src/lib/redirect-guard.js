/**
 * Ad redirect guard (malvertising mitigation).
 *
 * A malicious ad creative served into an AdSense slot can force the whole page
 * to navigate (e.g. to `u5s5.com/?z=...&syncedCookie=true`) by abusing the
 * `allow-top-navigation*` permission on Google's ad iframe sandbox, or by
 * firing a popunder via `window.open`.
 *
 * Since we don't control the ad network, we neutralize the *capability* on our
 * own page, before the ad script runs:
 *
 *   1. Strip every `allow-top-navigation*` token from any iframe sandbox, both
 *      at attribute-set time (before the frame loads) and via a MutationObserver
 *      backstop. Ads still render; they just can't redirect the top page.
 *   2. Gate `window.open` so off-site popunders that fire WITHOUT a genuine user
 *      gesture are blocked. Legit user-initiated popups (OAuth, share, Discord)
 *      keep working because they run inside an active user activation.
 *
 * This is intentionally conservative: it only removes the redirect capability,
 * never the ad rendering. Same-site iframes/embeds are untouched (we only drop
 * top-navigation tokens, which no legitimate embed on this site relies on).
 *
 * Shipped inline in <head> via Starlight's `head` config so it executes before
 * the (edge-injected, async) adsbygoogle.js.
 */
(function () {
	'use strict';

	function scrubSandbox(value) {
		return String(value)
			.split(/\s+/)
			.filter(function (token) {
				return token && token.indexOf('allow-top-navigation') === -1;
			})
			.join(' ');
	}

	// 1a. Intercept sandbox writes so the permission is gone BEFORE the frame's
	//     document loads (changing sandbox after load does not apply retroactively).
	var rawSetAttribute = Element.prototype.setAttribute;
	Element.prototype.setAttribute = function (name, value) {
		if (
			value != null &&
			this.tagName === 'IFRAME' &&
			String(name).toLowerCase() === 'sandbox'
		) {
			value = scrubSandbox(value);
		}
		return rawSetAttribute.call(this, name, value);
	};

	function hardenIframe(el) {
		if (!el || el.tagName !== 'IFRAME') return;
		var sandbox = el.getAttribute('sandbox');
		if (sandbox === null) return;
		var scrubbed = scrubSandbox(sandbox);
		if (scrubbed !== sandbox) {
			rawSetAttribute.call(el, 'sandbox', scrubbed);
		}
	}

	// 1b. MutationObserver backstop for frames inserted with a pre-set sandbox
	//     or re-armed after insertion.
	function scan(root) {
		if (!root) return;
		if (root.tagName === 'IFRAME') hardenIframe(root);
		if (root.querySelectorAll) {
			var frames = root.querySelectorAll('iframe');
			for (var i = 0; i < frames.length; i++) hardenIframe(frames[i]);
		}
	}

	var observer = new MutationObserver(function (mutations) {
		for (var i = 0; i < mutations.length; i++) {
			var mutation = mutations[i];
			if (mutation.type === 'attributes') {
				hardenIframe(mutation.target);
				continue;
			}
			for (var j = 0; j < mutation.addedNodes.length; j++) {
				scan(mutation.addedNodes[j]);
			}
		}
	});

	function start() {
		scan(document.documentElement);
		observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['sandbox'],
		});
	}

	if (document.documentElement) {
		start();
	} else {
		document.addEventListener('readystatechange', start, { once: true });
	}

	// 2. Block off-site popunders that fire without a real user gesture.
	var SELF = location.hostname;
	function isSameSite(hostname) {
		return (
			hostname === SELF ||
			hostname === 'kbve.com' ||
			hostname.slice(-9) === '.kbve.com'
		);
	}

	var rawOpen = window.open;
	window.open = function (url) {
		try {
			var activation = navigator.userActivation;
			// Only block when we can prove there is NO active user gesture.
			// Fail open if the API is unavailable so legit popups never break.
			if (url && activation && activation.isActive === false) {
				var target = new URL(url, location.href);
				var scheme = target.protocol;
				if (
					(scheme === 'http:' || scheme === 'https:') &&
					!isSameSite(target.hostname)
				) {
					return null;
				}
			}
		} catch (err) {
			/* fall through to the real window.open */
		}
		return rawOpen.apply(window, arguments);
	};
})();
