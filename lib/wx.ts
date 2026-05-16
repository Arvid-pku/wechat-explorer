import { spawn } from "node:child_process";

export type ChatTypeRaw = "private" | "group" | "official_account" | "folded" | string;

export interface RawSession {
  username: string;
  chat: string;
  chat_type: ChatTypeRaw;
  is_group: boolean;
  last_msg_type: string;
  last_sender: string;
  summary: string;
  time: string;
  timestamp: number;
  unread: number;
}

export interface RawMessage {
  chat?: string;
  content: string;
  sender: string;
  time: string;
  timestamp: number;
  type: string;
  url?: string;
}

export interface RawContact {
  username: string;
  display: string;
}

export interface HistoryOpts {
  limit?: number;
  offset?: number;
  since?: string;
  until?: string;
  type?: string;
}

export interface SearchOpts {
  limit?: number;
  type?: string;
  since?: string;
  until?: string;
  in?: string;
}

const WX_BIN = process.env.WX_BIN || "wx";

async function runWx(args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(WX_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`wx ${args[0]} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`wx ${args[0]} exited ${code}: ${stderr.slice(0, 500)}`));
      else resolve(stdout);
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function parseJsonLoose<T>(raw: string): T {
  const trimmed = raw.trim();
  const firstBrace = trimmed.search(/[{[]/);
  if (firstBrace === -1) throw new Error(`No JSON found in wx output: ${trimmed.slice(0, 200)}`);
  return JSON.parse(trimmed.slice(firstBrace));
}

export async function getSessions(limit = 10_000): Promise<RawSession[]> {
  const out = await runWx(["sessions", "--limit", String(limit), "--json"]);
  const data = parseJsonLoose<{ sessions: RawSession[] }>(out);
  return data.sessions ?? [];
}

export async function getContacts(limit = 10_000): Promise<RawContact[]> {
  const out = await runWx(["contacts", "--limit", String(limit), "--json"]);
  const data = parseJsonLoose<RawContact[] | { contacts: RawContact[] }>(out);
  return Array.isArray(data) ? data : (data.contacts ?? []);
}

export async function getHistory(chat: string, opts: HistoryOpts = {}): Promise<RawMessage[]> {
  const args = ["history", chat, "--limit", String(opts.limit ?? 500), "--json"];
  if (opts.offset) args.push("--offset", String(opts.offset));
  if (opts.since) args.push("--since", opts.since);
  if (opts.until) args.push("--until", opts.until);
  if (opts.type) args.push("--type", opts.type);
  const out = await runWx(args, 120_000);
  const data = parseJsonLoose<
    RawMessage[] | { messages?: RawMessage[]; history?: RawMessage[]; results?: RawMessage[] }
  >(out);
  if (Array.isArray(data)) return data;
  return data.messages ?? data.history ?? data.results ?? [];
}

export interface RawMember {
  username: string;
  display: string;
  contact_display?: string;
  group_nickname?: string;
  is_owner?: boolean;
}

export async function getMembers(chat: string): Promise<RawMember[]> {
  const out = await runWx(["members", chat, "--json"], 60_000);
  const data = parseJsonLoose<RawMember[] | { members?: RawMember[] }>(out);
  return Array.isArray(data) ? data : (data.members ?? []);
}

export async function search(keyword: string, opts: SearchOpts = {}): Promise<RawMessage[]> {
  const args = ["search", keyword, "--limit", String(opts.limit ?? 1000), "--json"];
  if (opts.type) args.push("--type", opts.type);
  if (opts.since) args.push("--since", opts.since);
  if (opts.until) args.push("--until", opts.until);
  if (opts.in) args.push("--in", opts.in);
  const out = await runWx(args, 120_000);
  const data = parseJsonLoose<{ results: RawMessage[] }>(out);
  return data.results ?? [];
}

export function classifyChatType(raw: ChatTypeRaw, isGroup: boolean): "private" | "group" | "official" | "folded" | "other" {
  if (raw === "group" || isGroup) return "group";
  if (raw === "official_account") return "official";
  if (raw === "folded") return "folded";
  if (raw === "private") return "private";
  return "other";
}
