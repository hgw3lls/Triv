# Trivia Listener ("Robbie")

A static web page that listens through the microphone, picks out trivia questions, asks Claude, OpenAI and Gemini for the answer (each can search the web), and lists the answers in a chat thread with a confidence rating. It never waits for you.

## Set up

1. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main` (or run the workflow by hand). The site appears at `https://<user>.github.io/Triv/`.
3. Open the site, tap **Settings**, and paste your API keys. One key is enough; three gives agreement-based confidence.
4. Tap **Check keys and load model lists** to confirm each key works and to pick models.
5. Tap the mic and leave it running.

## Free keys

The app works with no paid account:

- **Groq** (console.groq.com): free key, no card. Handles silent listening (Whisper) and answers with a fast open model.
- **Gemini** (Google AI Studio): free key. Handles silent listening and answers; web search needs the paid tier.
- **OpenRouter** (openrouter.ai): free key for models whose name ends in `:free`, with a low daily cap.

Free models cannot search the web or read photos here, and their limits change, so check each provider's page.

## Using it

- **Mic** (in the message box): tap once and leave it running. It turns red while listening. With a Gemini or OpenAI key it records silently, cuts the audio at each pause, and submits every question it finds without waiting for you.
- **Message box**: type a question and send it.
- **Plus button**: attach a photo of a question.
- **Tap an answer**: shows the confidence, what each model said, and its sources.
- **Thumbs up / down** (under an opened answer): mark the answer right or wrong. The mark is included in saved files.
- **Double-tap a question**: looks it up (again). With "Answer questions automatically" turned off in Settings, questions are only listed until you double-tap them.
- **Swipe a question sideways**: deletes it and its answer.
- **Round icon at the top**: empties the screen while answers keep collecting. Tap again to bring the thread back.
- **Top-left button**: tap twice within three seconds to clear everything.
- **Top-right button**: saves the answers to a file.
- **Tap the name**: opens Settings.

## How it keeps calls down

- **Voice detector on the phone.** The page listens for the pitch of a human voice before it records anything. Applause, clatter and crowd rumble never start a clip, and a clip with too little voice in it is dropped instead of sent. Music with a strong melody or singing can still get through.
- **Whisper for hearing.** With a Groq key, clips go to Groq's Whisper, which is built for speech, fast and cheap. The last few sentences are sent as a hint so names and mid-sentence starts come out right. Without a Groq key it uses Gemini, then OpenAI, and moves to the next one if one fails.
- **One call to find and answer.** After the transcription, a single call finds the questions and answers them. With Gemini the hearing is part of that same call.
- **Other models only when needed.** The fastest model with a key answers first. The rest are asked only if it is unsure or flags the question, and web search runs only if they still disagree. Double-tap a question to ask every model straight away, or turn on "Ask every model every time" in Settings.
- **Rolling context.** The last 45 seconds of what was said goes along with each clip, so a question split by a pause is stitched back together.
- **Spending guard.** Settings shows the calls sent today and lets you cap calls per day (default 800) and heard questions per minute (default 8).

## How confidence works

Every model answers each question separately and gives its own 0–100 estimate. The page groups matching answers:

- **Confident**: all models that answered agree, or a single model is at least 85% sure.
- **Fairly sure**: a majority agree.
- **Unsure**: the models disagree, or a lone model is not sure.

Tap an answer to see the rating, what each model said and the pages it cited.

## Things to know

- **Keys** are stored in this browser's local storage (or only in memory if you untick "Remember keys") and sent only to the provider that issued them. Nothing is stored in this repository. Anyone using your unlocked browser could read them, so use keys with spending limits.
- **Cost**: each question is one spotting call plus one call per model, and web searches are billed extra by each provider.
- **Listening** records the microphone in the page and sends each clip to Groq, Gemini or OpenAI (in that order, whichever you have a key for) to be transcribed. It plays no sounds. With only a Claude key it falls back to the browser's built-in speech recognition, which can chime and stops more often on iPhone.
- The page has to stay open and on screen: phones stop the microphone when the screen locks or the browser goes to the background.
- **Claude web search** has to be enabled for your organization in the Claude Console. If a provider rejects the search tool, the page retries without it and says so.
- **Saving**: Settings → Save answers as `.md` or `.csv`.

## Files

- `site/` – the page (`index.html`, `style.css`, `app.js`, `logic.js`)
- `test/logic.test.js` – checks for answer matching and confidence scoring
- `.github/workflows/pages.yml` – runs the test and deploys `site/` to GitHub Pages
