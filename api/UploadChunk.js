const { google } = require('googleapis');
const multer = require('multer');
const stream = require('stream');
const { Pool } = require('pg');
const { dbFilesConf } = require('../config/Database');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
    ...dbFilesConf,
    ssl: {
        rejectUnauthorized: false
    }
});

const upload = multer().single('chunk');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const drive = google.drive({
    version: 'v3',
    auth: oauth2Client
});

// Modify the session management
const SESSION_TIMEOUT = 30 * 60 * 1000;
const uploadSessions = new Map();

const uploadChunk = async (req, res) => {
    let client;
    try {
        // Handle multer upload first
        await new Promise((resolve, reject) => {
            upload(req, res, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Validate request body and file
        if (!req.body || !req.file || !req.file.buffer) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid request data' 
            });
        }

        const { chunkIndex, totalChunks, fileName, sessionId } = req.body;

        // Validate required fields
        if (!sessionId || !chunkIndex || !totalChunks) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Initialize session for first chunk
        if (chunkIndex === '0') {
            try {
                const uniqueFileName = `${uuidv4()}.pdf`;
                const fileMetadata = {
                    name: uniqueFileName,
                    parents: [process.env.GOOGLE_DRIVE_FILES_FOLDER_ID]
                };

                // Create empty file without media content first
                const response = await drive.files.create({
                    requestBody: fileMetadata,
                    fields: 'id'
                });

                uploadSessions.set(sessionId, {
                    fileId: response.data.id,
                    buffer: Buffer.alloc(0),
                    totalSize: parseInt(totalChunks),
                    receivedChunks: new Set(),
                    originalFileName: fileName,
                    uniqueFileName: uniqueFileName,
                    lastAccessed: Date.now()
                });

                console.log(`Session ${sessionId} initialized with file ID: ${response.data.id}`);
            } catch (error) {
                console.error('Session initialization error:', error);
                throw error;
            }
        }

        // Get and validate session
        const session = uploadSessions.get(sessionId);
        if (!session) {
            console.error(`Session ${sessionId} not found. Active sessions:`, uploadSessions.keys());
            return res.status(400).json({
                success: false,
                message: 'Upload session not found or expired'
            });
        }

        // Update session timestamp
        session.lastAccessed = Date.now();

        // Process chunk
        const chunkIndexNum = parseInt(chunkIndex);
        if (!session.receivedChunks.has(chunkIndexNum)) {
            try {
                session.buffer = Buffer.concat([session.buffer, req.file.buffer]);
                session.receivedChunks.add(chunkIndexNum);
                uploadSessions.set(sessionId, session); // Update session in Map
            } catch (error) {
                console.error('Chunk processing error:', error);
                throw new Error('Failed to process chunk');
            }
        }

        // Handle final chunk
        if (session.receivedChunks.size === parseInt(totalChunks)) {
            try {
                // Create a readable stream from the complete buffer
                const bufferStream = new stream.PassThrough();
                bufferStream.end(session.buffer);

                // Update file with actual content
                await drive.files.update({
                    fileId: session.fileId,
                    media: {
                        mimeType: 'application/pdf',
                        body: bufferStream
                    },
                    fields: 'id'
                });

                // Set file permissions and enable thumbnail generation
                await drive.permissions.create({
                    fileId: session.fileId,
                    requestBody: {
                        role: 'reader',
                        type: 'anyone'
                    }
                });

                // Force thumbnail generation
                await drive.files.get({
                    fileId: session.fileId,
                    fields: 'thumbnailLink',
                    supportsAllDrives: true
                });

                // Save metadata to database
                const { title, author, year, topic, keywords, summary } = req.body;
                
                client = await pool.connect();
                const result = await client.query(
                    `INSERT INTO archive 
                    (title, author, year, topic, keywords, summary, file_id, original_filename, status) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
                    RETURNING id`,
                    [title, author, year, topic, keywords, summary, session.fileId, 
                     session.originalFileName, 'processing']
                );

                // Clean up session after successful upload
                uploadSessions.delete(sessionId);
                console.log(`Session ${sessionId} completed and cleaned up`);

                return res.json({
                    success: true,
                    message: 'File uploaded successfully',
                    fileId: session.fileId,
                    recordId: result.rows[0].id,
                    thumbnailPending: true
                });
            } catch (error) {
                console.error('Final chunk processing error:', error);
                throw error;
            }
        }

        // Return progress
        return res.json({
            success: true,
            message: 'Chunk received',
            progress: (session.receivedChunks.size / parseInt(totalChunks)) * 100,
            chunkIndex: chunkIndexNum,
            totalChunks: parseInt(totalChunks)
        });

    } catch (error) {
        console.error('Upload chunk error:', {
            error,
            body: req.body,
            sessionId: req.body?.sessionId
        });
        return res.status(500).json({
            success: false,
            message: error.message || 'Upload failed',
            error: error.toString()
        });
    } finally {
        if (client) client.release();
    }
};

// Clean up stale sessions periodically
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of uploadSessions.entries()) {
        if (now - session.lastAccessed > SESSION_TIMEOUT) {
            uploadSessions.delete(sessionId);
            console.log(`Session ${sessionId} expired and cleaned up`);
        }
    }
}, 60000);

module.exports = uploadChunk;
