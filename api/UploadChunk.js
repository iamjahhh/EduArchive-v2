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

// Increase session timeout and add better session management
const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour timeout
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

const uploadSessions = {};
const sessionTimestamps = {};

// Add retry mechanism for chunk upload
const uploadChunkWithRetry = async (req, res, retryCount = 0) => {  // Add res parameter
    try {
        // Update session timestamp on every request
        const { sessionId } = req.body;
        if (sessionId) {
            sessionTimestamps[sessionId] = Date.now();
        }

        return await uploadChunk(req, res);  // Pass res to uploadChunk
    } catch (error) {
        if (retryCount < MAX_RETRIES && error.message === 'Upload session not found') {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return uploadChunkWithRetry(req, res, retryCount + 1);  // Pass res to recursive call
        }
        throw error;
    }
};

const uploadChunk = async (req, res) => {  // Add res parameter
    let client;
    try {
        await new Promise((resolve, reject) => {
            upload(req, res, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: 'No file chunk provided' });
        }

        const { chunkIndex, totalChunks, fileName, sessionId } = req.body;
        const chunk = req.file.buffer;
        const chunkSize = chunk.length;

        // Initialize session with more robust error handling
        if (chunkIndex === '0') {
            if (uploadSessions[sessionId]) {
                // Clean up existing session if it exists
                delete uploadSessions[sessionId];
                delete sessionTimestamps[sessionId];
            }

            const uniqueFileName = `${uuidv4()}.pdf`;
            
            // Create drive file first
            const response = await drive.files.create({
                requestBody: {
                    name: uniqueFileName,
                    parents: [process.env.GOOGLE_DRIVE_FILES_FOLDER_ID]
                },
                fields: 'id'
            });

            uploadSessions[sessionId] = {
                fileId: response.data.id,
                buffer: Buffer.alloc(0),
                totalSize: parseInt(totalChunks) * chunkSize,
                receivedChunks: new Set(),
                originalFileName: fileName,
                uniqueFileName: uniqueFileName,
                lastActivity: Date.now()
            };
            
            sessionTimestamps[sessionId] = Date.now();
        }

        // Verify session exists and is valid
        const session = uploadSessions[sessionId];
        if (!session) {
            console.error(`Session not found: ${sessionId}`);
            console.error('Active sessions:', Object.keys(uploadSessions));
            console.error('Session timestamps:', sessionTimestamps);
            throw new Error('Upload session not found');
        }

        // Update last activity
        session.lastActivity = Date.now();
        
        // Add chunk with validation
        const chunkIndexNum = parseInt(chunkIndex);
        if (!session.receivedChunks.has(chunkIndexNum)) {
            try {
                session.buffer = Buffer.concat([
                    session.buffer,
                    chunk
                ]);
                session.receivedChunks.add(chunkIndexNum);
            } catch (error) {
                console.error('Error adding chunk:', error);
                throw new Error('Failed to process chunk');
            }
        }

        // Check if this is the last chunk
        if (session.receivedChunks.size === parseInt(totalChunks)) {
            // Create a readable stream from the complete buffer
            const bufferStream = new stream.PassThrough();
            bufferStream.end(session.buffer);

            // Upload complete file
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

            // Clean up session
            delete uploadSessions[sessionId];
            delete sessionTimestamps[sessionId];

            return res.json({
                success: true,
                message: 'File uploaded successfully',
                fileId: session.fileId,
                recordId: result.rows[0].id,
                thumbnailPending: true
            });
        }

        // Return detailed progress for non-final chunks
        return res.json({
            success: true,
            message: 'Chunk received',
            progress: (session.receivedChunks.size / parseInt(totalChunks)) * 100,
            chunkSize: req.file.size,
            receivedChunks: session.receivedChunks.size,
            totalChunks: parseInt(totalChunks)
        });

    } catch (error) {
        console.error('Chunk upload error:', {
            error,
            sessionId: req.body?.sessionId,
            chunkIndex: req.body?.chunkIndex,
            totalChunks: req.body?.totalChunks
        });
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
};

// Export the retry wrapper instead of the original function
module.exports = async (req, res) => {
    try {
        const result = await uploadChunkWithRetry(req, res);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
            error: error.message
        });
    }
};
