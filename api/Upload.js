const { Pool } = require('pg');
const { dbFilesConf } = require('../config/Database');
const { PDFDocument } = require('pdf-lib');
const multer = require('multer');
const { google } = require('googleapis');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const stream = require('stream');

const pool = new Pool({
    ...dbFilesConf,
    ssl: {
        rejectUnauthorized: false
    }
});

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });

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
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const firstPage = pdfDoc.getPages()[0];
        const { width, height } = firstPage.getSize();

        const thumbnailPdf = await PDFDocument.create();
        const [copiedPage] = await thumbnailPdf.copyPages(pdfDoc, [0]);
        thumbnailPdf.addPage(copiedPage);

        const thumbnailBytes = await thumbnailPdf.saveAsBase64({
            resolution: 72,
            imageFormat: 'png'
        });

        const thumbnailBuffer = Buffer.from(thumbnailBytes, 'base64');
        const optimizedThumbnail = await sharp(thumbnailBuffer)
            .resize(200, 280, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .png({ quality: 80 })
            .toBuffer();

        return optimizedThumbnail;
    } catch (error) {
        console.error('Thumbnail generation error:', error);
        return null;
    }
}

async function uploadToDrive(buffer, name, mimeType) {
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const fileMetadata = {
        name,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
    };
    const media = {
        mimeType,
        body: bufferStream
    };
    const response = await drive.files.create({
        resource: fileMetadata,
        media,
        fields: 'id'
    });
    return response.data.id;
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

        const fileId = await uploadToDrive(compressedPdfBuffer, `${uuidv4()}.pdf`, 'application/pdf');
        const thumbnailId = await uploadToDrive(thumbnailBuffer, `${uuidv4()}_thumbnail.png`, 'image/png');

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