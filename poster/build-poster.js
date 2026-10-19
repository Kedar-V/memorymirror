/**
 * MemoryMirror — 24" × 24" research poster (print-ready)
 * Run: node build-poster.js
 */
const pptxgen = require("pptxgenjs");
const path = require("path");

const ASSETS = __dirname;
const OUT = path.join(__dirname, "MemoryMirror-Poster-24x24.pptx");

const C = {
  paper: "F4F0E8",
  panel: "FFFBF6",
  ink: "1D2A44",
  muted: "5C6578",
  line: "D9D2C5",
  navy: "1D2A44",
  teal: "1A7A6D",
  tealSoft: "E4F2EF",
  coral: "C45C4A",
  coralSoft: "F7E8E4",
  white: "FFFFFF",
};

async function main() {
  const pres = new pptxgen();
  pres.defineLayout({ name: "POSTER_24", width: 24, height: 24 });
  pres.layout = "POSTER_24";
  pres.author = "Kedar Prashant Vaidya";
  pres.title = "MemoryMirror — AIPI 590 Project Poster";
  pres.subject = "Explainable AI · Persistent assistant memory";

  const s = pres.addSlide();
  s.background = { color: C.paper };

  // Outer frame
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.35, y: 0.35, w: 23.3, h: 23.3,
    fill: { type: "none" },
    line: { color: C.navy, width: 1.5 },
  });

  // ===== HEADER =====
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.55, y: 0.55, w: 22.9, h: 3.15,
    fill: { color: C.navy },
    line: { color: C.navy },
  });
  s.addText("AIPI 590  ·  Responsible AI  ·  Duke University  ·  Fall 2026", {
    x: 0.8, y: 0.7, w: 16, h: 0.35,
    fontFace: "Calibri", fontSize: 16, color: "A8B4C8",
    margin: 0, isTextBox: true,
  });
  s.addText("MemoryMirror", {
    x: 0.8, y: 1.05, w: 16, h: 0.95,
    fontFace: "Cambria", fontSize: 72, bold: true, color: C.white,
    margin: 0, isTextBox: true,
  });
  s.addText("See, trace, and correct the memories an assistant is using.", {
    x: 0.8, y: 2.05, w: 16.5, h: 0.45,
    fontFace: "Calibri", fontSize: 24, color: "D5DCE8",
    margin: 0, isTextBox: true,
  });
  s.addText("Kedar Prashant Vaidya", {
    x: 17.6, y: 1.35, w: 5.5, h: 0.4,
    fontFace: "Calibri", fontSize: 18, color: C.white, align: "right",
    margin: 0, isTextBox: true,
  });
  s.addText("Interactive XAI demo  ·  Project 1", {
    x: 17.6, y: 1.8, w: 5.5, h: 0.35,
    fontFace: "Calibri", fontSize: 14, color: "A8B4C8", align: "right",
    margin: 0, isTextBox: true,
  });

  // Teal accent under header
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.55, y: 3.7, w: 22.9, h: 0.12,
    fill: { color: C.teal }, line: { color: C.teal },
  });

  // ===== HERO IMAGE =====
  s.addImage({
    path: path.join(ASSETS, "poster-hero.jpg"),
    x: 0.55, y: 4.0, w: 10.9, h: 6.1,
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.55, y: 9.55, w: 10.9, h: 0.55,
    fill: { color: C.navy }, line: { color: C.navy },
  });
  s.addText("Figure 1  ·  Memory as a mirror: beliefs become inspectable reflections of prior talk", {
    x: 0.7, y: 9.62, w: 10.6, h: 0.4,
    fontFace: "Calibri", fontSize: 12, color: "D5DCE8",
    margin: 0, isTextBox: true,
  });

  // ===== MOTIVATION + RQ (right of hero) =====
  panel(s, pres, 11.7, 4.0, 11.75, 6.1);

  sectionLabel(s, 11.95, 4.2, "MOTIVATION");
  s.addText("Assistants now keep durable “memories” about people. When those memories are wrong, stale, or over-inferred, the person usually cannot see the record, cannot prove where it came from, and cannot test whether fixing it changes the next reply.", {
    x: 11.95, y: 4.65, w: 11.25, h: 1.55,
    fontFace: "Calibri", fontSize: 16, color: C.ink, valign: "top",
    margin: 0, isTextBox: true,
  });

  sectionLabel(s, 11.95, 6.3, "RESEARCH QUESTION");
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 11.95, y: 6.75, w: 11.25, h: 1.55,
    fill: { color: C.tealSoft },
    line: { color: C.teal, width: 1.25 },
    rectRadius: 0.08,
  });
  s.addText("When an assistant answers from a stored memory, can a person see that memory, trace it to a source message, correct it, and get a different answer to the same question under the same model and the same agent settings?", {
    x: 12.15, y: 6.9, w: 10.85, h: 1.3,
    fontFace: "Cambria", fontSize: 17, italic: true, color: C.navy, valign: "middle",
    margin: 0, isTextBox: true,
  });

  s.addText([
    { text: "Domain: ", options: { bold: true } },
    { text: "Human–AI interaction · Explainable AI · Memory provenance\n", options: { breakLine: false } },
    { text: "Audience: ", options: { bold: true } },
    { text: "People subject to assistant memory, plus builders who need a correction loop they can evaluate", options: { breakLine: false } },
  ], {
    x: 11.95, y: 8.5, w: 11.25, h: 1.2,
    fontFace: "Calibri", fontSize: 15, color: C.muted,
    margin: 0, isTextBox: true,
  });

  // ===== ROW 2: Contribution | Method | Evaluation =====
  // Contribution
  panel(s, pres, 0.55, 10.35, 7.5, 7.55);
  sectionLabel(s, 0.75, 10.55, "CONTRIBUTION");
  s.addText("An interactive memory lab", {
    x: 0.75, y: 11.0, w: 7.1, h: 0.4,
    fontFace: "Cambria", fontSize: 26, bold: true, color: C.navy,
    margin: 0, isTextBox: true,
  });
  s.addText([
    { text: "Profile of active beliefs", options: { bullet: true, breakLine: true } },
    { text: "Lineage graph: message → belief → reply", options: { bullet: true, breakLine: true } },
    { text: "Edit / delete with version history kept", options: { bullet: true, breakLine: true } },
    { text: "Three-arm counterfactual lab", options: { bullet: true, breakLine: true } },
    { text: "12-case research benchmark + JSON export", options: { bullet: true, breakLine: true } },
    { text: "Sensitivity filter; local-first privacy", options: { bullet: true, breakLine: false } },
  ], {
    x: 0.75, y: 11.5, w: 7.1, h: 2.6,
    fontFace: "Calibri", fontSize: 16, color: C.ink, paraSpaceAfter: 6,
    margin: 0, isTextBox: true,
  });
  s.addImage({
    path: path.join(ASSETS, "poster-lineage.jpg"),
    x: 0.75, y: 14.25, w: 7.1, h: 3.25,
  });

  // Method
  panel(s, pres, 8.25, 10.35, 7.5, 7.55);
  sectionLabel(s, 8.45, 10.55, "METHOD");
  s.addText("Hold the model fixed. Change only memory.", {
    x: 8.45, y: 11.0, w: 7.1, h: 0.45,
    fontFace: "Cambria", fontSize: 22, bold: true, color: C.navy,
    margin: 0, isTextBox: true,
  });
  s.addText("Three synthetic people ship with a planted stale or over-inferred belief. The lab freezes model id and agent options, then swaps only the memory snapshot fed to the prompt.", {
    x: 8.45, y: 11.55, w: 7.1, h: 1.35,
    fontFace: "Calibri", fontSize: 15, color: C.ink,
    margin: 0, isTextBox: true,
  });

  // Step chips
  const steps = [
    { n: "01", t: "See", d: "Read the belief card" },
    { n: "02", t: "Trace", d: "Open source message" },
    { n: "03", t: "Correct", d: "New version; old kept" },
    { n: "04", t: "Re-ask", d: "Same Q, new memory" },
  ];
  steps.forEach((st, i) => {
    const y = 13.05 + i * 1.05;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 8.45, y, w: 7.1, h: 0.9,
      fill: { color: i % 2 === 0 ? C.tealSoft : C.panel },
      line: { color: C.line, width: 1 },
      rectRadius: 0.06,
    });
    s.addText(st.n, {
      x: 8.6, y: y + 0.2, w: 0.9, h: 0.5,
      fontFace: "Calibri", fontSize: 20, bold: true, color: C.teal,
      margin: 0, isTextBox: true,
    });
    s.addText(st.t, {
      x: 9.55, y: y + 0.12, w: 5.7, h: 0.35,
      fontFace: "Calibri", fontSize: 18, bold: true, color: C.navy,
      margin: 0, isTextBox: true,
    });
    s.addText(st.d, {
      x: 9.55, y: y + 0.45, w: 5.7, h: 0.3,
      fontFace: "Calibri", fontSize: 14, color: C.muted,
      margin: 0, isTextBox: true,
    });
  });

  // Evaluation
  panel(s, pres, 15.95, 10.35, 7.5, 7.55);
  sectionLabel(s, 16.15, 10.55, "EVALUATION");
  s.addText("Evidence, not vibes", {
    x: 16.15, y: 11.0, w: 7.1, h: 0.4,
    fontFace: "Cambria", fontSize: 24, bold: true, color: C.navy,
    margin: 0, isTextBox: true,
  });
  s.addImage({
    path: path.join(ASSETS, "poster-lab.jpg"),
    x: 16.15, y: 11.5, w: 7.1, h: 2.85,
  });
  s.addText("Figure 2  ·  Same question × three memory arms", {
    x: 16.15, y: 14.4, w: 7.1, h: 0.3,
    fontFace: "Calibri", fontSize: 11, color: C.muted,
    margin: 0, isTextBox: true,
  });

  // Metric boxes
  const metrics = [
    { title: "Correction adherence", body: "Reply must include corrected facts" },
    { title: "Stale-memory leakage", body: "Old facts must not reappear (negation window)" },
    { title: "Unsupported inference", body: "Blocks diagnoses the seed never stored" },
  ];
  metrics.forEach((m, i) => {
    const y = 14.8 + i * 0.95;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 16.15, y, w: 0.18, h: 0.8,
      fill: { color: i === 1 ? C.coral : C.teal },
      line: { color: i === 1 ? C.coral : C.teal },
    });
    s.addText(m.title, {
      x: 16.5, y: y, w: 6.7, h: 0.35,
      fontFace: "Calibri", fontSize: 15, bold: true, color: C.navy,
      margin: 0, isTextBox: true,
    });
    s.addText(m.body, {
      x: 16.5, y: y + 0.35, w: 6.7, h: 0.35,
      fontFace: "Calibri", fontSize: 13, color: C.muted,
      margin: 0, isTextBox: true,
    });
  });

  // ===== BOTTOM: Insights | Limitations | Takeaway =====
  panel(s, pres, 0.55, 18.15, 7.5, 4.55);
  sectionLabel(s, 0.75, 18.35, "INSIGHTS");
  s.addText([
    { text: "A correction that never reaches the prompt is theater — the reply arm must consume the new snapshot.", options: { bullet: true, breakLine: true } },
    { text: "Provenance edges come from recorded ids, not fuzzy wording similarity.", options: { bullet: true, breakLine: true } },
    { text: "Fixture mode proves the pipeline; live Cursor runs are the model score.", options: { bullet: true, breakLine: true } },
    { text: "Substring rubrics are honest about their limits — and force reproducible claims.", options: { bullet: true, breakLine: false } },
  ], {
    x: 0.75, y: 18.85, w: 7.1, h: 3.5,
    fontFace: "Calibri", fontSize: 15, color: C.ink, paraSpaceAfter: 8,
    margin: 0, isTextBox: true,
  });

  panel(s, pres, 8.25, 18.15, 7.5, 4.55);
  sectionLabel(s, 8.45, 18.35, "LIMITATIONS  &  FUTURE WORK");
  s.addText([
    { text: "Synthetic people and planted stale beliefs — not a field study of production chat logs.", options: { bullet: true, breakLine: true } },
    { text: "Causal claim is scoped: replies differ because the memory list differed, under fixed agent settings.", options: { bullet: true, breakLine: true } },
    { text: "Rubric is lexical; paraphrases can fail adherence or false-flag leakage.", options: { bullet: true, breakLine: true } },
    { text: "Next: user study on trust repair; stronger paraphrase scoring; rate limits before wider deploy.", options: { bullet: true, breakLine: false } },
  ], {
    x: 8.45, y: 18.85, w: 7.1, h: 3.5,
    fontFace: "Calibri", fontSize: 15, color: C.ink, paraSpaceAfter: 8,
    margin: 0, isTextBox: true,
  });

  // Takeaway callout
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 15.95, y: 18.15, w: 7.5, h: 4.55,
    fill: { color: C.navy },
    line: { color: C.navy },
    rectRadius: 0.1,
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 15.95, y: 18.15, w: 0.22, h: 4.55,
    fill: { color: C.teal },
    line: { color: C.teal },
  });
  s.addText("TAKEAWAY", {
    x: 16.4, y: 18.4, w: 6.8, h: 0.35,
    fontFace: "Calibri", fontSize: 14, bold: true, color: C.teal,
    charSpacing: 3, margin: 0, isTextBox: true,
  });
  s.addText("Make the memory loop visible enough to audit — and measurable enough to fail.", {
    x: 16.4, y: 18.9, w: 6.8, h: 1.6,
    fontFace: "Cambria", fontSize: 26, bold: true, color: C.white,
    margin: 0, isTextBox: true,
  });
  s.addText("Artifact: Next.js demo with fixture + live Cursor agent modes, lineage explorer, counterfactual lab, and a 12-case benchmark you can re-run and export.", {
    x: 16.4, y: 20.7, w: 6.8, h: 1.5,
    fontFace: "Calibri", fontSize: 15, color: "C5CDDA",
    margin: 0, isTextBox: true,
  });

  // Footer
  s.addText("MemoryMirror  ·  AIPI 590 Project Expo  ·  Code + README in the project repository  ·  Poster size 24\" × 24\"", {
    x: 0.55, y: 22.9, w: 22.9, h: 0.35,
    fontFace: "Calibri", fontSize: 12, color: C.muted, align: "center",
    margin: 0, isTextBox: true,
  });

  await pres.writeFile({ fileName: OUT });
  console.log("Wrote", OUT);
}

function panel(s, pres, x, y, w, h) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    fill: { color: C.panel },
    line: { color: C.line, width: 1 },
    rectRadius: 0.08,
  });
}

function sectionLabel(s, x, y, text) {
  s.addText(text, {
    x, y, w: 7, h: 0.3,
    fontFace: "Calibri", fontSize: 13, bold: true, color: C.teal,
    charSpacing: 2.5, margin: 0, isTextBox: true,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
