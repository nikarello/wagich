// Optional browser integration check. Requires Playwright and an installed Edge.
// Usage: node tools/tests/custom-browser.cjs [http://localhost:1313]
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true, reducedMotion: "reduce" });
    const errors = [];
    const uploadRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (request.method() !== "GET") uploadRequests.push(request.url()); });
    await page.goto(`${baseURL}/custom/`);
    await page.locator("#ct-upload-button:enabled").waitFor();
    assert.equal(await page.locator("#ct-download").isDisabled(), true);
    assert.equal(await page.locator('script[src*="metrika"]').count(), 0);
    const frameSize = await page.locator("#ct-template-frame").evaluate(async (image) => {
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    });
    assert.deepEqual(frameSize, [1131, 1391], "The supplied frame must load at its native proportions");
    const copy = await page.locator(".custom-tapestry").innerText();
    for (const removed of ["Двигайте изображение", "С клавиатуры:", "Окантовка закрывает", "Только в вашем браузере", "Файлы нужно прикрепить вручную", "Загрузка на сайт не оформляет заказ"]) {
      assert.equal(copy.includes(removed), false, `Removed instruction: ${removed}`);
    }

    async function fixture(width, height, type = "image/png") {
      const data = await page.evaluate(({ width, height, type }) => {
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d");
        ["#d22e2e", "#278452", "#2657b8"].forEach((color, i) => {
          context.fillStyle = color;
          context.fillRect(i * width / 3, 0, width / 3, height);
        });
        context.strokeStyle = "#fff8";
        context.lineWidth = 5;
        for (let x = -width; x < width; x += 137) {
          context.beginPath(); context.moveTo(x, 0); context.lineTo(x + width / 3, height); context.stroke();
        }
        return canvas.toDataURL(type).split(",")[1];
      }, { width, height, type });
      return { name: type === "image/png" ? "test.png" : "test.webp", mimeType: type, buffer: Buffer.from(data, "base64") };
    }
    const wide = await fixture(2400, 1000);
    const tall = await fixture(1000, 2400, "image/webp");
    const tiny = await fixture(20, 20);
    const oversizeDimensions = await fixture(12001, 64);
    const upload = async (file) => {
      await page.locator("#ct-file").setInputFiles(file);
      await page.waitForFunction(() => document.querySelector("#ct-crop-stage").getAttribute("aria-busy") === "false");
    };
    const artwork = () => page.locator("#ct-crop-canvas").evaluate((canvas) => canvas.toDataURL());
    const matchesPreview = async () => {
      assert.equal(await artwork(), await page.locator("#ct-preview-canvas").evaluate((canvas) => canvas.toDataURL()));
    };

    await upload(wide);
    await page.waitForFunction(() => document.querySelector("#ct-quality").textContent.includes("812 × 1000"));
    await matchesPreview();
    const original = await artwork();
    await page.locator("#ct-zoom").fill("2");
    await page.waitForFunction(() => document.querySelector("#ct-zoom-value").value === "200%");
    const beforeMove = await artwork();
    const stage = page.locator("#ct-crop-stage");
    await stage.scrollIntoViewIfNeeded();
    const box = await stage.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 3, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction((before) => document.querySelector("#ct-crop-canvas").toDataURL() !== before, beforeMove);
    await matchesPreview();
    await stage.press("ArrowLeft");
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#ct-download").click();
    const download = await downloadPromise;
    const pngPath = path.join(output, download.suggestedFilename());
    await download.saveAs(pngPath);
    const png = await fs.readFile(pngPath);
    assert.equal(png.readUInt32BE(16) / png.readUInt32BE(20), 13 / 16);
    assert.ok(png.readUInt32BE(16) <= 406.25);
    await page.locator("#ct-reset").click();
    await page.waitForFunction(() => document.querySelector("#ct-zoom-value").value === "100%");
    assert.equal(await artwork(), original);

    for (const invalid of [
      { name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") },
      { name: "broken.jpg", mimeType: "image/jpeg", buffer: Buffer.from([255, 216, 255, 224, 0]) },
      { name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(26 * 1024 * 1024) },
      tiny, oversizeDimensions,
    ]) {
      await upload(invalid);
      assert.equal(await page.locator("#ct-error").isVisible(), true);
      assert.equal(await artwork(), original, "A bad replacement must preserve the current artwork");
      assert.equal(await page.locator("#ct-download").isEnabled(), true);
    }
    await upload(tall);
    await page.waitForFunction(() => document.querySelector("#ct-quality").textContent.includes("1000 × 1230"));
    assert.equal(await page.locator("#ct-error").isVisible(), false);
    await matchesPreview();

    const photoScenes = ["bed", "wall", "armchair", "bedspread", "floor"];
    const photoSizes = {bed:[1040,1280],wall:[1280,960],armchair:[1254,1254],bedspread:[1254,1254],floor:[1254,1254]};
    for (const scene of ["cover", ...photoScenes]) {
      await page.locator('button[data-scene="'+scene+'"]').click();
      assert.equal(await page.locator("#ct-scene").getAttribute("data-scene"), scene);
      if (photoScenes.includes(scene)) {
        await page.locator('#ct-scene[data-photo-state="ready"]').waitFor();
        assert.equal(await page.locator("#ct-surface-canvas").isVisible(), true);
        assert.equal(await page.locator("#ct-tapestry").isVisible(), false);
        assert.equal(await page.locator(".ct-palette").isVisible(), false);
        const before = await page.locator("#ct-surface-canvas").evaluate(canvas=>canvas.toDataURL());
        await page.locator("#ct-zoom").fill("1.5");
        await page.waitForFunction(before=>document.querySelector("#ct-surface-canvas").toDataURL()!==before,before);
        await page.locator("#ct-reset").click();
        await page.waitForFunction(()=>document.querySelector("#ct-zoom-value").value==="100%");
        const pixels = await page.locator("#ct-surface-canvas").evaluate(canvas=>{
          const copy=document.createElement("canvas"); copy.width=canvas.width; copy.height=canvas.height;
          const c=copy.getContext("2d");c.drawImage(canvas,0,0);
          const data=c.getImageData(0,0,copy.width,copy.height).data;
          let opaque=0,red=0,blue=0,aboveSofa=0;
          for(let i=0;i<data.length;i+=4) if(data[i+3]>128) {
            opaque++; if(data[i]>data[i+2]*1.5)red++; if(data[i+2]>data[i]*1.5)blue++;
            if(i/4/copy.width<440)aboveSofa++;
          }
          return {opaque,red,blue,aboveSofa};
        });
        assert.ok(pixels.opaque>150000 && pixels.red>10000 && pixels.blue>10000, "Uploaded colors must replace the sample print");
        assert.deepEqual(await page.locator("#ct-surface-canvas").evaluate(c=>[c.width,c.height]),photoSizes[scene]);
        const bounds=await page.locator("#ct-scene").boundingBox();
        assert.ok(Math.abs(bounds.width/bounds.height-photoSizes[scene][0]/photoSizes[scene][1])<.002,"Scene photograph must not stretch");
        if(scene==="floor") assert.equal(pixels.aboveSofa,0,"Floor artwork must not cover the sofa");
      }
      await page.locator("#ct-scene").screenshot({path:path.join(output,'scene-'+scene+'.png')});
      await matchesPreview();
    }
    await page.locator('button[data-scene="cover"]').click();

    const cropBeforePalette = await artwork();
    await page.locator('[data-palette="wall"][data-color="#687c91"]').click();
    assert.equal(await page.locator(".ct-room-wall").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(104, 124, 145)");
    await page.locator('button[data-scene="bed"]').click();
    await page.locator('#ct-scene[data-photo-state="ready"]').waitFor();
    assert.equal(await page.locator(".ct-palette").isVisible(),false);
    assert.equal(await page.locator(".ct-furniture, .ct-plant").count(),0,"Schematic furniture must be removed");
    await page.locator('button[data-scene="cover"]').click();
    assert.equal(await page.locator(".ct-palette").isVisible(),true);
    assert.equal(await page.locator(".ct-room-wall").evaluate(e=>getComputedStyle(e).backgroundColor),"rgb(104, 124, 145)");
    assert.equal(await artwork(), cropBeforePalette, "Interior colors must not change the image crop");
    await page.locator('button[data-scene="cover"]').click();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `No overflow at ${width}px`);
      const bounds = await stage.boundingBox();
      assert.ok(Math.abs(bounds.width / bounds.height - 13 / 16) < 0.01);
      const artBounds = await page.locator(".ct-tapestry-art").boundingBox();
      assert.ok(Math.abs(artBounds.width / artBounds.height - 13 / 16) < 0.001, "Artwork under the frame must not stretch");
      const frameBounds = await page.locator("#ct-template-frame").boundingBox();
      assert.ok(Math.abs(frameBounds.width / frameBounds.height - 1131 / 1391) < 0.001, "The frame must keep its proportions");
      for (const photo of photoScenes) {
        await page.locator('button[data-scene="'+photo+'"]').click();
        await page.locator('#ct-scene[data-photo-state="ready"]').waitFor();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      }
      await page.locator('button[data-scene="cover"]').click();
      await page.screenshot({ path: path.join(output, `editor-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(uploadRequests, [], "Image data must not leave the browser");
    await page.goto(baseURL);
    assert.equal(await page.locator('a[href*="custom"]').count() >= 2, true);
    assert.equal(await page.locator('[data-product-card="1"]').count() > 0, true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const touch = await mobile.newPage();
    touch.on("pageerror", (error) => errors.push(error.message));
    await touch.goto(`${baseURL}/custom/`);
    await touch.locator("#ct-file").setInputFiles(wide);
    await touch.locator("#ct-download:enabled").waitFor();
    await touch.locator("#ct-crop-stage").scrollIntoViewIfNeeded();
    const touchBox = await touch.locator("#ct-crop-stage").boundingBox();
    const x = touchBox.x + touchBox.width / 2;
    const y = touchBox.y + touchBox.height / 2;
    const cdp = await mobile.newCDPSession(touch);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 25, y, id: 1 }, { x: x + 25, y, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 65, y, id: 1 }, { x: x + 65, y, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.waitForFunction(() => Number(document.querySelector("#ct-zoom").value) > 2);
    const beforeTouch = await touch.locator("#ct-crop-canvas").evaluate((canvas) => canvas.toDataURL());
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 140, y, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.waitForFunction((before) => document.querySelector("#ct-crop-canvas").toDataURL() !== before, beforeTouch);
    assert.deepEqual(errors, []);
    await mobile.close();
    const fallback = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await fallback.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        return type === "webgl" ? null : getContext.call(this, type, ...args);
      };
    });
    const fallbackPage = await fallback.newPage();
    fallbackPage.on("pageerror", error => errors.push(error.message));
    let attempts = 0;
    await fallbackPage.route("**/images/custom-scenes/armchair*.webp", async route => {
      if (++attempts === 1) await route.abort();
      else await route.continue();
    });
    await fallbackPage.goto(`${baseURL}/custom/`);
    await fallbackPage.locator('button[data-scene="armchair"]').click();
    await fallbackPage.locator('#ct-scene[data-photo-state="error"]').waitFor();
    assert.equal(await fallbackPage.locator("#ct-photo-retry").isVisible(), true);
    await fallbackPage.locator("#ct-photo-retry").click();
    await fallbackPage.locator('#ct-scene[data-photo-state="ready"]').waitFor();
    assert.ok(attempts >= 2, "Retry must request the failed photo again");
    assert.equal(await fallbackPage.locator("#ct-surface-canvas").getAttribute("data-renderer"), "canvas2d");
    await fallbackPage.locator("#ct-scene").screenshot({path:path.join(output,"scene-fallback-example.png")});
    const beforeUpload = await fallbackPage.locator("#ct-surface-canvas").evaluate(canvas => canvas.toDataURL());
    await fallbackPage.locator("#ct-file").setInputFiles(tall);
    await fallbackPage.waitForFunction(before => document.querySelector("#ct-surface-canvas").toDataURL() !== before, beforeUpload);
    for (const photo of photoScenes) {
      await fallbackPage.locator(`button[data-scene="${photo}"]`).click();
      await fallbackPage.locator('#ct-scene[data-photo-state="ready"]').waitFor();
      const hasPrint = await fallbackPage.locator("#ct-surface-canvas").evaluate(canvas => {
        const data=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
        let red=0,blue=0;
        for(let i=0;i<data.length;i+=4) if(data[i+3]>128) {
          if(data[i]>data[i+2]*1.5) red++;
          if(data[i+2]>data[i]*1.5) blue++;
        }
        return red>10000 && blue>10000;
      });
      assert.equal(hasPrint,true,"Fallback must retain the uploaded print colors");
    }
    await fallbackPage.locator("#ct-scene").screenshot({path:path.join(output,"scene-fallback-upload.png")});
    await fallback.close();

    const race = await browser.newContext();
    const racePage = await race.newPage();
    let finishPhoto;
    const delayedPhoto = new Promise(resolve => { finishPhoto = resolve; });
    await racePage.route("**/images/custom-scenes/armchair*.webp", async route => {
      await delayedPhoto; await route.continue();
    });
    await racePage.goto(`${baseURL}/custom/`);
    await racePage.locator('button[data-scene="armchair"]').click();
    await racePage.locator('#ct-scene[data-photo-state="loading"]').waitFor();
    await racePage.locator('button[data-scene="floor"]').click();
    await racePage.locator('#ct-scene[data-photo-state="ready"]').waitFor();
    finishPhoto();
    await racePage.waitForFunction(() => [...document.images].some(image => image.id==="ct-photo-background" && image.src.includes("floor")));
    await racePage.locator('button[data-scene="cover"]').click();
    await racePage.locator('button[data-scene="armchair"]').click();
    await racePage.locator('#ct-scene[data-photo-state="ready"]').waitFor();
    assert.ok((await racePage.locator("#ct-photo-background").getAttribute("src")).includes("armchair"));
    const lost = await racePage.locator("#ct-surface-canvas").evaluate(canvas => {
      const gl=canvas.getContext("webgl"), extension=gl?.getExtension("WEBGL_lose_context");
      if (!extension) return false;
      window.restorePhotoContext=()=>extension.restoreContext(); extension.loseContext(); return true;
    });
    if (lost) {
      await racePage.locator('#ct-scene[data-photo-state="error"]').waitFor();
      await racePage.evaluate(()=>window.restorePhotoContext());
      await racePage.locator('#ct-scene[data-photo-state="ready"]').waitFor();
    }
    await race.close();
    assert.deepEqual(errors, []);
    console.log("PASS: uploads, crop/export, responsive layouts, touch, warped artwork, photographic surfaces, cover wall palette, text cleanup, no image upload requests.");
    console.log("PASS: photo retry, Canvas 2D fallback, live replacement, scene loading races and WebGL context recovery.");
    console.log(`Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
