"use client";

import { useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { benchmarkCases, type BenchmarkCase } from "@/lib/benchmark";
import { postJson } from "@/lib/client-api";
import { scoreReply, type Score } from "@/lib/score";

type Row = BenchmarkCase &
  Score & {
    reply: string;
    simulated: boolean;
    model: string;
    temperature: number | null;
    error: string | null;
  };

type ChatReply = {
  reply: string;
  simulated: boolean;
  model: string;
  temperature: number | null;
};

export default function EvaluationDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [index, setIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const scored = rows.filter((row) => !row.error);
  const n = scored.length;
  const adherence = n ? scored.filter((row) => row.correctionAdherence).length / n : 0;
  const leakage = n ? scored.filter((row) => row.staleLeakage).length / n : 0;
  const inferred = n ? scored.filter((row) => row.unsupportedInference).length / n : 0;
  const chart = [
    { name: "Correction adherence", value: adherence },
    { name: "Stale-memory leakage", value: leakage },
    { name: "Unsupported inference", value: inferred },
  ];
  const allSimulated = rows.length > 0 && rows.every((row) => row.simulated || row.error);

  async function run() {
    stop.current = false;
    setRunning(true);
    setRows([]);
    const collected: Row[] = [];
    for (let i = 0; i < benchmarkCases.length; i += 1) {
      if (stop.current) break;
      const item = benchmarkCases[i];
      setIndex(i);
      try {
        const data = await postJson<ChatReply>("/api/chat", {
          messages: [{ id: item.id, role: "user", content: item.question }],
          memories: item.memories,
        });
        collected.push({
          ...item,
          ...scoreReply(data.reply, item),
          reply: data.reply,
          simulated: data.simulated,
          model: data.model,
          temperature: data.temperature,
          error: null,
        });
      } catch (error) {
        collected.push({
          ...item,
          reply: "",
          simulated: false,
          model: "",
          temperature: null,
          error: error instanceof Error ? error.message : "Request failed.",
          correctionAdherence: false,
          staleLeakage: false,
          unsupportedInference: false,
          missing: [],
          leaked: [],
          inferred: [],
        });
      }
      setRows([...collected]);
    }
    setRunning(false);
    setIndex(-1);
  }

  function download() {
    const payload = {
      exportedAt: new Date().toISOString(),
      scored: n,
      errors: rows.length - n,
      rates: { correctionAdherence: adherence, staleMemoryLeakage: leakage, unsupportedInference: inferred },
      note: "Substring rubric on one reply per case. Live calls use a local Cursor agent. Temperature is not set. A rate is not a causal estimate beyond the memory snapshot in the prompt. Simulated rows are fixtures.",
      cases: rows.map((row) => ({
        id: row.id,
        personaId: row.personaId,
        title: row.title,
        question: row.question,
        memories: row.memories,
        expectIncludes: row.expectIncludes,
        expectExcludes: row.expectExcludes,
        forbiddenInferences: row.forbiddenInferences,
        reply: row.reply,
        simulated: row.simulated,
        model: row.model,
        temperature: row.temperature,
        error: row.error,
        correctionAdherence: row.error ? null : row.correctionAdherence,
        staleLeakage: row.error ? null : row.staleLeakage,
        unsupportedInference: row.error ? null : row.unsupportedInference,
        missing: row.missing,
        leaked: row.leaked,
        inferred: row.inferred,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "memorymirror-benchmark.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="kicker">Evaluation</p>
        <h2 className="serif mt-1 text-4xl">Twelve corrected-record cases</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
          Each case sends one question with the corrected memory snapshot. Adherence means every expected phrase is in the reply. Leakage means a stale phrase appears outside a short negation window. Unsupported inference means a forbidden phrase appears the same way. Errors are left out of the rates.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-solid" disabled={running} onClick={() => void run()}>
          {running ? `Running ${index + 1} of ${benchmarkCases.length}` : "Run benchmark"}
        </button>
        {running && (
          <button type="button" className="btn" onClick={() => { stop.current = true; }}>
            Stop
          </button>
        )}
        <button type="button" className="btn" disabled={!rows.length} onClick={download}>
          Download JSON
        </button>
        {running && <span className="busy-bar w-24" aria-hidden />}
      </div>
      {allSimulated && (
        <p className="text-sm" role="status" style={{ color: "var(--warn)" }}>
          Simulated. These replies are fixtures written to follow the corrected snapshot, so this run checks the scorer and the wiring. It is not a model score. Set CURSOR_API_KEY and run again for live numbers.
        </p>
      )}
      {rows.some((row) => row.simulated === false && !row.error) && (
        <p className="text-sm" role="status">Live calls used a local Cursor agent. The model name is on each row. Temperature is not set.</p>
      )}
      {!rows.length && !running && (
        <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
          No results yet. The chart fills in as each case returns.
        </p>
      )}
      {n > 0 && (
        <div className="panel p-4">
          <p className="text-sm tabular-nums">{n} scored · {rows.length - n} errors</p>
          <div className="mt-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--ink-dim)", fontSize: 12 }} interval={0} />
                <YAxis domain={[0, 1]} tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} tick={{ fill: "var(--ink-dim)", fontSize: 12 }} width={48} />
                <Tooltip formatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                  {chart.map((entry) => (
                    <Cell key={entry.name} fill={entry.name.startsWith("Correction") ? "var(--good)" : entry.name.startsWith("Stale") ? "var(--bad)" : "var(--warn)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <ol className="space-y-2">
        {benchmarkCases.map((item, itemIndex) => {
          const row = rows.find((entry) => entry.id === item.id);
          return (
            <li key={item.id} className="panel px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <span className="mono text-[11px]" style={{ color: "var(--ink-dim)" }}>
                  {running && index === itemIndex && !row ? "Running" : row ? statusLabel(row) : "Waiting"}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6" style={{ color: "var(--ink-dim)" }}>{item.question}</p>
              {row?.error && <p className="mt-2 text-sm" role="alert" style={{ color: "var(--bad)" }}>{row.error}</p>}
              {row && !row.error && (
                <p className="mt-2 text-sm leading-6">
                  {row.simulated ? "Simulated. " : `${row.model}. `}
                  {row.missing.length ? `Missing: ${row.missing.join(", ")}. ` : ""}
                  {row.leaked.length ? `Leaked: ${row.leaked.join(", ")}. ` : ""}
                  {row.inferred.length ? `Inferred: ${row.inferred.join(", ")}.` : ""}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function statusLabel(row: Row) {
  if (row.error) return "Error";
  const bits = [
    row.correctionAdherence ? "adhered" : "missed",
    row.staleLeakage ? "leaked" : "no leak",
    row.unsupportedInference ? "inferred" : "no extra inference",
  ];
  return bits.join(" · ");
}
