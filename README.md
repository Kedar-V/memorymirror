# MemoryMirror

MemoryMirror makes an assistant's stored beliefs about a person visible, traceable, and correctable. The demo uses three synthetic people. A wrong or stale memory is already in the record. You can see which message it came from, change it, and ask the same question again.

**Live site: [kedar-v.github.io/memorymirror](https://kedar-v.github.io/memorymirror/)**

> **API calls to language models are disabled on the website.** GitHub Pages has no server, so the hosted copy runs entirely in your browser on built-in sample data: chat replies and extracted memories come from labeled fixtures, and no model is called. To use a live model, clone this repo and add your own API key (see [Setup](#setup)).

## Research question

When an assistant answers from a stored memory, can a person see that memory, trace it to a source message, correct it, and get a different answer to the same question under the same model and the same agent settings?

The lab holds the model and agent settings fixed and changes only the memory snapshot. A difference in the replies is a result of that prompt change. It is not a general claim that the memory caused the wording outside this setup.

## Setup

```bash
git clone https://github.com/Kedar-V/memorymirror.git
cd memorymirror
npm install
cp .env.example .env.local   # then put your own CURSOR_API_KEY in .env.local
npm run dev                  # http://localhost:3000
```

Leave `CURSOR_API_KEY` empty to use the fixture mode. Every fixture reply is labeled **Simulated** in the interface and ends with “Simulated fixture: no model was called.”

To call Cursor, set a user API key from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations) in `.env.local` and restart the server:

```bash
CURSOR_API_KEY=your-key
CURSOR_MODEL=composer-2.5
```

The key is read only in server route handlers. It is not prefixed with `NEXT_PUBLIC_` and is not sent to the browser. Each live chat or extraction starts a local Cursor agent with `@cursor/sdk` (`Agent.prompt`). The agent’s working directory is an empty folder in the system temp directory, with the sandbox on, so it is not pointed at this repo. Temperature is not a parameter of that agent. Both lab arms use the same model id and the same agent options.

```bash
npm run build
npm start
```

The GitHub Pages copy is built by `.github/workflows/pages.yml` with `NEXT_PUBLIC_STATIC_DEMO=1`, which exports a static site, removes the API routes, and answers every model request in the browser from the fixtures.

The app is a standard Next.js App Router project. Fixture mode can be deployed as-is. Live mode needs a long-running Node server with the Cursor SDK’s local executor; a short serverless limit will cut the agent off. Put `CURSOR_API_KEY` and, if you want, `CURSOR_MODEL` in the server environment. Do not expose the key as a public variable.

## How to use the demo

One screen: a start page, then a workspace with the memory list on the left and the selected memory’s explanation on the right.

90-second script with the sample conversation (Alex Morgan, pre-written sample data):

1. Click **Try sample conversation**. Four memories appear: two Explicit, one Inferred, one Uncertain.
2. Select **Prefers remote work** (Uncertain). The evidence is one message about working from home on Fridays. Click **View connections** to see message → fact → interpretation.
3. In the bottom bar, ask “What kind of job setup should I prioritize?” The reply lists the memories it used.
4. Close the chat, click **Correct**, and enter “Is open to remote or office-based work.” The old wording moves to the memory’s history.
5. Ask the same question again. The reply now cites the corrected memory.

Chat questions are answered from the stored memories only (the transcript is not sent), so a correction is the only thing that changes between the two answers. **Forget** removes a memory from replies and can be undone. **Research details** in the header holds the three-way comparison, the full memory map, the benchmark, and data export and deletion. Maya, Jordan, and Priya are still available from the profile menu.

Reset restores the selected profile. Clicking the logo returns to the start page.

Edges are recorded from source message ids, version links, and the memory ids actually sent with a reply. Similar wording does not create a relationship. Synthetic dates are only the timestamps already stored on the demo people.

Jordan Hale’s record still has him at the startup Northwind and as someone who hates meetings. He left for Harbor Grid and asked for a weekly 1:1.

Priya Nair’s record says she is bad at math because she was stuck on one lecture. She asked for a plain-language confidence interval. The seed does not store a mental-health inference. The extractor drops claims about health, race, ethnicity, religion, sexuality, politics, a street address, finances, and biometrics.

## Architecture

```text
app/page.tsx                         header, start/workspace switch, chat bar, research drawer
components/ImportFlow.tsx            start screen (sample, upload) and stored-data controls
components/MemoryList.tsx            the one memory list, Explicit / Inferred / Uncertain badges
components/MemoryDetail.tsx          evidence, interpretation, history, confirm/correct/forget, connections
components/ChatPanel.tsx             chat drawer, memories used per reply
components/MemoryExplorer.tsx        full lineage map (research drawer)
components/CounterfactualLab.tsx     three-arm comparison (research drawer)
components/EvaluationDashboard.tsx   benchmark cases, rates, JSON download
lib/memory-store.ts                  Zustand store, one session per demo person
lib/lineage.ts                       provenance edges and counterfactual lists
lib/profile.ts                       profile derived from active memories
lib/schemas.ts                       Zod limits, quote check, sensitivity filter
lib/demo-personas.ts                 three synthetic people
lib/benchmark.ts                     rubric and corrected snapshots
lib/simulate.ts                      fixture replies and fixture extraction
lib/score.ts                         substring scoring
lib/llm.ts                           server-side Cursor agent call
app/api/chat/route.ts                reply from a memory snapshot
app/api/extract/route.ts             candidate memories as JSON
```

The browser keeps the session in `localStorage`. A request leaves the browser only when you send a message, extract memories, run the lab, or run the benchmark. Those handlers accept at most 40 messages and 4,000 characters each. Extraction keeps at most 12 memories, and only when the evidence quote is a substring of the cited user message (12 characters or longer) and the source id is one of the ids you sent.

Correcting a memory writes a new version, marks the previous row superseded, and leaves model-reported confidence empty. Delete is reversible. Superseded and deleted rows are not sent to the model. Approved and candidate rows are.

## Evaluation methodology

`lib/benchmark.ts` holds 12 cases: four for Maya, four for Jordan, four for Priya. Each case is one user question plus the corrected memory snapshot for that person. The client calls `/api/chat` once per case so a single Vercel invocation does not have to finish the whole set.

Scoring is deterministic and does not ask the model to grade itself:

- **Correction adherence:** every string in `expectIncludes` appears in the reply.
- **Stale-memory leakage:** a string in `expectExcludes` appears, unless a negation word (`not`, `no`, `never`, `without`, `former`, `left`) sits in the 32 characters before it.
- **Unsupported inference:** the same check against `forbiddenInferences` (for example “anxious” or “bad at math”).

Rates use only cases that returned a reply. Failed requests are listed and omitted from the denominator. The downloaded JSON includes the question, the snapshot, the reply, the rubric, the score, the model, the temperature, and whether the reply was simulated.

### Reproduce the benchmark

Without a key:

1. `npm run dev`
2. Open Evaluation.
3. Run benchmark.
4. Download JSON.

Every row should have `"simulated": true`. The fixture replies are written to follow the corrected snapshot, so this run exercises the scorer and the request path. It is not a score for a model.

With a key:

1. Set `CURSOR_API_KEY` and restart.
2. Run the benchmark again.
3. Download a second JSON file.

Compare the two files. The questions, snapshots, and rubric strings should match. Live rows use the configured Cursor model. Temperature is not set. Run cases again only when you want a new sample. The agent can still vary between runs.

## Privacy model

- The demo archive (messages, memories, theme, selected persona) stays in `localStorage` on this browser.
- Reset and loading another persona replace that archive. Export writes a file locally.
- There is no account, no database, and no background sync.
- The server starts a local Cursor agent only for a request you start, and only when `CURSOR_API_KEY` is set.
- Fixture mode does not call Cursor.
- Route errors returned to the browser do not include the upstream body or the API key.
- The sensitivity filter is a blunt word list. It will miss paraphrases and it will reject some harmless sentences that happen to use a listed word.

## Known limitations

- The people, histories, and fixture replies are synthetic.
- Model-reported confidence is whatever the extractor emitted. It is not calibrated and it is not a probability of truth. Corrections clear it on purpose.
- The benchmark is a substring rubric. A paraphrase of “Brooklyn” fails adherence. A reply that repeats “Austin” from the user’s question counts as leakage. The negation window is only 32 characters.
- The lab does not support a causal claim beyond “these two prompts differed by the memory list.”
- Fixture replies branch on which claims are in the snapshot. They are not a substitute for the live model.
- There is no rate limiter. The routes enforce size limits and a 20 second timeout. Add a limiter before this is exposed beyond a demo.
- Superseded memories remain on the graph until you delete them, so a long correction chain gets crowded.

## License

The code in this repository is the demo itself. The synthetic transcripts are invented for the study and are not quotes from real people.
