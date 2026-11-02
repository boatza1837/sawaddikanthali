import {Redis} from "@upstash/redis";
import {redisConnection} from "@/lib/redis";
import {api} from "@/lib/http";
import {checkAgentHealth} from "@/modules/connext-health";
export const dynamic="force-dynamic";
export const maxDuration=30;
// Public external watchdog trigger; no caller-supplied state, recipient or text.
export const GET=api(async()=>{
 const lock=await new Redis(redisConnection()).set("canteen:connext:health-check",true,{nx:true,ex:30});
 if(!lock)return {checked:false};
 const state=await checkAgentHealth();return {checked:true,online:state.status==="ONLINE"};
});
