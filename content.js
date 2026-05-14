(function () {
  const STAMP = "data-reset-time-stamp";

  // Claude session countdown: "Resets in 3 hr 38 min" / "Resets in 5 min"
  const CLAUDE_COUNTDOWN_RE = /Resets in\s+(?:(\d+)\s*hr)?\s*(?:(\d+)\s*min)?/i;

  // Claude weekly: "Resets Fri 8:00 PM"
  const CLAUDE_WEEKLY_RE =
    /Resets\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)(?:day|nesday|sday|urday|riday|onday|uesday)?\s+(\d{1,2}):(\d{2})\s*([AP]M)/i;

  // Codex absolute date: "Resets May 19, 2026 2:02 PM"
  const CODEX_FULL_RE =
    /Resets\s+([A-Z][a-z]+\s+\d{1,2},\s*\d{4}\s+\d{1,2}:\d{2}\s*[AP]M)/;

  // Codex same-day clock: "Resets 3:54 PM"
  const CODEX_TIME_RE = /Resets\s+(\d{1,2}):(\d{2})\s*([AP]M)\b/;

  const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const DOW_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Cache target time for countdown strings so re-scans don't drift.
  const countdownTargets = new Map();

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
    if (days) parts.push(`${days} day`);
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

  function deriveLabel(text) {
    const c = text.match(CLAUDE_COUNTDOWN_RE);
    if (c && (c[1] || c[2])) {
      const key = c[0];
      let target = countdownTargets.get(key);
      if (!target) {
        target = new Date();
        target.setHours(target.getHours() + parseInt(c[1] || "0", 10));
        target.setMinutes(target.getMinutes() + parseInt(c[2] || "0", 10));
        countdownTargets.set(key, target);
      }
      return ` (at ${formatClock(target)})`;
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

  function scan() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    let n;
    while ((n = walker.nextNode())) {
      const v = n.nodeValue;
      if (!v || v.indexOf("Resets") === -1) continue;
      if (n.parentElement && n.parentElement.hasAttribute(STAMP)) continue;
      const label = deriveLabel(v);
      if (label) hits.push({ node: n, label });
    }
    for (const { node, label } of hits) {
      const parent = node.parentElement;
      if (!parent) continue;
      let span = parent.querySelector(`:scope > span[${STAMP}]`);
      if (!span) {
        span = document.createElement("span");
        span.setAttribute(STAMP, "1");
        span.style.marginLeft = "4px";
        span.style.opacity = "0.7";
        parent.appendChild(span);
      }
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

  schedule();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        let ownOnly = m.addedNodes.length > 0 || m.removedNodes.length > 0;
        for (const node of m.addedNodes) {
          if (!(node.nodeType === Node.ELEMENT_NODE && node.hasAttribute && node.hasAttribute(STAMP))) {
            ownOnly = false;
            break;
          }
        }
        if (ownOnly) continue;
      }
      schedule();
      return;
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
