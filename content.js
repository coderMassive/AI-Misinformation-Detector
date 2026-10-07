(async () => {
  const LOG = "[AI Misinformation Detector]";

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) {
    console.log(LOG, "select some text first");
    return;
  }
  const range = sel.getRangeAt(0).cloneRange();
  const text = sel.toString().trim();
  if (text.split(/\s+/).length < 5) {
    console.log(LOG, "select at least a few words");
    return;
  }

  // find the pieces of text inside the selection
  const parts = [];
  const ancestor = range.commonAncestorContainer;
  if (ancestor.nodeType === Node.TEXT_NODE) {
    parts.push({ node: ancestor, start: range.startOffset, end: range.endOffset });
  } else {
    const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!range.intersectsNode(node)) continue;
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
      if (end > start && node.nodeValue.slice(start, end).trim()) {
        parts.push({ node, start, end });
      }
    }
  }
  if (!parts.length) {
    console.log(LOG, "nothing to highlight in this selection");
    return;
  }

  console.log(LOG, "checking", text.length, "characters...");
  let reply;
  try {
    reply = await browser.runtime.sendMessage({ type: "detect", text });
  } catch (e) {
    console.log(LOG, "could not reach background script:", e);
    return;
  }
  if (!reply || reply.error) {
    console.log(LOG, "error:", reply && reply.error);
    return;
  }

  const score = reply.score;
  const pct = Math.round(score * 100);
  console.log(LOG, "score:", pct + "%");

  const color =
    score < 0.3 ? "rgba(0,170,0,0.3)" : score < 0.7 ? "rgba(255,170,0,0.45)" : "rgba(230,40,40,0.4)";
  const badgeColor = score < 0.3 ? "#1b7f1b" : score < 0.7 ? "#b36b00" : "#b00020";
  const group = String(Date.now());

  // highlight each piece
  const marks = [];
  parts.forEach(({ node, start, end }) => {
    try {
      const r = document.createRange();
      r.setStart(node, start);
      r.setEnd(node, end);
      const mark = document.createElement("mark");
      mark.setAttribute("data-ai-hl", group);
      mark.style.cssText = "background:" + color + ";color:inherit;";
      r.surroundContents(mark);
      marks.push(mark);
    } catch (e) {
      console.log(LOG, "could not wrap a piece of text:", e.message);
    }
  });
  if (!marks.length) return;

  // percentage badge next to the selection (click it to remove)
  const badge = document.createElement("span");
  badge.setAttribute("data-ai-hl", group);
  badge.textContent = pct + "% AI";
  badge.title = "Click to remove";
  badge.style.cssText =
    "margin-left:4px;padding:1px 6px;border-radius:10px;font:bold 12px sans-serif;" +
    "color:#fff;cursor:pointer;vertical-align:middle;background:" + badgeColor + ";";
  badge.addEventListener("click", () => {
    document.querySelectorAll('mark[data-ai-hl="' + group + '"]').forEach((m) => {
      const p = m.parentNode;
      m.replaceWith(...m.childNodes);
      p.normalize();
    });
    badge.remove();
  });
  marks[marks.length - 1].after(badge);
  sel.removeAllRanges();
})();