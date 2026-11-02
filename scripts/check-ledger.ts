import dotenv from "dotenv";
dotenv.config({path:".env.production.local",override:true,quiet:true});
const {db}=await import("../src/lib/db");
try{
 const rows=await db.$queryRaw<Array<{wallets:bigint;mismatches:bigint;balance:bigint}>>`
 SELECT count(*) AS wallets, count(*) FILTER (WHERE balance<>posted) AS mismatches,coalesce(sum(balance),0)::bigint AS balance
 FROM (SELECT w.id,w.balance,coalesce(sum(CASE WHEN e.side='CREDIT' THEN e.amount ELSE -e.amount END),0) AS posted FROM "Wallet" w LEFT JOIN "LedgerEntry" e ON e."walletId"=w.id GROUP BY w.id,w.balance) s`;
 const missing=await db.$queryRaw<Array<{count:bigint}>>`SELECT count(*) AS count FROM "TopupIntent" i WHERE i.status='PAID' AND NOT EXISTS (SELECT 1 FROM "LedgerTransaction" l WHERE l.reference=i.id AND l.kind='TOPUP')`;
 const pending=await db.topupIntent.groupBy({by:["provider","status"],_count:true});
 console.log(JSON.stringify({wallets:String(rows[0].wallets),ledgerMismatches:String(rows[0].mismatches),totalBalanceSatang:String(rows[0].balance),paidWithoutLedger:String(missing[0].count),topups:pending}));
}finally{await db.$disconnect();}
