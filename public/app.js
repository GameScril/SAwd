// ===== State Management =====
let selectedFiles = [];
let siteUrl = window.location.origin;
const MAX_DISPLAYED_FAILURES = 2;

// ===== Initialize on Page Load =====
document.addEventListener('DOMContentLoaded', async function() {
    await loadRuntimeConfig();
    setupDragAndDrop();
    setupFileInput();
});

// ===== Load Runtime Config =====
async function loadRuntimeConfig() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) {
            return;
        }

        const config = await response.json();
        if (config.siteUrl) {
            siteUrl = config.siteUrl.replace(/\/$/, '');
        }
    } catch (error) {
        // Fallback to current origin when API config is unavailable.
        siteUrl = window.location.origin;
    }
}

// ===== Setup Drag & Drop =====
function setupDragAndDrop() {
    const uploadZone = document.getElementById('uploadZone');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadZone.addEventListener(eventName, () => {
            uploadZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, () => {
            uploadZone.classList.remove('dragover');
        });
    });

    uploadZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    });
}

// ===== Setup File Input =====
function setupFileInput() {
    const fileInput = document.getElementById('uploadInput');
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
}

// ===== Obrada izabranih fajlova =====
function isSupportedImageFile(file) {
    const supportedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/heic',
        'image/heif'
    ];

    if (supportedMimeTypes.includes(file.type)) {
        return true;
    }

    const fileName = (file.name || '').toLowerCase();
    return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(fileName);
}

function handleFiles(files) {
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
    const newFiles = Array.from(files).filter(file => {
        if (!isSupportedImageFile(file)) {
            showError(`"${file.name}" nije podržani slikovni fajl (JPG, PNG, WEBP, HEIC, HEIF)`);
            return false;
        }
        if (file.size > MAX_FILE_SIZE) {
            showError(`"${file.name}" premašuje dozvoljenih 20 MB i neće biti dodat`);
            return false;
        }
        return true;
    });

    selectedFiles = [...selectedFiles, ...newFiles];
    renderFileList();
    updateUploadButton();
}

// ===== Prikaz liste fajlova =====
function renderFileList() {
    const fileList = document.getElementById('fileList');

    if (selectedFiles.length === 0) {
        fileList.innerHTML = '';
        return;
    }

    fileList.innerHTML = selectedFiles.map((file, index) => {
        const size = (file.size / 1024 / 1024).toFixed(2);

        return `
            <div class="file-item">
                <img data-index="${index}" src="" alt="Pregled slike" />
                <div class="file-item-overlay">
                    <span class="file-size">${size}MB</span>
                    <button class="remove-file" onclick="removeFile(${index})">×</button>
                </div>
            </div>
        `;
    }).join('');

    // Učitavanje pregleda
    selectedFiles.forEach((file, index) => {
        const reader = new FileReader();
        const preview = document.querySelector(`img[data-index="${index}"]`);
        
        reader.onload = (e) => {
            preview.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ===== Uklanjanje fajla =====
function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderFileList();
    updateUploadButton();
}

// ===== Brisanje svih fajlova =====
function clearFiles() {
    selectedFiles = [];
    document.getElementById('uploadInput').value = '';
    renderFileList();
    updateUploadButton();
}

// ===== Ažuriranje stanja dugmeta za otpremanje =====
function updateUploadButton() {
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = selectedFiles.length === 0;
}

// ===== Otpremanje fajlova =====
async function uploadFiles() {
    if (selectedFiles.length === 0) {
        showError('Izaberite bar jednu fotografiju');
        return;
    }

    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;

    const progressContainer = document.getElementById('uploadProgress');
    progressContainer.classList.add('active');
    progressContainer.innerHTML = '';

    // Kreiranje pratilaca napretka
    const progressTrackers = selectedFiles.map((file, index) => ({
        index,
        name: file.name,
        loaded: 0,
        total: file.size
    }));

    // Prikaz traka napretka
    renderProgressBars(progressTrackers);

    try {
        let uploadedTotal = 0;
        let failedTotal = 0;
        const failedMessages = [];

        for (const tracker of progressTrackers) {
            const file = selectedFiles[tracker.index];
            const result = await uploadSingleFile(file, tracker);

            if (result.success) {
                uploadedTotal += result.uploaded;
            } else {
                failedTotal += result.failed;
                if (result.message) {
                    failedMessages.push(`${file.name}: ${result.message}`);
                }
            }
        }

        if (uploadedTotal > 0) {
            const summary = failedTotal > 0
                ? `${uploadedTotal} fotografija uspešno otpremljeno, ${failedTotal} nije uspelo.`
                : `${uploadedTotal} fotografija je uspešno otpremljeno!`;

            showSuccess(summary);
            if (failedMessages.length > 0) {
                showError(`Neuspešni fajlovi: ${failedMessages.slice(0, MAX_DISPLAYED_FAILURES).join(' | ')}`);
            }
            setTimeout(() => {
                showSuccessScreen();
                clearFiles();
                uploadBtn.disabled = false;
            }, 500);
            return;
        }

        const details = failedMessages.length > 0
            ? ` ${failedMessages.slice(0, MAX_DISPLAYED_FAILURES).join(' | ')}`
            : '';
        showError(`Otpremanje nije uspelo za ${failedTotal} fajl(a).${details}`);
        uploadBtn.disabled = false;
        progressContainer.classList.remove('active');

    } catch (error) {
        showError(`Otpremanje nije uspelo: ${error.message}`);
        uploadBtn.disabled = false;
        progressContainer.classList.remove('active');
    }
}

// ===== Client-side Image Compression =====
// Compresses images above 4 MB before upload, providing a safe margin below
// Vercel's ~4.5 MB serverless body limit.
// HEIC/HEIF files are skipped (server handles conversion via sharp).
async function compressImage(file) {
    const MAX_UPLOAD_SIZE = 4 * 1024 * 1024; // 4 MB – safe margin below Vercel's 4.5 MB limit
    const MAX_DIMENSION = 4096;
    const JPEG_QUALITY = 0.85;

    if (file.size <= MAX_UPLOAD_SIZE) {
        return file;
    }

    const lowerName = (file.name || '').toLowerCase();
    if (
        file.type === 'image/heic' || file.type === 'image/heif' ||
        lowerName.endsWith('.heic') || lowerName.endsWith('.heif')
    ) {
        // Browser cannot decode HEIC; let the server handle it
        return file;
    }

    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);

            let { width, height } = img;
            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                if (width >= height) {
                    height = Math.round(height * MAX_DIMENSION / width);
                    width = MAX_DIMENSION;
                } else {
                    width = Math.round(width * MAX_DIMENSION / height);
                    height = MAX_DIMENSION;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);

            // Build a safe output filename regardless of dots in the original name
            const lastDot = file.name.lastIndexOf('.');
            const baseName = lastDot > 0 ? file.name.substring(0, lastDot) : file.name;
            const compressedName = baseName + '.jpg';

            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const compressed = new File(
                            [blob],
                            compressedName,
                            { type: 'image/jpeg', lastModified: Date.now() }
                        );
                        // Prefer compressed when it fits within the upload limit
                        // or when it is at least smaller than the original
                        if (blob.size <= MAX_UPLOAD_SIZE || blob.size < file.size) {
                            resolve(compressed);
                            return;
                        }
                    }
                    resolve(file);
                },
                'image/jpeg',
                JPEG_QUALITY
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(file);
        };

        img.src = url;
    });
}

async function uploadSingleFile(file, tracker) {
    const fileToUpload = await compressImage(file);

    return new Promise((resolve) => {
        const formData = new FormData();
        formData.append('photos', fileToUpload);

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (!e.lengthComputable) {
                return;
            }

            const percentComplete = (e.loaded / e.total) * 100;
            updateProgressBar(tracker.index, percentComplete);
        });

        xhr.addEventListener('load', () => {
            let response = null;
            try {
                response = JSON.parse(xhr.responseText);
            } catch (error) {
                response = null;
            }

            if ((xhr.status === 200 || xhr.status === 201) && response?.success) {
                updateProgressBar(tracker.index, 100);
                resolve({
                    success: true,
                    uploaded: response.uploaded || 1,
                    failed: 0
                });
                return;
            }

            if (xhr.status === 413) {
                updateProgressBar(tracker.index, 0);
                resolve({
                    success: false,
                    uploaded: 0,
                    failed: 1,
                    message: 'Fajl je prevelik za otpremanje. Pokušajte sa manjom fotografijom.'
                });
                return;
            }

            updateProgressBar(tracker.index, 0);
            resolve({
                success: false,
                uploaded: 0,
                failed: 1,
                message: response?.message || 'Otpremanje nije uspelo'
            });
        });

        xhr.addEventListener('error', () => {
            updateProgressBar(tracker.index, 0);
            resolve({
                success: false,
                uploaded: 0,
                failed: 1,
                message: 'Greška u mreži tokom otpremanja'
            });
        });

        xhr.open('POST', '/api/upload');
        xhr.send(formData);
    });
}

// ===== Render Progress Bars =====
function renderProgressBars(trackers) {
    const progressContainer = document.getElementById('uploadProgress');
    progressContainer.innerHTML = trackers.map(tracker => `
        <div class="progress-item">
            <div class="progress-item-name">
                <span>${tracker.name}</span>
                <span id="progress-percent-${tracker.index}">0%</span>
            </div>
            <div class="progress-item-bar">
                <div class="progress-item-fill" id="progress-fill-${tracker.index}" style="width: 0%"></div>
            </div>
        </div>
    `).join('');
}

// ===== Update Progress Bars =====
function updateProgressBars(percentComplete, trackers) {
    trackers.forEach((tracker, index) => {
        updateProgressBar(tracker.index, percentComplete);
    });
}

function updateProgressBar(index, percentComplete) {
    const fillEl = document.getElementById(`progress-fill-${index}`);
    const percentEl = document.getElementById(`progress-percent-${index}`);

    if (!fillEl || !percentEl) {
        return;
    }

    fillEl.style.width = percentComplete + '%';
    percentEl.textContent = Math.round(percentComplete) + '%';
}

// ===== Show Error Message =====
function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.classList.add('show');

    setTimeout(() => {
        errorEl.classList.remove('show');
    }, 5000);
}

// ===== Show Info Message =====
function showInfo(message) {
    const infoEl = document.getElementById('infoMessage');
    infoEl.textContent = message;
    infoEl.classList.add('show');

    setTimeout(() => {
        infoEl.classList.remove('show');
    }, 5000);
}

// ===== Show Success Message =====
function showSuccess(message) {
    showInfo(message);
    createConfetti();
}

// ===== Show Success Screen =====
function showSuccessScreen() {
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('successScreen').classList.add('show');
}

// ===== Reset for More Uploads =====
function resetForMore() {
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('successScreen').classList.remove('show');
}

// ===== Confetti Animation =====
function createConfetti() {
    const colors = ['#d4af9f', '#c9a884', '#8b6f5e', '#f0d9ce'];
    
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * window.innerWidth + 'px';
        confetti.style.top = '-10px';
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.opacity = Math.random();
        
        document.body.appendChild(confetti);

        const duration = Math.random() * 2 + 2;
        const keyframes = `
            @keyframes fall-${i} {
                to {
                    transform: translateY(${window.innerHeight}px) rotateZ(${Math.random() * 360}deg);
                    opacity: 0;
                }
            }
        `;
        
        const style = document.createElement('style');
        style.textContent = keyframes;
        document.head.appendChild(style);

        confetti.style.animation = `fall-${i} ${duration}s linear forwards`;

        setTimeout(() => {
            confetti.remove();
        }, duration * 1000);
    }
}
