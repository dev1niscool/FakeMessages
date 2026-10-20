# Investigation and implementation notes

The reference site is [fakemsgs.com](https://fakemsgs.com), inspected on October 19, 2026. The requester stated that the owner permitted this recreation and use of the original rendering service. This repository contains an independent editor, a browser illustration, and an adapter to that service.

## Evidence and scope

Browser observation and the public HTML, CSS, JavaScript, and referenced assets established the editor's tabs, configuration schema, default conversation, validation limits, local draft persistence, and render-job API. The HTML identified a Next.js/Turbopack React application. Original runtime bundles are not shipped in this repository.

The original labels its live preview “Illustration only” and describes exported screenshots as rendered in the real Messages app. An actual completed render returned a 1179 × 2556 PNG with native Messages typography and Tapbacks. Its reported stages included install, seed, open, and screenshot, with an observed total of 8.54 seconds. This is one measured job, not a latency guarantee. Public responses do not reveal the private device setup or backend implementation.

The [REA README](https://github.com/morluto/rea) informed the approach: inspect visible behavior, record evidence, and separate observations from unknowns. REA was neither installed nor executed.

## Rendering architecture

GitHub Pages serves the public editor. A separately hosted public cloud companion handles native rendering. **Native iPhone**, the default export option, follows this path:

1. `native-renderer.js` creates an isolated anonymous rendering session with a direct HTTPS request to the [cloud companion](https://fake-messages-renderer.dev1niscool.chatgpt.site). No account sign-in, popup, or connection to the site owner's computer is involved.
2. Embedded contact, message, link, and wallpaper images become uploaded assets. A “current” clock is resolved using the user's local time; local message IDs and empty message cards are omitted. The companion forwards the prepared conversation to the owner's FakeMsgs renderer.
3. The editor polls the job through the companion and retrieves its PNG. The browser applies the optional encryption-label removal locally, then offers the download.

The companion uses a fixed set of routes rather than accepting arbitrary upstream URLs. The request handler is mirrored in `server/native-renderer.mjs`. It validates origins, methods, session and job formats, upload types, request limits, and PNG responses; it does not use a shared visitor session. An in-memory anonymous token is sent in `X-Renderer-Session` and translated by the companion to the upstream cookie. Responses are marked private and non-cacheable. CORS permits the GitHub Pages editor origin. Public JavaScript contains no ChatGPT account credentials or deployment secrets.

Native rendering runs entirely through cloud services. The site owner's computer can be off, with no local listener, forwarded port, or tunnel. The localhost endpoint is selected only when a developer explicitly serves the editor at `localhost` or `127.0.0.1`. Native generation depends on the companion and original service remaining available. The `private-transport.js` and `server/bridge.js` files are legacy code from the earlier private-window flow and are not loaded by the public editor.

| Companion endpoint | Upstream operation |
| --- | --- |
| `POST /api/session` | `GET https://fakemsgs.com/api/health`, establish an anonymous session |
| `POST /api/assets` | Upload multipart image data to `/api/assets` |
| `POST /api/renders` | Submit the conversation to `/api/renders` |
| `GET /api/renders/{id}` | Poll the render job |
| `GET /api/renders/{id}/image` | Retrieve the generated PNG |

The original also exposes asset retrieval and render history, but the companion does not expose those routes. It is an adapter to the existing owner-authorized service, not a reconstruction of the native renderer.

**Browser preview** is a separate local export option using `phone.js`, `phone.css`, local vector Tapbacks, and the vendored `html-to-image` library. Its 393 × 852 viewport exports at 1×, 2×, or 3×. Native PNGs are 1179 × 2556. Both export options omit device borders. The browser illustration can differ from native output in font metrics, wrapping, custom emoji, effects, and layout.

## Editor and configuration

The editor retains Conversation, Appearance, Status bar, and Advanced tabs, plus the mobile Edit/Preview switch. Message cards support incoming/outgoing senders, text, images and captions, links, transport, receipts, timestamps, and one reaction from each person. Messages can be reordered, duplicated, and removed. Clicking a preview bubble opens its message card. Contact, theme, background, notification, back-to-app, clock, battery, network, signal, and unread-count controls are available.

State normalization selects supported properties instead of merging arbitrary imported objects into render state.

| Field | Values and meaning |
| --- | --- |
| `contact` | Required `name`; optional embedded `photo` and `location` |
| `theme` | `light` or `dark` |
| `transport` | Default `imessage` or `sms` |
| `unread_count` | Integer 0–999 |
| `notifications_silenced` | Boolean |
| `show_encryption` | Boolean, default `true`; `false` hides the encryption label |
| `clock_format` | 12 or 24 |
| `scroll_position` | `bottom` or `latest-top` |
| `background` | Optional preset, hex color, or embedded raster image |
| `back_to_app` | Optional label |
| `status` | `time`, `battery`, `charging`, `network`, `wifi_strength`, `cellular_strength` |
| `messages` | Array of 1–300 messages |

A message has a local `_id` and `from` equal to `me` or `them`. Optional fields are `text`, embedded `image`, `link`, `transport`, `receipt`, ISO `at`, and `reactions`. A link has an HTTP(S) `url` and optional `title` and embedded `image`. A reaction has `from` plus either a preset `type` or custom `emoji`. Preset types are `love`, `like`, `dislike`, `laugh`, `emphasize`, and `question`.

The default preserves the dark “Fridge Support” sample, four cheese-themed messages, reactions, and final Delivered receipt. Other defaults include iMessage transport, 12-hour current time, 87% battery, Wi-Fi, bottom conversation position, and a visible encryption label. Fresh drafts receive independent message IDs and nested state.

Validation caps contact names at 80 characters, message text at 8000, location at 100, back-to-app text at 40, and custom reactions at 16. An unfinished blank contact name restores as “Contact” without discarding the draft. Numeric settings are rounded and clamped. Custom time accepts a valid 24-hour `HH:MM` value; display formatting is separate. Empty messages remain editable but are excluded from native submission.

Image fields accept embedded PNG, JPEG, WebP, or GIF data URLs. Remote image URLs and SVG/HTML payloads are rejected. Links accept HTTP(S) URLs without embedded credentials. Unknown fields are discarded; duplicate or missing message IDs are regenerated. Invalid imports report an error before replacing the draft. Asset IDs from the original site's JSON are not portable image data; those images must be uploaded again locally.

## Encryption label

**Advanced → Show encryption label** updates `show_encryption`, which persists in drafts and JSON. Older drafts with no field default to `true`. Browser rendering conditionally omits the label.

Native Messages has no exposed setting for this label, so `show_encryption` is not forwarded upstream. For a native iMessage export with the setting disabled, the client interpolates pixels from either side of the label's area in the downloaded PNG. It retains the surrounding layout and image dimensions. Solid backgrounds work cleanly; detailed wallpapers may differ in that small area. The edit expects the current 1179 × 2556 output geometry and reports an error if the native service changes the image dimensions. SMS exports do not need this edit.

## Data handling and limits

Editing, image preparation, JSON import/export, and Browser preview generation run locally. Drafts are stored in localStorage for the current origin and browser profile. Native generation sends conversation text, settings, and images through the companion to the original rendering server. Anonymous session isolation is not a claim that native data stays on the device, and this implementation does not establish the upstream service's retention policy.

User image uploads are limited to 5 MB and downsampled to a longest side of 1600 pixels. Canvas rasterization discards animation. Embedded image data makes exported JSON self-contained. Several images can exceed localStorage quotas, so JSON export remains useful for backups. Drafts do not synchronize across devices, profiles, domains, or local-server ports.

Both renderers capture a fixed phone viewport, not a complete transcript of unlimited height. The position control determines which portion of a long conversation is visible. Native availability, queues, API behavior, and output geometry depend on external services. If native generation fails, the editor reports the error; Browser preview remains a selectable local alternative.

## Development and deployment

Serve the frontend directly, with no compilation or package installation:

```sh
python3 -m http.server 4173
```

Open [localhost:4173](http://localhost:4173); JavaScript modules require HTTP. Browser preview works with this server alone. For local native generation, run `node server/dev.mjs` in a second terminal. The native client connects directly to that local adapter at `http://127.0.0.1:5173`, which uses the owner-authorized FakeMsgs service. The request handler is in `server/native-renderer.mjs`, with a Worker entrypoint in `server/worker.js`. The complete hosted companion source lives in its separate deployment project; the local `renderer-service/` directory is ignored here.

Run tests with:

```sh
node --test tests/*.test.mjs
```

The current suite has 32 tests: 11 state tests, 13 adapter tests, and 8 retained legacy private transport tests. They cover configuration validation and round trips, image and URL restrictions, reactions, message operations, defaults for the encryption setting, the adapter's request/response boundaries, and the legacy popup's origin, source, nonce, timeout, cancellation, and binary-transfer behavior. The public native client uses direct HTTPS requests instead of the popup transport. Unit tests do not establish native visual fidelity; actual returned PNGs must also be inspected.

GitHub Pages deploys **main → / (root)** at [dev1niscool.github.io/FakeMessages](https://dev1niscool.github.io/FakeMessages/). `.nojekyll` enables direct serving, and relative asset paths support the project prefix. Both the frontend and cloud companion are public. Keep the GitHub Pages editor origin allowed by the adapter's CORS policy, and retain the fixed API routes and request limits. Update asset version queries when releasing and keep the hosted adapter aligned with its repository mirror. Deployment does not require any process or network port on the site owner's computer.

## Attribution

This work was requested with the original owner's permission. The independent editor does not redistribute original runtime bundles. Native screenshots are produced by the owner's existing service; its private implementation is unknown. The bundled local-export library carries its [MIT license](../vendor/html-to-image.LICENSE).
