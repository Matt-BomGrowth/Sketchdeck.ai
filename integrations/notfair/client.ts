/**
 * NotFair MCP client.
 *
 * NotFair is exposed as a remote MCP server. At runtime AdPilot connects with
 * the official MCP SDK over Streamable HTTP using NOTFAIR_MCP_URL and
 * NOTFAIR_API_KEY (bearer token). Capability ids and argument schemas are the
 * ones verified via the live connection (see capabilities.ts).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CapabilityDef } from "./capabilities";

export interface NotFairSearchResult {
  workflowId?: string;
  connectedPlatforms: Array<{ platform: string; primaryAccountId: string }>;
  capabilities: Array<{ id: string; platform: string; executor: "executeRead" | "execute"; title: string; description: string; inputSchema: unknown }>;
  totalCapabilities?: number;
  notice?: string;
}

export interface NotFairClientOptions {
  url?: string;
  apiKey?: string;
  /** Override for tests. */
  transportFactory?: () => { client: Client; connect(): Promise<void>; close(): Promise<void> };
}

export class NotFairError extends Error {
  constructor(message: string, readonly code?: string, readonly details?: unknown) {
    super(message);
    this.name = "NotFairError";
  }
}

export function notfairConfigured() {
  return Boolean(process.env.NOTFAIR_MCP_URL);
}

export class NotFairClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private readonly url?: string;
  private readonly apiKey?: string;

  constructor(opts: NotFairClientOptions = {}) {
    this.url = opts.url ?? process.env.NOTFAIR_MCP_URL;
    this.apiKey = opts.apiKey ?? process.env.NOTFAIR_API_KEY;
  }

  isConfigured() {
    return Boolean(this.url);
  }

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    if (!this.url) throw new NotFairError("NOTFAIR_MCP_URL is not configured.", "not_configured");
    const headers: Record<string, string> = {};
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    this.transport = new StreamableHTTPClientTransport(new URL(this.url), { requestInit: { headers } });
    this.client = new Client({ name: "adpilot-ai", version: "0.1.0" });
    await this.client.connect(this.transport);
    return this.client;
  }

  async close() {
    await this.transport?.close().catch(() => undefined);
    this.client = null;
    this.transport = null;
  }

  private async call<T>(tool: "search" | "executeRead" | "execute", args: Record<string, unknown>): Promise<T> {
    const client = await this.connect();
    const res = await client.callTool({ name: tool, arguments: args });
    const content = (res.content ?? []) as Array<{ type: string; text?: string }>;
    const text = content.filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text as string).join("\n");
    if (res.isError) throw new NotFairError(text || `NotFair ${tool} failed`, "tool_error");
    if (res.structuredContent) return res.structuredContent as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new NotFairError(`NotFair ${tool} returned non-JSON content`, "bad_response", text.slice(0, 500));
    }
  }

  /** Discover capabilities and connected platforms. */
  search(query: string, platform?: string, workflowId?: string) {
    return this.call<NotFairSearchResult>("search", { query, ...(platform ? { platform } : {}), ...(workflowId ? { workflowId } : {}) });
  }

  /** Execute a read-only capability. */
  executeRead<T = unknown>(cap: CapabilityDef | string, args: Record<string, unknown> = {}, workflowId?: string) {
    const capabilityId = typeof cap === "string" ? cap : cap.id;
    if (typeof cap !== "string" && cap.write) throw new NotFairError(`${capabilityId} is a write capability; use execute()`, "wrong_executor");
    return this.call<T>("executeRead", { capabilityId, arguments: args, ...(workflowId ? { workflowId } : {}) });
  }

  /**
   * Execute a WRITE capability. Callers must have passed AdPilot's approval
   * workflow; this method refuses to run unless `approved` is explicitly true.
   */
  execute<T = unknown>(cap: CapabilityDef | string, args: Record<string, unknown>, opts: { approved: boolean; approver: string; workflowId?: string }) {
    if (!opts.approved) throw new NotFairError("Refusing to execute a live change without approval.", "approval_required");
    const capabilityId = typeof cap === "string" ? cap : cap.id;
    return this.call<T>("execute", { capabilityId, arguments: args, ...(opts.workflowId ? { workflowId: opts.workflowId } : {}) });
  }

  /** Run a Google Ads GAQL script. Returns the script's `result`. */
  async runGoogleAdsScript<T = unknown>(code: string, options: { accountId?: string; timeoutMs?: number } = {}): Promise<T> {
    const res = await this.executeRead<{ ok: boolean; result?: T; error?: unknown; timedOut?: boolean; resultTruncated?: boolean }>("google_ads_runScript", {
      code,
      timeoutMs: options.timeoutMs ?? 45000,
      ...(options.accountId ? { accountId: options.accountId } : {}),
    });
    if (!res.ok || res.result === undefined) throw new NotFairError("runScript failed", "script_error", res.error ?? res);
    if (res.timedOut) throw new NotFairError("runScript timed out", "timeout");
    return res.result;
  }

  /** Run a GA4 script. Returns the script's `result`. */
  async runGa4Script<T = unknown>(code: string, options: { propertyId?: string; timeoutMs?: number } = {}): Promise<T> {
    const res = await this.executeRead<{ ok: boolean; result?: T; error?: unknown; timedOut?: boolean }>("google_analytics_runScript", {
      code,
      timeoutMs: options.timeoutMs ?? 45000,
      ...(options.propertyId ? { propertyId: options.propertyId } : {}),
    });
    if (!res.ok || res.result === undefined) throw new NotFairError("GA4 runScript failed", "script_error", res.error ?? res);
    return res.result;
  }
}

let shared: NotFairClient | null = null;
export function getNotFairClient() {
  if (!shared) shared = new NotFairClient();
  return shared;
}
