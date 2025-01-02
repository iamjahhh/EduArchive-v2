const { google } = require('googleapis');
const stream = require('stream');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const upload = multer().single('chunk');
const axios = require('axios');

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

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB

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

        const { chunkIndex, totalChunks, fileName } = req.body;
        const chunk = req.file.buffer;

        if (chunkIndex === '0') {
            // Start a resumable upload session
            const fileMetadata = {
                name: fileName,
                parents: [process.env.GOOGLE_DRIVE_FILES_FOLDER_ID],
            };

            const response = await drive.files.create({
                requestBody: fileMetadata,
                media: { mimeType: 'application/pdf' },
                fields: 'id',
                uploadType: 'resumable',
            });

            const uploadUrl = response.headers.location;
            req.session.uploadUrl = uploadUrl; // Store upload URL in session
            req.session.fileId = response.data.id;

            return res.json({
                success: true,
                uploadUrl,
                fileId: response.data.id
            });
        }

        const uploadUrl = req.session.uploadUrl;
        if (!uploadUrl) {
            return res.status(400).json({ success: false, message: 'Upload URL not found' });
        }

        const start = chunkIndex * CHUNK_SIZE;
        const end = start + chunk.byteLength - 1;
        const totalSize = totalChunks * CHUNK_SIZE;

        await axios.put(uploadUrl, chunk, {
            headers: {
                'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            },
        });


        if (parseInt(chunkIndex) + 1 === parseInt(totalChunks)) {
            res.json({
                success: true,
                message: 'File uploaded successfully',
                fileId: req.session.fileId,
            });
        } else {
            res.json({ success: true });
        }
    } catch (error) {
        console.error('Chunk upload error:', error);
        res.status(500).json({ success: false, message: 'Chunk upload failed', error: error.message });
    }
};

module.exports = uploadChunk;
