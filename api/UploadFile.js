const { Pool } = require('pg');
const { dbFilesConf } = require('../config/Database');
const { PDFDocument } = require('pdf-lib');
const multer = require('multer');
const sharp = require('sharp');

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
        
        // Convert PDF page to PNG
        const pngBytes = await firstPage.render({
            width: 200,
            height: 280
        }).toBuffer();

        // Optimize the PNG using sharp
        const thumbnail = await sharp(pngBytes)
            .resize(200, 280, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255 }
            })
            .png({ quality: 80 })
            .toBuffer();

        return thumbnail;
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
