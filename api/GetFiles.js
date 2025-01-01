const { Pool } = require('pg');
const { dbFilesConf } = require('../config/Database');

const pool = new Pool({
    ...dbFilesConf,
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    let client;
    try {
        client = await pool.connect();
        
        const result = await client.query(
            `SELECT 
                id,
                title,
                author,
                year,
                topic,
                keywords,
                summary,
                upload_date,
                downloads,
                encode(thumbnail, 'base64') as thumbnail
            FROM archive 
            ORDER BY upload_date DESC`
        );

        // Convert thumbnail to base64 URL with error handling
        const files = result.rows.map(file => ({
            ...file,
            thumbnail: file.thumbnail 
                ? `data:image/png;base64,${file.thumbnail}`
                : '/default-thumbnail.png' // You can add a default thumbnail image
        }));

        console.log('Thumbnails processed:', files.map(f => !!f.thumbnail)); // Debug log

        return res.status(200).json({
            success: true,
            files
        });

    } catch (error) {
        console.error('Database error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching files',
            error: error.message
        });
    } finally {
        if (client) {
            client.release();
        }
    }
};
