import { cropRect, exportSize, imageFormat, clamp, MAX_ZOOM } from "./custom-crop.mjs";
import { createSceneRenderer } from "./custom-scenes.mjs";
import { imagePdf } from "./custom-pdf.mjs";

const root = document.getElementById("custom-tapestry");
if (root) initEditor();

function initEditor() {
  const el = (id) => document.getElementById(`ct-${id}`);
  const fileInput = el("file");
  const uploadButton = el("upload-button");
  const stage = el("crop-stage");
  const cropCanvas = el("crop-canvas");
  const previewCanvas = el("preview-canvas");
  const cropContext = cropCanvas.getContext("2d");
  const previewContext = previewCanvas.getContext("2d");
  const zoomInput = el("zoom");
  const downloadButton = el("download");
  const pdfButton = el("download-pdf");
  const pointers = new Map();
  const state = { image: null, url: null, fileLabel: "", zoom: 1, centerX: 0, centerY: 0, loading: false, exporting: false, request: 0 };
  let frame = 0;
  let gesture = null;
  let dropDepth = 0;
  let loadAbort = null;

  if (!cropContext || !previewContext) {
    showError("Этот браузер не поддерживает редактор. Откройте страницу в современном браузере.");
    return;
  }
  uploadButton.disabled = false;
  const sources = Object.fromEntries(Array.from(root.querySelectorAll("[data-photo-url]"), button => [button.dataset.scene,button.dataset.photoUrl]));
  const sceneRenderer = createSceneRenderer({
    canvas: el("surface-canvas"), example: el("example"), preview: previewCanvas,
    scene: el("scene"), sources, background: el("photo-background"),
    status: el("photo-status"), retry: el("photo-retry"),
  });

  function rect() {
    return cropRect(state.image.naturalWidth, state.image.naturalHeight, state.zoom, state.centerX, state.centerY);
  }

  function syncControls() {
    const unavailable = !state.image || state.loading;
    zoomInput.disabled = unavailable;
    el("reset").disabled = unavailable;
    downloadButton.disabled = unavailable || state.exporting;
    pdfButton.disabled = unavailable || state.exporting;
    stage.setAttribute("aria-disabled", String(unavailable));
    stage.setAttribute("aria-busy", String(state.loading));
  }

  function showError(message) {
    el("error").textContent = message;
    el("error").hidden = !message;
  }

  function draw(context, target, source, selection) {
    // Transparent pixels use the same neutral base in every view and in export.
    context.fillStyle = "#f3efe6";
    context.fillRect(0, 0, target.width, target.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, selection.x, selection.y, selection.width, selection.height, 0, 0, target.width, target.height);
  }

  function render() {
    frame = 0;
    if (!state.image) return;
    const selection = rect();
    state.centerX = selection.centerX;
    state.centerY = selection.centerY;
    draw(cropContext, cropCanvas, state.image, selection);
    draw(previewContext, previewCanvas, state.image, selection);
    sceneRenderer.render(true);
    zoomInput.value = String(state.zoom);
    el("zoom-value").value = `${Math.round(state.zoom * 100)}%`;
    const lowResolution = selection.width < 1300 || selection.height < 1600;
    el("quality").dataset.quality = lowResolution ? "low" : "normal";
    el("quality").textContent = `${Math.floor(selection.width)} × ${Math.floor(selection.height)} пикс.${lowResolution ? " · Низкое разрешение" : ""}`;
  }

  function scheduleRender() {
    el("export-status").textContent = "";
    if (!frame) frame = requestAnimationFrame(render);
  }

  function resetCrop() {
    if (!state.image) return;
    state.zoom = 1;
    state.centerX = state.image.naturalWidth / 2;
    state.centerY = state.image.naturalHeight / 2;
    pointers.clear();
    gesture = null;
    stage.classList.remove("is-dragging");
    scheduleRender();
  }

  async function loadFile(input, { label = "", catalog = false } = {}) {
    if (!input) return;
    const request = ++state.request;
    loadAbort?.abort();
    loadAbort = new AbortController();
    const { signal } = loadAbort;
    let nextUrl = null;
    state.loading = true;
    pointers.clear();
    gesture = null;
    stage.classList.remove("is-dragging");
    syncControls();
    showError("");
    el("file-status").textContent = "Открываем изображение…";
    try {
      const file = typeof input === "function" ? await input(signal) : input;
      if (request !== state.request) return;
      if (file.size > 25 * 1024 * 1024) throw new Error("Файл больше 25 МБ. Выберите файл меньшего размера.");
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (request !== state.request) return;
      if (!imageFormat(bytes)) throw new Error("Выберите JPG, PNG или WebP. HEIC и другие форматы сначала сохраните как JPG или PNG.");
      nextUrl = URL.createObjectURL(file);
      const nextImage = new Image();
      await new Promise((resolve, reject) => {
        nextImage.onload = resolve;
        nextImage.onerror = () => reject(new Error("Не удалось открыть изображение. Попробуйте другой файл JPG, PNG или WebP."));
        nextImage.src = nextUrl;
      });
      if (request !== state.request) return;
      const { naturalWidth: width, naturalHeight: height } = nextImage;
      if (width * height > 32_000_000 || width > 12000 || height > 12000) throw new Error("Изображение слишком большое. Уменьшите его до 32 Мп и не более 12 000 пикселей по стороне.");
      if (width < 52 || height < 64) throw new Error("Изображение слишком маленькое. Выберите файл не меньше 52 × 64 пикселей.");
      if (state.url) URL.revokeObjectURL(state.url);
      state.image = nextImage;
      state.url = nextUrl;
      nextUrl = null;
      state.fileLabel = `${label || file.name} · ${width} × ${height} пикс.`;
      el("file-status").textContent = state.fileLabel;
      el("crop-empty").hidden = true;
      el("example").hidden = true;
      el("example-badge").hidden = true;
      previewCanvas.hidden = false;
      uploadButton.textContent = "Заменить изображение";
      resetCrop();
      if (catalog) {
        root.querySelector('button[data-scene="wall"]').click();
      } else {
        const url = new URL(window.location.href);
        if (url.searchParams.has("product")) {
          url.searchParams.delete("product");
          window.history.replaceState(null, "", url);
        }
      }
    } catch (error) {
      if (request !== state.request) return;
      showError(error.message || "Не удалось открыть файл. Попробуйте другое изображение.");
      el("file-status").textContent = state.fileLabel;
    } finally {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      if (request === state.request) {
        state.loading = false;
        syncControls();
      }
    }
  }

  uploadButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileInput.value = ""; // The same file can be selected again after reset or failure.
    loadFile(file);
  });
  const dropzone = el("dropzone");
  dropzone.addEventListener("dragenter", (event) => { event.preventDefault(); dropDepth++; dropzone.classList.add("is-dragging"); });
  dropzone.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; });
  dropzone.addEventListener("dragleave", () => { if (--dropDepth <= 0) { dropDepth = 0; dropzone.classList.remove("is-dragging"); } });
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropDepth = 0;
    dropzone.classList.remove("is-dragging");
    if (event.dataTransfer.files.length !== 1) { showError("Добавьте одно изображение за раз."); return; }
    loadFile(event.dataTransfer.files[0]);
  });
  // Prevent dropping a file outside the target from navigating away and losing work.
  for (const type of ["dragover", "drop"]) {
    window.addEventListener(type, (event) => {
      if (Array.from(event.dataTransfer?.types || []).includes("Files")) event.preventDefault();
    });
  }
  zoomInput.addEventListener("input", () => {
    if (!state.image || state.loading) return;
    state.zoom = Number(zoomInput.value);
    scheduleRender();
  });
  el("reset").addEventListener("click", resetCrop);

  function gestureMetrics() {
    const points = Array.from(pointers.values());
    const a = points[0];
    const b = points[1] || a;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(b.x - a.x, b.y - a.y) };
  }

  function beginGesture() {
    if (!pointers.size) { gesture = null; return; }
    const metrics = gestureMetrics();
    const bounds = stage.getBoundingClientRect();
    const selection = rect();
    gesture = { ...metrics, zoom: state.zoom, anchorX: selection.x + (metrics.x - bounds.left) / bounds.width * selection.width, anchorY: selection.y + (metrics.y - bounds.top) / bounds.height * selection.height };
  }

  stage.addEventListener("pointerdown", (event) => {
    if (!state.image || state.loading || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    stage.focus({ preventScroll: true });
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.classList.add("is-dragging");
    beginGesture();
  });
  stage.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId) || !gesture || state.loading) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const metrics = gestureMetrics();
    if (pointers.size >= 2 && gesture.distance > 0) state.zoom = clamp(gesture.zoom * metrics.distance / gesture.distance, 1, MAX_ZOOM);
    const selection = rect();
    const bounds = stage.getBoundingClientRect();
    state.centerX = gesture.anchorX - ((metrics.x - bounds.left) / bounds.width - 0.5) * selection.width;
    state.centerY = gesture.anchorY - ((metrics.y - bounds.top) / bounds.height - 0.5) * selection.height;
    scheduleRender();
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    stage.addEventListener(type, (event) => {
      if (!pointers.delete(event.pointerId)) return;
      stage.classList.toggle("is-dragging", pointers.size > 0);
      beginGesture();
    });
  }
  stage.addEventListener("keydown", (event) => {
    if (!state.image || state.loading) return;
    const directions = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const selection = rect();
    const step = (event.shiftKey ? 0.1 : 0.02) * selection.width;
    state.centerX = selection.centerX + direction[0] * step;
    state.centerY = selection.centerY + direction[1] * step;
    scheduleRender();
  });

  root.querySelectorAll("[data-scene]").forEach((button) => {
    if (button.tagName !== "BUTTON") return;
    button.addEventListener("click", () => {
      root.querySelectorAll("button[data-scene]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      el("scene").dataset.scene = button.dataset.scene;
      el("scene").setAttribute("aria-label", `Предпросмотр: ${button.textContent.toLowerCase()}`);
      root.querySelector(".ct-palette").hidden = Boolean(sources[button.dataset.scene]);
      sceneRenderer.render();
    });
  });

  root.querySelectorAll("[data-palette]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.palette;
      el("scene").style.setProperty(`--ct-${target}`, button.dataset.color);
      root.querySelectorAll(`[data-palette="${target}"]`).forEach((swatch) => swatch.setAttribute("aria-pressed", String(swatch === button)));
    });
  });

  async function exportImage(format) {
    if (!state.image || state.loading || state.exporting) return;
    state.exporting = true;
    syncControls();
    const source = state.image;
    const selection = rect();
    const size = exportSize(selection);
    el("export-status").textContent = "Готовим макет…";
    const output = document.createElement("canvas");
    try {
      output.width = size.width;
      output.height = size.height;
      const context = output.getContext("2d");
      if (!context) throw new Error("Не удалось создать макет. Попробуйте снова.");
      draw(context, output, source, selection);
      const blob = format === "pdf"
        ? await imagePdf(context.getImageData(0, 0, size.width, size.height))
        : await new Promise((resolve) => output.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Не удалось сохранить макет. Попробуйте другой браузер.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `wagich-130x160-maket.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      el("export-status").textContent = format === "pdf" ? "PDF · 130 × 160 см" : `PNG · ${size.width} × ${size.height} пикс.`;
    } catch (error) {
      el("export-status").textContent = error.message || "Не удалось сохранить макет. Попробуйте снова.";
    } finally {
      output.width = output.height = 1;
      state.exporting = false;
      syncControls();
    }
  }
  downloadButton.addEventListener("click", () => exportImage("png"));
  pdfButton.addEventListener("click", () => exportImage("pdf"));

  const product = new URLSearchParams(window.location.search).get("product");
  if (product) {
    try {
      const products = JSON.parse(el("catalog-products").textContent);
      if (!Object.hasOwn(products, product)) throw new Error("Этот гобелен не найден. Выберите другой товар или загрузите изображение.");
      const item = products[product];
      const url = new URL(item.src, window.location.href);
      if (url.origin !== window.location.origin) throw new Error("Не удалось открыть изображение товара.");
      loadFile(async (signal) => {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error("Не удалось загрузить изображение товара. Обновите страницу или загрузите изображение.");
        const blob = await response.blob();
        return new File([blob], `${product}.jpg`, { type: blob.type });
      }, { label: item.title, catalog: true });
    } catch (error) {
      showError(error.message || "Не удалось открыть изображение товара.");
    }
  }
}
