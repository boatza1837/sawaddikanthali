import {z} from "zod";
import {api,actor} from "@/lib/http";
import {requireAdmin} from "@/modules/admin";
import {db} from "@/lib/db";
import {topupMode,listenerOnline} from "@/modules/connext";
import {ensure} from "@/lib/errors";
export const GET=api(async req=>{const user=await actor(req);await requireAdmin(user);return {mode:await topupMode(),online:await listenerOnline()};});
export const POST=api(async req=>{const user=await actor(req);await requireAdmin(user);const {mode}=z.object({mode:z.enum(["slip2go","connext"])}).strict().parse(await req.json());if(mode==="connext")ensure(await listenerOnline(),"CONNEXT_OFFLINE",503);await db.auditLog.create({data:{actorId:user.id,action:"TOPUP_MODE_CHANGED",targetId:"topup-provider",detail:mode}});return {mode};});
