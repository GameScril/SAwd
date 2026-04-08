/**
 * Google OAuth 2.0 and Photos API Integration
 * 
 * Handles:
 * - OAuth 2.0 authorization flow
 * - Refresh token management
 * - Google Photos API access
 * - Album creation/management
 * - Photo uploads to Google Photos
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');
const { exec } = require('child_process');
require('dotenv').config();

// ===== Constants =====
const SCOPES = [
    'https://www.googleapis.com/auth/photoslibrary.appendonly',
    'https://www.googleapis.com/auth/photoslibrary.sharing'
];
const ALBUM_NAME = 'Slaviša & Ana Wedding';
const TOKEN_PATH = path.join(__dirname, '.env');

/**
 * Normalize env values copied from dashboards/CLI.
 * Removes surrounding quotes and trims whitespace/newlines.
 */
function normalizeEnvValue(value) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/^['\"]|['\"]$/g, '');
}

/**
 * Upload raw image bytes to Google Photos and return upload token.
 * This endpoint is separate from the discovery-based Photos API methods.
 *
 * @param {string} accessToken
 * @param {Object} file
 * @returns {Promise<string>}
 */
function uploadBytes(accessToken, file) {
    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: 'photoslibrary.googleapis.com',
                path: '/v1/uploads',
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-type': 'application/octet-stream',
                    'Content-Length': file.buffer.length,
                    'X-Goog-Upload-File-Name': file.originalname,
                    'X-Goog-Upload-Protocol': 'raw'
                }
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                        return;
                    }

                    reject(new Error(`Upload bytes failed: ${res.statusCode} ${data}`));
                });
            }
        );

        req.on('error', (error) => {
            reject(error);
        });

        req.write(file.buffer);
        req.end();
    });
}

/**
 * Send a JSON request to the Google Photos Library API.
 *
 * @param {string} accessToken
 * @param {string} method
 * @param {string} requestPath
 * @param {Object|null} body
 * @returns {Promise<Object>}
 */
function requestJson(accessToken, method, requestPath, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;

        const req = https.request(
            {
                hostname: 'photoslibrary.googleapis.com',
                path: requestPath,
                method,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            },
            (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    const trimmed = data.trim();
                    const parsed = trimmed ? (() => {
                        try {
                            return JSON.parse(trimmed);
                        } catch (error) {
                            return null;
                        }
                    })() : null;

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed || {});
                        return;
                    }

                    const message = parsed?.error?.message || trimmed || `HTTP ${res.statusCode}`;
                    reject(new Error(message));
                });
            }
        );

        req.on('error', (error) => {
            reject(error);
        });

        if (payload) {
            req.setHeader('Content-Length', Buffer.byteLength(payload));
            req.write(payload);
        }

        req.end();
    });
}

/**
 * Get OAuth 2.0 client
 * @returns {google.auth.OAuth2} Configured OAuth2 client
 */
function getOAuth2Client() {
    const clientId = normalizeEnvValue(process.env.GOOGLE_CLIENT_ID);
    const clientSecret = normalizeEnvValue(process.env.GOOGLE_CLIENT_SECRET);
    const redirectUri = normalizeEnvValue(process.env.GOOGLE_REDIRECT_URI);

    return new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri
    );
}

/**
 * Get authorization URL for user to visit
 * Used during first-time setup
 * @returns {string} Authorization URL
 */
function getAuthorizationUrl() {
    const oauth2Client = getOAuth2Client();
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent' // Force consent every time to ensure refresh token
    });
    return authUrl;
}

/**
 * Get access token using refresh token
 * This is called before each API request to ensure valid token
 * 
 * @returns {Promise<string>} Valid access token
 * @throws {Error} If refresh token is invalid or expired
 */
async function getAccessToken() {
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
        throw new Error(
            'Refresh token not found. Please run "node auth.js" to authenticate.'
        );
    }

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        return credentials.access_token;
    } catch (error) {
        console.error('Failed to refresh access token:', error.message);
        throw new Error(
            'Authentication failed. Please run "node auth.js" again to re-authenticate.'
        );
    }
}

/**
 * Get or create the shared album
 * Albums are used to organize and share photos
 * 
 * @param {string} accessToken - Valid Google OAuth access token
 * @returns {Promise<string>} Album ID
 */
async function getOrCreateAlbum(accessToken) {
    try {
        const cachedAlbumId = normalizeEnvValue(process.env.GOOGLE_ALBUM_ID);

        if (cachedAlbumId) {
            console.log(`✅ Using cached album: ${ALBUM_NAME} (${cachedAlbumId})`);
            return cachedAlbumId;
        }

        // List existing albums
        // Create new album if not found
        console.log(`📸 Creating new album: ${ALBUM_NAME}`);
        const createResponse = await requestJson(accessToken, 'POST', '/v1/albums', {
            album: {
                title: ALBUM_NAME
            }
        });

        const albumId = createResponse.id;
        console.log(`✅ Album created: ${albumId}`);

        if (!process.env.VERCEL) {
            const envPath = path.join(__dirname, '.env');
            let envContent = fs.readFileSync(envPath, 'utf8');

            if (envContent.includes('GOOGLE_ALBUM_ID=')) {
                envContent = envContent.replace(/GOOGLE_ALBUM_ID=.*/, `GOOGLE_ALBUM_ID=${albumId}`);
            } else {
                envContent += `\nGOOGLE_ALBUM_ID=${albumId}`;
            }

            fs.writeFileSync(envPath, envContent);
            process.env.GOOGLE_ALBUM_ID = albumId;
        } else {
            console.log('ℹ️ Running on Vercel; skipping .env write. Add GOOGLE_ALBUM_ID to Vercel env vars to persist this album ID.');
        }

        return albumId;

    } catch (error) {
        console.error('Album operation error:', error.message);
        throw new Error(`Failed to get/create album: ${error.message}`);
    }
}

/**
 * Upload photos to Google Photos and add to album
 * 
 * Process:
 * 1. Get valid access token
 * 2. Get/create shared album
 * 3. For each file:
 *    a. Upload file bytes to get upload token
 *    b. Create media item with upload token and album ID
 * 4. Return results
 * 
 * @param {Array<Object>} files - Array of multer file objects with buffer, originalname, mimetype
 * @returns {Promise<Object>} Upload results { success, uploadedCount, failedCount, message }
 */
async function uploadPhotosToAlbum(files) {
    try {
        // Get access token
        const accessToken = await getAccessToken();

        // Get or create album
        const albumId = await getOrCreateAlbum(accessToken);

        let uploadedCount = 0;
        let failedCount = 0;
        const failedFiles = [];

        // Upload each file
        for (const file of files) {
            try {
                console.log(`📤 Uploading: ${file.originalname}`);

                // Step 1: Upload file bytes to get upload token
                const uploadToken = await uploadBytes(accessToken, file);

                if (!uploadToken) {
                    throw new Error('No upload token received from Google');
                }

                // Step 2: Create media item with upload token and add to album
                const batchResponse = await requestJson(accessToken, 'POST', '/v1/mediaItems:batchCreate', {
                    albumId,
                    newMediaItems: [
                        {
                            description: file.originalname,
                            simpleMediaItem: {
                                uploadToken
                            }
                        }
                    ]
                });

                // Check if creation was successful
                if (batchResponse.newMediaItemResults && batchResponse.newMediaItemResults[0]?.mediaItem) {
                    uploadedCount++;
                    console.log(`✅ Uploaded: ${file.originalname}`);
                } else {
                    const error = batchResponse.newMediaItemResults?.[0]?.status;
                    failedCount++;
                    failedFiles.push(`${file.originalname}: ${error?.message || 'Unknown error'}`);
                    console.error(`❌ Failed: ${file.originalname}`);
                }

            } catch (error) {
                failedCount++;
                failedFiles.push(`${file.originalname}: ${error.message}`);
                console.error(`❌ Error uploading ${file.originalname}:`, error.message);
            }
        }

        // Return results
        const message = `${uploadedCount} photo(s) uploaded successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`;
        
        console.log(`\n📊 Upload Summary:`);
        console.log(`   ✅ Successful: ${uploadedCount}`);
        console.log(`   ❌ Failed: ${failedCount}`);
        console.log(`   📁 Album: ${ALBUM_NAME}`);

        return {
            success: uploadedCount > 0,
            uploadedCount,
            failedCount,
            failedFiles,
            message
        };

    } catch (error) {
        console.error('Upload failed:', error.message);
        return {
            success: false,
            uploadedCount: 0,
            failedCount: files.length,
            message: `Upload failed: ${error.message}`
        };
    }
}

/**
 * Interactive OAuth flow for first-time setup
 * Guides user through Google authentication process
 * 
 * Usage: node auth.js
 */
async function authenticate() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log(`
    ╔════════════════════════════════════════════╗
    ║   Google Authentication Setup              ║
    ║   Slaviša & Ana Wedding Photos             ║
    ╚════════════════════════════════════════════╝
    `);

    // Check for required environment variables
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.error(`
    ❌ Missing Google OAuth credentials!
    
    Please set these in your .env file:
    - GOOGLE_CLIENT_ID
    - GOOGLE_CLIENT_SECRET
    - GOOGLE_REDIRECT_URI
    
    See README.md for setup instructions.
        `);
        rl.close();
        process.exit(1);
    }

    const authUrl = getAuthorizationUrl();

    // Best-effort browser launch for first-time setup.
    // Falls back to manual copy/paste if this fails.
    try {
        if (process.platform === 'win32') {
            exec(`start "" "${authUrl}"`);
        } else if (process.platform === 'darwin') {
            exec(`open "${authUrl}"`);
        } else {
            exec(`xdg-open "${authUrl}"`);
        }
        console.log('🌐 Opened authentication URL in your default browser.');
    } catch (error) {
        console.log('ℹ️ Could not open browser automatically. Please open the URL manually.');
    }

    console.log(`
    📋 Next Steps:
    
    1. Open this link in your browser:
    ${authUrl}
    
    2. Sign in with your Google account
    3. Grant permission to access Google Photos (append-only)
    4. You will be redirected to: ${process.env.GOOGLE_REDIRECT_URI}
    5. The refresh token will be automatically saved to .env
    
    📍 Or copy/paste the URL above into your browser...
    `);

    // For automation, we could open the browser, but the user can do it manually
    // In production, you might want to use something like 'open' or 'start' command
    
    rl.question('\n✅ Press Enter after you\'ve completed authentication in your browser...', () => {
        rl.close();

        // Check if refresh token was saved
        require('dotenv').config(); // Reload
        
        if (process.env.GOOGLE_REFRESH_TOKEN) {
            console.log(`
    ✅ Success! Refresh token saved to .env
    
    You can now run the server:
    npm start
            `);
        } else {
            console.error(`
    ❌ Refresh token not found in .env
    
    Make sure you:
    1. Completed Google authentication
    2. Were redirected to the callback URL
    3. The token was saved automatically
    
    If you're still having issues, check that:
    - GOOGLE_REDIRECT_URI in .env matches OAuth credentials
    - You granted all permissions
            `);
            process.exit(1);
        }
    });
}

/**
 * CLI: Handle command-line invocation
 * Usage: node auth.js
 */
if (require.main === module) {
    authenticate().catch(error => {
        console.error('Authentication error:', error);
        process.exit(1);
    });
}

// ===== Module Exports =====
module.exports = {
    getOAuth2Client,
    getAuthorizationUrl,
    getAccessToken,
    getOrCreateAlbum,
    uploadPhotosToAlbum,
    authenticate
};
