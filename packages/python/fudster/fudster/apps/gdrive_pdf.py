"""Google Drive view-only PDF extractor.

Opens a Google Drive PDF link in a headless browser, scrolls through
all pages to force rendering, captures each page image from the DOM,
and converts the result to Markdown (with OCR when available).

Requires the ``browser`` optional dependency group::

    pip install fudster[browser]
"""

from __future__ import annotations

import base64
import io
import logging
import re
import tempfile
import time
from pathlib import Path

logger = logging.getLogger(__name__)

_GDRIVE_FILE_RE = re.compile(
    r"https?://drive\.google\.com/file/d/([a-zA-Z0-9_-]+)",
)

_GDRIVE_PREVIEW_TPL = (
    "https://drive.google.com/file/d/{file_id}/preview"
)

# JS that converts every blob: <img> on the page to a base64 data-URL
# via an offscreen canvas.  Returns a JSON array of base64 JPEG strings.
_CAPTURE_JS = """
return (function() {
    var imgs = document.querySelectorAll('img[src^="blob:"]');
    var results = [];
    for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        if (img.naturalWidth === 0) continue;
        var c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        try {
            results.push(c.toDataURL('image/png').split(',')[1]);
        } catch(e) {
            // tainted canvas — skip
        }
    }
    return results;
})();
"""


def _parse_file_id(url: str) -> str:
    """Extract the Google Drive file ID from a URL."""
    m = _GDRIVE_FILE_RE.search(url)
    if m:
        return m.group(1)
    raise ValueError(
        f"Could not extract Google Drive file ID from: {url}"
    )


def _build_viewer_url(url: str) -> str:
    """Normalise a Google Drive URL to the embeddable viewer."""
    file_id = _parse_file_id(url)
    return _GDRIVE_PREVIEW_TPL.format(file_id=file_id)


def _scroll_all_pages(sb, *, pause: float = 0.6, max_scrolls: int = 300):
    """Scroll the Google Drive PDF viewer to load every page."""
    last_height = 0
    stable_count = 0
    for _ in range(max_scrolls):
        sb.execute_script(
            "document.querySelector('div.ndfHFb-c4YZDc-cYSp0e-DARUcf')"
            "?.scrollBy(0, window.innerHeight);"
        )
        time.sleep(pause)
        new_height = sb.execute_script(
            "var el = document.querySelector("
            "'div.ndfHFb-c4YZDc-cYSp0e-DARUcf');"
            "return el ? el.scrollTop : 0;"
        )
        if new_height == last_height:
            stable_count += 1
            if stable_count >= 3:
                break
        else:
            stable_count = 0
        last_height = new_height


def _capture_blob_images(sb) -> list[bytes]:
    """Capture all blob: images from the viewer as PNG bytes."""
    raw = sb.execute_script(_CAPTURE_JS)
    if not raw:
        return []
    images: list[bytes] = []
    for b64 in raw:
        if b64:
            images.append(base64.b64decode(b64))
    return images


def _try_ocr(image_bytes: bytes) -> str | None:
    """Attempt OCR on a single image. Returns text or None."""
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return None
    img = Image.open(io.BytesIO(image_bytes))
    text = pytesseract.image_to_string(img)
    return text.strip() if text.strip() else None


def _images_to_markdown(
    images: list[bytes],
    *,
    output_dir: Path | None = None,
    use_ocr: bool = True,
) -> str:
    """Convert captured page images to Markdown.

    If *use_ocr* is True and pytesseract + Pillow are available, each
    page is OCR'd and the recognised text is emitted.  Otherwise the
    images are saved to *output_dir* and referenced as Markdown images.
    """
    parts: list[str] = []
    ocr_available = use_ocr
    if ocr_available:
        try:
            import pytesseract  # noqa: F401
            from PIL import Image  # noqa: F401
        except ImportError:
            ocr_available = False

    if output_dir is None:
        output_dir = Path(tempfile.mkdtemp(prefix="fudster_gdrive_"))

    output_dir.mkdir(parents=True, exist_ok=True)

    for idx, img_bytes in enumerate(images, 1):
        page_label = f"Page {idx}"
        parts.append(f"## {page_label}\n")

        if ocr_available:
            text = _try_ocr(img_bytes)
            if text:
                parts.append(text)
                parts.append("")
                continue

        # Fallback: save image and reference it
        img_name = "page_{:03d}.png".format(idx)
        img_path = output_dir / img_name
        img_path.write_bytes(img_bytes)
        parts.append(f"![{page_label}]({img_path})\n")

    return "\n".join(parts)


def extract_gdrive_pdf(
    url: str,
    *,
    headless: bool = True,
    output_dir: str | None = None,
    scroll_pause: float = 0.6,
    use_ocr: bool = True,
) -> str:
    """Extract a view-only Google Drive PDF and return Markdown.

    Parameters
    ----------
    url:
        Google Drive share / view link containing ``/file/d/<id>``.
    headless:
        Run the browser without a visible window.
    output_dir:
        Directory to save page images.  Created if absent.
    scroll_pause:
        Seconds to wait between scroll steps.
    use_ocr:
        Attempt OCR via pytesseract when available.

    Returns
    -------
    str
        Markdown representation of the PDF content.
    """
    try:
        from seleniumbase import SB
    except ImportError:
        raise ImportError(
            "seleniumbase is required. "
            "Install with: pip install fudster[browser]"
        )

    viewer_url = _build_viewer_url(url)
    logger.info("Opening viewer: %s", viewer_url)

    out = Path(output_dir) if output_dir else None

    with SB(
        uc=True,
        headless=headless,
        browser="chrome",
    ) as sb:
        sb.open(viewer_url)
        # Wait for the PDF viewer to render at least one page image
        try:
            sb.wait_for_element(
                'img[src^="blob:"]', timeout=20,
            )
        except Exception:
            logger.warning(
                "No blob images found — the PDF may require "
                "sign-in or the link may be invalid."
            )
            return (
                "# Error\n\n"
                "Could not load the PDF. Ensure the link is a "
                "publicly shared Google Drive PDF.\n"
            )

        logger.info("First page loaded, scrolling through document…")
        _scroll_all_pages(sb, pause=scroll_pause)

        # Brief extra pause for final images to render
        time.sleep(1.0)

        images = _capture_blob_images(sb)
        logger.info("Captured %d page image(s)", len(images))

    if not images:
        return (
            "# Error\n\n"
            "No page images could be captured from the viewer.\n"
        )

    header = f"# Google Drive PDF — {len(images)} page(s)\n\n"
    body = _images_to_markdown(images, output_dir=out, use_ocr=use_ocr)
    return header + body
