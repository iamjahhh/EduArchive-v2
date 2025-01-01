const { Pool } = require('pg');
const { dbFilesConf } = require('../config/Database');
const { PDFDocument, rgb } = require('pdf-lib');
const multer = require('multer');
const sharp = require('sharp');
const { degrees } = require('pdf-lib');

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
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const firstPage = pdfDoc.getPages()[0];
        
        // Get page dimensions
        const { width, height } = firstPage.getSize();
        
        // Create a new PDF with white background for the thumbnail
        const thumbnailPdf = await PDFDocument.create();
        const thumbnailPage = thumbnailPdf.addPage([width, height]);
        
        // Draw white background
        thumbnailPage.drawRectangle({
            x: 0,
            y: 0,
            width: width,
            height: height,
            color: rgb(1, 1, 1), // white
        });
        
        // Copy the first page content
        const [copiedPage] = await thumbnailPdf.copyPages(pdfDoc, [0]);
        thumbnailPdf.addPage(copiedPage);

        // Save as PNG with higher resolution
        const pngBytes = await thumbnailPdf.saveAsBase64({
            resolution: 150,
            pageIndex: 0
        });

        // Convert base64 to buffer and process with sharp
        const pngBuffer = Buffer.from(pngBytes, 'base64');
        
        // Process with sharp
        const thumbnail = await sharp(pngBuffer)
            .resize(200, 280, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .png()
            .toBuffer();

        return thumbnail;
    } catch (error) {
        console.error('Thumbnail generation error:', error);
        // Return a default thumbnail or null
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
        const compressedPdfBuffer = await compressPDF(req.file.buffer);
        const thumbnailBuffer = await generateThumbnail(req.file.buffer);

        client = await pool.connect();

        const result = await client.query(
            `INSERT INTO archive 
            (title, author, year, topic, keywords, summary, file_data, thumbnail) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING id`,
            [title, author, year, topic, keywords, summary, compressedPdfBuffer, thumbnailBuffer]
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
