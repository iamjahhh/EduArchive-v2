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

        const files = result.rows.map(file => ({
            ...file,
            thumbnail: file.thumbnail 
                ? `data:image/png;base64,${file.thumbnail}`
                : null
        }));

        console.log('Files retrieved:', files.length);
        console.log('Files with thumbnails:', files.filter(f => f.thumbnail).length);

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
