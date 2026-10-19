export type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul" | "ol"; items: string[] };

const listLine = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

export function blocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) {
      i += 1;
      continue;
    }
    const mark = lines[i].match(listLine);
    if (mark) {
      const ordered = /\d/.test(mark[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const next = lines[i].match(listLine);
        if (!next || /\d/.test(next[2]) !== ordered) break;
        items.push(next[3].replace(/^#{1,6}\s+/, ""));
        i += 1;
      }
      out.push({ kind: ordered ? "ol" : "ul", items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !listLine.test(lines[i])) {
      para.push(lines[i].trim().replace(/^#{1,6}\s+/, ""));
      i += 1;
    }
    out.push({ kind: "p", lines: para });
  }
  return out;
}

function check() {
  const got = blocks("**This week**\n- **Standing:** keep it\n\n3. [Priority 3]");
  const para = got[0];
  const bullets = got[1];
  const numbers = got[2];
  if (got.length !== 3 || para?.kind !== "p" || para.lines[0] !== "**This week**") throw new Error("markdown para");
  if (bullets?.kind !== "ul" || bullets.items[0] !== "**Standing:** keep it") throw new Error("markdown list");
  if (numbers?.kind !== "ol" || numbers.items[0] !== "[Priority 3]") throw new Error("markdown ol");
}

check();
