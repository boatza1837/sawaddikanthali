import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({actor:vi.fn(),gate:vi.fn(),adjust:vi.fn(),find:vi.fn()}));
vi.mock("@/auth",()=>({auth:vi.fn()}));
vi.mock("@/lib/http",async original=>({...await original<typeof import("@/lib/http")>(),actor:mocks.actor}));
vi.mock("@/modules/admin",()=>({requireAdmin:mocks.gate,enroll:vi.fn(),verifyMfa:vi.fn(),mfaStatus:vi.fn()}));
vi.mock("@/modules/adjustments",()=>({adjustWallet:mocks.adjust}));
vi.mock("@/lib/db",()=>({db:{user:{findUnique:mocks.find}}}));
import { POST, GET } from "@/app/api/admin/[...action]/route";
import { DomainError } from "@/lib/errors";
const data={memberId:"member",direction:"CREDIT",amount:100,reason:"Approved manual correction",key:"233b5318-d557-4ad5-bfa6-061380a3a0ef",expectedBalance:0};
const post=(body:unknown)=>new Request("https://canteen.example/api/admin/adjust",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();mocks.actor.mockResolvedValue({id:"actual-admin",role:"ADMIN",status:"ACTIVE"});mocks.gate.mockResolvedValue(undefined);mocks.adjust.mockResolvedValue({transactionId:"adjustment"});});
it("does not read balances or adjust money without recent independent Admin MFA",async()=>{
 mocks.gate.mockRejectedValue(new DomainError("ADMIN_MFA_REQUIRED",403));
 expect((await POST(post(data))).status).toBe(403);
 expect((await GET(new Request("https://canteen.example/api/admin/wallet?memberId=member"))).status).toBe(403);
 expect(mocks.adjust).not.toHaveBeenCalled();expect(mocks.find).not.toHaveBeenCalled();
});
it("binds financial actor to the authenticated administrator and rejects spoofed actor IDs",async()=>{
 expect((await POST(post({...data,actorId:"someone-else"}))).status).toBe(400);
 expect(mocks.adjust).not.toHaveBeenCalled();
 expect((await POST(post(data))).status).toBe(200);
 expect(mocks.adjust).toHaveBeenCalledWith({...data,actorId:"actual-admin"});
});
