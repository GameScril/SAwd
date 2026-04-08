let siteUrl = window.location.origin.replace(/\/$/, '');

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
        siteUrl = window.location.origin.replace(/\/$/, '');
    }
}

function generateQRCode() {
    const qrUrl = `${siteUrl}/`;
    const encodedUrl = encodeURIComponent(qrUrl);
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodedUrl}`;
    document.getElementById('qrCode').src = qrApiUrl;
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadRuntimeConfig();
    generateQRCode();
});
