(function () {
  const STAMP = "data-reset-time-stamp";

  const URL_MATCHERS = [
    /^https:\/\/claude\.ai\/(?:settings\/usage|.*#settings\/usage)(?:[?#]|$)/,
    /^https:\/\/chatgpt\.com\/codex\/cloud\/settings\/analytics(?:[/?#]|$)/,
  ];

  // Claude session countdown: "Resets in 3 hr 38 min" / "Resets in 5 min"
  const CLAUDE_COUNTDOWN_RE = /Resets in\s+(?:(\d+)\s*hr)?\s*(?:(\d+)\s*min)?/i;

  // Claude weekly: "Resets Fri 8:00 PM"
  const CLAUDE_WEEKLY_RE =
    /Resets\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2}):(\d{2})\s*([AP]M)/i;

  // Codex absolute date: "Resets May 19, 2026 2:02 PM"
  const CODEX_FULL_RE =
    /Resets\s+([A-Z][a-z]+\s+\d{1,2},\s*\d{4}\s+\d{1,2}:\d{2}\s*[AP]M)/i;

  // Codex same-day clock: "Resets 3:54 PM"
  const CODEX_TIME_RE = /Resets\s+(\d{1,2}):(\d{2})\s*([AP]M)\b/;

  const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const DOW_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Cache target time per text node so React re-renders don't shift the baseline.
  const countdownTargets = new WeakMap();
  const liveLabels = new Map();

  function inScope() {
    return URL_MATCHERS.some((re) => re.test(location.href));
  }

  function minuteFloor(date) {
    const d = new Date(date);
    d.setSeconds(0, 0);
    return d;
  }

  function formatClock(date) {
    const hm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return hm;
    const tmr = new Date(now);
    tmr.setDate(tmr.getDate() + 1);
    if (date.toDateString() === tmr.toDateString()) return `${hm} tomorrow`;
    return `${DOW_LABEL[date.getDay()]} ${hm}`;
  }

  function formatDelta(future) {
    const diffMs = future - new Date();
    if (diffMs <= 0) return "0 min";
    const totalMin = Math.round(diffMs / 60000);
    const days = Math.floor(totalMin / 1440);
    const hr = Math.floor((totalMin % 1440) / 60);
    const min = totalMin % 60;
    const parts = [];
    if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
    if (hr) parts.push(`${hr} hr`);
    if (min || (!days && !hr)) parts.push(`${min} min`);
    return parts.join(" ");
  }

  function to24h(h, ampm) {
    const u = ampm.toUpperCase();
    if (u === "PM" && h !== 12) return h + 12;
    if (u === "AM" && h === 12) return 0;
    return h;
  }

  function nextWeekdayAt(dow, h, m) {
    const now = new Date();
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    let delta = (dow - now.getDay() + 7) % 7;
    if (delta === 0 && d <= now) delta = 7;
    d.setDate(d.getDate() + delta);
    return d;
  }

  function deriveLabel(text, owner) {
    const c = text.match(CLAUDE_COUNTDOWN_RE);
    if (c && (c[1] || c[2])) {
      const raw = c[0];
      let cached = owner ? countdownTargets.get(owner) : null;
      if (!cached || cached.raw !== raw || cached.target <= new Date()) {
        // Anchor to start of current minute so re-mounts within the same minute
        // recompute to the same target instead of creeping forward.
        const target = minuteFloor(new Date());
        target.setHours(target.getHours() + parseInt(c[1] || "0", 10));
        target.setMinutes(target.getMinutes() + parseInt(c[2] || "0", 10));
        cached = { raw, target };
        if (owner) countdownTargets.set(owner, cached);
      }
      return ` (at ${formatClock(cached.target)})`;
    }

    let m = text.match(CLAUDE_WEEKLY_RE);
    if (m) {
      const dow = WEEKDAYS[m[1].slice(0, 3).toLowerCase()];
      if (dow !== undefined) {
        const target = nextWeekdayAt(dow, to24h(parseInt(m[2], 10), m[4]), parseInt(m[3], 10));
        return ` (in ${formatDelta(target)})`;
      }
    }

    m = text.match(CODEX_FULL_RE);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return ` (in ${formatDelta(d)})`;
    }

    m = text.match(CODEX_TIME_RE);
    if (m) {
      const d = new Date();
      d.setHours(to24h(parseInt(m[1], 10), m[3]), parseInt(m[2], 10), 0, 0);
      if (d <= new Date()) d.setDate(d.getDate() + 1);
      return ` (in ${formatDelta(d)})`;
    }

    return null;
  }

  function bindLiveLabel(span, node) {
    liveLabels.set(span, { node });
  }

  function refreshLiveLabels() {
    for (const [span, record] of liveLabels) {
      if (!span.isConnected || !record.node.isConnected) {
        if (span.isConnected) span.remove();
        liveLabels.delete(span);
        continue;
      }
      const label = deriveLabel(record.node.nodeValue || "", record.node);
      if (!label) {
        span.remove();
        liveLabels.delete(span);
        continue;
      }
      if (span.textContent !== label) span.textContent = label;
    }
  }

  function scan() {
    if (!inScope()) {
      teardown();
      return;
    }
    refreshLiveLabels();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    let n;
    while ((n = walker.nextNode())) {
      const v = n.nodeValue;
      if (!v || v.indexOf("Resets") === -1) continue;
      const parent = n.parentElement;
      if (!parent || parent.closest(`[${STAMP}]`)) continue;
      const label = deriveLabel(v, n);
      if (label) hits.push({ node: n, parent, label });
    }
    for (const { node, parent, label } of hits) {
      let span = parent.querySelector(`:scope > span[${STAMP}]`);
      if (!span) {
        span = document.createElement("span");
        span.setAttribute(STAMP, "1");
        span.style.marginLeft = "4px";
        span.style.opacity = "0.7";
        node.after(span);
      }
      bindLiveLabel(span, node);
      if (span.textContent !== label) span.textContent = label;
    }
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try {
        scan();
      } catch (e) {
        // ignore
      }
    });
  }

  function isOwnNode(node) {
    return node.nodeType === Node.ELEMENT_NODE && node.hasAttribute && node.hasAttribute(STAMP);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        const changed = [...m.addedNodes, ...m.removedNodes];
        if (changed.length > 0 && changed.every(isOwnNode)) continue;
      } else if (m.type === "characterData") {
        const parent = m.target.parentElement;
        if (parent && parent.closest(`[${STAMP}]`)) continue;
      }
      schedule();
      return;
    }
  });

  let intervalId = null;
  let armed = false;
  function arm() {
    if (armed) return;
    armed = true;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    scheduleNextMinute();
    schedule();
  }
  function scheduleNextMinute() {
    const now = new Date();
    const ms = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50;
    intervalId = setTimeout(() => {
      schedule();
      if (armed) scheduleNextMinute();
    }, ms);
  }
  function teardown() {
    if (!armed) return;
    armed = false;
    observer.disconnect();
    if (intervalId !== null) {
      clearTimeout(intervalId);
      intervalId = null;
    }
    liveLabels.clear();
  }

  function syncToUrl() {
    if (inScope()) arm();
    else teardown();
  }

  // SPA navigation. We can't monkey-patch history.pushState from a content
  // script — that runs in an isolated world and the page's own pushState calls
  // go through a different realm. Navigation API is exposed per-realm but
  // fires for same-document navigations initiated by the page; fall back to
  // polling location.href on older Chromium.
  if (window.navigation && typeof window.navigation.addEventListener === "function") {
    window.navigation.addEventListener("navigatesuccess", syncToUrl);
    window.navigation.addEventListener("currententrychange", syncToUrl);
  } else {
    let lastHref = location.href;
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        syncToUrl();
      }
    }, 500);
  }
  window.addEventListener("popstate", syncToUrl);
  window.addEventListener("hashchange", syncToUrl);

  syncToUrl();
})();
