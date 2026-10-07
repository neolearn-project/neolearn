import test from "node:test";
import assert from "node:assert/strict";
import { createSynchronousMutationLock, createTextbookAdminRequestGuard } from "../app/lib/textbookAdminRequestGuard.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("a deferred older detail response cannot replace a newer source selection", async () => {
  const guard=createTextbookAdminRequestGuard(),older=deferred(),newer=deferred();
  const oldTicket=guard.beginDetail("source-a");
  const newTicket=guard.beginDetail("source-b");
  newer.resolve({id:"source-b",identity:"source-b:v1:r1:bbb"});
  const newResponse=await newer.promise;
  assert.equal(guard.acceptDetail(newTicket,newResponse.id),true);
  guard.select(newResponse.identity);
  older.resolve({id:"source-a",identity:"source-a:v1:r1:aaa"});
  const oldResponse=await older.promise;
  assert.equal(guard.acceptDetail(oldTicket,oldResponse.id),false);
  assert.equal(guard.currentIdentity(),"source-b:v1:r1:bbb");
});

test("a deferred page-review response cannot update a different source", async () => {
  const guard=createTextbookAdminRequestGuard(),review=deferred();
  guard.select("source-a:v1:r1:aaa");
  const ticket=guard.begin("mutation");
  guard.select("source-b:v1:r1:bbb");
  review.resolve({ok:true,pageNumber:4});
  await review.promise;
  assert.equal(guard.accept(ticket),false);
});

test("a deferred suggestion response cannot populate another source", async () => {
  const guard=createTextbookAdminRequestGuard(),suggestion=deferred();
  guard.select("source-a:v1:r1:aaa");
  const ticket=guard.begin("suggestion");
  guard.select("source-b:v1:r1:bbb");
  suggestion.resolve({suggestions:[{topicId:30}]});
  await suggestion.promise;
  assert.equal(guard.accept(ticket),false);
});

test("newer same-source request generations supersede older responses", async () => {
  const guard=createTextbookAdminRequestGuard(),older=deferred(),newer=deferred();
  guard.select("source-a:v1:r1:aaa");
  const oldTicket=guard.begin("suggestion"),newTicket=guard.begin("suggestion");
  newer.resolve({ok:true});await newer.promise;
  assert.equal(guard.accept(newTicket),true);
  older.resolve({ok:true});await older.promise;
  assert.equal(guard.accept(oldTicket),false);
});

test("starting a mutation invalidates an already pending source switch", async () => {
  const guard=createTextbookAdminRequestGuard(),detail=deferred();
  guard.select("source-a:v1:r1:aaa");
  const detailTicket=guard.beginDetail("source-b");
  const mutationTicket=guard.begin("mutation");
  detail.resolve({id:"source-b"});
  const response=await detail.promise;
  assert.equal(guard.acceptDetail(detailTicket,response.id),false);
  assert.equal(guard.accept(mutationTicket),true);
});

test("synchronous mutation ownership prevents double-click mutation starts", () => {
  const lock=createSynchronousMutationLock();
  const first=lock.acquire(),second=lock.acquire();
  assert.ok(first);
  assert.equal(second,null);
  assert.equal(lock.release(Symbol("not-owner")),false);
  assert.equal(lock.isLocked(),true);
  assert.equal(lock.release(first),true);
  assert.equal(lock.isLocked(),false);
  assert.ok(lock.acquire());
});

test("network and JSON failures release the originating mutation lock", async () => {
  for(const failure of [new Error("network failed"),new SyntaxError("invalid JSON")]){
    const lock=createSynchronousMutationLock(),owner=lock.acquire();
    let reported="";
    try{
      await Promise.reject(failure);
    }catch(error){
      reported=error.message;
    }finally{
      assert.equal(lock.release(owner),true);
    }
    assert.equal(reported,failure.message);
    assert.equal(lock.isLocked(),false);
    assert.ok(lock.acquire());
  }
});
