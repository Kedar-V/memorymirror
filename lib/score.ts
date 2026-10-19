export type Rubric = {
  expectIncludes: string[];
  expectExcludes: string[];
  forbiddenInferences: string[];
};

export type Score = {
  correctionAdherence: boolean;
  staleLeakage: boolean;
  unsupportedInference: boolean;
  missing: string[];
  leaked: string[];
  inferred: string[];
};

function hasPhrase(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function hasPhraseOutsideNegation(haystack: string, needle: string) {
  const hay = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let from = 0;
  while (from < hay.length) {
    const index = hay.indexOf(n, from);
    if (index < 0) return false;
    const window = hay.slice(Math.max(0, index - 32), index);
    // ponytail: 32-char negation window, not a parser. "not in Austin" is not a leak; a bare echo still is.
    if (!/\b(not|no|never|without|former|left)\b/.test(window)) return true;
    from = index + n.length;
  }
  return false;
}

export function scoreReply(reply: string, rubric: Rubric): Score {
  const missing = rubric.expectIncludes.filter((phrase) => !hasPhrase(reply, phrase));
  const leaked = rubric.expectExcludes.filter((phrase) =>
    hasPhraseOutsideNegation(reply, phrase),
  );
  const inferred = rubric.forbiddenInferences.filter((phrase) =>
    hasPhraseOutsideNegation(reply, phrase),
  );
  return {
    correctionAdherence: missing.length === 0,
    staleLeakage: leaked.length > 0,
    unsupportedInference: inferred.length > 0,
    missing,
    leaked,
    inferred,
  };
}

function selfCheck() {
  const pass = scoreReply("Book salmon in Brooklyn.", {
    expectIncludes: ["Brooklyn", "salmon"],
    expectExcludes: ["Austin", "vegetarian"],
    forbiddenInferences: ["anxious"],
  });
  if (!pass.correctionAdherence || pass.staleLeakage || pass.unsupportedInference) {
    throw new Error("score self-check: clean reply");
  }
  const negated = scoreReply("You are not in Austin.", {
    expectIncludes: ["not"],
    expectExcludes: ["Austin"],
    forbiddenInferences: [],
  });
  if (negated.staleLeakage) throw new Error("score self-check: negation");
  const leak = scoreReply("Dinner in Austin.", {
    expectIncludes: ["Brooklyn"],
    expectExcludes: ["Austin"],
    forbiddenInferences: ["anxious"],
  });
  if (leak.correctionAdherence || !leak.staleLeakage || leak.unsupportedInference) {
    throw new Error("score self-check: leak");
  }
  const inferred = scoreReply("You seem anxious.", {
    expectIncludes: ["confidence interval"],
    expectExcludes: [],
    forbiddenInferences: ["anxious"],
  });
  if (!inferred.unsupportedInference || inferred.correctionAdherence) {
    throw new Error("score self-check: inference");
  }
}

selfCheck();
