const { google } = require('googleapis');
const multer = require('multer');

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

            const res = await drive.files.create({
                resource: fileMetadata,
                media: {
                    mimeType: 'application/pdf',
                    body: Buffer.from([]) // Empty buffer for initialization
                },
                fields: 'id',
                supportsAllDrives: true,
                uploadType: 'resumable'
            });

            uploadSessions[sessionId] = {
                fileId: res.data.id,
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
            // Upload complete file
            await drive.files.update({
                fileId: session.fileId,
                media: {
                    body: session.buffer
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

            // Clean up session
            delete uploadSessions[sessionId];

            return res.json({
                success: true,
                message: 'File uploaded successfully',
                fileId: session.fileId
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
    }
};

module.exports = uploadChunk;
