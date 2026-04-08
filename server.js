/**
 * Wedding Photo Upload Server
 * Express server that handles Google Photos authentication and photo uploads
 * 
 * Features:
 * - OAuth 2.0 authentication with Google
 * - File upload to Google Photos via REST API
 * - Album management (creates shared album if needed)
 * - Progress tracking
 * - Error handling
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { getAccessToken, uploadPhotosToAlbum } = require('./auth');

const app = express();
const port = process.env.PORT || 3000;

// ===== Middleware =====
app.use(express.static('public'));
app.use(express.json());

// Configure multer for file uploads (store in memory)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB per file
    },
    fileFilter: (req, file, cb) => {
        // Validate file type
        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images are allowed.'));
        }
    }
});

// ===== Routes =====

/**
 * GET /
 * Serves the main HTML file
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * GET /auth/callback
 * Handles OAuth 2.0 callback from Google
 * 
 * Query params:
 * - code: Authorization code from Google
 * - state: State parameter for CSRF protection
 */
app.get('/auth/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) {
        return res.status(400).send(`
            <html>
                <head><title>Authentication Error</title></head>
                <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
                    <div style="text-align: center;">
                        <h1>❌ Authentication Failed</h1>
                        <p>${error}</p>
                        <p><a href="/" style="color: #d4af9f;">Return to Wedding Photos</a></p>
                    </div>
                </body>
            </html>
        `);
    }

    if (!code) {
        return res.status(400).send('Authorization code not found');
    }

    try {
        // Exchange authorization code for tokens
        const { google } = require('googleapis');
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        const { tokens } = await oauth2Client.getToken(code);

        // Save refresh token to .env
        if (tokens.refresh_token) {
            const envPath = path.join(__dirname, '.env');
            let envContent = fs.readFileSync(envPath, 'utf8');
            
            // Update or add GOOGLE_REFRESH_TOKEN
            if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
                envContent = envContent.replace(
                    /GOOGLE_REFRESH_TOKEN=.*/,
                    `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`
                );
            } else {
                envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
            }
            
            fs.writeFileSync(envPath, envContent);
            
            // Reload environment variables
            delete require.cache[require.resolve('dotenv')];
            require('dotenv').config();
        }

        return res.send(`
            <html>
                <head><title>Authentication Successful</title></head>
                <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
                    <div style="text-align: center;">
                        <h1>✅ Authentication Successful!</h1>
                        <p>Your Google Photos account has been linked.</p>
                        <p>You can now close this window and upload photos.</p>
                        <p><a href="/" style="color: #d4af9f; font-weight: bold;">Return to Wedding Photos</a></p>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('OAuth callback error:', error);
        return res.status(500).send(`
            <html>
                <head><title>Authentication Error</title></head>
                <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
                    <div style="text-align: center;">
                        <h1>❌ Error Processing Authentication</h1>
                        <p>${error.message}</p>
                        <p><a href="/" style="color: #d4af9f;">Return to Wedding Photos</a></p>
                    </div>
                </body>
            </html>
        `);
    }
});

/**
 * POST /api/upload
 * Handles file uploads
 * 
 * Expects: multipart/form-data with photos array
 * Returns: JSON with success status and number of uploaded photos
 * 
 * Process:
 * 1. Validate files
 * 2. Get access token from refresh token
 * 3. Upload each photo to Google Photos
 * 4. Add to shared album
 */
app.post('/api/upload', upload.array('photos', 50), async (req, res) => {
    try {
        // Validate files
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }

        console.log(`Received ${req.files.length} files for upload`);

        // Validate refresh token
        if (!process.env.GOOGLE_REFRESH_TOKEN) {
            return res.status(401).json({
                success: false,
                message: 'Google authentication required. Please run: node auth.js'
            });
        }

        try {
            // Get access token and upload photos
            const result = await uploadPhotosToAlbum(req.files);

            return res.json({
                success: result.success,
                uploaded: result.uploadedCount,
                failed: result.failedCount,
                message: result.message
            });
        } catch (error) {
            console.error('Upload error:', error);

            // Check if it's an authentication error
            if (error.message && error.message.includes('unauthorized')) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication failed. Please run: node auth.js'
                });
            }

            return res.status(500).json({
                success: false,
                message: error.message || 'Upload failed'
            });
        }

    } catch (error) {
        console.error('Request error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during upload'
        });
    }
});

/**
 * GET /auth/status
 * Returns authentication status
 * Useful for frontend to check if Google auth is configured
 */
app.get('/api/auth/status', (req, res) => {
    const hasRefreshToken = !!process.env.GOOGLE_REFRESH_TOKEN;
    const hasClientId = !!process.env.GOOGLE_CLIENT_ID;
    const hasClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;

    res.json({
        authenticated: hasRefreshToken && hasClientId && hasClientSecret,
        hasRefreshToken,
        hasClientId,
        hasClientSecret
    });
});

/**
 * GET /api/config
 * Returns public runtime config used by frontend
 */
app.get('/api/config', (req, res) => {
    res.json({
        siteUrl: process.env.SITE_URL || `http://localhost:${port}`
    });
});

/**
 * Error handling middleware
 */
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);

    // Multer errors
    if (error instanceof multer.MulterError) {
        if (error.code === 'FILE_TOO_LARGE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum 20MB per file.'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files. Maximum 50 files at once.'
            });
        }
    }

    if (error.message && error.message.includes('Invalid file type')) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    res.status(500).json({
        success: false,
        message: 'Server error'
    });
});

// ===== Start Server (local only) =====
if (require.main === module) {
    app.listen(port, () => {
        console.log(`
    ╔════════════════════════════════════════════╗
    ║   Wedding Photo Upload Server              ║
    ║   Slaviša & Ana 💍                         ║
    ╚════════════════════════════════════════════╝
    
    🚀 Server running at: http://localhost:${port}
    
    📸 First time setup:
    1. Run: node auth.js
    2. Complete Google authentication in browser
    3. Return here and start uploading photos!
    
    🌐 Share URL: ${process.env.SITE_URL || `http://localhost:${port}`}
    `);
    });
}

// Gracefully handle shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Server shutting down...');
    process.exit(0);
});

module.exports = app;
