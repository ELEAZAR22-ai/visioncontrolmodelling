const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const canvasWrapper = document.getElementById('canvasWrapper');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const detectBtn = document.getElementById('detectBtn');
const resetBtn = document.getElementById('resetBtn');
const loaderOverlay = document.getElementById('loaderOverlay');
const confThreshold = document.getElementById('confThreshold');
const confValue = document.getElementById('confValue');
const resultsList = document.getElementById('resultsList');
const emptyState = document.getElementById('emptyState');
const detectionCount = document.getElementById('detectionCount');
const errorBanner = document.getElementById('errorBanner');

let selectedFile = null;
let loadedImage = null;
let rawPredictions = [];

// Update confidence slider display and re-filter existing results
confThreshold.addEventListener('input', () => {
  confValue.textContent = `${confThreshold.value}%`;
  if (loadedImage && rawPredictions.length > 0) {
    renderDetections();
  }
});

// Trigger file picker
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleFileSelection(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFileSelection(e.target.files[0]);
  }
});

resetBtn.addEventListener('click', () => {
  selectedFile = null;
  loadedImage = null;
  rawPredictions = [];
  fileInput.value = '';
  canvasWrapper.classList.add('hidden');
  resetBtn.classList.add('hidden');
  dropZone.classList.remove('hidden');
  resultsList.classList.add('hidden');
  emptyState.classList.remove('hidden');
  errorBanner.classList.add('hidden');
  detectionCount.textContent = '0 found';
  detectBtn.disabled = true;
});

function handleFileSelection(file) {
  if (!file.type.startsWith('image/')) {
    showError('Please upload a valid image file (JPG, PNG, or WEBP).');
    return;
  }

  selectedFile = file;
  rawPredictions = [];
  errorBanner.classList.add('hidden');

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      drawBaseImage();
      dropZone.classList.add('hidden');
      canvasWrapper.classList.remove('hidden');
      resetBtn.classList.remove('hidden');
      detectBtn.disabled = false;
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function drawBaseImage() {
  if (!loadedImage) return;
  canvas.width = loadedImage.width;
  canvas.height = loadedImage.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(loadedImage, 0, 0);
}

// Run Inference
detectBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  loaderOverlay.classList.remove('hidden');
  detectBtn.disabled = true;
  errorBanner.classList.add('hidden');

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);

    const response = await fetch('/api/predict', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Prediction failed.');
    }

    // Parse Ultralytics response structure (handles both Dedicated & Shared endpoints)
    rawPredictions = extractPredictions(data);
    renderDetections();
  } catch (err) {
    showError(err.message);
  } finally {
    loaderOverlay.classList.add('hidden');
    detectBtn.disabled = false;
  }
});

function extractPredictions(apiResponse) {
  // Ultralytics returns detections inside images[0].results or data[0].results
  if (apiResponse?.images?.[0]?.results) {
    return apiResponse.images[0].results;
  }
  if (Array.isArray(apiResponse?.data) && apiResponse.data[0]?.results) {
    return apiResponse.data[0].results;
  }
  if (Array.isArray(apiResponse?.results)) {
    return apiResponse.results;
  }
  return [];
}

function renderDetections() {
  drawBaseImage();

  const minConf = Number(confThreshold.value) / 100;
  const filtered = rawPredictions.filter((item) => (item.confidence ?? 0) >= minConf);

  detectionCount.textContent = `${filtered.length} found`;
  emptyState.classList.add('hidden');
  resultsList.classList.remove('hidden');
  resultsList.innerHTML = '';

  if (filtered.length === 0) {
    resultsList.innerHTML = `
      <div class="empty-state">
        <p>No objects detected above <strong>${confThreshold.value}%</strong> confidence. Try lowering the confidence slider.</p>
      </div>`;
    return;
  }

  // Scale line thickness and font relative to image resolution
  const scale = Math.max(1, Math.round(canvas.width / 600));
  const lineWidth = 3 * scale;
  const fontSize = 15 * scale;

  filtered.forEach((det) => {
    const label = det.name || `Class ${det.class}`;
    const confPct = ((det.confidence || 0) * 100).toFixed(1);

    // 1. Add item to right-hand results list
    const card = document.createElement('div');
    card.className = 'result-item';
    card.innerHTML = `
      <div class="result-top">
        <span class="class-name">${escapeHtml(label)}</span>
        <span class="confidence-badge">${confPct}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${confPct}%"></div>
      </div>
    `;
    resultsList.appendChild(card);

    // 2. Draw bounding box on canvas if box coordinates exist
    if (det.box) {
      const { x1, y1, x2, y2 } = det.box;
      const boxW = x2 - x1;
      const boxH = y2 - y1;

      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(x1, y1, boxW, boxH);

      // Label pill background
      const text = `${label} ${confPct}%`;
      ctx.font = `600 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
      const textMetrics = ctx.measureText(text);
      const padX = 8 * scale;
      const pillH = fontSize + 10 * scale;
      const pillY = Math.max(0, y1 - pillH);

      ctx.fillStyle = '#7c3aed';
      ctx.fillRect(x1, pillY, textMetrics.width + padX * 2, pillH);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x1 + padX, pillY + fontSize + 2 * scale);
    }
  });
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.remove('hidden');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}