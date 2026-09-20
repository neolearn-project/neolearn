export const AI_CREDIT_SHADOW_RPC_TIMEOUT_MS = 1500;

export function createAiCreditShadowRuntime({
  supabaseAdmin,
  timeoutMs = AI_CREDIT_SHADOW_RPC_TIMEOUT_MS,
}) {
  async function invoke(run) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await run(controller.signal);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async reserve(ledgerId) {
      const result = await invoke(async (signal) => {
        const query = supabaseAdmin().rpc("reserve_ai_credit_shadow", {
          p_ai_usage_ledger_id: ledgerId,
          p_ttl_seconds: 900,
        });
        return query.abortSignal(signal);
      });
      const reservationId = result?.data?.reservation_id;
      const canonicalUuid = typeof reservationId === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(reservationId);
      return result?.error || result?.data?.ok !== true || !canonicalUuid
        ? null
        : { id: reservationId };
    },

    async settle(reservationId) {
      const result = await invoke(async (signal) => {
        const query = supabaseAdmin().rpc("settle_ai_credit_shadow", {
          p_reservation_id: reservationId,
        });
        return query.abortSignal(signal);
      });
      return result?.data?.ok === true && !result.error;
    },

    async release(reservationId, reason) {
      const result = await invoke(async (signal) => {
        const query = supabaseAdmin().rpc("release_ai_credit_shadow", {
          p_reservation_id: reservationId,
          p_reason: reason,
        });
        return query.abortSignal(signal);
      });
      return result?.data?.ok === true && !result.error;
    },
  };
}
