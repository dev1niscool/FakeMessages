# Investigation and implementation notes

This document records the publicly observable behavior used to build FakeMessages and the limits of the resulting static implementation. The reference site was [fakemsgs.com](https://fakemsgs.com), inspected on October 19, 2026. The requester reported that the site's owner permitted the recreation; this was not independently verified.

## Method and evidence

The investigation combined browser observation with reads of the site's public HTML, CSS, JavaScript, and referenced assets. No access to its private source repository or server implementation was available.

The HTML identified the application as a Next.js/Turbopack React site. Its page contained four editor tabs and a mobile Edit/Preview switch. The application bundle exposed the conversation schema, default example, input limits, local draft persistence, message operations, and API calls. The observed style rules established the basic editor layout, phone geometry, bubble styles, and system font stack.

The [REA repository README](https://github.com/morluto/rea) supplied methodological inspiration: inspect observable structure and runtime behavior, record evidence, and separate conclusions from unknowns. REA was neither installed nor executed. Native binary analysis was unnecessary for the public browser interface.

The application in this repository is newly written HTML, CSS, and JavaScript. Original runtime chunks are not shipped. Device decoration and background treatments are recreated locally; the application does not hotlink the reference site's assets or use its API.

## The material architectural difference

The reference site's metadata describes its generated images as screenshots rendered in the real Messages app. Its preview labels itself “Illustration only.” The public client uses these endpoints:

| Endpoint | Purpose visible in the client |
| --- | --- |
| `GET /api/health` | Check renderer availability |
| `POST /api/assets` | Upload an image as multipart form data |
| `GET /api/assets/{id}` | Read an uploaded image |
| `POST /api/renders` | Submit a conversation configuration |
| `GET /api/renders` | Load previous render jobs |
| `GET /api/renders/{id}` | Poll a queued or running job |
| `GET /api/renders/{id}/image` | View or download its screenshot |

The public health response reported an available service with two devices during inspection. That establishes that a service was advertised as available; it does not reveal how the server or devices were implemented. The client alone cannot reconstruct that backend.

GitHub Pages serves static files. FakeMessages therefore renders the conversation in HTML/CSS and exports it locally using the vendored `html-to-image` library. It has no native Messages rendering, server queue, upload endpoint, or server screenshot history. Its output should be described as an iMessage-style mockup, not a native Messages capture. Font metrics, emoji artwork, wrapping, blur effects, and antialiasing can differ across browsers and operating systems.

## Feature map

| Area | Reference behavior | Static implementation |
| --- | --- | --- |
| Workspace | Conversation, Appearance, Status bar, Advanced tabs; mobile Edit/Preview switch | Same main editing organization and responsive preview |
| Contact | Name, uploaded photo, optional location | Local fields and embedded photo |
| Messages | Incoming/outgoing messages, text, images and captions, links | Editable message cards with local preview |
| Organization | Reorder and remove messages | Reorder, remove, and duplicate messages |
| Per-message settings | Transport, receipt, timestamp | iMessage/SMS selection, delivered/read state, timestamp |
| Reactions | One reaction per person; preset Tapbacks or custom emoji | Same two-person reaction schema |
| Appearance | Light/dark, default transport, conversation position, backgrounds | Local theme, transport, position, preset/color/image backgrounds |
| Conversation details | Silenced notifications and back-to-app text | Configurable preview details |
| Status bar | Current/custom time, 12/24-hour clock, battery, charging, unread count, network, signal strength | Local controls and preview, with randomization |
| Configuration | Import, edit, export JSON | Validated JSON import/editor and portable export |
| Draft persistence | Debounced localStorage draft | Browser-local draft persistence |
| Screenshot | Remote job rendered with native Messages | Browser-rendered PNG, selectable scale and optional device frame |

The original also exposes editing and drag interactions directly inside its illustrated phone preview. The static implementation focuses editing in the message cards; the preview is the visual representation used for export. This is not a claim of exhaustive interaction parity.

## Configuration model

The public schema uses these fields. The new state module explicitly selects supported properties rather than merging arbitrary imported objects into rendering or style state.

| Field | Values and meaning |
| --- | --- |
| `contact` | Required `name`; optional embedded `photo` and `location` |
| `theme` | `light` or `dark` |
| `transport` | Default `imessage` or `sms` |
| `unread_count` | Integer 0–999 |
| `notifications_silenced` | Boolean |
| `clock_format` | 12 or 24 |
| `scroll_position` | `bottom` or `latest-top` |
| `background` | Optional preset, hex color, or embedded raster image |
| `back_to_app` | Optional label |
| `status` | `time`, `battery`, `charging`, `network`, `wifi_strength`, `cellular_strength` |
| `messages` | Array of 1–300 messages |

A message has a local `_id` and `from` equal to `me` or `them`. Optional fields are `text`, embedded `image`, `link`, `transport`, `receipt`, ISO `at`, and `reactions`. A link has an HTTP(S) `url` and optional `title` and embedded `image`. A reaction has `from` plus either a preset `type` or custom `emoji`. The preset types are `love`, `like`, `dislike`, `laugh`, `emphasize`, and `question`.

The default sample preserves the reference's dark theme, “Fridge Support” contact, four cheese-themed messages, reactions, and final Delivered receipt. Defaults include iMessage transport, 12-hour time, a current clock, 87% battery, Wi-Fi, and bottom conversation position. Each new draft receives independent message IDs and nested state.

Validation requires a contact name of at most 80 characters and valid senders. An unfinished blank name is restored as “Contact” without discarding the draft. Text is capped at 8000 characters per message, location at 100, back-to-app text at 40, and custom reactions at 16. Numeric status values are rounded and clamped to their supported ranges. A custom clock accepts a valid 24-hour `HH:MM` value; display formatting is separate. Empty message text remains valid while composing a draft.

Image fields accept embedded PNG, JPEG, WebP, or GIF data URLs. Remote image URLs and SVG/HTML data are rejected. Links accept HTTP(S) URLs without embedded credentials. Unknown fields are discarded, duplicate/missing message IDs are regenerated, and malformed imports report an error before replacing the draft. Asset references such as the original server's `assets/...` paths are not portable to this app; upload the image locally instead.

## Local rendering and data flow

The browser loads only this repository's static application files and bundled export library for normal operation. It uses local system fonts, inline/local icons and styles, and embedded user image data. No external image or font request is needed to render or export a conversation. Link cards do not require fetching remote page metadata or thumbnails; their content is provided in the draft.

Conversation editing, image processing, JSON import/export, and PNG generation run in the browser. Draft persistence uses localStorage on the current origin and browser profile. Loading the hosted site still makes ordinary requests to GitHub Pages, and explicitly following an external link opens that destination. The app does not send the private conversation or uploaded image data to either the reference site or a rendering service.

User image uploads are limited to 5 MB and downsampled to a longest side of 1600 pixels. Decoding and drawing an image to a raster canvas discards animation. Uploaded assets become self-contained data URLs suitable for JSON backups and PNG export. A browser may reject an image it cannot decode even if its filename has a supported extension.

## Export and persistence limits

- The phone is a fixed viewport. PNG output contains the visible portion of the conversation, not an unlimited-height transcript. Long content is clipped to that viewport; position controls determine which section is displayed.
- The preview scales to fit its panel. Export resolution is selected separately, and the device frame can be included or omitted.
- Browser rendering is not pixel-identical to native Messages. System fonts and emoji vary by platform; visual effects may be simplified in the exported image.
- Several embedded images can exceed localStorage quotas. A draft may remain usable in memory even when saving fails. Export JSON for a durable backup before closing the page or clearing site data.
- Drafts do not synchronize between devices, browser profiles, domains, or local-server ports. A JSON file is the portable project format.
- JSON files from the reference site may contain server asset IDs that cannot be resolved here. Text/settings can be mapped, but those images must be added again locally.
- GitHub Pages supplies neither native screenshot devices nor a backend. Reproducing the reference site's server-rendered output would require a separate service and deployment design.

## Development and deployment

The repository is served directly, with no compilation or package installation required:

```sh
python3 -m http.server 4173
```

Then open [localhost:4173](http://localhost:4173). JavaScript modules require HTTP serving rather than direct `file:` navigation.

State and import-validation checks run with:

```sh
node --test tests/*.test.mjs
```

The tests exercise independent defaults, a full-schema JSON round trip, supported embedded assets, unsafe URL and prototype payload rejection, numerical/time validation, reactions, message ordering, deep duplication, and minimum/maximum message counts. These state tests do not establish native Messages fidelity or replace browser checks of preview and PNG output.

GitHub Pages should deploy the `main` branch from `/ (root)`. `.nojekyll` marks the repository as a direct static site, and relative asset paths support the `/FakeMessages/` project prefix. The expected public address is [https://dev1niscool.github.io/FakeMessages/](https://dev1niscool.github.io/FakeMessages/).

## Attribution and rights

The requester's statement of owner permission is recorded as context, not independently verified evidence or a general license grant. This repository does not license the original site's code, assets, branding, or third-party marks. The bundled `html-to-image` dependency carries its own [MIT license](../vendor/html-to-image.LICENSE). No broader rights should be inferred from that dependency license.
