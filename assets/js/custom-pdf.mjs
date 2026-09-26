// One-page, lossless RGB PDF of the same 13:16 crop used for PNG export.
// No remote service, fonts, user-provided PDF syntax or runtime dependencies.
const encode = value => new TextEncoder().encode(value);
const PAGE_WIDTH = (1300 * 72 / 25.4).toFixed(5);
const PAGE_HEIGHT = (1600 * 72 / 25.4).toFixed(5);

export async function imagePdf({ width, height, data }, { compress = true } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<=0 || height<=0 ||
      width>2600 || height>3200 || width*16!==height*13 || data.length!==width*height*4) {
    throw new RangeError("PDF requires a bounded, opaque 13:16 RGBA image");
  }
  let rgb = new Uint8Array(width*height*3);
  for (let source=0,target=0;source<data.length;source+=4) {
    if (data[source+3]!==255) throw new RangeError("PDF requires an opaque crop");
    rgb[target++]=data[source]; rgb[target++]=data[source+1]; rgb[target++]=data[source+2];
  }
  let filter="";
  if (compress && typeof CompressionStream!=="undefined") {
    try {
      const stream=new Blob([rgb]).stream().pipeThrough(new CompressionStream("deflate"));
      rgb=new Uint8Array(await new Response(stream).arrayBuffer());
      filter=" /Filter /FlateDecode";
    } catch {
      // Uncompressed RGB is valid PDF too, including in older browsers.
    }
  }
  const parts=[],offsets=[0]; let length=0;
  const append=value=>{
    const bytes=typeof value==="string"?encode(value):value;
    parts.push(bytes); length+=bytes.length;
  };
  const object=(id,body,stream)=>{
    offsets[id]=length;
    append(`${id} 0 obj\n${body}`);
    if(stream){append("\nstream\n");append(stream);append("\nendstream");}
    append("\nendobj\n");
  };
  append("%PDF-1.4\n");
  append(new Uint8Array([37,226,227,207,211,10]));
  object(1,"<< /Type /Catalog /Pages 2 0 R >>");
  object(2,"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /XObject << /Image 4 0 R >> >> /Contents 5 0 R >>`);
  object(4,`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8${filter} /Length ${rgb.length} >>`,rgb);
  const commands=encode(`q\n${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm\n/Image Do\nQ\n`);
  object(5,`<< /Length ${commands.length} >>`,commands);
  const xref=length;
  append("xref\n0 6\n0000000000 65535 f \n");
  for(let id=1;id<=5;id++)append(`${String(offsets[id]).padStart(10,"0")} 00000 n \n`);
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts,{type:"application/pdf"});
}
