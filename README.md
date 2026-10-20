# FakeMessages

A conversation editor based on [FakeMsgs](https://fakemsgs.com), with native iPhone screenshots and a live browser illustration. Built with the original owner's permission, as stated by the requester.

**Website:** [dev1niscool.github.io/FakeMessages](https://dev1niscool.github.io/FakeMessages/) · **Source:** [dev1niscool/FakeMessages](https://github.com/dev1niscool/FakeMessages)

Edit contacts, messages, photos, links, Tapbacks, receipts, timestamps, appearance, and status bar details. Reorder or duplicate messages, save a draft on your device, and import or export the conversation as JSON.

## Screenshot options

**Native iPhone** is the default renderer and works directly from the website without signing in or opening another window. The editor sends the conversation and its images to the [Cloudflare Worker](https://fake-messages-renderer.devinkancherlaawesome-bbc.workers.dev), which uses the original FakeMsgs native rendering service and returns a 1179 × 2556 PNG with actual iPhone Messages artwork, including the native HAHA Tapback. The adapter runs on the owner's **Cloudflare Workers Free** account, with source in a [private GitLab repository](https://gitlab.com/johnnystremio/fake-messages-renderer). Native generation depends on Cloudflare and FakeMsgs remaining available. Visitors never connect to the site owner's computer; it can be turned off.

**Browser preview** is available to everyone and exports the local HTML/CSS illustration at 1×, 2×, or 3×. It works without signing in or using the native service, but fonts, emoji, and other rendering details depend on the browser and operating system. The live preview is an illustration; the native export can differ. Neither export includes a device border.

In **Advanced**, turn off **Show encryption label** to remove “Encrypted” above the messages. The setting persists in drafts and JSON as `show_encryption: false`. For native exports, the browser removes that label from the returned PNG by interpolating the surrounding background while retaining the layout. Detailed wallpapers may show a difference in the edited area.

## Run locally

From the repository folder:

```sh
python3 -m http.server 4173
```

Open [localhost:4173](http://localhost:4173). The static editor needs no install or build step. JavaScript modules require HTTP serving rather than opening `index.html` directly. Choose **Browser preview** for a standalone local export.

For native generation locally, also run `node server/dev.mjs` in a second terminal. This optional development adapter listens at `http://127.0.0.1:5173` and connects to the owner-authorized FakeMsgs service. The portable handler is mirrored in `server/native-renderer.mjs`, with a Worker entrypoint in `server/worker.js`. The production source is maintained in the private GitLab repository; its local `gitlab-renderer/` checkout is ignored here. Local development servers are not needed to run the public website.

Run the state and adapter tests with Node.js:

```sh
node --test tests/*.test.mjs
```

## Data and export

- Drafts are saved in localStorage in the current browser. JSON is the portable backup format; browser storage can fill up or be cleared.
- Editing, image preparation, JSON operations, and **Browser preview** export run locally. **Native iPhone** generation sends conversation text, settings, and images through the Cloudflare Worker to FakeMsgs. Native sessions are anonymous and isolated per page session; this does not make native rendering local-only.
- Image uploads accept PNG, JPEG, WebP, and GIF up to 5 MB. Images are downsampled to at most 1600 pixels on the longest side; animation is not preserved.
- A screenshot captures a fixed phone viewport, not an unlimited-height transcript. Use the conversation position setting for long conversations.
- A native “current” clock is resolved to the user's local time before submission.

## Deployment

The public frontend is hosted on GitHub Pages from **main → / (root)** using **Deploy from a branch**. `.nojekyll` enables direct static serving. The backend source lives in [private GitLab](https://gitlab.com/johnnystremio/fake-messages-renderer), and the publicly callable adapter executes on **Cloudflare Workers Free**. The native screenshot is still produced by FakeMsgs. ChatGPT Sites is no longer part of this runtime.

The editor makes HTTPS requests directly to the Worker's fixed API routes, with an anonymous session for each visitor. Public JavaScript contains no account credentials or deployment secrets. No server, open port, or tunnel on the site owner's computer is required.

Cloudflare's GitLab integration was used for the initial deployment. After it succeeded, the Git repository was disconnected and the temporary deployment token was revoked. Automatic builds are no longer connected. The running API needs no deployment token or continuous GitLab connection. Future backend changes require deployment authorization again; frontend changes continue to deploy through GitHub Pages.

Keep the Cloudflare account on **Workers Free**, without paid add-ons. Its current allowance is 100,000 Worker requests per day, shared across the account; a screenshot requires multiple requests. Reaching the free quota stops requests instead of creating paid overages. Large uploads may also hit the Free CPU limit. These limits affect availability, and the public adapter has no per-person rate limiter or bot check. The configuration has no storage bindings. See [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/) for current limits.

When releasing changes, update the `?v=` asset versions in `index.html` and JavaScript imports so returning visitors receive current files. Keep the GitLab adapter aligned with its source mirror in `server/native-renderer.mjs`. The unused `private-transport.js` and `server/bridge.js` files preserve the historical private-window implementation; the public editor does not load them. The ignored `renderer-service/` checkout belongs to the retired ChatGPT Sites implementation.

See [the investigation and architecture notes](docs/REVERSE_ENGINEERING.md) for the configuration schema, observed API, and known limits.

## Attribution

The editor and adapter are independently written from observed public behavior. Original JavaScript bundles are not distributed here. Native exports use the owner's existing service; its private implementation has not been reconstructed.

The bundled `html-to-image` library is covered by its [MIT license](vendor/html-to-image.LICENSE). [REA](https://github.com/morluto/rea) informed the observation and behavior-mapping approach; it was not installed or executed.
