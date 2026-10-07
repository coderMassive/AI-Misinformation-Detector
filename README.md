# AI Misinformation Detector

A Firefox extension with two tools for text you select on any web page.

**Check for AI.** Select some text and the extension asks Sapling's AI detector how likely it is to be AI-written. Your selection is highlighted and a badge shows the percentage (green is low, orange is medium, red is high).

**Fact-check.** Select a claim and a free AI model on OpenRouter researches it with web search. A small panel shows a verdict (true, mostly true, mixed, mostly false, false, or unverifiable), a short summary, and the sources it used.

## What you need

Firefox, and free accounts for the services you want to use. The AI check needs a Sapling key. The fact-check needs both an OpenRouter key and a Tavily key. You can set up only one of the two tools if you like.

## Files

Put all of these in one folder:

```
ai-misinfo-detector/
  manifest.json
  background.js
  content.js
  factcheck.js
  options.html
  options.js
```

## Setup

### 1. Get your API keys

For the AI check, create an account at sapling.ai and copy your API key from the dashboard.

For the fact-check, create an account at openrouter.ai and make a key at openrouter.ai/keys. It starts with `sk-or-v1-`. Then create an account at app.tavily.com and copy your key. It starts with `tvly-`. Tavily's free plan gives 1,000 credits per month and does not need a credit card.

### 2. Load the extension in Firefox

Open `about:debugging` in the address bar and click "This Firefox." Click "Load Temporary Add-on" and select the `manifest.json` file in your folder. The extension is now loaded.

Firefox removes temporary add-ons when it closes, so you need to load it again each time you restart Firefox. Your saved keys may need to be entered again too.

### 3. Enter your keys

Open `about:addons`, click "Extensions," then click "AI Misinformation Detector" and open its "Preferences" tab. Paste each key into its own box:

- **Sapling API key:** your Sapling key
- **OpenRouter API key:** your `sk-or-v1-` key
- **Model:** leave empty to use the default (`nvidia/nemotron-3-ultra-550b-a55b:free`)
- **Tavily API key:** your `tvly-` key

Click Save and wait for the word "Saved" to appear.

## How to use it

Select some text on a page, then right-click it. You will see two options:

- **Check selected text for AI** highlights the text and adds a percentage badge. Click the badge to remove the highlight. Select at least five words. The toolbar button also runs this check on your current selection.
- **Fact-check selected text** opens a panel in the bottom right corner with the verdict and sources. Select a sentence or two that contains a factual claim. Click the x to close the panel.

## Limits and privacy

Free services have limits. OpenRouter's free models are rate limited (reportedly around 50 requests per day on a free account), and one fact-check can use up to 5 requests. Tavily gives 1,000 credits per month on the free plan. Free models are also sometimes busy, so a fact-check may take a few tries.

Your selected text is sent to outside services. The AI check sends it to Sapling. The fact-check sends it to OpenRouter and the company running the free model, and the search queries go to Tavily. OpenRouter says free model providers may log prompts, so do not use this on private or sensitive text.

No AI detector or fact-checker is always right. Treat the percentages and verdicts as hints, and open the linked sources to check for yourself.
