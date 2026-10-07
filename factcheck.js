(async () => {
  const LOG = "[Fact Check]";

  const text = window.getSelection().toString().trim();
  if (text.split(/\s+/).length < 4) {
    console.log(LOG, "select a sentence or two first");
    return;
  }

  // remove any old panel
  const old = document.getElementById("ai-fc-panel");
  if (old) old.remove();

  function el(tag, css, content) {
    const e = document.createElement(tag);
    e.style.cssText = css;
    if (content) e.textContent = content;
    return e;
  }

  const panel = el(
    "div",
    "position:fixed;bottom:16px;right:16px;width:340px;max-height:60vh;overflow:auto;z-index:2147483647;" +
      "background:#fff;color:#222;border:1px solid #bbb;border-radius:8px;padding:12px;" +
      "font:13px/1.4 sans-serif;box-shadow:0 4px 16px #0004;"
  );
  panel.id = "ai-fc-panel";

  const header = el("div", "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;");
  header.appendChild(el("strong", "font-size:14px;", "Fact check"));
  const close = el("button", "border:none;background:none;font-size:18px;cursor:pointer;color:#222;", "\u00d7");
  close.addEventListener("click", () => panel.remove());
  header.appendChild(close);
  panel.appendChild(header);

  const status = el("div", "color:#555;", "Starting...");
  panel.appendChild(status);
  document.body.appendChild(panel);

  // progress updates from the background script
  window.__fcProgress = (t) => { status.textContent = t; };
  if (!window.__fcListener) {
    window.__fcListener = true;
    browser.runtime.onMessage.addListener((m) => {
      if (m.type === "fc-progress" && window.__fcProgress) window.__fcProgress(m.text);
    });
  }

  let reply;
  try {
    reply = await browser.runtime.sendMessage({ type: "factcheck", text });
  } catch (e) {
    reply = { error: "Could not reach the extension: " + e.message };
  }

  status.remove();
  if (!reply || reply.error) {
    console.log(LOG, "error:", reply && reply.error);
    panel.appendChild(el("div", "color:#b00020;", (reply && reply.error) || "No response."));
    return;
  }

  const r = reply.result;
  console.log(LOG, r);

  const colors = {
    "true": "#1b7f1b",
    "mostly true": "#4a8f1b",
    "mixed": "#b36b00",
    "mostly false": "#c0501a",
    "false": "#b00020",
    "unverifiable": "#666",
  };
  const badge = el(
    "span",
    "display:inline-block;padding:2px 10px;border-radius:10px;color:#fff;font-weight:bold;" +
      "text-transform:capitalize;background:" + (colors[r.verdict] || "#666") + ";",
    r.verdict
  );
  panel.appendChild(badge);
  panel.appendChild(el("p", "margin:8px 0;", r.summary));

  if (r.sources && r.sources.length) {
    panel.appendChild(el("div", "font-weight:bold;margin-top:6px;", "Sources"));
    r.sources.forEach((s) => {
      if (!/^https?:\/\//i.test(s.url)) return;
      const a = el("a", "display:block;color:#0b5fff;word-break:break-all;margin-top:2px;", s.title || s.url);
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      panel.appendChild(a);
    });
  } else {
    panel.appendChild(el("div", "color:#666;", "No sources were confirmed."));
  }
})();