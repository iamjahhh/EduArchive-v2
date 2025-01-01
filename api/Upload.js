const { Pool } = require('pg');
const { PDFDocument } = require('pdf-lib');

const stream = require('stream');
const multer = require('multer');

const { dbFilesConf } = require('../config/Database');
const { google } = require('googleapis');

const { fromBuffer } = require('pdf2pic');
const { v4: uuidv4 } = require('uuid');

require('dotenv').config();

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

async function generateThumbnail(pdfBuffer) {
    try {
        const options = {
            density: 100,
            saveFilename: "thumbnail",
            format: "png",
            width: 200,
            height: 280
        };
        
        const convert = fromBuffer(pdfBuffer, options);
        const pageToConvert = 1;
        
        const result = await convert(pageToConvert);
        return result.buffer;
    } catch (error) {
        console.error('Thumbnail generation error:', error);
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

        console.log('Starting upload to Drive:', {
            name,
            mimeType,
            folderId,
            type: isFile ? 'file' : 'thumbnail'
        });

        const fileMetadata = {
            name,
            parents: [folderId]
        };

        const media = {
            mimeType,
            body: bufferStream
        };

        const file = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id'
        });

        console.log(`${isFile ? 'File' : 'Thumbnail'} uploaded successfully:`, file.data.id);
        return file.data.id;
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
        const thumbnailBuffer = await generateThumbnail(req.file.buffer);

        const fileId = await uploadToDrive(compressedPdfBuffer, `${uuidv4()}.pdf`, 'application/pdf', true);
        const thumbnailId = await uploadToDrive(thumbnailBuffer, `${uuidv4()}_thumbnail.png`, 'image/png', false);

        client = await pool.connect();

        const result = await client.query(
            `INSERT INTO archive 
            (title, author, year, topic, keywords, summary, file_id, thumbnail_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING id`,
            [title, author, year, topic, keywords, summary, fileId, thumbnailId]
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