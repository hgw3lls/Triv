# Trivia Listener

A static web page that listens through the microphone, picks out trivia questions, asks Claude, OpenAI and Gemini for the answer (each can search the web), and lists the answers in a chat thread with a confidence rating. It never waits for you.

## Set up

1. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main` (or run the workflow by hand). The site appears at `https://<user>.github.io/trivia-listener/`.
3. Open the site, tap **Settings**, and paste your API keys. One key is enough; three gives agreement-based confidence.
4. Tap **Check keys and load model lists** to confirm each key works and to pick models.
5. Tap the mic and leave it running.

## How confidence works

Every model answers each question separately and gives its own 0–100 estimate. The page groups matching answers:

- **Confident**: all models agree.
- **Fairly sure**: a majority agree.
- **Unsure**: the models disagree, or a lone model is not sure.

Tap the line under an answer to see what each model said and the pages it cited.

## Things to know

- **Keys** are stored in this browser's local storage (or only in memory if you untick "Remember keys") and sent only to the provider that issued them. Nothing is stored in this repository. Anyone using your unlocked browser could read them, so use keys with spending limits.
- **Cost**: each question is one spotting call plus one call per model, and web searches are billed extra by each provider.
- **Listening** uses the browser's built-in speech recognition. Chrome and Edge send the audio to their speech service. It works best in Chrome on a computer or Android; Safari on iPhone works but stops more often.
- **Claude web search** has to be enabled for your organization in the Claude Console. If a provider rejects the search tool, the page retries without it and says so.
- **Saving**: Settings → Save answers as `.md` or `.csv`.

## Files

- `site/` – the page (`index.html`, `style.css`, `app.js`, `logic.js`)
- `test/logic.test.js` – checks for answer matching and confidence scoring
- `.github/workflows/pages.yml` – runs the test and deploys `site/` to GitHub Pages
