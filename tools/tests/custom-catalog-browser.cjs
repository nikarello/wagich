// Optional integration check: node tools/tests/custom-catalog-browser.cjs [baseURL]
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const baseURL = process.argv[2] || "http://localhost:1313";
const output = path.resolve(".hugo-local-build/browser-check");

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${baseURL}/`);
    const cards = page.locator("[data-product-card]");
    const count = await cards.count();
    assert.ok(count > 0);
    assert.equal(await page.locator(".interior-preview-link").count(), 0, "No preview buttons in the catalog grid");
    assert.equal(await page.locator("a a").count(), 0);
    const productHref = await cards.first().locator("a").first().getAttribute("href");
    const slug = new URL(productHref, baseURL).pathname.split("/").filter(Boolean).pop();
    await page.locator("#catalog-filter-toggle").click();
    await page.locator('[data-stock-filter="out"]').click();
    const soldCard = page.locator('[data-product-card]:visible').first();
    await soldCard.locator("a").first().click();
    await page.locator(".interior-preview-link").waitFor();
    assert.equal(await page.locator(".interior-preview-link").count(), 1, "Only the current product has an interior action");
    assert.equal(await page.locator('.interior-preview-link svg[aria-hidden="true"]').count(), 1);
    const soldSlug = await page.locator(".interior-preview-link").getAttribute("data-interior-product");
    assert.ok(soldSlug);
    await page.locator(".interior-preview-link").screenshot({ path: path.join(output, "interior-button-desktop.png") });
    await page.locator(".interior-preview-link").click();
    await page.locator("#ct-download:enabled").waitFor();
    assert.equal(new URL(page.url()).searchParams.get("product"), soldSlug);
    await page.locator('#ct-scene[data-scene="wall"][data-photo-state="ready"]').waitFor();
    const products = JSON.parse(await page.locator("#ct-catalog-products").textContent());
    assert.equal(Object.keys(products).length, count);
    assert.equal(products[soldSlug].src, `/images/${soldSlug}.jpg`, "Use the normal artwork even for sold-out products");
    assert.ok((await page.locator("#ct-file-status").textContent()).startsWith(products[soldSlug].title));
    const cropMatches = await page.evaluate(async src => {
      const image = new Image(); image.src = src; await image.decode();
      const width = Math.min(image.naturalWidth, image.naturalHeight * 13 / 16), height = width * 16 / 13;
      const canvas = document.createElement("canvas"); canvas.width = 650; canvas.height = 800;
      const context = canvas.getContext("2d"); context.fillStyle = "#f3efe6"; context.fillRect(0, 0, 650, 800);
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
      context.drawImage(image, (image.naturalWidth - width) / 2, (image.naturalHeight - height) / 2, width, height, 0, 0, 650, 800);
      return canvas.toDataURL() === document.querySelector("#ct-crop-canvas").toDataURL();
    }, products[soldSlug].src);
    assert.equal(cropMatches, true, "Auto-loaded crop must match the original normal artwork");
    await page.locator(".custom-tapestry").screenshot({ path: path.join(output, "catalog-interior.png") });

    const artwork = path.resolve("assets/images", `${slug}.jpg`);
    await page.locator("#ct-file").setInputFiles(artwork);
    await page.locator("#ct-download:enabled").waitFor();
    assert.equal(new URL(page.url()).searchParams.has("product"), false, "Manual replacement clears the old product selection");
    await page.locator("#ct-zoom").fill("1.4");
    await page.waitForFunction(() => document.querySelector("#ct-zoom-value").value === "140%");
    await page.locator("#ct-crop-stage").press("ArrowLeft");
    for (const format of ["png", "pdf"]) {
      const downloadPromise = page.waitForEvent("download");
      await page.locator(format === "png" ? "#ct-download" : "#ct-download-pdf").click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), `wagich-130x160-maket.${format}`);
      await download.saveAs(path.join(output, `catalog-export.${format}`));
    }
    assert.match(await page.locator("#ct-export-status").textContent(), /PDF/);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      const png = await page.locator("#ct-download").boundingBox();
      const pdf = await page.locator("#ct-download-pdf").boundingBox();
      assert.ok(Math.abs(png.y - pdf.y) < 1 && png.x + png.width < pdf.x, "Export buttons stay side by side");
      assert.ok(png.height >= 44 && pdf.height >= 44);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 390) await page.locator(".ct-order").screenshot({ path: path.join(output, "export-mobile.png") });
    }

    for (const route of ["/tapestry/", `/tapestry/${slug}/`, "/tags/attack-on-titan/"]) {
      const response = await page.goto(`${baseURL}${route}`);
      assert.equal(response.status(), 200);
      const isProduct = route === `/tapestry/${slug}/`;
      assert.equal(await page.locator(".interior-preview-link").count(), isProduct ? 1 : 0, `Interior action only on product detail: ${route}`);
      assert.equal(await page.locator("a a").count(), 0);
      if (isProduct) {
        const url = await page.locator(".interior-preview-link").getAttribute("href");
        assert.ok(Object.hasOwn(products, new URL(url, page.url()).searchParams.get("product")));
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseURL}/`);
    await page.locator("#catalog-filter-toggle").click();
    await page.locator('[data-stock-filter="all"]').click();
    assert.equal(await page.locator("[data-product-card]:visible").count(), count);
    assert.equal(await page.locator(".interior-preview-link").count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await cards.first().screenshot({ path: path.join(output, "catalog-card-mobile.png") });
    const detailHref = await cards.first().locator("a").first().getAttribute("href");
    await cards.first().locator("a").first().click();
    await page.locator(".interior-preview-link").waitFor();
    assert.equal(new URL(page.url()).pathname, new URL(detailHref, baseURL).pathname);
    assert.equal(await page.locator(".interior-preview-link").count(), 1);
    await page.locator(".interior-preview-link").screenshot({ path: path.join(output, "interior-button-mobile.png") });

    for (const product of ["missing-product", "__proto__", "https://example.com/test.jpg"]) {
      await page.goto(`${baseURL}/custom/?product=${encodeURIComponent(product)}`);
      await page.locator("#ct-error:visible").waitFor();
      assert.equal(await page.locator("#ct-download-pdf").isDisabled(), true);
      assert.equal(await page.locator("#ct-upload-button").isEnabled(), true);
    }
    await page.locator("#ct-file").setInputFiles(artwork);
    await page.locator("#ct-download-pdf:enabled").waitFor();
    assert.equal(await page.locator("#ct-error").isVisible(), false);

    const racePage = await browser.newPage();
    racePage.on("pageerror", error => errors.push(error.message));
    let finishRequest;
    const delayed = new Promise(resolve => { finishRequest = resolve; });
    await racePage.route(`**/images/${soldSlug}.jpg`, async route => { await delayed; await route.continue(); });
    await racePage.goto(`${baseURL}/custom/?product=${soldSlug}`);
    await racePage.locator('#ct-crop-stage[aria-busy="true"]').waitFor();
    await racePage.locator("#ct-file").setInputFiles(artwork);
    await racePage.locator("#ct-download:enabled").waitFor();
    const manualLabel = await racePage.locator("#ct-file-status").textContent();
    finishRequest();
    await racePage.waitForLoadState("networkidle");
    assert.equal(await racePage.locator("#ct-file-status").textContent(), manualLabel);
    assert.equal(await racePage.locator("#ct-scene").getAttribute("data-scene"), "cover");
    assert.equal(await racePage.locator("#ct-error").isVisible(), false);
    await racePage.close();

    await page.route(`**/images/${soldSlug}.jpg`, route => route.abort());
    await page.goto(`${baseURL}/custom/?product=${soldSlug}`);
    await page.locator("#ct-error:visible").waitFor();
    assert.equal(await page.locator("#ct-download-pdf").isDisabled(), true);
    await page.locator("#ct-file").setInputFiles(artwork);
    await page.locator("#ct-download-pdf:enabled").waitFor();
    assert.equal(await page.locator("#ct-error").isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(`PASS: ${count} compact catalog cards, product-only interior action, sold-out artwork, product/collection navigation, manual replacement, loading race, responsive PNG/PDF downloads.`);
    console.log(`Exports and screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
