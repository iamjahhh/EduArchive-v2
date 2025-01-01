const { Pool } = require('pg');
const { dbFilesConf } = require('../config/Database');
const { google } = require('googleapis');

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

async function getDriveFileUrl(fileId) {
    const response = await drive.files.get({
        fileId,
        fields: 'webViewLink'
    });
    return response.data.webViewLink;
}

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
                file_id,
                thumbnail_id
            FROM archive 
            ORDER BY upload_date DESC`
        );

        const files = await Promise.all(result.rows.map(async file => ({
            ...file,
            fileUrl: await getDriveFileUrl(file.file_id),
            thumbnailUrl: await getDriveFileUrl(file.thumbnail_id)
        })));

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
