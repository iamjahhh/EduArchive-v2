const { google } = require('googleapis');
const { Pool } = require('pg');
const { dbFilesConf } = require('../config/Database');

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

module.exports = async (req, res) => {
    let client;
    
    try {
        const { fileId } = req.body;
        
        if (!fileId) {
            return res.status(400).json({
                success: false,
                message: 'File ID is required'
            });
        }

        client = await pool.connect();
        const result = await client.query(
            'SELECT file_id FROM archive WHERE id = $1',
            [fileId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        const driveFileId = result.rows[0].file_id;

        await drive.files.delete({
            fileId: driveFileId
        });

        await client.query(
            'DELETE FROM archive WHERE id = $1',
            [fileId]
        );

        return res.json({
            success: true,
            message: 'File deleted successfully'
        });

    } catch (error) {
        console.error('Delete file error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error deleting file',
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
};
