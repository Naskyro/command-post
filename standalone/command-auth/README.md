# Independent Command sign-in gateway

This is the credential service for a separately hosted Command installation. An employee uses a username and password. No personal/work email, ChatGPT account, customer account, or owner role is required. It is **not** an alternative entrance to a managed ChatGPT Site. Nothing in this directory runs in the hosted application. Do not configure this proxy to point at a managed Site. There are no default accounts, passwords, public registration, or public administrative endpoints.

## Deployment boundaries

```
Employee browser → public HTTPS ingress → 127.0.0.1:4100 (login and application proxy)
                                            ↓ authenticated, fixed private upstream
                                      independently hosted Command backend
                                            ↓ authorized server-side calls only
internal HTTPS ingress (mTLS/ACL) → 127.0.0.1:4101 (issue link / credential lifecycle)
```

Two ports, two services of trust, two different secrets. Terminate public TLS at a trusted reverse proxy; send **all** public paths solely to port 4100. Never publish 4101 or the Command backend. In particular, do not add a public path rewrite or alternate hostname which opens the internal listener. Keep the credential database on a persistent, private local volume; the SQLite WAL provider is for a single trust domain, not independent writers on shared network storage. Back up with SQLite's supported online backup or stop the service for an offline consistent backup. Encrypt and restrict backups and the host volume: hashes and recovery history are sensitive. Run as a dedicated operating-system user with a private data directory (0700), backup/restore privileges separate from normal application administration.

The independent backend must enable its trusted-gateway identity adapter, check the injected `x-command-gateway-key`, and resolve `x-command-person-id` to **exactly one existing roster primary key** on every protected request. The roster controls active/onboarding/deactivated status, module grants, delegation, and owner decisions. A credential is not a grant. Do not trust a browser, reverse-DNS name, forwarded email, display name, or username as an application identity. Do not map unrecognized users to an existing owner. Do not expose secondary backend listeners or skip backend authorization because a browser can sign in. The callback `/api/internal/command/check-reset` is its own private authenticated server operation (both secrets, no employee identity). All other unknown/no-identity requests fail closed.

The proxy chooses a **single configured private origin**; it never accepts a request-supplied destination. Send only to your private Command service. Safe headers are positively selected; browser identity, `Authorization`, `x-forwarded-*`, and `oai-*` are discarded. The gateway fixes Host, forwarded host/protocol, and validated Origin to the canonical public origin. Configure the backend's trusted reverse-proxy integration so the URL it constructs has the same HTTPS origin as the employee's browser. Trust `x-command-read-only` only as a signal to **restrict** access. An existing `__Host-command-view` scope marker and `cp_*` application cookies can pass through; malformed or duplicate scope markers remain invalid rather than disappearing. Gateway password-reset, session, and form cookies never go upstream.

## Run locally for implementation testing

Use Node.js 22.13+ with `node:sqlite` (Node 24.22.1 tested) and a local filesystem. No NPM install or third-party dependency is required. From the repository root:

```sh
node --test standalone/command-auth/gateway.test.mjs
```

This starts isolated loopback services and uses synthetic data, a temporary SQLite file, mocked eligibility decisions, and test-only secrets. It does not connect to any live account. Manual browser testing requires a TLS endpoint: the service **does not** weaken `Secure` cookies for HTTP. Use a trusted development certificate and a real local HTTPS hostname. Do not disable certificate verification.

## Configure and start the service

| Environment variable | Required value |
| --- | --- |
| `COMMAND_PUBLIC_ORIGIN` | Exact external `https://` origin of independently hosted Command, e.g. `https://command.example.org`. No path, query, fragment, or embedded credentials. |
| `COMMAND_UPSTREAM_ORIGIN` | Private Command service origin, e.g. `https://command-app.services.internal`. Loopback such as `http://127.0.0.1:3000` can use HTTP on the **same trusted host**. Remote private service transport must use TLS. Accepts private IP/private DNS names under `.internal` or `.svc.cluster.local`; DNS/TLS must also be secured. `COMMAND_PRIVATE_UPSTREAM` is a compatibility alias. |
| `COMMAND_AUTH_DB` | Absolute persistent SQLite path in an existing private directory. Startup creates the schema, never an admin, role, or roster row. |
| `COMMAND_AUTH_INTERNAL_SECRET` | A random secret of at least 32 bytes encoded as hex. Used by the Command administrator adapter on the private control-plane listener and as one half of callback authentication. |
| `COMMAND_AUTH_GATEWAY_SECRET` | A **different** random hex secret of at least 32 bytes. Used for trusted upstream identity and the eligibility callback. |
| `COMMAND_AUTH_PUBLIC_PORT` / `COMMAND_AUTH_INTERNAL_PORT` | Optional loopback ports, defaults `4100` and `4101` respectively; they must differ. |
| `COMMAND_AUTH_TRUST_LOCAL_PROXY_IP` | Optional, default false. Set `true` only when the local ingress overwrites `X-Command-Client-IP` with the actual client IP on **every** request and prevents other clients reaching the listener. Otherwise IP rate limiting uses the socket's peer; a proxy can share one bucket for all employees. |

Configure the **Command application adapter** with `COMMAND_AUTH_INTERNAL_URL` pointing to the private HTTPS control-plane origin, plus the same two appropriate secrets. The public and internal origins are different. The trusted workers operating the credential service and Command both need to agree on the issuer/subject roster identifier in the callback.

Example service commands (load secrets from your secret manager before starting):

```sh
umask 077
install -d -m 0700 /var/lib/command-auth
node standalone/command-auth/server.mjs
```

For new secrets use two independent outputs of `openssl rand -hex 32`, store each in a secret manager, and inject them into the applicable services. Never place values in source control or an employee-accessible settings table. Configure the public proxy, CDN, APM, traces, and any third-party logs to **omit the entire query string on `/auth/reset`**; also suppress request bodies, passwords, cookies, authorization headers, reset API response bodies, and raw reset URLs. Do not cache `/auth/*`, the control plane, or authenticated pages at a shared edge. Exclude credential forms from analytics/session replay. Distribute a link only to the verified employee using an approved private channel; avoid group chat, tickets that many people can see, URL shorteners, or public link scanners. Strict same-origin POST checks require `Origin` to be preserved, not fabricated from client input.

## First sign-in and forgotten passwords

1. An already authorized administrator selects an existing roster employee, records the reason and requests a one-use link from the private service. The application must validate issuer authority and subject eligibility **before** this request. Provisioning an account can supply an optional unique username. The gateway never creates a Command roster or assigns permissions. For a new credential without a username the safe lowercase roster ID is used; an ID with incompatible symbols receives a stable `staff-…` username. The response shows the actual username. Existing usernames remain unchanged on reset; duplicate proposed usernames are rejected. Reset never reenables a deactivated credential.
2. The employee opens the link within **30 minutes**, including outside an email workflow. A GET validates the link but does not consume it. A short-lived host-only recovery cookie lets the browser remove the secret from its address bar before showing the password form. The page shows the username and asks for a passphrase twice; 15 characters minimum, 512 UTF-8 bytes maximum. No password is sent in the link.
3. On submission the service calls Command's private eligibility callback with the original issuing actor and actual subject. An ineligible response, error, timeout, malformed response or redirect does not change the password. An expired or superseded secret cannot succeed. The local transaction consumes the approved link once and revokes all prior sessions. The employee then signs in normally.
4. A newly issued link supersedes any previous link. An existing signed-in employee can change their own password at `/auth/password` using their current password; saving revokes **all** sessions and pending links. Signing out ends the current session. Individual gateway sessions expire at 12 hours absolute or one hour idle, whichever comes first. The employee may complete apps' authenticated OAuth top-level GET returns with a `SameSite=Lax` session cookie. Forms use an independent `SameSite=Strict` nonce cookie and exact `Origin` validation; operating-system/browser timeouts or stale forms may require reopening the page.

There is no public “find a user,” shared temporary password, persistent admin backdoor, or promise of email delivery. On the public listener `/internal/*` and `/api/internal/*` are rejected even as encoded aliases. The authentication gateway protects the upstream; a private credential API is **not** exposed for public software that merely knows a roster ID. Keep request sizes bounded and add a real edge rate limiter in addition to the durable per-IP and per-username limits and two-concurrent-derivation cap in this reference. Password verifiers use salted scrypt (`N=131072, r=8, p=1`); only hashes of high-entropy reset and session tokens are stored. The `events` table records administrative issuance/revocation and employee sign-in/logout/password changes without logging secret material. Credential history is not an employee discipline report.

## Private API contract

Every operation is `POST` with `Authorization: Bearer <COMMAND_AUTH_INTERNAL_SECRET>`, JSON content type, an authenticated **private** network path and TLS if the caller isn't on the same trusted host. Bearer possession authenticates Command's control plane; it does not replace the application's per-actor checks.

| Endpoint | Request | Success / restrictions |
| --- | --- | --- |
| `/internal/command/reset` | `{personId,actorId,reason,username?}` | `200 {resetUrl,username,expiresAt}`. Expiration is UTC ISO 8601. `409` for disabled credential or conflicting new username. This is the **only** response ever revealing the raw one-use secret. |
| `/internal/command/deactivate` | `{personId,operationId,version,actorId?,reason?}` | `200 {ok:true}`. Stores disabled state even if no credential exists, wipes any verifier, pending reset and sessions. |
| `/internal/command/reactivate` | Same versioned schema | `200 {ok:true}`. Removes disabled state; leaves credential passwordless until a **newly approved** setup link succeeds. |

Lifecycle version is a positive monotonically increasing **roster** version per person. Retry exactly the same operation ID, version, and requested status. Older versions and duplicate deliveries are harmless successes, including after a user sets a new password. A different operation at the same version is a conflict (`409`); resolve the application outbox ordering instead of skipping it. If actor/reason are unavailable from a background retry, the provider records `command-lifecycle` and the operation ID. Roster deactivation must deny application access immediately, also dispatching and retrying credential deactivation; a gateway credential never overrides an inactive roster row.

Private callback in **the opposite direction**: `POST {COMMAND_UPSTREAM_ORIGIN}/api/internal/command/check-reset`, with both `Authorization: Bearer <COMMAND_AUTH_INTERNAL_SECRET>` and `x-command-gateway-key: <COMMAND_AUTH_GATEWAY_SECRET>`, body `{actorId,personId}`. Only a successful JSON `{eligible:true}` permits redemption. Do not accept a claimed authorized actor from a browser; do not send the token or password to this endpoint. Restricted owner/peer resets follow the application's current hierarchy, including promotions after issuing a link.

## First verified administrator and last-owner recovery

There is intentionally no web bootstrap operation. Before first use, **verify the target's pre-existing roster ID and status through an authoritative roster record**, confirm the intended username, and verify the person's identity out-of-band under your company's approval process. Confirm the appropriate administrative/owner permissions already exist in Command; the CLI cannot supply them. Never pick a target by guessing a display name or letting an incoming request dictate the first owner. Store the ticket/authorization with appropriate access. The credential DB must already exist (start the service once). Perform this procedure from an operator-only console as the credential service OS account, preferably during a maintenance window.

```sh
node standalone/command-auth/operator.mjs bootstrap \
  --person=EXISTING_ROSTER_ID --verified-roster=EXISTING_ROSTER_ID \
  --username=APPROVED_LOGIN --actor=VERIFIED_OPERATOR_ID \
  --reason='Approved first sign-in; ticket identifier'
```

The duplicated ID is the operator's explicit verification attestation. The offline command cannot inspect the application roster: prior authoritative verification is a **required** step, and a wrongly attested ID still grants no role. It prompts twice without echo on a private TTY and refuses to overwrite existing credentials or bootstrap a deactivated roster tombstone. Arrange for the verified employee to enter their own secret privately. A supervised secrets manager can instead provide two matching newline-terminated lines on an inherited descriptor with `--password-fd=3`; never pass a password in command-line arguments, environment, diagnostics, shell history, or chat. No command line is provided for changing a recorded username or reassigning an identity.

If the last owner loses access, use the same identity-verification and authorization process (two operators where possible). Select `rotate` instead of `bootstrap`, with the **same active roster ID and existing username**. It permits password rotation only on an active, already existing local credential. Rotation revokes outstanding reset links and all sessions atomically. It does not make an employee an owner, bypass a roster deactivation, or change a permission. Review the `offline_bootstrap`/`offline_rotate` audit entry, confirm the new sign-in with the intended employee, and secure the console. A normal web reset of a protected owner remains unavailable. Troubleshoot inactive roster records through the separate authorized roster/lifecycle procedure, not by editing SQLite fields.

For suspected compromise rotate gateway/control-plane secrets together with their matching consumers during a controlled restart (this reference accepts one key per direction, so coordinate rollout). After restoring a credential database from backup invalidate restored token and session state before resuming traffic, reconcile its lifecycle records against Command, and reissue links. Test private routes, roster deactivation, 30-minute expiry, stale links, controlled admin recovery, and delegated read-only mode in your independently hosted staging environment before onboarding real employees.

Security design references: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
