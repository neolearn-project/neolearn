import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../supabase/migrations/20260917_atomic_razorpay_finalization.sql", import.meta.url),
  "utf8"
);

test("RPC is service-role-only with fixed search_path", () => {
  assert.match(sql, /security definer\s+set search_path = pg_catalog, public/i);
  assert.match(sql, /revoke all on function[\s\S]+from authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/i);
});

test("payment row locking and unique links serialize concurrency", () => {
  assert.match(sql, /where razorpay_order_id = p_order_id\s+for update/i);
  assert.match(sql, /student_subscriptions_student_payment_id_uidx/i);
  assert.match(sql, /student_payments_razorpay_payment_id_uidx/i);
  assert.match(sql, /when unique_violation then[\s\S]+PAYMENT_CONFLICT/i);
});

test("RPC validates ownership and every provider identifier", () => {
  for (const pattern of [
    /payment_row\.student_mobile is distinct from p_student_mobile/i,
    /payment_row\.plan_code[\s\S]+p_plan_code/i,
    /payment_row\.amount::numeric \* 100\)[\s\S]+p_amount_paise::numeric/i,
    /payment_row\.currency[\s\S]+p_currency/i,
    /payment_row\.razorpay_order_id is distinct from p_order_id/i,
    /payment_row\.razorpay_payment_id[\s\S]+p_payment_id/i,
  ]) assert.match(sql, pattern);
});

test("immutable validity snapshot replaces live plan terms", () => {
  assert.match(sql, /purchase_validity_days integer/i);
  assert.match(sql, /payment_row\.purchase_validity_days/i);
  assert.doesNotMatch(sql, /from public\.plans/i);
});

test("catalog and data preflights guard existing objects", () => {
  assert.match(sql, /student_payment_id type mismatch/i);
  assert.match(sql, /billing timestamps must all be timestamptz/i);
  assert.match(sql, /unexpected FK involving student_payment_id/i);
  assert.match(sql, /student payment FK definition differs/i);
  assert.match(sql, /index % definition differs/i);
  assert.match(sql, /duplicate student_payment_id links/i);
  assert.match(sql, /orphan student_payment_id links/i);
  assert.match(sql, /unexpected finalize RPC overload/i);
  assert.match(sql, /unexpected execute ACL/i);
});

test("retry returns the existing subscription without mutating its period", () => {
  assert.match(sql, /if already_processed then\s+return pg_catalog\.jsonb_build_object/i);
  assert.doesNotMatch(sql, /set\s+start_at\s*=/i);
  assert.doesNotMatch(sql, /set\s+end_at\s*=/i);
});

test("partial claimed-payment recovery reuses claim time and an existing subscription", () => {
  assert.match(sql, /activation_start := coalesce\(payment_row\.updated_at/i);
  assert.match(sql, /student_payment_id is null[\s\S]+start_at between activation_start/i);
  assert.match(sql, /set student_payment_id = payment_row\.id/i);
});

test("payment paid and subscription activation occur in one transaction", () => {
  assert.match(sql, /^begin;/im);
  assert.match(sql, /update public\.student_subscriptions[\s\S]+update public\.student_payments/i);
  assert.match(sql, /payment_status = 'paid'/i);
  assert.match(sql, /^commit;/im);
});

test("expired recovery cannot displace a newer active subscription", () => {
  assert.match(sql, /should_activate := subscription_row\.start_at <= statement_timestamp\(\)[\s\S]+subscription_row\.end_at > statement_timestamp\(\)/i);
  assert.match(sql, /if should_activate and not already_processed and exists[\s\S]+should_activate := false/i);
  assert.match(sql, /if should_activate then\s+update public\.student_subscriptions\s+set is_active = false/i);
});

test("unclaimed payment identifiers take the initial-claim path", () => {
  assert.match(sql, /was_claimed := coalesce\(payment_row\.razorpay_payment_id = p_payment_id, false\)/i);
});
