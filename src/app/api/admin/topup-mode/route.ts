import {z} from "zod";
import {api,actor} from "@/lib/http";
import {requireAdmin} from "@/modules/admin";
import {db} from "@/lib/db";
import {topupMode,listenerOnline} from "@/modules/connext";
import {ensure} from "@/lib/errors";
export const GET=api(async req=>{const user=await actor(req);await requireAdmin(user);return {mode:await topupMode(),online:await listenerOnline(),lineAuth:"NOT_CHECKED",health:await db.connextHealth.findUnique({where:{id:"primary"},select:{status:true,reason:true,lastHeartbeat:true}}),alertReview:await db.connextAlert.count({where:{status:"REVIEW"}}),pending:await db.connextJob.count({where:{status:"PENDING"}}),review:await db.connextJob.count({where:{status:"REVIEW"}})};});
export const POST=api(async req=>{const user=await actor(req);await requireAdmin(user);const data=z.union([z.object({mode:z.enum(["slip2go","connext"])}).strict(),z.object({retryQueue:z.literal(true)}).strict()]).parse(await req.json());
 if("retryQueue" in data){const result=await db.$transaction(async tx=>{const changed=await tx.connextJob.updateMany({where:{status:"REVIEW"},data:{status:"PENDING",attempts:0,availableAt:new Date()}});await tx.auditLog.create({data:{actorId:user.id,action:"CONNEXT_QUEUE_RETRY",targetId:"connext-queue",detail:JSON.stringify({count:changed.count})}});return changed;});return {retried:result.count};}
 const {mode}=data;if(mode==="connext")ensure(await listenerOnline(),"CONNEXT_OFFLINE",503);await db.auditLog.create({data:{actorId:user.id,action:"TOPUP_MODE_CHANGED",targetId:"topup-provider",detail:mode}});return {mode};});
