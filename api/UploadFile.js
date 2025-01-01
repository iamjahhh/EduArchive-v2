const { Pool } = require('pg');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');

// Configure PostgreSQL connection
const pool = new Pool({
    host: "aws-0-ap-southeast-1.pooler.supabase.com",
    user: "postgres.mqtfasojsdfhkiggvpvu",
    password: "Putangina02!",
    database: "postgres",
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    }
});

// Configure multer for file upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
}).single('file');

// Compress PDF function
async function compressPDF(buffer) {
    const pdfDoc = await PDFDocument.load(buffer);
    return await pdfDoc.save({ compress: true });
}

// API handler
module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    let client;
    try {
        // Handle file upload
        await new Promise((resolve, reject) => {
            upload(req, res, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Get form data
        const { title, author, year, topic, keywords, summary } = req.body;

        // Compress PDF
        const compressedPdfBuffer = await compressPDF(req.file.buffer);

        // Connect to database
        client = await pool.connect();

        // Insert into database
        const result = await client.query(
            `INSERT INTO archive 
            (title, author, year, topic, keywords, summary, file_data) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING id`,
            [title, author, year, topic, keywords, summary, compressedPdfBuffer]
        );

        // Return success response
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
