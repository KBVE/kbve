import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { ImageOff } from 'lucide-react';

interface Props {
	text: string | null;
	html: string | null;
	truncated?: boolean;
}

const MAX_HEIGHT = 2400;

/// Sanitize before the html ever reaches a document. The iframe below is the
/// boundary that matters, but a bypass should have to beat both.
function clean(html: string): string {
	return DOMPurify.sanitize(html, {
		FORBID_TAGS: ['script', 'style', 'svg', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
		FORBID_ATTR: ['srcset', 'ping', 'formaction'],
		ALLOW_DATA_ATTR: false,
	});
}

function hasImages(html: string): boolean {
	return /<img\b/i.test(html);
}

/// A whole document rather than a fragment: the CSP lives in its head, so it
/// applies even if the sandbox attribute is ever lost.
function srcdocFor(html: string, showImages: boolean): string {
	const img = showImages ? 'https: data:' : "'none'";
	return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${img}; media-src 'none'; font-src 'none'; connect-src 'none'; script-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'">
<base target="_blank">
<style>
  html,body{margin:0;padding:0;background:transparent;color:#d8dee9;
    font:14px/1.6 ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
    overflow-wrap:anywhere;word-break:break-word}
  a{color:#7ed957}
  img{max-width:100%;height:auto}
  table{max-width:100%;border-collapse:collapse}
  blockquote{margin:0 0 0 .75rem;padding-left:.75rem;border-left:2px solid #3b4252;color:#9aa5b1}
  pre{white-space:pre-wrap;overflow-x:auto}
</style>
</head><body>${html}</body></html>`;
}

export function MessageBody({ text, html, truncated }: Props) {
	const frameRef = useRef<HTMLIFrameElement | null>(null);
	const [showImages, setShowImages] = useState(false);
	const [height, setHeight] = useState(160);

	const sanitized = useMemo(() => (html ? clean(html) : null), [html]);
	const blocked = useMemo(
		() => (sanitized ? hasImages(sanitized) && !showImages : false),
		[sanitized, showImages],
	);
	const srcdoc = useMemo(
		() => (sanitized ? srcdocFor(sanitized, showImages) : null),
		[sanitized, showImages],
	);

	// Scripts cannot run inside (sandbox withholds allow-scripts and the CSP
	// forbids them), so the frame cannot report its own height. allow-same-origin
	// lets the parent measure it instead, which is only safe *because* scripts
	// are withheld -- granting both is what makes a sandbox meaningless.
	useEffect(() => {
		if (!srcdoc) return;
		const frame = frameRef.current;
		if (!frame) return;
		const measure = () => {
			const doc = frame.contentDocument;
			if (!doc?.body) return;
			const next = Math.min(doc.body.scrollHeight + 16, MAX_HEIGHT);
			if (next > 0) setHeight(next);
		};
		frame.addEventListener('load', measure);
		const timer = window.setTimeout(measure, 120);
		return () => {
			frame.removeEventListener('load', measure);
			window.clearTimeout(timer);
		};
	}, [srcdoc]);

	if (srcdoc) {
		return (
			<div className="hm-body-wrap">
				{blocked && (
					<div className="hm-images-blocked">
						<ImageOff size={14} aria-hidden="true" />
						<span>Images in this message were not loaded.</span>
						<button
							type="button"
							className="hm-btn hm-btn-ghost hm-btn-tiny"
							onClick={() => setShowImages(true)}
						>
							Show images
						</button>
					</div>
				)}
				<iframe
					ref={frameRef}
					className="hm-body-frame"
					title="Message content"
					sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
					referrerPolicy="no-referrer"
					srcDoc={srcdoc}
					style={{ height: `${height}px` }}
				/>
				{truncated && (
					<p className="hm-muted hm-truncated">Message truncated.</p>
				)}
			</div>
		);
	}

	if (text && text.trim()) {
		return (
			<div className="hm-body-wrap">
				<pre className="hm-body hm-body-text">{text}</pre>
				{truncated && (
					<p className="hm-muted hm-truncated">Message truncated.</p>
				)}
			</div>
		);
	}

	return <p className="hm-muted">Empty message.</p>;
}

export default MessageBody;
