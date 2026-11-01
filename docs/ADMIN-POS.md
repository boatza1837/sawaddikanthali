# Admin and employee POS

## Admin access
The owner chose boatza144110@gmail.com as the first administrator. The trusted operator command `node --env-file=.env.production.local --import tsx scripts/grant-admin.ts boatza144110@gmail.com` grants ADMIN only after the account completed registration. It invalidates existing sessions. No public endpoint can grant ADMIN.

Sign in again, visit /admin, select Start Authenticator enrollment, scan the QR in a TOTP app and confirm a six-digit code. Keep the displayed setup key in a password manager before confirmation. No email is sent by this flow. Real device enrollment must be completed by the account owner; automated tests are not evidence of a device test.

TOTP follows RFC 6238 (SHA1, six digits, 30 seconds, +/- one time step). Secrets use AES-256-GCM, bound to the user, with an HKDF key derived from AUTH_SECRET. Keep AUTH_SECRET stable and backed up: rotating it makes enrolled secrets unreadable and requires a planned re-enrollment. Codes cannot be reused, verification is rate limited, and successful checks create a 15-minute HttpOnly, SameSite=Strict grant bound to the current live Google session. The server checks it for every administrative read/write. Active role and same-origin checks also apply.

If the setup key and device are both lost, recovery requires a trusted database operator to revoke grants and the MFA record with an audit entry after verifying the account owner. There is deliberately no public reset or email-only bypass.

## Available administration
- All-time actual member count, net/gross sales, refunds, wallet liabilities; sales are distinct from wallet liabilities.
- Latest 50 sales, live open shifts, latest 50 immutable audit events.
- Search latest 100 matching members; assign USER/EMPLOYEE/SUPERVISOR to registered accounts or suspend/reactivate. Cannot change self/any ADMIN or activate PENDING registration. Each edit requires a reason, revokes target sessions/tokens and is audited.
- Create/update POS terminals and lock/deactivate them. Locking or deactivating closes open shifts; charge checks terminal state on the server.
- No balance editing, ledger editing, mock revenue, payment-provider configuration or ADMIN privilege grant in the UI.

## POS
An ACTIVE EMPLOYEE, SUPERVISOR or ADMIN visits /pos. Admins can act as cashiers through their own open shift; administrative management still requires independent MFA. Open the terminal configured by Admin. A refresh restores the staff member's own open shift. Set the manual amount, confirm it, read a member QR using a USB keyboard scanner or paste its token, check the member/balance, then confirm. Camera QR scanning is available with front/back switching and local image decoding; RFID is not integrated.

Charges use integer satang, serializable database transactions, conditional debit, immutable double-entry ledger and a single-use expiring token. A pending browser request is retained in sessionStorage with its original idempotency key. Never start a new charge after an unknown network result; retry the saved request and reconcile history. Recovery across closed tabs/devices or cleared storage still needs operator reconciliation.

SUPERVISOR has a refund form: original POS sale ID, amount and reason. Server refuses over-refunds and unauthorized employees. Same-tab pending refunds also retain their exact request/key for safe retry. Refunds credit only the original member wallet, not an external bank account. Employee refund-request/approval queues are not implemented.

## Mobile home screen
/manifest.webmanifest and local PNG icons provide a standalone app entry. Source icon is public/icons/app-icon.svg. Signed-in visits to / redirect server-side to /wallet; incomplete registration still appears at /wallet. Browser-supported install prompts are used when available; otherwise the button gives Safari/Chrome Add to Home Screen instructions. No offline balance/payment cache or service worker is used. Network is required; installation availability depends on the browser.

## Release limits
Production PromptPay is still unavailable. These pages do not enable money topups or establish bank settlement support. Real account/device, mobile installation, camera/hardware scanning and operational recovery need owner/device acceptance checks.

## Live local preview

Standard pnpm dev uses the local .env database. pnpm dev:online explicitly loads private .env.production.local credentials and connects to real online project records with localhost origin and hot reload. All Admin/POS writes in this mode affect those records; it is not a mock preview. Sandbox topups remain disabled. Never commit .env.production.local. Google OAuth client must allow http://localhost:3000/api/auth/callback/google.

## Camera QR scanner

After opening a shift, confirming the amount automatically opens the camera scanner. Allow camera access on the first use. The camera button remains available to rescan after manual closure or an invalid/expired QR. Rear camera is preferred; front/rear switching is available. jsQR is loaded on demand; video is decoded in a local canvas without storing or uploading images. Only the opaque member-token format is accepted; QR links are never opened. Successful scans stop the camera and call the existing authenticated identify API, which checks token expiry/use and member status. The employee still verifies the preview and explicitly confirms the charge. Scanning alone never debits a wallet.

Tracks are stopped on cancellation, scan success, hidden tab, disabled controls and unmount, including late permission resolution. Denied permission, missing/busy cameras and unsupported browsers have visible messages; USB/manual input remains available. A secure browser context is required (HTTPS or localhost; a phone visiting a computer LAN HTTP address is insufficient). Decoder tests use a generated QR image, not a real camera. Front/back selection is a browser preference; actual mobile devices and camera permissions still require an owner acceptance test.
