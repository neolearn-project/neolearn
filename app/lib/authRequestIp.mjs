import { isIP } from "node:net";

// Vercel overwrites its forwarded header at the edge. Do not let a client
// supplied Cloudflare header override it on the Vercel deployment.
export function authRequestIp(request, env = process.env) {
  const header = env.VERCEL === "1" ? "x-vercel-forwarded-for" : "cf-connecting-ip";
  const value = (request.headers.get(header) || "").trim();
  return isIP(value) ? value : "unavailable";
}
