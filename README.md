# FakeMessages

A conversation editor based on [FakeMsgs](https://fakemsgs.com), with native iPhone screenshots and a live browser illustration. Built with the original owner's permission, as stated by the requester.

**Website:** [dev1niscool.github.io/FakeMessages](https://dev1niscool.github.io/FakeMessages/) · **Source:** [dev1niscool/FakeMessages](https://github.com/dev1niscool/FakeMessages)

Edit contacts, messages, photos, links, Tapbacks, receipts, timestamps, appearance, and status bar details. Reorder or duplicate messages, save a draft on your device, and import or export the conversation as JSON.

## Screenshot options

**Native iPhone** is the default renderer. It opens the owner's [private companion renderer](https://fake-messages-renderer.dev1niscool.chatgpt.site/render) in a small window or tab. Sign in with the authorized ChatGPT account if prompted. The companion sends the conversation and its images to the original FakeMsgs native rendering service and returns a 1179 × 2556 PNG with actual iPhone Messages artwork, including the native HAHA Tapback. Native generation requires access to the private companion and availability of both external services. If signing in disconnects the window from the editor, return to the editor and click **Generate screenshot** again.

**Browser preview** is available to everyone and exports the local HTML/CSS illustration at 1×, 2×, or 3×. It works without signing in or using the native service, but fonts, emoji, and other rendering details depend on the browser and operating system. The live preview is an illustration; the native export can differ. Neither export includes a device border.

In **Advanced**, turn off **Show encryption label** to remove “Encrypted” above the messages. The setting persists in drafts and JSON as `show_encryption: false`. For native exports, the browser removes that label from the returned PNG by interpolating the surrounding background while retaining the layout. Detailed wallpapers may show a difference in the edited area.

## Run locally

From the repository folder:

```sh
python3 -m http.server 4173
```

Open [localhost:4173](http://localhost:4173). The static editor needs no install or build step. JavaScript modules require HTTP serving rather than opening `index.html` directly. Choose **Browser preview** for a standalone local export.

For native generation locally, also run `node server/dev.mjs` in a second terminal. This starts the adapter at `http://127.0.0.1:5173` and connects to the owner-authorized FakeMsgs service. The portable handler is in `server/native-renderer.mjs`, with a Worker entrypoint in `server/worker.js`. The full hosted companion application is maintained separately; its local `renderer-service/` checkout is ignored by this repository.

Run the state and adapter tests with Node.js:

```sh
node --test tests/*.test.mjs
```

## Data and export

- Drafts are saved in localStorage in the current browser. JSON is the portable backup format; browser storage can fill up or be cleared.
- Editing, image preparation, JSON operations, and **Browser preview** export run locally. **Native iPhone** generation sends conversation text, settings, and images to the companion and FakeMsgs servers. Native sessions are anonymous and isolated per page session; this does not make native rendering local-only.
- Image uploads accept PNG, JPEG, WebP, and GIF up to 5 MB. Images are downsampled to at most 1600 pixels on the longest side; animation is not preserved.
- A screenshot captures a fixed phone viewport, not an unlimited-height transcript. Use the conversation position setting for long conversations.
- A native “current” clock is resolved to the user's local time before submission.

## Deployment

The public frontend is hosted on GitHub Pages from **main → / (root)** using **Deploy from a branch**. `.nojekyll` enables direct static serving. The companion is deployed separately and stays private. Its authenticated `/render` page performs same-origin API calls and returns results to the trusted editor through a nonce-bound window message exchange. Public JavaScript contains no account credentials or deployment secrets. Public visitors can use the editor and Browser preview; native generation requires access to the private companion.

When releasing changes, update the `?v=` asset versions in `index.html` and JavaScript imports so returning visitors receive current files. Keep the hosted adapter and bridge aligned with their source mirrors in `server/native-renderer.mjs` and `server/bridge.js`.

See [the investigation and architecture notes](docs/REVERSE_ENGINEERING.md) for the configuration schema, observed API, and known limits.

## Attribution

The editor and adapter are independently written from observed public behavior. Original JavaScript bundles are not distributed here. Native exports use the owner's existing service; its private implementation has not been reconstructed.

The bundled `html-to-image` library is covered by its [MIT license](vendor/html-to-image.LICENSE). [REA](https://github.com/morluto/rea) informed the observation and behavior-mapping approach; it was not installed or executed.
