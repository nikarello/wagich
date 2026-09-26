import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { imagePdf } from "../../assets/js/custom-pdf.mjs";

const width = 52, height = 64;
const data = new Uint8ClampedArray(width * height * 4);
const rgb = Buffer.alloc(width * height * 3);
for (let i = 0; i < width * height; i++) {
  const pixel = [i % 256, Math.floor(i / width) * 3, 255 - i % 256];
  data.set([...pixel, 255], i * 4);
  rgb.set(pixel, i * 3);
}

for (const compress of [true, false]) {
  test(`PDF has exact physical size, valid byte offsets and lossless pixels (compression=${compress})`, async () => {
    const blob = await imagePdf({ width, height, data }, { compress });
    assert.equal(blob.type, "application/pdf");
    const bytes = Buffer.from(await blob.arrayBuffer());
    const text = bytes.toString("latin1");
    assert.ok(text.startsWith("%PDF-1.4\n"));
    assert.match(text, /\/MediaBox \[0 0 3685\.03937 4535\.43307\]/);
    assert.match(text, /\/Count 1/);
    const xref = Number(text.match(/startxref\n(\d+)\n%%EOF/)[1]);
    assert.equal(text.slice(xref, xref + 4), "xref");
    const offsets = text.slice(xref).split("\n").slice(3, 8);
    offsets.forEach((line, i) => assert.ok(text.slice(Number(line.slice(0, 10))).startsWith(`${i + 1} 0 obj\n`)));
    const start = text.indexOf("4 0 obj\n");
    const stream = text.indexOf("stream\n", start) + 7;
    const dictionary = text.slice(start, stream);
    const length = Number(dictionary.match(/\/Length (\d+)/)[1]);
    const pixels = bytes.subarray(stream, stream + length);
    assert.equal(dictionary.includes("/FlateDecode"), compress);
    assert.deepEqual(compress ? inflateSync(pixels) : pixels, rgb);
    assert.equal(text.slice(stream + length, stream + length + 10), "\nendstream");
    assert.match(text, /3685\.03937 0 0 4535\.43307 0 0 cm\n\/Image Do/);
  });
}

test("PDF rejects stretched, oversized, incomplete and transparent input", async () => {
  for (const input of [
    { width: 52, height: 65, data },
    { width: 2613, height: 3216, data },
    { width, height, data: data.slice(4) },
    { width, height, data: new Uint8ClampedArray(data.length) },
  ]) await assert.rejects(imagePdf(input), RangeError);
});
