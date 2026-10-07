const LOG = "[AI Misinformation Detector]";
const cache = new Map(); // text -> Sapling score
const MAX_STEPS = 4;     // max rounds of searching (free models have request limits)

function run(tabId, file) {
  browser.tabs.executeScript(tabId, { file }).catch((e) => {
    console.log(LOG, "could not run on this page:", e.message);
  });
}

// right-click menu items on selected text
browser.menus.create({
  id: "check-ai",
  title: "Check selected text for AI",
  contexts: ["selection"],
});
browser.menus.create({
  id: "fact-check",
  title: "Fact-check selected text",
  contexts: ["selection"],
});
browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "check-ai") run(tab.id, "content.js");
  if (info.menuItemId === "fact-check") run(tab.id, "factcheck.js");
});
browser.browserAction.onClicked.addListener((tab) => run(tab.id, "content.js"));

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === "detect") return detectAI(msg.text);
  if (msg.type === "factcheck") return factCheck(msg.text, sender.tab.id);
});

// ai detection

async function detectAI(text) {
  if (cache.has(text)) {
    console.log(LOG, "using cached score");
    return { score: cache.get(text) };
  }
  const { key } = await browser.storage.local.get("key");
  if (!key) {
    return { error: "No API key set. Open the extension's Preferences and paste your Sapling key." };
  }
  try {
    const res = await fetch("https://api.sapling.ai/api/v1/aidetect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, text, sent_scores: false }),
    });
    const data = await res.json().catch(() => ({}));
    console.log(LOG, "Sapling replied with status", res.status);
    if (res.status === 429) return { error: "Rate limited by Sapling (429). Wait a bit and try again." };
    if (!res.ok) return { error: data.msg || "Request failed (" + res.status + ")" };
    cache.set(text, data.score);
    return { score: data.score };
  } catch (e) {
    return { error: "Network error: " + e.message };
  }
}

// fact-checking

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const VERDICTS = ["true", "mostly true", "mixed", "mostly false", "false", "unverifiable"];

const SYSTEM_PROMPT =
  "You are a careful fact-checker. The user gives you a piece of text. " +
  "Pick its main factual claims (up to 3) and check them. Opinions and predictions cannot be checked. " +
  "Always use web_search to find evidence before answering, and use web_fetch to read a page when " +
  "the search snippets are not enough. Prefer reliable sources and compare more than one when you can. " +
  "Never guess. If you cannot find good evidence, say it is unverifiable.";

const FINAL_PROMPT =
  "Based on your research, give your final verdict on the text. Reply with ONLY a JSON object, " +
  "no other text, in this shape: " +
  '{"verdict": "true" | "mostly true" | "mixed" | "mostly false" | "false" | "unverifiable", ' +
  '"summary": "2 or 3 short sentences", ' +
  '"sources": [{"title": "...", "url": "..."}]}. ' +
  "Only list sources you actually found while searching.";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for evidence. Returns titles, URLs and snippets.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string", description: "A short search query" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description: "Fetch the text content of one web page by URL.",
      parameters: {
        type: "object",
        required: ["url"],
        properties: { url: { type: "string", description: "The full URL to read" } },
      },
    },
  },
];

const norm = (u) => String(u).trim().replace(/\/+$/, "");

const FALLBACK_MODEL = "openrouter/free";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chatOnce(key, body) {
  let res;
  try {
    res = await fetch(OR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const err = new Error("Cannot reach OpenRouter: " + e.message);
    err.retryable = true;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("OpenRouter key rejected. Check it in Preferences.");
  if (res.status === 429) throw new Error("OpenRouter free limit reached. Wait a bit and try again.");
  if (!res.ok || data.error) {
    const message = (data.error && data.error.message) || "OpenRouter error (" + res.status + ")";
    const code = Number((data.error && data.error.code) || res.status);
    const err = new Error(message);
    err.retryable = code >= 500 || /overload|unavailable|timeout|upstream|capacity/i.test(message);
    throw err;
  }
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) {
    const err = new Error("Empty reply from the model.");
    err.retryable = true;
    throw err;
  }
  return msg;
}

// retries when a model is busy, then falls back to the free router
async function chat(key, body) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      return await chatOnce(key, body);
    } catch (e) {
      lastErr = e;
      if (!e.retryable) throw e;
      console.log(LOG, "model busy, retrying:", e.message);
      await sleep(2000 * (i + 1));
    }
  }
  if (body.model !== FALLBACK_MODEL) {
    console.log(LOG, "trying fallback model", FALLBACK_MODEL);
    try {
      return await chatOnce(key, { ...body, model: FALLBACK_MODEL });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// search and page reading use Tavily (free key from app.tavily.com)
async function tavily(path, key, body) {
  const res = await fetch("https://api.tavily.com/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("Tavily key rejected");
  if (res.status === 429) throw new Error("Tavily rate limited");
  if (!res.ok) throw new Error("Tavily " + path + " failed (" + res.status + "). You may be out of credits.");
  return res.json();
}

async function webSearch(query, key, seen) {
  const data = await tavily("search", key, { query, max_results: 5, search_depth: "basic" });
  const results = data.results || [];
  results.forEach((r) => seen.add(norm(r.url)));
  if (!results.length) return "No results.";
  return results
    .map((r) => r.title + "\n" + r.url + "\n" + String(r.content || "").slice(0, 700))
    .join("\n\n");
}

async function webFetch(url, key, seen) {
  const data = await tavily("extract", key, { urls: [url], extract_depth: "basic" });
  const page = (data.results || [])[0];
  if (!page) throw new Error("Could not read that page");
  seen.add(norm(url));
  return String(page.raw_content || "").slice(0, 4000);
}

function parseVerdict(text, seen) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) throw new Error("The model did not return a verdict. Try again.");
  let r;
  try {
    r = JSON.parse(m[0]);
  } catch (e) {
    throw new Error("Could not read the model's verdict. Try again.");
  }
  const v = String(r.verdict || "").toLowerCase();
  r.verdict = VERDICTS.includes(v) ? v : "unverifiable";
  r.summary = String(r.summary || "");
  // drop any source URL the model made up
  r.sources = (Array.isArray(r.sources) ? r.sources : []).filter(
    (s) => s && s.url && seen.has(norm(s.url))
  );
  return r;
}

async function factCheck(text, tabId) {
  const cfg = await browser.storage.local.get(["openrouterKey", "model", "tavilyKey"]);
  const model = cfg.model || DEFAULT_MODEL;
  if (!cfg.openrouterKey) {
    return { error: "No OpenRouter key set. Add one in Preferences." };
  }
  if (!cfg.tavilyKey) {
    return { error: "No Tavily API key set. Add one in Preferences (needed for web search)." };
  }

  const progress = (t) => {
    console.log(LOG, t);
    browser.tabs.sendMessage(tabId, { type: "fc-progress", text: t }).catch(() => {});
  };

  const seen = new Set(); // every URL the model actually saw
  const messages = [
    { role: "system", content: SYSTEM_PROMPT + " Today is " + new Date().toDateString() + "." },
    { role: "user", content: "Fact-check this text:\n\n" + text.slice(0, 2000) },
  ];

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      progress("Thinking...");
      const msg = await chat(cfg.openrouterKey, { model, messages, tools: TOOLS });
      const calls = msg.tool_calls || [];
      messages.push({
        role: "assistant",
        content: msg.content || "",
        tool_calls: calls.length ? calls : undefined,
      });
      if (!calls.length) break;

      for (const call of calls) {
        const name = call.function.name;
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch (e) { /* leave args empty */ }
        let result;
        try {
          if (name === "web_search") {
            progress("Searching: " + args.query);
            result = await webSearch(args.query, cfg.tavilyKey, seen);
          } else if (name === "web_fetch") {
            progress("Reading: " + args.url);
            result = await webFetch(args.url, cfg.tavilyKey, seen);
          } else {
            result = "Unknown tool: " + name;
          }
        } catch (e) {
          result = "Tool error: " + e.message;
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }

    progress("Writing verdict...");
    messages.push({ role: "user", content: FINAL_PROMPT });
    const final = await chat(cfg.openrouterKey, {
      model,
      messages,
      tools: TOOLS,
      tool_choice: "none",
    });
    return { result: parseVerdict(final.content, seen) };
  } catch (e) {
    console.log(LOG, "fact-check failed:", e);
    return { error: e.message };
  }
}