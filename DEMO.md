# MemoryMirror: live demo script (about 3 minutes)

## Before you go on

1. `npm run dev`, then open http://localhost:3000. Make sure `.env.local` has `CURSOR_API_KEY` so replies come from the live model.
2. Make the browser window about 1440×900 and zoom to 100%.
3. Click the **M** logo (top left) to get to the start screen. **Try sample conversation** resets the sample, so every run starts the same way.
4. Practice the ask question once. The first live call can take a few seconds.

## Text to paste

| When | Paste this |
|---|---|
| Ask (before and after) | `What kind of job setup should I prioritize?` |
| Correction | `Is open to remote or office-based work.` |

---

## 1. Hook (15s): start screen

**Say:** "Assistants remember things about you, and you usually can't see what or why. MemoryMirror shows you."

**Click:** **Try sample conversation**.

## 2. What it remembers (25s): memory list

**Say:** "Here's what the AI took from five messages with Alex. Each memory has a label. **Explicit** means Alex said it. **Inferred** means the AI concluded it. **Uncertain** means the AI concluded it on thin evidence."

**Point to:** the last item, "Prefers remote work.", which is marked **Uncertain** and **Not confirmed**.

## 3. Why it believes it (35s): the explanation panel

**Click:** "Prefers remote work."

**Say:** "Here's why. The only evidence is one line: *'One of them lets me work from home on Fridays.'* The AI turned one remote day a week into a general preference. Its own confidence is 34%."

**Click:** **View connections**.

**Say:** "This is the reasoning: this message, plus the fact that Alex is comparing offers, led to this conclusion." Click **Hide connections**.

## 4. The effect (30s): ask before correcting

**Click:** the bottom bar, **Ask the AI something about you…**. Paste the ask question and press Enter.

**Say:** "The AI only sees its stored memories, not the transcript." When the reply arrives, point to **Based on these memories** under it: "It leaned on that remote inference."

**Press:** `Esc` to close the chat.

## 5. Correct it (30s): Correct

**Click:** "Prefers remote work.", then **Correct**. Paste the correction and press Enter (or click **Save correction**).

**Say:** "I'm not deleting it, I'm fixing it. The old version is kept under **How this memory changed**, so the history stays auditable."

## 6. Ask again (30s): proof

**Click:** the ask bar, paste the **same** ask question, and press Enter.

**Say:** "Same question, corrected memory, different answer. Remote is now one option, not the assumption. That's the whole idea: see the inference, check the evidence, correct it, and watch the behavior change."

**Press:** `Esc`.

---

## Extras if you have time

- **Forget / Undo:** select any memory, click **Forget**, then **Undo**. Forgotten memories sit in **Forgotten (n)** at the bottom of the list.
- **Confirm:** on a "Not confirmed" memory, click **Confirm** to mark it as approved by you.
- **Other profiles:** use the dropdown in the header to switch between the other sample personas.
- **Research details** (header): **Compare answers** sends one question with the original, corrected, and removed memory side by side (it takes about 5 seconds live). **Benchmark** runs 12 scored cases (about 35 seconds). **Full memory map** shows every memory as a graph. **Your data** has export and delete controls.
- **Upload a long conversation:** click the logo, then **Upload conversation**, pick `samples/long-conversation.json` (64 messages from "Priya"), and click **Find memories**. It takes about 25 seconds, so talk through the "Choose what to analyze" screen while it runs. You get about 30 memories, including several **Inferred** and **Uncertain** ones that the AI read between the lines. Good ones to open: "likely to prioritize local Pittsburgh jobs over remote roles" (Uncertain) and "learns best with classroom examples" (Inferred, builds on "is a chemistry teacher"). The model writes these fresh each time, so the exact wording varies.

## If something goes wrong

- **Reply is slow:** keep talking through the evidence panel. Replies usually arrive in 3–5 seconds.
- **No API key or network:** replies are clearly labeled as simulated, so say so. The sample has fixture replies for the job-setup question, so the before and after still differ.
- **The state got messy:** click the **M** logo, then **Try sample conversation**. That resets the sample.
- **The chat covers the Correct button:** press `Esc` first.
