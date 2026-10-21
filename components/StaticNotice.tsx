import { STATIC_DEMO } from "@/lib/client-api";

export const REPO_URL = "https://github.com/Kedar-V/memorymirror";

export default function StaticNotice() {
  if (!STATIC_DEMO) return null;
  return (
    <p role="note" className="rounded-lg px-3 py-2 text-sm leading-6" style={{ background: "var(--warn-soft)", color: "var(--ink)" }}>
      <strong>API calls to language models are disabled on this website.</strong> Replies and extracted memories come from built-in sample data. To use a live model,{" "}
      <a href={REPO_URL} className="underline" target="_blank" rel="noreferrer">clone the repo</a> and add your own API key.
    </p>
  );
}
