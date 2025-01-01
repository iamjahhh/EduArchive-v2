const { Pool } = require('pg');
const { PDFDocument } = require('pdf-lib');
const { dbFilesConf } = require('../config/Database');
const { pdfToPng } = require('pdf-to-png-converter');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');

const stream = require('stream');
const multer = require('multer');

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

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
        const tempPdfPath = path.join(os.tmpdir(), `${uuidv4()}.pdf`);
        await fs.writeFile(tempPdfPath, pdfBuffer);

        const pngPath = path.join(os.tmpdir(), `${uuidv4()}_thumbnail.png`);
        await pdfToPng.convert(tempPdfPath, {
            outputFolderPath: path.dirname(pngPath),
            fileNameWithoutExtension: path.basename(pngPath, '.png'),
            pageNumbers: [1], 
            height: 280, 
            width: 200
        });

        const thumbnailBuffer = await fs.readFile(pngPath);

        await fs.unlink(tempPdfPath);
        await fs.unlink(pngPath);

        return thumbnailBuffer;
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

        const fileMetadata = {
            name,
            parents: [folderId]
        };

        const media = {
            mimeType,
            body: bufferStream
        };

        // Create file
        const file = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webContentLink'
        });

        // Set public permissions
        await drive.permissions.create({
            fileId: file.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });

        // Update sharing settings to make the file accessible
        await drive.files.update({
            fileId: file.data.id,
            requestBody: {
                copyRequiresWriterPermission: false,
                writersCanShare: true
            }
        });

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