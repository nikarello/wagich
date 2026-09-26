import { PHOTO_CONFIG, PHOTO_SCENES, photoMesh } from "./custom-photo-geometry.mjs";

// The neutral photograph supplies the cloth's real shading and woven texture.
// Only the print surface is replaced; its fringe and the room remain photographic.
function webglDevice(canvas, gl) {
  const compile = (type, text) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, text); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Shader compilation failed");
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, `
    attribute vec2 point; attribute vec2 uv; uniform vec2 photoSize;
    varying vec2 imageUV; varying vec2 photoUV;
    void main() {
      imageUV = uv; photoUV = point / photoSize;
      gl_Position = vec4(photoUV.x*2.0-1.0, 1.0-photoUV.y*2.0, 0.0, 1.0);
    }`));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D artwork; uniform sampler2D photograph; uniform vec3 lightBase;
    varying vec2 imageUV; varying vec2 photoUV;
    void main() {
      vec3 fabric = texture2D(photograph, photoUV).rgb;
      vec3 ink = texture2D(artwork, imageUV).rgb;
      vec3 light = clamp(fabric / lightBase, 0.30, 1.22);
      gl_FragColor = vec4(ink * light, 1.0);
    }`));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Shader link failed");
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  for (const [name, offset] of [["point",0],["uv",8]]) {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,2,gl.FLOAT,false,16,offset);
  }
  const textures = [0,1].map(unit => {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return texture;
  });
  gl.uniform1i(gl.getUniformLocation(program,"artwork"),0);
  gl.uniform1i(gl.getUniformLocation(program,"photograph"),1);
  const upload = (unit,image) => {
    gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,textures[unit]);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  };
  let previous;
  canvas.dataset.renderer = "webgl";
  return {
    draw(source,art,changed) {
      if (gl.isContextLost()) throw new Error("Graphics context lost");
      if (previous !== source) {
        gl.bufferData(gl.ARRAY_BUFFER,source.mesh,gl.STATIC_DRAW);
        gl.uniform2f(gl.getUniformLocation(program,"photoSize"),source.config.width,source.config.height);
        gl.uniform3fv(gl.getUniformLocation(program,"lightBase"),source.config.light);
        upload(1,source.image);
      }
      if (changed || !previous) upload(0,art);
      previous = source;
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES,0,source.mesh.length/4);
    },
  };
}

function paintTriangle(context,art,points) {
  const width = art.naturalWidth || art.width, height = art.naturalHeight || art.height;
  const src = points.map(p => [p[2]*width,p[3]*height]);
  const [a,b,c] = src;
  const denominator = a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]);
  const coefficients = axis => [
    (points[0][axis]*(b[1]-c[1])+points[1][axis]*(c[1]-a[1])+points[2][axis]*(a[1]-b[1]))/denominator,
    (points[0][axis]*(c[0]-b[0])+points[1][axis]*(a[0]-c[0])+points[2][axis]*(b[0]-a[0]))/denominator,
    (points[0][axis]*(b[0]*c[1]-c[0]*b[1])+points[1][axis]*(c[0]*a[1]-a[0]*c[1])+points[2][axis]*(a[0]*b[1]-b[0]*a[1]))/denominator,
  ];
  const x = coefficients(0), y = coefficients(1);
  context.save(); context.beginPath();
  // Offset every edge by a full pixel. Moving vertices radially leaves seams
  // on narrow triangles because it barely moves their long edges.
  const normals = points.map((p,i) => {
    const q=points[(i+1)%3],dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy);
    return [dy/length,-dx/length];
  });
  points.forEach((p,i) => {
    const a=normals[(i+2)%3],b=normals[i];
    const scale=1/Math.max(.01,1+a[0]*b[0]+a[1]*b[1]);
    context[i ? "lineTo" : "moveTo"](p[0]+(a[0]+b[0])*scale,p[1]+(a[1]+b[1])*scale);
  });
  context.closePath(); context.clip();
  context.transform(x[0],y[0],x[1],y[1],x[2],y[2]);
  context.drawImage(art,0,0); context.restore();
}

function canvasDevice(canvas) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  const mask = document.createElement("canvas"); mask.width=canvas.width; mask.height=canvas.height;
  const maskContext = mask.getContext("2d");
  canvas.dataset.renderer = "canvas2d";
  return {
    draw(source,art) {
      if (!source.lighting) {
        source.lighting = document.createElement("canvas");
        source.lighting.width=source.config.width; source.lighting.height=source.config.height;
        const light = source.lighting.getContext("2d");
        light.drawImage(source.image,0,0,source.config.width,source.config.height);
        const pixels = light.getImageData(0,0,source.config.width,source.config.height);
        for (let i=0;i<pixels.data.length;i+=4) for (let c=0;c<3;c++) pixels.data[i+c]=Math.max(76,pixels.data[i+c]/source.config.light[c]);
        light.putImageData(pixels,0,0);
        source.fallbackMesh=photoMesh(source.key,12,32);
      }
      context.clearRect(0,0,canvas.width,canvas.height);
      context.save(); context.scale(canvas.width/source.config.width,canvas.height/source.config.height);
      const mesh=source.fallbackMesh;
      for (let i=0;i<mesh.length;i+=12) paintTriangle(context,art,[mesh.subarray(i,i+4),mesh.subarray(i+4,i+8),mesh.subarray(i+8,i+12)]);
      context.restore();
      if (mask.width!==canvas.width || mask.height!==canvas.height) { mask.width=canvas.width; mask.height=canvas.height; }
      maskContext.clearRect(0,0,mask.width,mask.height); maskContext.drawImage(canvas,0,0);
      context.globalCompositeOperation="multiply";
      context.drawImage(source.lighting,0,0,canvas.width,canvas.height);
      context.globalCompositeOperation="destination-in"; context.drawImage(mask,0,0);
      context.globalCompositeOperation="source-over";
    },
  };
}

export function createSceneRenderer({ canvas,example,preview,scene,sources,background,status,retry }) {
  const cache = new Map();
  let exampleBitmap;
  let device, active, revision=0, painted=-1, ticket=0;
  function fail() {
    scene.dataset.photoState="error";
    scene.setAttribute("aria-busy","false");
    status.textContent="Не удалось открыть сцену."; retry.hidden=false;
  }
  function draw() {
    try {
      const {width,height}=active.config;
      if (canvas.width!==width || canvas.height!==height) { canvas.width=width; canvas.height=height; }
      if (!device) {
        const gl=canvas.getContext("webgl",{ alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:true });
        device=gl ? webglDevice(canvas,gl) : canvasDevice(canvas);
      }
      if (preview.hidden && !exampleBitmap) {
        exampleBitmap=document.createElement("canvas");
        exampleBitmap.width=preview.width; exampleBitmap.height=preview.height;
        exampleBitmap.getContext("2d").drawImage(example,0,0,exampleBitmap.width,exampleBitmap.height);
      }
      device.draw(active,preview.hidden ? exampleBitmap : preview,painted!==revision);
      painted=revision;
      background.src=active.image.src;
      scene.dataset.photoState="ready";
      scene.setAttribute("aria-busy","false"); status.textContent=""; retry.hidden=true;
    } catch { fail(); }
  }
  function render(changed=false) {
    if (changed) revision++;
    const key=scene.dataset.scene;
    if (!PHOTO_SCENES.includes(key)) {
      ticket++; delete scene.dataset.photoState;
      scene.style.removeProperty("aspect-ratio");
      scene.setAttribute("aria-busy","false"); status.textContent=""; retry.hidden=true;
      return;
    }
    const config=PHOTO_CONFIG[key];
    scene.style.aspectRatio=`${config.width} / ${config.height}`;
    if (active?.key===key) { draw(); return; }
    const request=++ticket;
    scene.dataset.photoState="loading";
    scene.setAttribute("aria-busy","true"); status.textContent="Загрузка…"; retry.hidden=true;
    if (!cache.has(key)) {
      const image=new Image(); image.src=sources[key];
      cache.set(key,Promise.all([image.decode(),example.decode()]).then(() => ({key,image,config,mesh:photoMesh(key)})));
    }
    cache.get(key).then(source => {
      if (request!==ticket || scene.dataset.scene!==key) return;
      active=source; painted=-1; draw();
    }).catch(() => {
      cache.delete(key);
      if (request===ticket && scene.dataset.scene===key) fail();
    });
  }
  retry.addEventListener("click",() => { active=null; render(); });
  canvas.addEventListener("webglcontextlost",event => {
    event.preventDefault(); device=null; painted=-1;
    if (PHOTO_SCENES.includes(scene.dataset.scene)) fail();
  });
  canvas.addEventListener("webglcontextrestored",() => { device=null; painted=-1; render(); });
  return { render };
}
