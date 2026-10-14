import { randomUUID } from "node:crypto";
import { mkdir,rename,writeFile } from "node:fs/promises";
import path from "node:path";
import { buildTextbookEvidenceBlocks } from "./textbookAiMapping.mjs";

export const TEXTBOOK_AI_CAPTURE_DIR=path.join(".local-diagnostics","textbook-ai-mapping");

export function isLocalTextbookAiCaptureEnabled(env=process.env) {
  return env.NEOLEARN_LOCAL_TEXTBOOK_AI_CAPTURE==="1"&&!env.VERCEL;
}

export async function captureLocalTextbookAiEvidenceFailure({source,pages,proposals,rejectionCode},options={}) {
  if(!isLocalTextbookAiCaptureEnabled(options.env))return {captured:false};
  const root=path.resolve(options.cwd||process.cwd(),TEXTBOOK_AI_CAPTURE_DIR);await mkdir(root,{recursive:true});
  const safeSource=String(source?.id||"unknown").replace(/[^a-zA-Z0-9-]/g,"_");
  const name=`${safeSource}-v${Number(source?.version)||0}-r${Number(source?.processing_revision)||0}-${Date.now()}-${randomUUID()}.json`;
  const target=path.join(root,name),temporary=`${target}.tmp`;
  const payload={captureVersion:2,captureFilename:name,capturedAt:new Date().toISOString(),rejectionCode:String(rejectionCode||""),source:{id:String(source?.id||""),version:Number(source?.version)||0,sha256:String(source?.sha256||""),processingRevision:Number(source?.processing_revision)||0,pageCount:Number(source?.page_count)||0},pages:(pages||[]).map(page=>({pageNumber:page.page_number,text:String(page.extracted_text||"")})),proposals};
  await writeFile(temporary,JSON.stringify(payload,null,2),{encoding:"utf8",flag:"wx"});await rename(temporary,target);return {captured:true,path:target};
}

export function analyzeCapturedEvidence(capture,options={}) {
  const blocks=new Map(buildTextbookEvidenceBlocks(capture?.pages||[]).flatMap(page=>page.blocks.map(block=>[block.id,{...block,pageNumber:page.pageNumber}]))),failures=[];
  const proposals=Array.isArray(capture?.proposals?.proposals)?capture.proposals.proposals:[],unresolvedTopicIds=Array.isArray(capture?.proposals?.unresolvedTopicIds)?capture.proposals.unresolvedTopicIds:[];
  const proposalOccurrences=new Map(),unresolvedOccurrences=new Map();
  proposals.forEach((proposal,index)=>{const indexes=proposalOccurrences.get(proposal?.topicId)||[];indexes.push(index);proposalOccurrences.set(proposal?.topicId,indexes)});
  unresolvedTopicIds.forEach((topicId,index)=>{const indexes=unresolvedOccurrences.get(topicId)||[];indexes.push(index);unresolvedOccurrences.set(topicId,indexes)});
  const proposalDuplicates=[...proposalOccurrences].filter(([,indexes])=>indexes.length>1).map(([topicId,indexes])=>({topicId,count:indexes.length,indexes}));
  const unresolvedDuplicates=[...unresolvedOccurrences].filter(([,indexes])=>indexes.length>1).map(([topicId,indexes])=>({topicId,count:indexes.length,indexes}));
  const proposalUnresolvedOverlap=[...proposalOccurrences].filter(([topicId])=>unresolvedOccurrences.has(topicId)).map(([topicId,proposalIndexes])=>({topicId,proposalIndexes,unresolvedIndexes:unresolvedOccurrences.get(topicId)}));
  for(const duplicate of proposalDuplicates)failures.push({...duplicate,rejection:"DUPLICATE_PROPOSAL_TOPIC"});
  for(const duplicate of unresolvedDuplicates)failures.push({...duplicate,rejection:"DUPLICATE_UNRESOLVED_TOPIC"});
  for(const overlap of proposalUnresolvedOverlap)failures.push({...overlap,rejection:"PROPOSAL_UNRESOLVED_OVERLAP"});
  for(const proposal of proposals){const evidenceIds=proposal?.evidenceIds,seen=new Set();if(!Array.isArray(evidenceIds)||evidenceIds.length<1||evidenceIds.length>5)failures.push({topicId:proposal?.topicId,chapterId:proposal?.chapterId,pageFrom:proposal?.pageFrom,pageTo:proposal?.pageTo,evidenceId:null,pageNumber:null,resolvedQuote:null,citedPageText:null,rejection:"EVIDENCE_COUNT"});
    for(const evidenceId of evidenceIds||[]){const block=blocks.get(evidenceId),duplicate=seen.has(evidenceId);seen.add(evidenceId);const rejection=duplicate?"EVIDENCE_ID_DUPLICATE":typeof evidenceId!=="string"||!block?"EVIDENCE_ID_UNKNOWN":block.pageNumber<proposal?.pageFrom||block.pageNumber>proposal?.pageTo?"EVIDENCE_ID_OUTSIDE_RANGE":!block.text.trim()?"EVIDENCE_BLOCK_EMPTY":null;
      if(rejection)failures.push({topicId:proposal?.topicId,chapterId:proposal?.chapterId,pageFrom:proposal?.pageFrom,pageTo:proposal?.pageTo,evidenceId,pageNumber:block?.pageNumber??null,resolvedQuote:block?.text??null,citedPageText:block?String((capture.pages||[]).find(page=>page.pageNumber===block.pageNumber)?.text||""):null,rejection});
    }
  }
  return {captureVersion:capture?.captureVersion,captureFilename:options.captureFilename||capture?.captureFilename||null,capturedAt:capture?.capturedAt||null,source:capture?.source,rejectionCode:capture?.rejectionCode,proposalCount:proposals.length,unresolvedCount:unresolvedTopicIds.length,proposalDuplicates,unresolvedDuplicates,proposalUnresolvedOverlap,failureCount:failures.length,failures};
}
