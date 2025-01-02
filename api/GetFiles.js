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
    'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function getDriveFileUrl(fileId, isThumbnail = false) {
    try {
        const response = await drive.files.get({
            fileId: fileId,
            fields: 'webContentLink,webViewLink'
        });

        if (isThumbnail) {
            return `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`;
        }

        return response.data.webViewLink;
    } catch (error) {
        console.error(`Error getting file ${fileId}:`, error);
        return null;
    }
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
            fileUrl: await getDriveFileUrl(file.file_id, false),
            thumbnailUrl: await getDriveFileUrl(file.thumbnail_id, true)
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
