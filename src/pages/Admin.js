import { useState, useEffect } from 'react';
import "./Admin.css"
import { v4 as uuidv4 } from 'uuid';
import bootstrap from 'bootstrap/dist/js/bootstrap.bundle';

const Admin = () => {
    const [fileUploaded, setFileUploaded] = useState(null);
    const [fileError, setFileError] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedTopic, setSelectedTopic] = useState('');
    const [modalFile, setModalFile] = useState(null);
    const [files, setFiles] = useState([]);

    const resetForm = () => {
        setFileUploaded(null);
        setFileError(null);
        document.getElementById('uploadForm').reset();
    };

    useEffect(() => {
        const modal = document.getElementById('uploadModal');
        if (modal) {
            modal.addEventListener('hidden.bs.modal', resetForm);
            return () => modal.removeEventListener('hidden.bs.modal', resetForm);
        }
    }, []);

    useEffect(() => {
        fetchFiles();
    }, []);

    const fetchFiles = async () => {
        try {
            const response = await fetch('/api/GetFiles');
            const data = await response.json();

            if (data.success) {
                setFiles(data.files);
            } else {
                console.error('Error fetching files:', data.message);
            }
        } catch (error) {
            console.error('Error fetching files:', error);
        }
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file && file.type === 'application/pdf') {
            setFileUploaded(file);
        } else {
            setFileError('Please select a PDF file.');
            event.target.value = '';
            setFileUploaded(null);
        }
    };

    const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB

    const uploadFileInChunks = async (file) => {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const sessionId = uuidv4();

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(file.size, start + CHUNK_SIZE);
            const chunk = file.slice(start, end);

            const formData = new FormData();
            formData.append('chunk', chunk);
            formData.append('chunkIndex', chunkIndex);
            formData.append('totalChunks', totalChunks);
            formData.append('fileName', file.name);
            formData.append('sessionId', sessionId);

            const response = await fetch('/api/UploadChunk', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.message || 'Chunk upload failed');
            }
        }

        return sessionId;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsUploading(true);

        try {
            const sessionId = await uploadFileInChunks(fileUploaded);
            if (sessionId) {
                alert('File uploaded successfully!');
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            alert(`Error uploading file: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleSubmitOld = async (e) => {
        e.preventDefault();
        setIsUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', fileUploaded);
            formData.append('title', document.getElementById('uploadTitle').value);
            formData.append('author', document.getElementById('uploadAuthor').value);
            formData.append('year', document.getElementById('uploadYear').value);
            formData.append('topic', selectedTopic);
            formData.append('keywords', document.getElementById('uploadKeywords').value);
            formData.append('summary', document.getElementById('uploadSummary').value);

            const response = await fetch('/api/Upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data?.message || data?.error || 'Upload failed');
            }

            await fetchFiles();

            const modalElement = document.getElementById('uploadModal');
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            if (modalInstance) {
                modalInstance.hide();
                // Remove modal backdrop manually
                const backdrop = document.querySelector('.modal-backdrop');
                if (backdrop) {
                    backdrop.remove();
                }
                // Reset body classes
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
            }

            resetForm();
            alert('File uploaded successfully!');

        } catch (error) {
            console.error('Upload error:', error);
            alert(`Error uploading file: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleTopicChange = (e) => {
        setSelectedTopic(e.target.value);
    };

    const handleEditClick = (file) => {
        setModalFile(file);
    };

    const handleDeleteClick = (file) => {
        setModalFile(file);
    };

    return (
        <>
            <div className="admin-container">
                <h2 style={{ alignSelf: "center", fontWeight: "600" }}>Admin Panel</h2>

                <button
                    type="button"
                    className="upload-btn"
                    data-bs-toggle="modal"
                    data-bs-target="#uploadModal"
                ><i className="fas fa-upload"></i> Upload New Resource
                </button>

                <div className="files-list">
                    {files.map(file => (
                        <div key={file.id} className="file-item">
                            {file.thumbnailUrl && (
                                <img
                                    src={file.thumbnailUrl}
                                    alt={file.title}
                                    className="thumbnail"
                                />
                            )}
                            <div className="file-info">
                                <div className="title">{file.title}</div>
                                <div className="topic">{file.topic}</div>
                                <div className="keywords">{file.keywords}</div>
                                <div className="year">{file.year}</div>
                            </div>
                            <div className="actions">
                                <button
                                    type="button"
                                    className="upload-btn"
                                    data-bs-toggle="modal"
                                    data-bs-target="#editModal"
                                    onClick={() => handleEditClick(file)}
                                >Edit</button>

                                <button
                                    type="button"
                                    className="red-btn"
                                    data-bs-toggle="modal"
                                    data-bs-target="#deleteModal"
                                    onClick={() => handleDeleteClick(file)}
                                >Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="modal fade" id="deleteModal" tabIndex="-1" aria-labelledby="deleteModalLabel" aria-hidden="true">
                <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title" id="deleteModalLabel">Delete Resource</h5>
                            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div className="modal-body">
                            <div className="deleteModal-content">
                                {modalFile && (
                                    <>
                                        <img
                                            id="editThumbnailDelete"
                                            src={modalFile.thumbnailUrl}
                                            alt={modalFile.title}
                                            className="thumbnail"
                                        />
                                        <p id="editTitleDelete" style={{ marginTop: "5px", marginBottom: "10px", fontWeight: "bold" }}>
                                            {modalFile.title} ({modalFile.year})
                                        </p>
                                        <p>
                                            by <strong>{modalFile.author}</strong>
                                        </p>
                                        <p style={{ marginTop: "5px", marginBottom: "10px" }}>
                                            Are you sure you want to delete this file? This action cannot be undone.
                                        </p>
                                        <button id="confirmDeleteBtn" className="btn btn-danger">Delete</button>
                                    </>
                                )}
                                <button type="button" style={{ marginLeft: "15px" }} className="btn btn-secondary">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="modal fade" id="uploadModal" tabIndex="-1" aria-labelledby="uploadModalLabel" aria-hidden="true">
                <div className="modal-dialog">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title" id="uploadModalLabel">Upload Resource</h5>
                            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div className="modal-body">
                            <form id="uploadForm" className="form-container" onSubmit={handleSubmit}>
                                <div className="file-input-container">
                                    <label htmlFor="file-upload" className="custom-file-label">Choose PDF File</label>
                                    <input
                                        id="file-upload"
                                        type="file"
                                        name="file"
                                        accept="application/pdf"
                                        onChange={handleFileChange}
                                        required
                                    />
                                    <div className="text-danger mt-2 text-center">{fileError}</div>
                                    {fileUploaded ?
                                        <div id="file-name" className="file-name">{fileUploaded.name}</div>
                                        : null}
                                </div>
                                <div className="form-group">
                                    <label htmlFor="uploadTitle">Title:</label>
                                    <input type="text" id="uploadTitle" placeholder="Title" required></input>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="uploadAuthor">Author:</label>
                                    <input type="text" id="uploadAuthor" placeholder="Author" required></input>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="uploadYear">Year:</label>
                                    <input type="text" id="uploadYear" placeholder="Year" required></input>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="uploadTopics">Topic:</label>
                                    <div id="uploadTopics" className="radio-group">
                                        {['Science', 'Technology', 'Engineering', 'Mathematics', 'Medicine', 'Education', 'Health'].map((topic) => (
                                            <label key={topic} className="radio-option">
                                                <input
                                                    type="radio"
                                                    name="topic"
                                                    value={topic}
                                                    onChange={handleTopicChange}
                                                    checked={selectedTopic === topic}
                                                    required
                                                /> {topic}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="uploadKeywords">Keywords:</label>
                                    <input type="text" id="uploadKeywords" placeholder="Keywords (comma-separated)" required></input>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="uploadSummary">Summary:</label>
                                    <textarea id="uploadSummary" placeholder="Summary of the resource" required></textarea>
                                </div><div className={`spinner ${isUploading ? '' : 'hidden'}`}></div>
                                <button
                                    type="submit"
                                    className="upload-btn"
                                    disabled={isUploading || !fileUploaded}
                                >
                                    {isUploading ? 'Uploading...' : 'Upload Resource'}
                                </button>
                                <button
                                    type="button"
                                    className="red-btn"
                                    data-bs-dismiss="modal"
                                    style={{ marginLeft: '1rem' }}
                                    onClick={resetForm}
                                >
                                    Cancel
                                </button>                            </form>                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Admin;