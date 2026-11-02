import {z} from "zod";
import {Redis} from "@upstash/redis";
import {redisConnection} from "@/lib/redis";
import {api,actor} from "@/lib/http";
import {ensure} from "@/lib/errors";
import {secret,validSignature} from "@/lib/security";
import {createConnext,acceptConnext,topupMode,listenerOnline} from "@/modules/connext";
export const dynamic="force-dynamic";
export const GET=api(async req=>{await actor(req);return {mode:await topupMode(),online:await listenerOnline()};});
export const POST=api(async req=>{
 if(req.headers.has("x-connext-signature")){
  ensure(Number(req.headers.get("content-length")??99999)<8192,"BODY_TOO_LARGE",413);
  const body=await req.text();ensure(body.length<8192,"BODY_TOO_LARGE",413);
  ensure(validSignature(body,req.headers.get("x-connext-signature"),secret("CONNEXT_AGENT_SECRET")),"INVALID_SIGNATURE",401);
  const data=z.object({sentAt:z.number().int(),text:z.string().max(2000).optional()}).strict().parse(JSON.parse(body));
  ensure(Math.abs(Date.now()-data.sentAt)<60000,"STALE_AGENT_REQUEST",409);
  if(!data.text){await new Redis(redisConnection()).set("canteen:connext:alive",true,{ex:45});return {alive:true};}
  return acceptConnext(data.text);
 }
 const user=await actor(req);const data=z.object({amount:z.number().int().positive().max(999900),key:z.string().uuid()}).strict().parse(await req.json());return createConnext(user.id,data.amount,data.key);
});
