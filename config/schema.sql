-- Drop the table if it exists (be careful with this in production!)
DROP TABLE IF EXISTS archive;

-- Create the table with the specified schema
CREATE TABLE archive (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    year VARCHAR(4) NOT NULL,
    topic VARCHAR(50) NOT NULL,
    keywords TEXT NOT NULL,
    summary TEXT NOT NULL,
    file_id VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'processing',
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    downloads INT DEFAULT 0
);

-- Create indices for frequently searched columns
CREATE INDEX idx_archive_topic ON archive(topic);
CREATE INDEX idx_archive_year ON archive(year);
CREATE INDEX idx_archive_upload_date ON archive(upload_date);
CREATE INDEX idx_archive_status ON archive(status);

-- Create enum for status if you want to restrict values
-- COMMENT: Possible status values: 'processing', 'ready', 'failed', 'deleted'