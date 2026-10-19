import { blocks } from "@/lib/markdown";

function rich(text: string) {
  return text.split(/(\*\*[^*]+?\*\*|`[^`]+`)/g).map((bit, index) => {
    if (bit.startsWith("**") && bit.endsWith("**") && bit.length > 4) {
      return <strong key={index}>{bit.slice(2, -2)}</strong>;
    }
    if (bit.startsWith("`") && bit.endsWith("`") && bit.length > 2) {
      return (
        <code key={index} className="mono text-[0.85em]">
          {bit.slice(1, -1)}
        </code>
      );
    }
    return bit;
  });
}

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-6">
      {blocks(text).map((block, index) => {
        if (block.kind === "p") {
          return (
            <p key={index}>
              {block.lines.map((line, lineIndex) => (
                <span key={lineIndex}>
                  {lineIndex > 0 && <br />}
                  {rich(line)}
                </span>
              ))}
            </p>
          );
        }
        const Tag = block.kind === "ol" ? "ol" : "ul";
        return (
          <Tag key={index} className={`${block.kind === "ol" ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{rich(item)}</li>
            ))}
          </Tag>
        );
      })}
    </div>
  );
}
