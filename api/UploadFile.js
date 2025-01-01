const { Pool } = require('pg');
const { dbFilesConf } = require('../config/Database');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');

const pool = new Pool(dbFilesConf);

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 
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

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

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

        const compressedPdfBuffer = await compressPDF(req.file.buffer);

        const client = await pool.connect();

        const result = await client.query(
            'INSERT INTO archive (title, author, year, topic, keywords, summary, file_data) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [
                req.body.title,
                req.body.author,
                req.body.year,
                req.body.topic,
                req.body.keywords,
                req.body.summary,
                compressedPdfBuffer
            ]
        );

        client.release();

        res.status(200).json({
            message: 'File uploaded successfully',
            fileId: result.rows[0].id
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            message: 'Error uploading file',
            error: error.message
        });
    }
};