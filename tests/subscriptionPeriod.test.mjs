import test from "node:test";
import assert from "node:assert/strict";
import { isPaidSubscriptionActive } from "../lib/access/subscriptionPeriod.mjs";

const now = "2026-09-17T12:00:00.000Z";
const paid = {
  is_active: true,
  payment_status: "paid",
  start_at: "2026-09-17T11:00:00.000Z",
  end_at: "2026-09-17T13:00:00.000Z",
};

test("future subscription is rejected", () => {
  assert.equal(
    isPaidSubscriptionActive({ ...paid, start_at: "2026-09-17T12:00:00.001Z" }, now),
    false
  );
});

test("expired subscription is rejected", () => {
  assert.equal(
    isPaidSubscriptionActive({ ...paid, end_at: "2026-09-17T11:59:59.999Z" }, now),
    false
  );
});

test("exact start boundary is accepted", () => {
  assert.equal(isPaidSubscriptionActive({ ...paid, start_at: now }, now), true);
});

test("exact end boundary is rejected", () => {
  assert.equal(isPaidSubscriptionActive({ ...paid, end_at: now }, now), false);
});
