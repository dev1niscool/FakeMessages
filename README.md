# FakeMessages

An independent browser implementation of the conversation editor at [FakeMsgs](https://fakemsgs.com), with a live iMessage-style preview and PNG export.

**Website:** [dev1niscool.github.io/FakeMessages](https://dev1niscool.github.io/FakeMessages/) · **Source:** [dev1niscool/FakeMessages](https://github.com/dev1niscool/FakeMessages)

Edit contacts, messages, photos, links, reactions, receipts, timestamps, appearance, and status bar details. Reorder or duplicate messages, save a draft on your device, and import or export the conversation as JSON.

PNG generation runs in the browser. The original site uses a server to produce screenshots in the native Messages app; this version reproduces the appearance in HTML/CSS and does not use that service.

## Run locally

From the repository folder:

```sh
python3 -m http.server 4173
```

Open [localhost:4173](http://localhost:4173). There is no install or build step. Use an HTTP server rather than opening `index.html` directly, because the app uses JavaScript modules.

Run the state and import-validation tests with Node.js:

```sh
node --test tests/*.test.mjs
```

## Publish on GitHub Pages

In the repository's **Settings → Pages**, select **Deploy from a branch**, then **main** and **/ (root)**. Save. The included `.nojekyll` file allows GitHub Pages to serve the static files directly. No build action, API key, backend, or custom domain is required.

## Data and export

- Conversation text and uploaded images stay in your browser. Editing and generation do not send private draft data to a server. The site files are served normally by GitHub Pages.
- Images, icons, styles, and the export library are local or embedded. Fonts use the device's system fonts; there are no remote font or image dependencies.
- PNG export captures the visible portion of a fixed phone viewport. Long conversations do not produce one unlimited-height screenshot. Choose the conversation position and review the preview before exporting.
- Image uploads accept PNG, JPEG, WebP, and GIF up to 5 MB. Images are downsampled to at most 1600 pixels on the longest side; animation is not preserved.
- Browser storage has limits and can be cleared. Export JSON to keep a portable backup, especially for conversations containing several images.

See [the investigation and feature map](docs/REVERSE_ENGINEERING.md) for implementation details and known differences.

## Attribution

The requester reported permission from the owner of FakeMsgs to recreate the site; that permission was not independently verified. This repository does not grant rights to the original site's code, branding, or assets. The app is an independent implementation based on observed public behavior, rather than a copy of the original JavaScript bundles.

The bundled `html-to-image` library is covered by its [MIT license](vendor/html-to-image.LICENSE). [REA](https://github.com/morluto/rea) informed the observation and behavior-mapping approach; it was not installed or executed.
