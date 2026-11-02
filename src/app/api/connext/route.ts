import {z} from "zod";
import {reportAgentHealth} from "@/modules/connext-health";
import {api,actor} from "@/lib/http";
import {ensure} from "@/lib/errors";
import {secret,validSignature} from "@/lib/security";
import {createConnext,acceptConnext,drainConnext,topupMode,listenerOnline} from "@/modules/connext";
export const dynamic="force-dynamic";
export const maxDuration=30;
export const GET=api(async req=>{await actor(req);await drainConnext(10);return {mode:await topupMode(),online:await listenerOnline()};});
export const POST=api(async req=>{
 if(req.headers.has("x-connext-signature")){
  ensure(Number(req.headers.get("content-length")??99999)<8192,"BODY_TOO_LARGE",413);
  const body=await req.text();ensure(body.length<8192,"BODY_TOO_LARGE",413);
  ensure(validSignature(body,req.headers.get("x-connext-signature"),secret("CONNEXT_AGENT_SECRET")),"INVALID_SIGNATURE",401);
  const data=z.object({sentAt:z.number().int(),text:z.string().max(2000).optional(),health:z.enum(["ONLINE","LINE_STOPPED","NOTIFICATIONS_DENIED","UNKNOWN"]).optional(),agentVersion:z.literal(2).optional()}).strict().parse(JSON.parse(body));
  ensure(Math.abs(Date.now()-data.sentAt)<60000,"STALE_AGENT_REQUEST",409);
  if(!data.text){ensure(data.agentVersion===2&&data.health,"AGENT_UPDATE_REQUIRED",409);const state=await reportAgentHealth(data.health,data.sentAt);await drainConnext(25);return {alive:state.status==="ONLINE",lineAuth:"NOT_CHECKED"};}
  const accepted=await acceptConnext(data.text);await drainConnext(5);return accepted;
 }
 const user=await actor(req);const data=z.object({amount:z.number().int().positive().max(999900),key:z.string().uuid()}).strict().parse(await req.json());return createConnext(user.id,data.amount,data.key);
});
