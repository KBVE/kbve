using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>
    /// Shared UI Toolkit style helpers — NieR/YoRHA-inspired aesthetic
    /// adapted to a shadcn-black + tailwind-amber/yellow palette.
    ///
    /// Visual vocabulary borrowed from YoRHA: 3-color discipline, sharp
    /// (zero-radius) corners, square marker accents before headings,
    /// horizontal strip dividers, letter-spaced display text.
    ///
    /// Authored in C# (no .uss assets) so styles stay strongly-typed and
    /// grep-able. If we ever migrate to USS sheets, the palette constants
    /// translate 1:1 to CSS custom properties.
    /// </summary>
    public static class UIStyles
    {
        // -- Palette --
        // Black surfaces (shadcn / tailwind zinc) + gold-yellow (tailwind amber)
        // text. NieR's orange-red survives as the alert swatch.
        public static class Palette
        {
            // Surfaces — tailwind `zinc` ramp. Lower numbers = lighter, but
            // we lean into the dark end of the ramp on purpose.
            public static readonly Color Black   = FromHex(0x00, 0x00, 0x00);
            public static readonly Color Zinc950 = FromHex(0x09, 0x09, 0x0B); // shadcn page bg
            public static readonly Color Zinc900 = FromHex(0x18, 0x18, 0x1B); // card / panel
            public static readonly Color Zinc800 = FromHex(0x27, 0x27, 0x2A); // muted surface
            public static readonly Color Zinc700 = FromHex(0x3F, 0x3F, 0x46); // border / divider
            public static readonly Color Zinc500 = FromHex(0x71, 0x71, 0x7A); // disabled text

            // Foreground — tailwind `amber` / `yellow`. Default body text
            // is amber-300 (warm gold). Headings step up to amber-200.
            public static readonly Color Gold        = FromHex(0xFC, 0xD3, 0x4D); // amber-300
            public static readonly Color GoldBright  = FromHex(0xFD, 0xE6, 0x8A); // amber-200 (headings)
            public static readonly Color GoldDeep    = FromHex(0xF5, 0x9E, 0x0B); // amber-500 (button/active)
            public static readonly Color Yellow      = FromHex(0xFA, 0xCC, 0x15); // yellow-400
            public static readonly Color GoldMuted   = new(0xFC / 255f, 0xD3 / 255f, 0x4D / 255f, 0.65f);

            // Alert — tailwind `orange-500`, the NieR-red analogue.
            public static readonly Color Alert = FromHex(0xF9, 0x73, 0x16);
            // Success — tailwind `emerald-500`. Reserved for positive
            // notifications (build success, recipe completed, level-up).
            public static readonly Color Success = FromHex(0x10, 0xB9, 0x81);

            // -- Semantic aliases --
            // Existing panels / future panels reference these names.
            // Re-themes happen by editing this section only.
            public static readonly Color PanelBg     = new(0x09 / 255f, 0x09 / 255f, 0x0B / 255f, 0.92f); // zinc-950 @ 92%
            public static readonly Color TileHudBg   = new(0x18 / 255f, 0x18 / 255f, 0x1B / 255f, 0.90f); // zinc-900 @ 90%
            public static readonly Color ModalBg     = new(0x09 / 255f, 0x09 / 255f, 0x0B / 255f, 0.98f); // near-opaque
            public static readonly Color BackdropDim = new(0f,         0f,         0f,         0.65f);   // modal scrim

            // Borders default to gold to mirror YoRHA's framed look.
            // 0.4 alpha keeps the chrome quiet without losing the outline.
            public static readonly Color BorderGold  = new(0xFC / 255f, 0xD3 / 255f, 0x4D / 255f, 0.40f);
            public static readonly Color BorderSubtle = new(0x3F / 255f, 0x3F / 255f, 0x46 / 255f, 1.00f); // zinc-700

            // Buttons — dark surface with gold text + bright hover.
            public static readonly Color ButtonBg      = Zinc900;
            public static readonly Color ButtonBgHover = Zinc800;

            // Text — semantic names so future panels pick the right swatch.
            public static readonly Color TextPrimary   = Gold;        // body
            public static readonly Color TextStrong    = GoldBright;  // headings
            public static readonly Color TextMuted     = GoldMuted;   // captions
            public static readonly Color TextStat      = Gold;        // unit stats
            public static readonly Color TextCreature  = Alert;       // creature names (warning-ish)
            public static readonly Color TextInventory = Yellow;      // inventory list
            public static readonly Color TextResource  = GoldDeep;    // resource counts
            public static readonly Color TextDanger    = Alert;
        }

        // -- Radius --
        // YoRHA aesthetic = sharp corners. Soft corners exist for cases
        // where readability beats vibe (e.g. tooltip pills).
        public static class Radius
        {
            public const float Sharp = 0f;
            public const float Soft  = 4f;
        }

        // -- Spacing scale --
        // shadcn/tailwind-flavoured ramp. Use these in place of raw pixel
        // numbers so panel density stays consistent — bumping the ramp
        // here re-spaces the entire UI in one edit.
        //   Xs : pixel-pair gaps (label/value pair, icon flush)
        //   Sm : intra-section gaps (list rows, button paddings)
        //   Md : inter-element gaps (header→body, between rows)
        //   Lg : section gaps (header bar margin, strip dividers)
        //   Xl : panel-level gaps (rare — modal padding)
        public static class Spacing
        {
            public const float Xs = 2f;
            public const float Sm = 4f;
            public const float Md = 6f;
            public const float Lg = 8f;
            public const float Xl = 12f;
        }

        // -- Type scale --
        // Five sizes covering everything from dense list rows to panel
        // titles. Body / Label are the workhorses; Heading / Title only
        // for panel-level chrome. Stays small on purpose so panels can
        // pack more data without scrolling at our standard zoom.
        public static class Type
        {
            public const int Tiny    = 9;   // pip / unit annotation
            public const int Body    = 10;  // dense list row body
            public const int BodyLg  = 11;  // standard panel body
            public const int Label   = 12;  // bold labels, button text
            public const int Heading = 13;  // section headings inside a panel
            public const int Title   = 15;  // panel title (top of card)
        }

        // -- Standard panel widths --
        // Min/max pair so panels grow with content but cap at a width
        // that doesn't dominate the viewport at 1920x1080 / smaller.
        public static class PanelWidth
        {
            public const float NarrowMin = 200f; public const float NarrowMax = 280f;  // single-column inspector
            public const float StdMin    = 240f; public const float StdMax    = 320f;  // floating side panels
            public const float WideMin   = 320f; public const float WideMax   = 420f;  // tabbed / two-pane
        }

        // -- Equal-sided setters (chainable) --
        // Each replaces 4 inline calls. Chain them with the C# initializer
        // pattern: `panel.style.BorderRadius(0).BorderWidth(1).BorderColor(...)`.

        public static IStyle BorderRadius(this IStyle s, float r)
        {
            s.borderTopLeftRadius     = r;
            s.borderTopRightRadius    = r;
            s.borderBottomLeftRadius  = r;
            s.borderBottomRightRadius = r;
            return s;
        }

        public static IStyle BorderWidth(this IStyle s, float w)
        {
            s.borderTopWidth    = w;
            s.borderBottomWidth = w;
            s.borderLeftWidth   = w;
            s.borderRightWidth  = w;
            return s;
        }

        public static IStyle BorderColor(this IStyle s, Color c)
        {
            s.borderTopColor    = c;
            s.borderBottomColor = c;
            s.borderLeftColor   = c;
            s.borderRightColor  = c;
            return s;
        }

        // CSS-style padding: vertical / horizontal pair.
        public static IStyle Padding(this IStyle s, float vertical, float horizontal)
        {
            s.paddingTop    = vertical;
            s.paddingBottom = vertical;
            s.paddingLeft   = horizontal;
            s.paddingRight  = horizontal;
            return s;
        }

        public static IStyle Padding(this IStyle s, float all)
            => s.Padding(all, all);

        public static IStyle Margin(this IStyle s, float vertical, float horizontal)
        {
            s.marginTop    = vertical;
            s.marginBottom = vertical;
            s.marginLeft   = horizontal;
            s.marginRight  = horizontal;
            return s;
        }

        public static IStyle Margin(this IStyle s, float all)
            => s.Margin(all, all);

        // -- Compound helpers --
        // ApplyPanelChrome handles the bg/border/radius/padding combo every
        // panel sets in nearly-identical form. Defaults are tighter than
        // the v1 spacing — old panels passed padV: 12 / padH: 14 ad-hoc
        // which made everything feel oversized; new defaults pull from the
        // Spacing ramp so the entire UI moves together when we re-tune.
        public static VisualElement ApplyPanelChrome(
            this VisualElement v,
            Color? background = null,
            Color? border     = null,
            float radius      = Radius.Sharp,
            float borderWidth = 1f,
            float padV        = Spacing.Md,
            float padH        = Spacing.Lg)
        {
            v.style.backgroundColor = background ?? Palette.PanelBg;
            v.style.BorderColor(border ?? Palette.BorderGold);
            v.style.BorderRadius(radius);
            v.style.BorderWidth(borderWidth);
            v.style.Padding(padV, padH);
            return v;
        }

        /// <summary>Compact panel chrome — minimal padding, for ultra-dense panels (toast, tooltip, inline list rows). Half the standard padding so the chrome doesn't compete with the data.</summary>
        public static VisualElement ApplyPanelChromeCompact(this VisualElement v,
                                                            Color? background = null,
                                                            Color? border     = null)
        {
            return v.ApplyPanelChrome(
                background: background, border: border,
                padV: Spacing.Sm, padH: Spacing.Md);
        }

        // -- Anchoring --
        // Absolute-positioned panels use percent offsets so they track the
        // safe area as the window resizes. These two cover the common cases
        // (bottom-right HUD, top-left toolbar). Add more as needed.
        public static IStyle AnchorBottomRight(this IStyle s, float marginPct = 2f)
        {
            s.position = Position.Absolute;
            s.bottom   = new Length(marginPct, LengthUnit.Percent);
            s.right    = new Length(marginPct, LengthUnit.Percent);
            return s;
        }

        public static IStyle AnchorTopLeft(this IStyle s, float marginPct = 2f)
        {
            s.position = Position.Absolute;
            s.top      = new Length(marginPct, LengthUnit.Percent);
            s.left     = new Length(marginPct, LengthUnit.Percent);
            return s;
        }

        public static IStyle AnchorTopRight(this IStyle s, float marginPct = 2f)
        {
            s.position = Position.Absolute;
            s.top      = new Length(marginPct, LengthUnit.Percent);
            s.right    = new Length(marginPct, LengthUnit.Percent);
            return s;
        }

        public static IStyle AnchorBottomLeft(this IStyle s, float marginPct = 2f)
        {
            s.position = Position.Absolute;
            s.bottom   = new Length(marginPct, LengthUnit.Percent);
            s.left     = new Length(marginPct, LengthUnit.Percent);
            return s;
        }

        // -- NieR/YoRHA primitives --
        // Visual atoms borrowed from the NieR design system. Use these
        // instead of raw labels when you want the YoRHA look.

        /// <summary>
        /// Square accent block — the small marker that prefixes NieR's
        /// list items / headings. Pure background block, no text.
        /// </summary>
        public static VisualElement MakeMarker(float size = 12f, Color? color = null)
        {
            var v = new VisualElement();
            v.style.width  = size;
            v.style.height = size;
            v.style.flexShrink = 0;
            v.style.backgroundColor = color ?? Palette.Gold;
            return v;
        }

        /// <summary>
        /// Horizontal full-width divider (NieR's `Strip`). 2px gold by default.
        /// Sits between sections of a panel.
        /// </summary>
        public static VisualElement MakeStrip(float thickness = 2f, Color? color = null,
                                              float marginV = 6f)
        {
            var v = new VisualElement();
            v.style.height = thickness;
            v.style.width  = new Length(100, LengthUnit.Percent);
            v.style.backgroundColor = color ?? Palette.Gold;
            v.style.marginTop    = marginV;
            v.style.marginBottom = marginV;
            return v;
        }

        /// <summary>
        /// Heading row: marker square + label, in the YoRHA Title pattern.
        /// Use for panel section headers ("INVENTORY", "STATS", etc.).
        /// Returns the wrapper; grab the label via UQ if you need to retext.
        /// </summary>
        public static VisualElement MakeMarkerRow(string text,
                                                  Color? markerColor = null,
                                                  Color? textColor   = null,
                                                  int fontSize       = 14,
                                                  float gap          = 8f)
        {
            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems    = Align.Center;

            // Marker square sized to the cap-height of the label so they
            // visually align without padding tweaks.
            var marker = MakeMarker(size: fontSize, color: markerColor);
            marker.style.marginRight = gap;
            row.Add(marker);

            var label = new Label(text);
            label.name  = "marker-row-label"; // stable handle for retext
            label.style.color   = textColor ?? Palette.TextStrong;
            label.style.fontSize = fontSize;
            label.style.unityFontStyleAndWeight = FontStyle.Bold;
            row.Add(label);

            return row;
        }

        /// <summary>
        /// Tailwind-zinc style heading label — bold, bright gold, no marker.
        /// For when MakeMarkerRow is overkill (e.g. labels inside lists).
        /// </summary>
        public static Label MakeHeading(string text, int fontSize = 16,
                                        Color? color = null)
        {
            var label = new Label(text);
            label.style.color    = color ?? Palette.TextStrong;
            label.style.fontSize = fontSize;
            label.style.unityFontStyleAndWeight = FontStyle.Bold;
            return label;
        }

        /// <summary>
        /// Standard panel header — marker title on the left, close X on the
        /// right, strip divider underneath. Every panel was duplicating
        /// this 20-line block; the helper trims it to one call and keeps
        /// the chrome consistent across panels.
        ///
        /// Returns the marker-row Label by `out` so callers can retext the
        /// title at runtime (e.g. inspector swapping title per inspected
        /// building). Pass `null` for onClose to skip the close button.
        /// </summary>
        public static VisualElement MakePanelHeader(VisualElement panel,
                                                    string title,
                                                    System.Action onClose,
                                                    out Label titleLabel)
        {
            var header = new VisualElement();
            header.style.flexDirection  = FlexDirection.Row;
            header.style.justifyContent = Justify.SpaceBetween;
            header.style.alignItems     = Align.Center;
            header.style.marginBottom   = Spacing.Md;

            var titleRow = MakeMarkerRow(title, fontSize: Type.Title);
            titleLabel = titleRow.Q<Label>("marker-row-label");
            header.Add(titleRow);

            if (onClose != null)
            {
                var closeBtn = MakeYorhaButton("\u00D7", onClose);
                closeBtn.style.width    = 18;
                closeBtn.style.height   = 18;
                closeBtn.style.fontSize = Type.Label;
                closeBtn.style.Padding(0);
                header.Add(closeBtn);
            }

            panel.Add(header);
            panel.Add(MakeStrip(thickness: 1f, marginV: Spacing.Sm));
            return header;
        }

        /// <summary>Convenience overload when the caller doesn't need to retext the title later.</summary>
        public static VisualElement MakePanelHeader(VisualElement panel, string title, System.Action onClose)
            => MakePanelHeader(panel, title, onClose, out _);

        /// <summary>
        /// Vertical bar accent — a wide stripe + a thinner stripe side by
        /// side, NieR's `Bar` component. Used as a left-edge decoration on
        /// footer / header rows.
        /// </summary>
        public static VisualElement MakeBar(float width = 10f, float height = 24f,
                                            Color? color = null)
        {
            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.flexShrink    = 0;

            var c = color ?? Palette.Gold;

            var primary = new VisualElement();
            primary.style.width  = width;
            primary.style.height = height;
            primary.style.backgroundColor = c;
            primary.style.marginRight = 4;
            row.Add(primary);

            var secondary = new VisualElement();
            secondary.style.width  = width * 0.4f;
            secondary.style.height = height;
            secondary.style.backgroundColor = c;
            row.Add(secondary);

            return row;
        }

        /// <summary>
        /// Horizontal separator line with an optional small square at the
        /// end (NieR's `Tab` separator pattern). Use to fence off content
        /// sections within a panel.
        /// </summary>
        public static VisualElement MakeSeparator(bool withEndDot = true,
                                                  float thickness = 2f,
                                                  Color? color    = null,
                                                  float marginV   = 6f)
        {
            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems    = Align.Center;
            row.style.width         = new Length(100, LengthUnit.Percent);
            row.style.marginTop     = marginV;
            row.style.marginBottom  = marginV;

            var c = color ?? Palette.Gold;

            var line = new VisualElement();
            line.style.flexGrow = 1;
            line.style.height   = thickness;
            line.style.backgroundColor = c;
            row.Add(line);

            if (withEndDot)
            {
                // Square (not round) — UI Toolkit border-radius on tiny
                // boxes ends up jagged at default DPI. Square reads as a
                // YoRHA terminator anyway.
                var dot = new VisualElement();
                dot.style.width  = thickness * 3f;
                dot.style.height = thickness * 3f;
                dot.style.marginLeft = 8;
                dot.style.backgroundColor = c;
                row.Add(dot);
            }

            return row;
        }

        /// <summary>
        /// Sectioned panel frame: top separator, scrollable body, bottom
        /// separator (NieR's `Tab` layout). Returns the outer frame; add
        /// content to the `body` out-param.
        /// </summary>
        public static VisualElement MakeTabFrame(out VisualElement body,
                                                 float padH = 16f)
        {
            var frame = new VisualElement();
            frame.style.flexDirection = FlexDirection.Column;
            frame.style.flexGrow = 1;
            frame.style.Padding(0, padH);

            frame.Add(MakeSeparator(withEndDot: true));

            body = new VisualElement();
            body.name = "tab-body";
            body.style.flexGrow = 1;
            frame.Add(body);

            frame.Add(MakeSeparator(withEndDot: true));

            return frame;
        }

        /// <summary>
        /// Click-to-toggle disclosure group (NieR's `DropDown`). Header
        /// shows + when collapsed, − when expanded. Content visibility
        /// toggles via DisplayStyle so layout reflows with it.
        /// </summary>
        public static VisualElement MakeCollapsible(string title,
                                                    VisualElement content,
                                                    bool startExpanded = false)
        {
            var wrapper = new VisualElement();

            var header = new VisualElement();
            header.style.flexDirection = FlexDirection.Row;
            header.style.alignItems    = Align.Center;
            header.style.Padding(8, 10);
            header.style.backgroundColor = Palette.Zinc900;

            var symbol = new Label(startExpanded ? "\u2212" : "+");
            symbol.style.color    = Palette.Gold;
            symbol.style.fontSize = 16;
            symbol.style.unityFontStyleAndWeight = FontStyle.Bold;
            symbol.style.minWidth = 20;
            symbol.pickingMode    = PickingMode.Ignore;
            header.Add(symbol);

            var titleLabel = new Label(title);
            titleLabel.style.color    = Palette.Gold;
            titleLabel.style.fontSize = 14;
            titleLabel.style.unityFontStyleAndWeight = FontStyle.Bold;
            titleLabel.style.marginLeft = 6;
            titleLabel.pickingMode = PickingMode.Ignore;
            header.Add(titleLabel);

            content.style.display = startExpanded ? DisplayStyle.Flex : DisplayStyle.None;

            // Local variable captured by the click handler — toggles state
            // and swaps glyphs / display in lockstep.
            bool expanded = startExpanded;
            header.RegisterCallback<ClickEvent>(_ =>
            {
                expanded = !expanded;
                content.style.display = expanded ? DisplayStyle.Flex : DisplayStyle.None;
                symbol.text = expanded ? "\u2212" : "+";
            });

            wrapper.Add(header);
            wrapper.Add(content);
            return wrapper;
        }

        /// <summary>
        /// YoRHA-themed button — dark fill + gold text + sharp corners,
        /// inverts on hover (NieR's background-position trick adapted to
        /// UI Toolkit's per-event color swap).
        /// </summary>
        public static Button MakeYorhaButton(string text, System.Action onClick = null)
        {
            var btn = new Button(onClick) { text = text };
            btn.style.backgroundColor = Palette.Zinc900;
            btn.style.color           = Palette.Gold;
            btn.style.BorderRadius(Radius.Sharp);
            btn.style.BorderWidth(1);
            btn.style.BorderColor(Palette.Gold);
            btn.style.Padding(8, 16);
            btn.style.fontSize = 14;
            btn.style.unityFontStyleAndWeight = FontStyle.Bold;
            // Unity's default Button has nonzero margins — clear them so
            // sibling buttons sit flush in toolbars.
            btn.style.marginLeft  = 0;
            btn.style.marginRight = 0;
            btn.style.marginTop   = 0;
            btn.style.marginBottom= 0;

            btn.RegisterCallback<PointerEnterEvent>(_ =>
            {
                btn.style.backgroundColor = Palette.Gold;
                btn.style.color           = Palette.Zinc950;
            });
            btn.RegisterCallback<PointerLeaveEvent>(_ =>
            {
                btn.style.backgroundColor = Palette.Zinc900;
                btn.style.color           = Palette.Gold;
            });

            return btn;
        }

        /// <summary>
        /// Animated loading indicator — cycles "" → "." → ".." → "..."
        /// at the given interval. The schedule auto-cancels when the
        /// label is detached from the panel.
        /// </summary>
        public static Label MakeLoadingDots(int intervalMs = 500, Color? color = null)
        {
            var label = new Label("");
            label.style.color    = color ?? Palette.GoldMuted;
            label.style.fontSize = 16;
            label.style.unityFontStyleAndWeight = FontStyle.Bold;

            int n = 0;
            label.schedule
                .Execute(() => { n = (n + 1) % 4; label.text = new string('.', n); })
                .Every(intervalMs);

            return label;
        }

        /// <summary>
        /// Display title row — large letter-spaced heading with an optional
        /// subtitle inline (NieR's `Title` component). Letter-spacing carries
        /// the YoRHA gravitas without needing the SCE PS3 Rodin font.
        /// </summary>
        public static VisualElement MakeTitle(string title, string subtitle = null,
                                              int titleSize = 32, int subtitleSize = 16)
        {
            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems    = Align.FlexEnd;

            var titleLabel = new Label(title);
            titleLabel.style.color    = Palette.TextStrong;
            titleLabel.style.fontSize = titleSize;
            titleLabel.style.unityFontStyleAndWeight = FontStyle.Bold;
            titleLabel.style.letterSpacing = 8;
            titleLabel.style.marginRight   = 12;
            row.Add(titleLabel);

            if (!string.IsNullOrEmpty(subtitle))
            {
                var subLabel = new Label(subtitle);
                subLabel.style.color    = Palette.GoldMuted;
                subLabel.style.fontSize = subtitleSize;
                subLabel.style.unityFontStyleAndWeight = FontStyle.Bold;
                subLabel.style.marginBottom = 4;
                row.Add(subLabel);
            }

            return row;
        }

        /// <summary>
        /// Pre-styled label for typewriter use — slight transparency to
        /// echo the NieR `Typer` opacity:0.8 hint, gold body color, bold.
        /// Pair with <see cref="TypeText"/> to reveal text char-by-char.
        /// </summary>
        public static Label MakeTyperLabel(int fontSize = 14, Color? color = null)
        {
            var label = new Label("");
            label.style.color    = color ?? new Color(
                Palette.Gold.r, Palette.Gold.g, Palette.Gold.b, 0.85f);
            label.style.fontSize = fontSize;
            label.style.unityFontStyleAndWeight = FontStyle.Bold;
            label.style.whiteSpace = WhiteSpace.Normal; // honor \n in source text
            return label;
        }

        /// <summary>
        /// Reveal text into a label one character at a time. Awaitable —
        /// completes when the full string is shown.
        ///
        /// Cancelling the token acts as "skip to end": the label is filled
        /// with the full text and the task completes normally rather than
        /// throwing. Detaching the label from its panel mid-type also bails.
        /// </summary>
        public static async UniTask TypeText(this Label label, string text,
                                             int speedMs = 15,
                                             CancellationToken ct = default)
        {
            if (label == null) return;
            if (string.IsNullOrEmpty(text)) { label.text = text ?? string.Empty; return; }

            try
            {
                label.text = string.Empty;
                for (int i = 1; i <= text.Length; i++)
                {
                    // Detached from a panel mid-reveal — caller probably
                    // closed the dialogue box. Bail silently.
                    if (label.panel == null) return;

                    label.text = text[..i];
                    await UniTask.Delay(speedMs, cancellationToken: ct);
                }
            }
            catch (System.OperationCanceledException)
            {
                // "Skip" — show the rest of the line and exit cleanly so
                // callers don't need to special-case cancellation.
                if (label.panel != null) label.text = text;
            }
        }

        // -- Color helper --
        // Hex-style construction — keeps tailwind/shadcn values readable in
        // source instead of float divisions scattered everywhere.
        static Color FromHex(byte r, byte g, byte b, float a = 1f)
            => new(r / 255f, g / 255f, b / 255f, a);
    }
}
