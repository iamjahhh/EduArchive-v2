const { Pool } = require('pg');
const { PDFDocument } = require('pdf-lib');
const { dbFilesConf } = require('../config/Database');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const stream = require('stream');
const multer = require('multer');
const axios = require('axios');

const pool = new Pool({
    ...dbFilesConf,
    ssl: {
        rejectUnauthorized: false
    }
});

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

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
}).single('file');

async function compressPDF(buffer) {
    const pdfDoc = await PDFDocument.load(buffer);
    const compressedPdfBytes = await pdfDoc.save({
        useObjectStreams: false,
        addDefaultPage: false,
        compress: true
    });
    return Buffer.from(compressedPdfBytes);
}

async function generateThumbnail(pdfUrl) {
    try {
        // Make API request to PDFLayer
        const response = await axios({
            method: 'get',
            url: 'https://api.pdflayer.com/api/convert',
            params: {
                access_key: process.env.PDFLAYER_API_KEY,
                document_url: pdfUrl,
                page: 1,
                image_format: 'png',
                width: 200,
                height: 280,
                scale: '2.0',
                background_color: 'white'
            },
            responseType: 'arraybuffer'  // Important: get response as buffer
        });

        // Response is already a buffer when using responseType: 'arraybuffer'
        return response.data;
    } catch (error) {
        console.error('Thumbnail generation error:', error.response?.data || error.message);
        return null;
    }
}

async function uploadToDrive(buffer, name, mimeType, isFile = true) {
    try {
        const bufferStream = new stream.PassThrough();
        bufferStream.end(buffer);

        const folderId = isFile 
            ? process.env.GOOGLE_DRIVE_FILES_FOLDER_ID 
            : process.env.GOOGLE_DRIVE_THUMBNAILS_FOLDER_ID;

        const fileMetadata = {
            name,
            parents: [folderId]
        };

        const media = {
            mimeType,
            body: bufferStream
        };

        // Create file with more fields in response
        const file = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webContentLink, webViewLink'
        });

        // Set public permissions
        await drive.permissions.create({
            fileId: file.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });

        // Update sharing settings
        await drive.files.update({
            fileId: file.data.id,
            requestBody: {
                copyRequiresWriterPermission: false,
                writersCanShare: true
            }
        });

        // Immediately get a direct link that doesn't require authentication
        const publicUrl = file.data.webContentLink.replace('&export=download', '');

        return {
            fileId: file.data.id,
            webContentLink: publicUrl,
            webViewLink: file.data.webViewLink
        };
    } catch (error) {
        console.error('Drive upload error:', error);
        throw error;
    }
}

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    let client;
    try {
        await new Promise((resolve, reject) => {
            upload(req, res, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { title, author, year, topic, keywords, summary } = req.body;
        const compressedPdfBuffer = await compressPDF(req.file.buffer);

        // First upload the PDF
        const pdfUpload = await uploadToDrive(compressedPdfBuffer, `${uuidv4()}.pdf`, 'application/pdf', true);
        
        console.log('PDF uploaded, URL:', pdfUpload.webContentLink);
        
        // Generate thumbnail using the public URL
        const thumbnailBuffer = await generateThumbnail(pdfUpload.webContentLink);
        
        if (!thumbnailBuffer) {
            throw new Error('Failed to generate thumbnail');
        }

        // Upload the thumbnail
        const thumbnailUpload = await uploadToDrive(thumbnailBuffer, `${uuidv4()}_thumbnail.png`, 'image/png', false);

        client = await pool.connect();

        const result = await client.query(
            `INSERT INTO archive 
            (title, author, year, topic, keywords, summary, file_id, thumbnail_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING id`,
            [title, author, year, topic, keywords, summary, pdfUpload.fileId, thumbnailUpload.fileId]
        );

        return res.status(200).json({
            success: true,
            message: 'File uploaded successfully',
            fileId: result.rows[0].id
        });

    } catch (error) {
        console.error('Upload error:', {
            message: error.message,
            stack: error.stack
        });

        return res.status(500).json({
            success: false,
            message: 'Error uploading file',
            error: error.message
        });

    } finally {
        if (client) {
            client.release();
        }
    }
};