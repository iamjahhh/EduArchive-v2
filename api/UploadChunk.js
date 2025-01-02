const { google } = require('googleapis');
const multer = require('multer');
const stream = require('stream');
const { Pool } = require('pg');
const { dbFilesConf } = require('../config/Database');

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

// In-memory storage for upload sessions
const uploadSessions = {};

const uploadChunk = async (req, res) => {
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

        if (chunkIndex === '0') {
            // Initialize the upload session
            const fileMetadata = {
                name: fileName,
                parents: [process.env.GOOGLE_DRIVE_FILES_FOLDER_ID]
            };

            // Create a readable stream from an empty buffer
            const bufferStream = new stream.PassThrough();
            bufferStream.end(Buffer.from([]));

            const response = await drive.files.create({
                requestBody: fileMetadata,
                media: {
                    mimeType: 'application/pdf',
                    body: bufferStream
                },
                fields: 'id'
            });

            uploadSessions[sessionId] = {
                fileId: response.data.id,
                buffer: Buffer.alloc(0),
                totalSize: parseInt(totalChunks) * chunkSize,
                receivedChunks: new Set()
            };
        }

        const session = uploadSessions[sessionId];
        if (!session) {
            return res.status(400).json({ 
                success: false, 
                message: 'Upload session not found' 
            });
        }

        // Add chunk to session buffer
        const chunkIndexNum = parseInt(chunkIndex);
        if (!session.receivedChunks.has(chunkIndexNum)) {
            session.buffer = Buffer.concat([
                session.buffer,
                chunk
            ]);
            session.receivedChunks.add(chunkIndexNum);
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

            // Set file permissions
            await drive.permissions.create({
                fileId: session.fileId,
                requestBody: {
                    role: 'reader',
                    type: 'anyone'
                }
            });

            // Save metadata to database
            const { title, author, year, topic, keywords, summary } = req.body;
            
            client = await pool.connect();
            const result = await client.query(
                `INSERT INTO archive 
                (title, author, year, topic, keywords, summary, file_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7) 
                RETURNING id`,
                [title, author, year, topic, keywords, summary, session.fileId]
            );

            // Clean up session
            delete uploadSessions[sessionId];

            return res.json({
                success: true,
                message: 'File uploaded successfully',
                fileId: session.fileId,
                recordId: result.rows[0].id
            });
        }

        // Return progress for non-final chunks
        return res.json({
            success: true,
            message: 'Chunk received',
            progress: (session.receivedChunks.size / parseInt(totalChunks)) * 100
        });

    } catch (error) {
        console.error('Chunk upload error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Chunk upload failed', 
            error: error.message 
        });
    } finally {
        if (client) {
            client.release();
        }
    }
};

module.exports = uploadChunk;
