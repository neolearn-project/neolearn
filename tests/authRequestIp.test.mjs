import test from "node:test";
import assert from "node:assert/strict";
import { authRequestIp } from "../app/lib/authRequestIp.mjs";

test("Vercel OTP rate limits use the platform IP and ignore a spoofed Cloudflare header", () => {
  const req = new Request("https://example.test", { headers: {
    "x-vercel-forwarded-for": "192.0.2.4", "cf-connecting-ip": "198.51.100.9",
  }});
  assert.equal(authRequestIp(req, {VERCEL:"1"}), "192.0.2.4");
  assert.equal(authRequestIp(req, {}), "198.51.100.9");
  for (const value of ["192.0.2.4, 198.51.100.9", "not-an-ip", ""]) {
    assert.equal(authRequestIp(new Request("https://example.test", {headers:{"x-vercel-forwarded-for":value}}), {VERCEL:"1"}), "unavailable");
  }
  assert.equal(authRequestIp(new Request("https://example.test", {headers:{"x-vercel-forwarded-for":"2001:db8::1"}}), {VERCEL:"1"}), "2001:db8::1");
});
