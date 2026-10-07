export function createTextbookAdminRequestGuard() {
  let desiredSourceId = null;
  let currentIdentity = null;
  let detailGeneration = 0;
  const generations = { suggestion: 0, mutation: 0 };

  return {
    beginDetail(sourceId) {
      desiredSourceId = String(sourceId);
      return { kind: "detail", generation: ++detailGeneration, sourceId: desiredSourceId };
    },
    acceptDetail(ticket, responseSourceId) {
      return ticket?.kind === "detail" && ticket.generation === detailGeneration &&
        ticket.sourceId === desiredSourceId && ticket.sourceId === String(responseSourceId);
    },
    select(identity) {
      currentIdentity = identity || null;
    },
    begin(kind) {
      if (!(kind in generations) || !currentIdentity) return null;
      if (kind === "mutation") {
        detailGeneration += 1;
        desiredSourceId = null;
      }
      return { kind, generation: ++generations[kind], identity: currentIdentity };
    },
    accept(ticket) {
      return Boolean(ticket && ticket.kind in generations && ticket.generation === generations[ticket.kind] &&
        ticket.identity === currentIdentity);
    },
    isLatest(ticket) {
      return Boolean(ticket && ticket.kind in generations && ticket.generation === generations[ticket.kind]);
    },
    currentIdentity() {
      return currentIdentity;
    },
  };
}

export function createSynchronousMutationLock() {
  let owner = null;
  return {
    acquire() { if (owner) return null; owner = Symbol("textbook-mutation-owner"); return owner; },
    release(candidate) { if (!candidate || candidate !== owner) return false; owner = null; return true; },
    owns(candidate) { return Boolean(candidate && candidate === owner); },
    isLocked() { return owner !== null; },
  };
}
