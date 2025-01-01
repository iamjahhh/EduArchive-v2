const { Pool } = require('pg');
const { dbFilesConf } = require('../config/Database');
const { PDFDocument, rgb } = require('pdf-lib');
const multer = require('multer');

const pool = new Pool({
    ...dbFilesConf,
    ssl: {
        rejectUnauthorized: false
    }
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
    return await pdfDoc.save({ compress: true });
}

async function generateThumbnail(pdfBuffer) {
    try {
        // Load the PDF
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];

        // Create a new document for the thumbnail
        const thumbnailDoc = await PDFDocument.create();
        const [copiedPage] = await thumbnailDoc.copyPages(pdfDoc, [0]);
        thumbnailDoc.addPage(copiedPage);

        // Convert to PNG with high resolution
        const pngBytes = await thumbnailDoc.saveAsBase64({
            resolution: 150,
            imageFormat: 'png'
        });

        // Convert base64 to buffer
        return Buffer.from(pngBytes, 'base64');
    } catch (error) {
        console.error('Thumbnail generation error:', error);
        return null;
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
        console.log('Starting file processing...');
        const compressedPdfBuffer = await compressPDF(req.file.buffer);
        console.log('PDF compressed, size:', compressedPdfBuffer.length);

        const thumbnailBuffer = await generateThumbnail(req.file.buffer);
        console.log('Thumbnail generated, size:', thumbnailBuffer?.length);

        client = await pool.connect();
        console.log('Database connected');

        const result = await client.query(
            `INSERT INTO archive 
            (title, author, year, topic, keywords, summary, file_data, thumbnail) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING id`,
            [
                title,
                author,
                year,
                topic,
                keywords,
                summary,
                compressedPdfBuffer,
                thumbnailBuffer
            ]
        );

        console.log('Insert successful, ID:', result.rows[0].id);

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
