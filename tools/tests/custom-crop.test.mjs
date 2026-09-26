import test from "node:test";
import assert from "node:assert/strict";
import { cropRect, exportSize, imageFormat, RATIO } from "../../assets/js/custom-crop.mjs";

test("landscape, portrait and exact-size sources fill 13:16 without stretching", () => {
  for (const [width, height] of [[2400, 1000], [1000, 2400], [1300, 1600], [52, 12000], [12000, 64]]) {
    for (const zoom of [1, 1.37, 4, 99, 0]) {
      for (const [cx, cy] of [[0, 0], [width / 2, height / 2], [width * 2, height * 2], [-100, -100]]) {
        const crop = cropRect(width, height, zoom, cx, cy);
        assert.ok(Math.abs(crop.width / crop.height - RATIO) < 1e-12);
        assert.ok(crop.x >= 0 && crop.y >= 0);
        assert.ok(crop.x + crop.width <= width + 1e-9);
        assert.ok(crop.y + crop.height <= height + 1e-9);
        assert.ok(crop.width > 0 && crop.height > 0);
      }
    }
  }
});

test("default crop removes only excess and starts centered", () => {
  const landscape = cropRect(2400, 1000);
  assert.equal(landscape.height, 1000);
  assert.equal(landscape.width, 812.5);
  assert.equal(landscape.x, 793.75);
  assert.equal(landscape.y, 0);
  const portrait = cropRect(1000, 2400);
  assert.equal(portrait.width, 1000);
  assert.equal(portrait.y, (2400 - 1000 / RATIO) / 2);
});

test("PNG has exact physical proportions, is bounded and does not upscale", () => {
  for (const [width, height] of [[1300, 1600], [2000, 4000], [6000, 5000], [52, 64]]) {
    for (const zoom of [1, 2.17, 4]) {
      const crop = cropRect(width, height, zoom);
      const output = exportSize(crop);
      assert.equal(output.width / output.height, RATIO);
      assert.ok(output.width <= crop.width + 1e-9 && output.height <= crop.height + 1e-9);
      assert.ok(output.height <= 3200);
    }
  }
});

test("file signatures identify only supported raster formats", () => {
  assert.equal(imageFormat(new Uint8Array([255, 216, 255, 224])), "jpeg");
  assert.equal(imageFormat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), "png");
  assert.equal(imageFormat(new TextEncoder().encode("RIFFxxxxWEBP")), "webp");
  for (const value of ["<svg></svg>", "GIF89a", "", "xxxxftypheic"]) {
    assert.equal(imageFormat(new TextEncoder().encode(value)), null);
  }
});
