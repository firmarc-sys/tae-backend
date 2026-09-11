# Jahorin Optics Bridge — TAE backend contract

Jahorin Optics Bridge is the HeyCyan device lane for System Intelligence as a Service (S.I.aaS). TAE interprets the intention, Horus Optics owns the user-facing capability, Ma’at governs consequential actions, ARI accepts typed commands, and an authenticated Android companion performs BLE and Wi-Fi operations.

```text
Human → TAE → Horus Optics → Ma’at → ARI /api/iot → Android companion → HeyCyan
```

ARI is deliberately not the local glasses transport. It accepts no glasses IP address, SSID, password, local manifest URL or local media URL. Cleartext HTTP is permitted only inside the Android companion, bound to the selected Wi-Fi P2P network and addressed with the private IPv4 value received over BLE.

## Command contract

Mutating requests to `POST /api/iot` require an authenticated GID, explicit human confirmation, an idempotency key, and an ISO-8601 validity window no longer than five minutes. The accepted response uses HTTP 202 and remains truthful:

```json
{
  "operation": "glasses.media.sync",
  "device_id": "heycyan-device-id",
  "request_id": "uuid",
  "idempotency_key": "uuid",
  "issued_at": "2026-09-11T15:00:00.000Z",
  "expires_at": "2026-09-11T15:02:00.000Z",
  "confirmed": true,
  "parameters": {
    "import_mode": "media_store"
  }
}
```

The response is `accepted: true`, `status: "awaiting_companion"`, and `executed: false`. ARI derives a stable `command_id` from the GID, device, operation and idempotency key; the companion must deduplicate execution by that identifier. A later companion event—not request acceptance—must provide proof of device execution.

Supported operations:

- `glasses.state.inspect`
- `glasses.connect`
- `glasses.disconnect`
- `glasses.capture.photo`
- `glasses.video.start`
- `glasses.video.stop`
- `glasses.speech.start`
- `glasses.speech.stop`
- `glasses.media.sync`
- `glasses.firmware.inspect`
- `glasses.ai_photo.capture` for known compatible firmware only

`glasses.firmware.update` is blocked until a vendor manifest, package integrity rules, signature validation, power requirements, rollback procedure and interrupted-update recovery procedure are verified.

## Android transport contract

The companion must:

1. Maintain BLE.
2. Begin Wi-Fi P2P discovery.
3. Send BLE control bytes `02 01 04`.
4. Wait for notification subtype `0x08`.
5. Parse the glasses IPv4 address from bytes `7..10`.
6. Bind the HTTP client to the selected P2P network.
7. request `/files/media.config`.
8. Download entries only from `/files/<filename>`.

Subtype `0x09`, including value `0xFF`, is advisory until manifest reachability is tested. The phone's P2P `groupOwnerAddress` is never substituted for the BLE-reported glasses address. P2P reset is suppressed during an active HTTP transfer, redirects are disabled, and only an expected private destination is allowed.

## Security and platform policy

- CyanBridge is reference material, not an application dependency.
- Only its HeyCyan BLE transport, firmware reads, P2P controller, IP parser, manifest parser, MediaStore importer and Opus repair logic may be selectively ported after focused review.
- Accessibility automation, Telegram control, Shizuku, remote phone control, autonomous screen interaction, `QUERY_ALL_PACKAGES` and `MANAGE_EXTERNAL_STORAGE` are prohibited.
- The Android companion uses `compileSdk 36` and `targetSdk 36`.
- HeyCyan is not represented as an Android XR device.
- Permission prompts are owned by the UI. The adapter issues no device command before the required grant.
- Partial grants resolve to `permission_required`; permanent denial resolves to `capability_unavailable`.
- ARI traffic remains HTTPS/WSS-only.

Run `npm run verify:heycyan` to verify these invariants.
