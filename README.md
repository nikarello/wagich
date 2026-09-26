# WAGICH site

Static Hugo catalog for `wagich.ru`.

## Production pipeline

The production path is:

1. Edit site sources locally.
2. Push changes to `main` on GitHub.
3. GitHub Actions builds the site with Hugo.
4. `.github/workflows/deploy_yc.yml` syncs the generated `public/` directory to Yandex Object Storage bucket `wagich.ru`.

The Yandex deployment uses repository secrets:

- `YC_S3_KEY_ID`
- `YC_S3_SECRET_KEY`

## Catalog update button

`.github/workflows/update-catalog.yml` is a manual GitHub Actions workflow. It downloads the Google Sheets CSV into `assets/products.csv`, commits it to `main`, and that push triggers the Yandex deploy workflow.

Required secrets:

- `GH_PAT`
- `GSHEET_ID`
- `GSHEET_GID`

## Local workflow

Use `deploy.bat` only as a local build check. It does not push anything.

Use `deploy_to_main.bat` only when you want to commit local changes and push them to `main`. It uses a normal push and refuses to run if local `main` is behind `origin/main`.

Do not force-push `main` for normal site updates. A push to `main` is enough to trigger the Yandex deploy action.

## Custom tapestry editor

Open `/custom/` from the catalog banner or the site header. The fixed size is
**130 cm wide × 160 cm high** (portrait, 13:16). No backend or upload service is required.
All image operations run in the browser. Analytics and session recording are disabled
on this page through `private_editor: true`.

The editor accepts JPEG, PNG and WebP (25 MiB, 32 MP, maximum 12,000 px per side).
Users move the image with a mouse, touch or arrow keys, and zoom with the slider or
two fingers. Every view, PNG export and PDF export uses the same source crop; the image is never
stretched. Transparent pixels have a light fabric-colored base. Export is capped
at 2600 × 3200 px, keeps 13:16 exactly and does not enlarge the source crop.
PDF is one borderless page at 130 × 160 cm with lossless RGB artwork. Browser-native
Deflate compression reduces its size; browsers without it use uncompressed RGB.
Neither export includes the room, fringe or fabric shading.
The original file and exported PNG/PDF must be attached to Telegram manually. This is
a preview and contact flow, not automatic order submission or a production print file.
Refreshing or closing the page clears an uploaded image and crop adjustments.

Only the product detail page has an interior preview link with a room icon to
`/custom/?product=<slug>`. A Hugo-generated catalog maps known slugs to original,
same-origin artwork (never the SOLD OUT thumbnail). The editor loads that artwork
and opens the photo above the sofa. Refreshing this link reloads the product.
Uploading another image cancels an unfinished catalog load and clears the product query.
Unknown products and load failures show an error while keeping manual upload available.

Run locally:

```powershell
node --test tools/tests/custom-crop.test.mjs tools/tests/custom-scenes.test.mjs tools/tests/custom-pdf.test.mjs
hugo server --bind 127.0.0.1 --port 1313 --baseURL http://localhost:1313/ --disableFastRender
```

Open `http://localhost:1313/custom/`. For a production build check:

```powershell
hugo --minify --destination .hugo-local-build/public
```

An optional browser integration check is available in `tools/tests/custom-browser.cjs`.
It requires Playwright in Node's module search path and an installed Microsoft Edge
(or set `PLAYWRIGHT_CHANNEL=chrome` to use Chrome). With the local server running, run
`node tools/tests/custom-browser.cjs`. It checks file validation, crop/preview parity,
PNG export, responsive layouts, touch gestures and catalog navigation. Screenshots
and a sample PNG go to the ignored `.hugo-local-build/browser-check/` directory.
Run `node tools/tests/custom-catalog-browser.cjs` for product links, SOLD OUT artwork,
catalog load/replacement races, and PNG/PDF downloads. It saves matching exports and
mobile button screenshots in the same directory. The PDF unit tests verify physical
dimensions, byte offsets and lossless image data with and without compression.

Hugo bundles and fingerprints the editor JS and CSS. The existing Yandex workflow
runs the crop/export tests, builds Hugo and deploys the module with the rest of the site.
No new hosting secrets are needed. A local build does not publish the site.

### Tapestry frame and room mockups

The cover view uses the supplied transparent PNG in
`assets/images/custom-tapestry-frame.png` (1131 × 1391 px). The file is copied unchanged
from the supplied template. The selected image is below the photographed fringe.
A CSS clip follows the inner seam so artwork does not show through the outer fringe.
The shared geometry lives in `assets/js/custom-template.json`. The artwork box is
x=71, y=97, width=988, height=1216 in native template coordinates:
exactly 13:16, with a small edge hidden under the binding. The exported PNG remains
the clean selected image without the frame or interior.

The cover retains its six-color wall palette. All five interiors are photographic:
above the bed, above the sofa, on an armchair, on the bed and on the floor.
Their room colors are fixed. The palette appears only in the cover and never affects export.
Schematic furniture has been removed.

Photo sources are local PNG assets in `assets/images/custom-scenes/`.
`bed-neutral.png` (1040 × 1280) and `wall-neutral.png` (1280 × 960) are the user's
supplied templates, copied unchanged. The other three images are neutral fabric versions
of the approved generated concepts. `generation.json` records both sources.
Hugo produces fingerprinted WebP assets. The browser loads each photo on first selection
and caches it for the page. No remote image service is used.

Each photo has a print mesh traced in its own native coordinates and a calibrated
fabric lighting base in `PHOTO_CONFIG`. The preview keeps each photograph's original
aspect ratio, including portrait and landscape templates. The wall templates use
uniform vertical print spacing; the bedspread accounts for perspective and the fold
at the mattress edge. WebGL and Canvas 2D both use the same scene geometry.
The selected crop replaces the complete print area, while the photo supplies real fabric
lighting, folds, weave and fringe. WebGL renders the mesh during crop edits. A Canvas 2D
fallback supports browsers without WebGL. Loading failures show a retry button, and
late image responses cannot replace the scene selected by the user. The clean PNG export
keeps the original crop and 13:16 proportions without perspective or fabric shading.
These are visual mockups, not a physical fabric simulation or a manufacturing color proof.

- Page structure: `layouts/custom/single.html`.
- Room styling: `assets/css/custom-tapestry.css`.
- File handling, crop interaction and download: `assets/js/custom-tapestry.mjs`.
- Crop geometry: `assets/js/custom-crop.mjs`.
- PDF encoding: `assets/js/custom-pdf.mjs`.
- Product links and catalog image map: `layouts/partials/interior-preview-link.html`
  and `layouts/partials/custom-catalog-data.html`.
- Photo mesh geometry: `assets/js/custom-photo-geometry.mjs`.
- Photo loading, texture projection and fallback: `assets/js/custom-scenes.mjs`.
- Photo layers and palette: `layouts/partials/custom-room-scenes.html` and
  `layouts/partials/custom-room-palette.html`.

For a different flat frame, update its PNG, dimensions, artwork box and seam clip together.
For a replacement photo, update its neutral fabric PNG and the matching mesh coordinates.
Keep `cropRect()` and the clean PNG export unchanged.

Before publishing, check a wide and tall upload, crop boundaries, all six scenes,
touch drag and pinch, keyboard movement, invalid/oversized files, and downloaded PNG.
The optional browser check covers these flows, responsive widths of 320, 390, 768,
1024 and 1440 px, photo loading/retry, fallback rendering and photo/crop updates.
Real iOS Safari and Android testing remains recommended before launch; desktop emulation
does not reproduce every mobile file picker or graphics driver.

## Analytics

Analytics is wired through `layouts/partials/analytics.html` and configured in `config.toml`.

Set these values to enable tracking:

```toml
[params.analytics]
yandexMetricaId = "12345678"
microsoftClarityId = "abcdef1234"
debug = false
```

Tracked events:

- `site_click` for every link/button click, with click text, target, page type, section, product slug, tag slug, and stock filter when available.
- `telegram_contact_click`, `telegram_channel_click`.
- `catalog_return_click`, `all_public_tags_click`, `public_tag_click`, `product_card_click`.
- `stock_filter_click`, `catalog_search`, `catalog_search_submit`.
- `time_on_page` at 15, 30, 60, and 120 seconds.
- `site_error` for JavaScript errors and unhandled promise rejections.

In Yandex Metrica, create JavaScript event goals for the events that should appear as goals/funnel steps. Clarity will receive custom events for filtering recordings and heatmaps.
