// Chrome browser Prompt API (LanguageModel / Gemini Nano).
// Docs: https://developer.chrome.com/docs/ai/get-started
//       https://developer.chrome.com/docs/ai/built-in-apis
//       https://developer.chrome.com/docs/ai/cache-models
//
// The Prompt API is a single-turn text-in / text-out endpoint that runs
// on-device. It does NOT support tool calls or multi-turn message arrays,
// so we adapt the existing pass-1/pass-2 prompts to a single user message
// and let the existing JSON-text fallback in pass-1 handle the response.

import type { AssistantMessage, Context } from "@earendil-works/pi-ai";
import type { CompleteOptions } from "./provider";
import type { Settings } from "../types";

export const CHROME_AI_PROVIDER_ID = "chrome-ai";
export const CHROME_AI_MODEL_ID = "gemini-nano";

declare global {
  // The Prompt API is a Chromium-only global. We only narrow the shape we
  // actually use; anything else on `LanguageModel` is left untouched.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var LanguageModel: any;

  // Device Memory API — Chrome exposes approximate RAM via navigator.
  // Not standard, but available in all Chromium-based browsers.
  interface Navigator {
    readonly deviceMemory?: number;
  }
}

// Subset of the Prompt API we depend on. The real surface is larger.
interface ChromeLanguageModel {
  availability(options?: {
    languages?: string[];
  }): Promise<
    "unavailable" | "downloadable" | "downloading" | "available"
  >;
  create(options?: {
    systemPrompt?: string;
    initialPrompts?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    topK?: number;
    signal?: AbortSignal;
    monitor?: (m: { addEventListener: (e: "downloadprogress", cb: (ev: { loaded: number }) => void) => void }) => void;
    outputLanguage?: string;
  }): Promise<ChromeLanguageModelSession>;
}

interface ChromeLanguageModelSession {
  prompt(
    input: string,
    options?: { signal?: AbortSignal; responseConstraint?: unknown },
  ): Promise<string>;
  promptStreaming(
    input: string,
    options?: { signal?: AbortSignal },
  ): ReadableStream<string>;
  destroy(): void;
  readonly inputUsage: number;
  readonly outputUsage: number;
  readonly inputQuota: number;
  clone(options?: { signal?: AbortSignal }): Promise<ChromeLanguageModelSession>;
}

function lm(): ChromeLanguageModel | null {
  // Service workers and extension pages both expose globals via `globalThis`.
  // The Prompt API is intentionally un-namespaced (it's a Chromium global),
  // so we feature-detect on the global itself rather than UA-sniffing.
  const g = (typeof self !== "undefined" ? self : globalThis) as {
    LanguageModel?: ChromeLanguageModel;
  };
  return g.LanguageModel ?? null;
}

// True only if the running browser exposes the Prompt API at all. Does NOT
// imply the on-device model is downloaded; pair with getChromeAiStatus()
// to know whether a session can be created right now.
export function hasChromeAiApi(): boolean {
  return lm() !== null;
}

export type ChromeAiStatus =
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available"
  | "unsupported";

export async function getChromeAiStatus(): Promise<ChromeAiStatus> {
  const m = lm();
  if (!m) return "unsupported";
  try {
    return await m.availability({ languages: ["en"] });
  } catch {
    // Some Chromium builds expose the constructor but throw from availability().
    return "unavailable";
  }
}

// Join the prompt's user messages into a single string. Pass-1 and pass-2
// always send one user turn, but we concatenate to stay safe if that changes.
function joinUserMessages(ctx: Context): string {
  return ctx.messages
    .filter((m) => m.role === "user")
    .map((m) =>
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .map((b) => (b.type === "text" ? b.text : ""))
              .filter(Boolean)
              .join("\n")
          : "",
    )
    .filter(Boolean)
    .join("\n\n");
}

// One-shot complete. Mirrors the shape of `complete()` in provider.ts so the
// existing pass-1 / pass-2 code can stay untouched: it just sees an
// AssistantMessage with a single text block and a usage record.
//
// The Prompt API has no tool-call support, so we always return text and let
// the existing `parseJson` fallback in pass-1 turn the response into a
// taxonomy. The cost is reported as $0 — the model runs locally.
export async function completeChromeAi(
  _settings: Settings,
  ctx: Context,
  options: CompleteOptions = {},
): Promise<AssistantMessage> {
  const m = lm();
  if (!m) {
    throw new Error(
      "Chrome browser AI is not available. Update Chrome and enable " +
        "the 'Prompt API for Gemini Nano' flag, or pick a different model.",
    );
  }
  const status = await m.availability({ languages: ["en"] }).catch(() => "unavailable");
  if (status === "unavailable") {
    throw new Error(
      "Chrome browser AI is not available on this device (need 22GB " +
        "free disk, 16GB RAM / 4GB VRAM). See chrome://on-device-internals.",
    );
  }

  const systemPrompt = ctx.systemPrompt || "";
  const userText = joinUserMessages(ctx);
  if (!userText) {
    throw new Error("Chrome AI complete() called without a user message.");
  }

  // create() may trigger a model download. User activation is required for
  // the "downloadable" / "downloading" states. We just call create() — the
  // caller is already in response to a click (Test / Run), so activation
  // is implicit.
  const session = await m.create({
    systemPrompt,
    temperature: 0.2,
    topK: 8,
    signal: options.signal,
    outputLanguage: "en",
  });

  try {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    // The Prompt API takes a single string. We ignore maxTokens — the API
    // has its own internal cap (capabilities() on the session). Pass 1
    // asks for ~10 categories, pass 2 for ~100 short JSON lines; both fit
    // comfortably inside the default output budget.
    void options.maxTokens; // explicitly unused
    const text = await session.prompt(userText, {
      signal: options.signal,
    });

    return {
      role: "assistant",
      content: [{ type: "text", text }],
      // pi-ai requires these for downstream consumers; chrome-ai is its
      // own runtime so we tag with a sentinel provider / api / model.
      api: "chrome-ai" as never,
      provider: CHROME_AI_PROVIDER_ID as never,
      model: CHROME_AI_MODEL_ID,
      stopReason: "stop",
      timestamp: Date.now(),
      usage: {
        input: session.inputUsage,
        output: session.outputUsage,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: session.inputUsage + session.outputUsage,
        // pi-ai's Cost type: { input, output, cacheRead, cacheWrite, total }
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
    };
  } finally {
    // Always release the session — Gemini Nano holds GPU/CPU resources.
    try {
      session.destroy();
    } catch {
      // ignore — session is best-effort
    }
  }
}

// Map a status to a human-readable hint used by the Settings UI.
export function statusHint(status: ChromeAiStatus): string {
  switch (status) {
    case "available":
      return "Ready";
    case "downloadable":
      return "Will download on first use (Chrome will prompt you)";
    case "downloading":
      return "Downloading model…";
    case "unavailable":
      return "Model not available — GPU may lack Vulkan support";
    case "unsupported":
      return "Not enabled. Enable the 'Prompt API for Gemini Nano' flag in chrome://flags";
  }
}

// ── Device compatibility check ──

// One row in the device report.
export interface CompatRow {
  label: string;
  required: string;
  detected: string;
  /** true = pass, false = fail, null = can't determine */
  pass: boolean | null;
}

// Full report shown in the settings panel when Browser Model is selected.
export interface DeviceCompatibility {
  rows: CompatRow[];
  status: ChromeAiStatus;
  overall: "pass" | "fail" | "partial" | "unknown";
  /** True when the `chrome://flags` settings are not enabled. */
  flagsMissing: boolean;
  /** Human-readable guidance for enabling flags. */
  flagsGuidance: string;
  /** Note about GPU compatibility when model is unavailable. */
  gpuNote: string;
}

function parseChromeVersion(): number | null {
  try {
    const m = /Chrome\/(\d+)/.exec(navigator.userAgent);
    return m ? parseInt(m[1]!, 10) : null;
  } catch {
    return null;
  }
}

function detectOS(): string {
  const ua = navigator.userAgent;
  if (/Windows NT 10/.test(ua)) return "Windows 10/11";
  if (/Windows/.test(ua)) return "Windows (older)";
  if (/Mac/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  return "Unknown";
}

const MIN_CHROME = 138;
const MIN_RAM_GB = 16;
const MIN_CPU_CORES = 4;

// Gather whatever the running browser exposes and return a structured
// compatibility report. Avoids requesting extension-only permissions;
// we use only web APIs (navigator.*, user-agent) plus the Prompt API.
export async function checkDeviceCompatibility(): Promise<DeviceCompatibility> {
  const st = await getChromeAiStatus();
  const chromeVer = parseChromeVersion();
  const os = detectOS();
  const ram = navigator.deviceMemory ?? null;
  const cpu = navigator.hardwareConcurrency ?? null;

  // Chrome Prompt API supported: Windows 10+, macOS 13+, Linux, ChromeOS (Chromebook Plus).
  // See: https://developer.chrome.com/docs/ai/prompt-api#review-the-hardware-requirements
  const osOk =
    os === "Windows 10/11" ||
    os === "macOS" ||
    os === "Linux" ||
    os === "ChromeOS";
  const ramOk = ram !== null ? ram >= MIN_RAM_GB : null;
  const cpuOk = cpu !== null ? cpu >= MIN_CPU_CORES : null;
  const chromeOk = chromeVer !== null ? chromeVer >= MIN_CHROME : null;

  const rows: CompatRow[] = [
    {
      label: "Chrome version",
      required: `${MIN_CHROME}+`,
      detected: chromeVer ? `Chrome ${chromeVer}` : "Unknown",
      pass: chromeOk,
    },
    {
      label: "Operating system",
      required: "Windows 10+, macOS 13+, Linux, ChromeOS",
      detected: os,
      pass: osOk,
    },
    {
      label: "System RAM",
      required: `${MIN_RAM_GB} GB+`,
      detected: ram !== null ? `${ram} GB` : "Unknown",
      pass: ramOk,
    },
    {
      label: "CPU cores",
      required: `${MIN_CPU_CORES}+`,
      detected: cpu !== null ? `${cpu}` : "Unknown",
      pass: cpuOk,
    },
    {
      label: "Prompt API",
      required: "Available",
      detected:
        st === "available"
          ? "Ready"
          : st === "downloadable"
            ? "Will download on first use"
            : st === "downloading"
              ? "Downloading model…"
              : st === "unavailable"
                ? hasChromeAiApi()
                  ? "Model not available (GPU may lack Vulkan support)"
                  : "Not available"
                : "Flags not enabled",
      pass: st === "available" || st === "downloadable" || st === "downloading",
    },
  ];

  // Determine whether the flag-specific issue is the root cause: if
  // the Prompt API row failed and it's because LanguageModel doesn't
  // exist, the flags are missing. If LanguageModel exists but returns
  // "unavailable", the device is the problem.
  const apiRow = rows[4]!;
  const flagsMissing = apiRow.pass === false && !hasChromeAiApi();
  const flagsGuidance = flagsMissing
    ? 'Enable Chrome flags: chrome://flags/#optimization-guide-on-device-model + chrome://flags/#prompt-api-for-gemini-nano'
    : '';

  // When the model is unavailable and the API exists, the GPU likely
  // lacks Vulkan support or failed model validation.
  const gpuNote =
    st === "unavailable" && hasChromeAiApi()
      ? "The on-device model requires Vulkan GPU support. Check chrome://gpu for Vulkan status."
      : '';

  // Overall verdict.
  const failures = rows.filter((r) => r.pass === false);
  const unknowns = rows.filter((r) => r.pass === null);

  let overall: "pass" | "fail" | "partial" | "unknown";
  if (failures.length > 0) {
    overall = "fail";
  } else if (unknowns.length === rows.length) {
    overall = "unknown";
  } else if (unknowns.length > 0) {
    overall = "partial";
  } else {
    overall = "pass";
  }

  return { rows, status: st, overall, flagsMissing, flagsGuidance, gpuNote };
}
