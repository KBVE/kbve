// Self-contained CSS for the embed bundle. Injected into shadow root so
// host page styles can't reach in and our utilities can't leak out.
//
// Token resolution (CSS custom properties cross the shadow boundary):
//   --kbve-chat-*    host-page override (highest priority — opinionated)
//   --sl-color-*     Starlight theme var if host is a Starlight site
//   <baked default>  built-in dark palette (or light when [data-theme="light"])
//
// Embedding on Rareicon / astro-kbve / any Starlight site picks up that
// site's colors automatically. Bare HTML hosts get the default palette.
// Set --kbve-chat-accent on the host element to override a single token
// without writing a full theme.

export const EMBED_CSS = `
:host {
  all: initial;
  display: block;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', Roboto, sans-serif;
  color: var(--kbc-text);

  --kbc-bg:         var(--kbve-chat-bg,         var(--sl-color-bg,         #0a0d14));
  --kbc-elev-1:     var(--kbve-chat-elev-1,     var(--sl-color-bg-nav,     #11161f));
  --kbc-elev-2:     var(--kbve-chat-elev-2,     var(--sl-color-bg-sidebar, #161c28));
  --kbc-hover:      var(--kbve-chat-hover,      var(--sl-color-gray-6,     #1c2433));
  --kbc-border:     var(--kbve-chat-border,     var(--sl-color-border,     #1f2735));
  --kbc-text:       var(--kbve-chat-text,       var(--sl-color-text,       #e6ebf2));
  --kbc-text-dim:   var(--kbve-chat-text-dim,   var(--sl-color-gray-2,     #8a93a3));
  --kbc-text-muted: var(--kbve-chat-text-muted, var(--sl-color-gray-4,     #5b6373));
  --kbc-accent:     var(--kbve-chat-accent,     var(--sl-color-accent,     #7c5cff));
  --kbc-accent-soft: color-mix(in srgb, var(--kbc-accent) 16%, transparent);
  --kbc-success:    var(--kbve-chat-success, #22c55e);
  --kbc-warn:       var(--kbve-chat-warn,    #f59e0b);
  --kbc-danger:     var(--kbve-chat-danger,  #ef4444);
  --kbc-radius:     var(--kbve-chat-radius,    12px);
  --kbc-radius-sm:  var(--kbve-chat-radius-sm, 8px);
}

/* Explicit light-theme overrides only kick in when the host page didn't
 * supply --sl-color-* / --kbve-chat-* vars to begin with. */
:host([data-theme="light"]) {
  --kbc-bg:         var(--kbve-chat-bg,         var(--sl-color-bg,         #ffffff));
  --kbc-elev-1:     var(--kbve-chat-elev-1,     var(--sl-color-bg-nav,     #f7f8fa));
  --kbc-elev-2:     var(--kbve-chat-elev-2,     var(--sl-color-bg-sidebar, #eef0f4));
  --kbc-hover:      var(--kbve-chat-hover,      var(--sl-color-gray-6,     #e6e9ef));
  --kbc-border:     var(--kbve-chat-border,     var(--sl-color-border,     #d8dde5));
  --kbc-text:       var(--kbve-chat-text,       var(--sl-color-text,       #1a1f2c));
  --kbc-text-dim:   var(--kbve-chat-text-dim,   var(--sl-color-gray-2,     #515b6b));
  --kbc-text-muted: var(--kbve-chat-text-muted, var(--sl-color-gray-4,     #8a93a3));
}

.root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 320px;
  background: var(--kbc-bg);
  border: 1px solid var(--kbc-border);
  border-radius: var(--kbc-radius);
  overflow: hidden;
  box-sizing: border-box;
}

.root *, .root *::before, .root *::after { box-sizing: border-box; }

.topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--kbc-border);
  background: var(--kbc-elev-1);
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: -0.01em;
}

.brand-dot {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--kbc-accent) 0%, #22d3ee 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
}

.channel-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--kbc-elev-2);
  border: 1px solid var(--kbc-border);
  font-size: 12px;
  font-weight: 600;
}

.channel-pill-hash { color: var(--kbc-text-muted); font-weight: 400; }

.spacer { flex: 1; }

.status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--kbc-text-dim);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--kbc-text-muted);
}
.status-dot.connected { background: var(--kbc-success); box-shadow: 0 0 6px rgba(34, 197, 94, 0.6); }
.status-dot.connecting { background: var(--kbc-warn); animation: kbc-pulse 1.2s ease-in-out infinite; }
.status-dot.error { background: var(--kbc-danger); }

@keyframes kbc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.icon-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--kbc-text-dim);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-family: inherit;
  transition: all 0.12s ease;
}
.icon-btn:hover {
  background: var(--kbc-hover);
  color: var(--kbc-text);
  border-color: var(--kbc-border);
}
.icon-btn.active {
  background: var(--kbc-accent-soft);
  color: var(--kbc-accent);
  border-color: var(--kbc-accent);
}

.me-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--kbc-border);
  background: var(--kbc-elev-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
}

.rail {
  flex: 0 0 160px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--kbc-border);
  background: var(--kbc-elev-1);
  min-height: 0;
}

.rail-head {
  padding: 10px 12px 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--kbc-text-muted);
}

.rail-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 6px 12px;
}

.channel-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--kbc-radius-sm);
  background: transparent;
  border: none;
  color: var(--kbc-text-dim);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  font-family: inherit;
  transition: all 0.1s ease;
}
.channel-item:hover { background: var(--kbc-hover); color: var(--kbc-text); }
.channel-item.active {
  background: var(--kbc-accent-soft);
  color: var(--kbc-accent);
  font-weight: 600;
}

.channel-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--kbc-accent);
  color: white;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.feed {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px;
  font-size: 13px;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.feed::-webkit-scrollbar { width: 6px; }
.feed::-webkit-scrollbar-thumb { background: var(--kbc-border); border-radius: 3px; }
.feed::-webkit-scrollbar-thumb:hover { background: var(--kbc-text-muted); }

.msg {
  display: grid;
  grid-template-columns: 44px auto 1fr;
  gap: 8px;
  padding: 2px 6px;
  border-radius: 4px;
}
.msg:hover { background: var(--kbc-hover); }

.msg-time {
  color: var(--kbc-text-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  padding-top: 3px;
  user-select: none;
}

.msg-nick {
  font-weight: 700;
  font-size: 13px;
  white-space: nowrap;
}

.msg-content {
  color: var(--kbc-text);
  min-width: 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.msg.system .msg-content,
.msg.join .msg-content,
.msg.part .msg-content {
  grid-column: 2 / -1;
  color: var(--kbc-text-muted);
  font-style: italic;
  font-size: 12px;
}

.composer {
  flex: 0 0 auto;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--kbc-border);
  background: var(--kbc-elev-1);
}

.composer-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
  background: var(--kbc-elev-2);
  border: 1px solid var(--kbc-border);
  border-radius: var(--kbc-radius);
  padding: 3px 3px 3px 10px;
  transition: border-color 0.12s ease;
}
.composer-row:focus-within {
  border-color: var(--kbc-accent);
  box-shadow: 0 0 0 3px var(--kbc-accent-soft);
}

.composer-avatar {
  align-self: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--kbc-border);
  background: var(--kbc-elev-1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.composer-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--kbc-text);
  font-size: 13px;
  outline: none;
  padding: 8px 0;
  font-family: inherit;
  min-width: 0;
}
.composer-input::placeholder { color: var(--kbc-text-muted); }

.send {
  padding: 0 14px;
  border-radius: 9px;
  border: none;
  background: linear-gradient(135deg, var(--kbc-accent) 0%, #6c47ff 100%);
  color: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: transform 0.1s ease, opacity 0.1s ease;
}
.send:hover:not(:disabled) { transform: translateY(-1px); }
.send:disabled { opacity: 0.4; cursor: not-allowed; }

.readonly-notice {
  padding: 12px;
  border-top: 1px solid var(--kbc-border);
  background: var(--kbc-elev-1);
  font-size: 12px;
  color: var(--kbc-text-dim);
  text-align: center;
}
.readonly-notice a {
  color: var(--kbc-accent);
  text-decoration: none;
  font-weight: 600;
}
.readonly-notice a:hover { text-decoration: underline; }

.users {
  flex: 0 0 140px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--kbc-border);
  background: var(--kbc-elev-1);
  min-height: 0;
}

.users-head {
  padding: 10px 12px 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--kbc-text-muted);
}

.users-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 6px 12px;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: var(--kbc-radius-sm);
  font-size: 12px;
  color: var(--kbc-text-dim);
}
.user-item:hover { background: var(--kbc-hover); color: var(--kbc-text); }

.user-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: white;
}

.empty {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--kbc-text-muted);
}

@media (max-width: 600px) {
  .rail, .users { display: none; }
}
`;
