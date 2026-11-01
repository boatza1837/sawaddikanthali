import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  renderOtpEmailHtml,
  emailConfigured,
  sendVerificationEmail,
} from "../src/modules/email";
beforeEach(() => {
  vi.stubEnv("EMAIL_PROVIDER", "brevo");
  vi.stubEnv("BREVO_API_KEY", "test-key-not-a-real-credential");
  vi.stubEnv("BREVO_SENDER_EMAIL", "sender@example.test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Brevo delivery boundary", () => {
  it("sends through HTTPS with configured sender and accepts only provider acknowledgement", async () => {
    const mocked = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messageId: "test-message" }), {
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", mocked);
    await sendVerificationEmail("member@example.test", "123456");
    expect(mocked).toHaveBeenCalledOnce();
    const [url, options] = mocked.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    const body = JSON.parse(options.body);
    expect(body.sender.email).toBe("sender@example.test");
    expect(body.to).toEqual([{ email: "member@example.test" }]);
    expect(body.textContent).toContain("123456");
    expect(body.htmlContent).toBeDefined();
    expect(body.htmlContent).toContain("123456");
    expect(body.htmlContent).toContain("SMART CANTEEN");
  });
  it("rejects provider errors without leaking response details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "private-provider-detail" }), {
          status: 403,
        }),
      ),
    );
    await expect(
      sendVerificationEmail("member@example.test", "123456"),
    ).rejects.toThrow("EMAIL_DELIVERY_FAILED");
  });
  it("does not call a provider with missing credentials", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    const mocked = vi.fn();
    vi.stubGlobal("fetch", mocked);
    expect(emailConfigured()).toBe(false);
    await expect(
      sendVerificationEmail("member@example.test", "123456"),
    ).rejects.toThrow("EMAIL_NOT_CONFIGURED");
    expect(mocked).not.toHaveBeenCalled();
  });
  it("does not silently claim success on an empty acknowledgement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    await expect(
      sendVerificationEmail("member@example.test", "123456"),
    ).rejects.toThrow("EMAIL_DELIVERY_FAILED");
  });
});

it("rejects markup before OTP HTML interpolation", () => {
  expect(() => renderOtpEmailHtml("<img src=x onerror=alert(1)>")).toThrow(
    "INVALID_OTP_FORMAT",
  );
  expect(() => renderOtpEmailHtml("12345")).toThrow("INVALID_OTP_FORMAT");
});
