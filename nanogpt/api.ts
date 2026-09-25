async function fetchJson(url: string, apiKey: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await res.json() as any;
  return Array.isArray(data) ? data : (data?.data ?? []);
}

function mapModels(list: any[]) {
  return list.map((m: any) => {
    const isThinkingVariant = m.id.includes(":thinking");
    const efforts = (m.reasoning_efforts ?? []) as string[];
    const model: any = {
      id: m.id,
      name: m.name ? (m.subscription?.included === false ? `${m.name} [paid]` : m.name) : m.id,
      reasoning: m.capabilities?.reasoning ?? (m.id.includes("r1") || isThinkingVariant),
      input: (m.architecture?.input_modalities ?? ["text"]).includes("image")
        ? (["text", "image"] as ("text" | "image")[])
        : (["text"] as ("text" | "image")[]),
      cost: {
        input: m.pricing?.prompt ?? 0,
        output: m.pricing?.completion ?? 0,
        cacheRead: (m.pricing?.cacheReadInputPer1kTokens ?? 0) * 1000,
        cacheWrite: 0,
      },
      contextWindow: m.context_length ?? 128000,
      maxTokens: m.max_output_tokens ?? 4096,
    };
    if (model.reasoning && efforts.length) {
      const map: Record<string, string | null> = {};
      for (const lvl of ["minimal", "low", "medium", "high", "xhigh", "max"]) {
        map[lvl] = efforts.includes(lvl) ? lvl : null;
      }
      // nanogpt: reasoning_effort "none" disables reasoning; :thinking variants can't disable
      map.off = isThinkingVariant ? null : "none";
      model.thinkingLevelMap = map;
    }
    return model;
  });
}

export async function fetchSubscriptionModels(apiKey: string, baseUrl: string = process.env.OPENAI_BASE_URL || "https://nano-gpt.com/api/v1") {
  if (baseUrl === "https://nano-gpt.com/api/v1") {
    const models = await fetchJson("https://nano-gpt.com/api/subscription/v1/models?detailed=true", apiKey);
    return mapModels(models);
  } else {
    // Custom proxy: usually there's no subscription models endpoint separate from main models
    return [];
  }
}

export async function fetchModels(apiKey: string, baseUrl: string = process.env.OPENAI_BASE_URL || "https://nano-gpt.com/api/v1") {
  if (baseUrl === "https://nano-gpt.com/api/v1") {
    const defaultBase = "https://nano-gpt.com";
    const [allModels, subModels] = await Promise.all([
      fetchJson(`${defaultBase}/api/v1/models?detailed=true`, apiKey),
      fetchJson(`${defaultBase}/api/subscription/v1/models?detailed=true`, apiKey),
    ]);

    const merged = [...allModels];
    const allIds = new Set(allModels.map((m: any) => m.id));
    for (const m of subModels) {
      if (!allIds.has(m.id)) {
        merged.push(m);
      }
    }

    return mapModels(merged);
  } else {
    // Custom proxy (Headroom, LiteLLM, etc.)
    const models = await fetchJson(`${baseUrl}/models?detailed=true`, apiKey);
    return mapModels(models);
  }
}

export const fallbackModels = [
  {
    id: "unknown",
    name: "unknown",
    reasoning: false,
    input: ["text"] as ("text" | "image")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 4096,
  },
];
