import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const API_TOKEN = process.env.API_TOKEN ?? "";

/** Server-side proxy to the API. Keeps the API token out of the browser. */
async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = `${API_URL}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  if (API_TOKEN) headers["authorization"] = `Bearer ${API_TOKEN}`;
  const hasBody = !["GET", "HEAD"].includes(req.method);
  try {
    const res = await fetch(url, { method: req.method, headers, body: hasBody ? await req.text() : undefined, cache: "no-store" });
    return new NextResponse(res.status === 204 ? null : await res.text(), { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } });
  } catch {
    return NextResponse.json({ error: "The PulseCheck API is unreachable." }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
