import { useState, useEffect, useRef } from 'react';
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
    const [uploadProgress, setUploadProgress] = useState([]);
    const [showUploadProgress, setShowUploadProgress] = useState(false);
    const [uploadStats, setUploadStats] = useState({
        totalSize: 0,
        uploadedSize: 0,
        startTime: null,
        chunks: []
    });
    const [elapsedTime, setElapsedTime] = useState(0);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const timerRef = useRef(null);

    // Add refs for modals
    const progressModalRef = useRef(null);
    const successModalRef = useRef(null);

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

    useEffect(() => {
        if (showUploadProgress && uploadStats.startTime) {
            timerRef.current = setInterval(() => {
                setElapsedTime(Date.now() - uploadStats.startTime);
            }, 100);

            return () => clearInterval(timerRef.current);
        }
    }, [showUploadProgress, uploadStats.startTime]);

    // Add effect to initialize modals
    useEffect(() => {
        // Initialize modals once when component mounts
        progressModalRef.current = new bootstrap.Modal(document.getElementById('uploadProgressModal'), {
            backdrop: 'static',
            keyboard: false
        });
        successModalRef.current = new bootstrap.Modal(document.getElementById('successModal'));
    }, []);

    // Add effect to handle modal visibility
    useEffect(() => {
        if (progressModalRef.current) {
            if (showUploadProgress) {
                progressModalRef.current.show();
            } else {
                progressModalRef.current.hide();
            }
        }
    }, [showUploadProgress]);

    useEffect(() => {
        if (successModalRef.current) {
            if (showSuccessModal) {
                successModalRef.current.show();
            } else {
                successModalRef.current.hide();
            }
        }
    }, [showSuccessModal]);

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

    const uploadFileInChunks = async (file, formDetails) => {
        const CHUNK_SIZE = 4 * 1024 * 1024; // Reduce chunk size to 2MB
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const sessionId = uuidv4();
        let uploadedChunks = 0;
        let retryCount = 0;
        const MAX_RETRIES = 3;

        // Initialize upload stats...
        setUploadStats({
            totalSize: file.size,
            uploadedSize: 0,
            startTime: Date.now(),
            chunks: Array(totalChunks).fill({ status: 'pending', speed: 0, time: 0 }),
            error: null
        });
        setShowUploadProgress(true);

        try {
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                let success = false;
                retryCount = 0;

                while (!success && retryCount < MAX_RETRIES) {
                    try {
                        const start = chunkIndex * CHUNK_SIZE;
                        const end = Math.min(file.size, start + CHUNK_SIZE);
                        const chunk = file.slice(start, end);
                        const chunkStartTime = Date.now();

                        const formData = new FormData();
                        formData.append('chunk', chunk);
                        formData.append('chunkIndex', chunkIndex.toString());
                        formData.append('totalChunks', totalChunks.toString());
                        formData.append('fileName', file.name);
                        formData.append('sessionId', sessionId);

                        if (chunkIndex === totalChunks - 1) {
                            Object.entries(formDetails).forEach(([key, value]) => {
                                formData.append(key, value);
                            });
                        }

                        const response = await fetch('/api/UploadChunk', {
                            method: 'POST',
                            body: formData,
                        });

                        if (!response.ok) {
                            throw new Error((await response.json()).message);
                        }

                        const result = await response.json();
                        success = true;
                        uploadedChunks++;

                        // Update chunk stats...
                        const chunkEndTime = Date.now();
                        const chunkTime = chunkEndTime - chunkStartTime;
                        const chunkSpeed = (chunk.size / 1024 / 1024) / (chunkTime / 1000);

                        setUploadStats(prev => ({
                            ...prev,
                            uploadedSize: prev.uploadedSize + chunk.size,
                            chunks: prev.chunks.map((c, i) =>
                                i === chunkIndex ?
                                { status: 'completed', speed: chunkSpeed, time: chunkTime } :
                                c
                            )
                        }));

                        if (result.fileId) {
                            return result.fileId;
                        }
                    } catch (error) {
                        retryCount++;
                        if (retryCount === MAX_RETRIES) {
                            throw error;
                        }
                        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                    }
                }
            }
        } catch (error) {
            setUploadStats(prev => ({
                ...prev,
                error: error.message,
                chunks: prev.chunks.map(c =>
                    c.status === 'pending' ? { ...c, status: 'failed' } : c
                )
            }));
            throw error;
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Close upload modal first
        const uploadModalElement = document.getElementById('uploadModal');
        const uploadModalInstance = bootstrap.Modal.getInstance(uploadModalElement);
        if (uploadModalInstance) {
            uploadModalInstance.hide();
            // Remove backdrop and cleanup
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) backdrop.remove();
            document.body.classList.remove('modal-open');
            document.body.style.paddingRight = '';
        }

        setIsUploading(true);
        setShowUploadProgress(true);  // This will trigger the progress modal

        try {
            // Get form details
            const formDetails = {
                title: document.getElementById('uploadTitle').value,
                author: document.getElementById('uploadAuthor').value,
                year: document.getElementById('uploadYear').value,
                topic: selectedTopic,
                keywords: document.getElementById('uploadKeywords').value,
                summary: document.getElementById('uploadSummary').value,
                originalFileName: fileUploaded.name // Add original filename to metadata
            };

            const fileId = await uploadFileInChunks(fileUploaded, formDetails);

            if (fileId) {
                await fetchFiles();
                setShowUploadProgress(false);
                setUploadResult({
                    title: formDetails.title,
                    fileName: fileUploaded.name,
                    fileSize: fileUploaded.size,
                    uploadTime: elapsedTime,
                    chunks: uploadStats.chunks.length
                });
                setShowSuccessModal(true);
                resetForm();
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            setUploadStats(prev => ({
                ...prev,
                error: error.message
            }));
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

    // Format time function
    const formatTime = (ms) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        return minutes > 0 
            ? `${minutes}m ${seconds % 60}s`
            : `${seconds}s`;
    };

    // Format size function
    const formatSize = (bytes) => {
        const mb = bytes / (1024 * 1024);
        return mb.toFixed(2);
    };

    // Update the progress modal JSX
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
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            {/* Simplified Upload Progress Modal */}
            <div className="modal fade upload-progress-modal" 
                id="uploadProgressModal" 
                tabIndex="-1">
                <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header border-0">
                            <h6 className="modal-title">
                                <i className="fas fa-cloud-upload-alt me-2 text-primary"></i>
                                Uploading File...
                            </h6>
                        </div>
                        <div className="modal-body">
                            <div className="upload-stats mb-4">
                                <div className="stats-grid">
                                    <div className="stat-item">
                                        <i className="fas fa-file-alt stat-icon"></i>
                                        <div className="stat-label">Size</div>
                                        <div className="stat-value">
                                            {(uploadStats.totalSize / (1024 * 1024)).toFixed(1)}MB
                                        </div>
                                    </div>
                                    <div className="stat-item">
                                        <i className="fas fa-percentage stat-icon"></i>
                                        <div className="stat-label">Progress</div>
                                        <div className="stat-value">
                                            {((uploadStats.uploadedSize / uploadStats.totalSize) * 100).toFixed(0)}%
                                        </div>
                                    </div>
                                    <div className="stat-item">
                                        <i className="fas fa-clock stat-icon"></i>
                                        <div className="stat-label">Time</div>
                                        <div className="stat-value">
                                            {Math.floor(elapsedTime / 1000)}s
                                        </div>
                                    </div>
                                </div>
                                <div className="progress" style={{ height: "10px" }}>
                                    <div 
                                        className="progress-bar progress-bar-striped progress-bar-animated bg-primary" 
                                        style={{ 
                                            width: `${(uploadStats.uploadedSize / uploadStats.totalSize) * 100}%` 
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="chunks-container">
                                {uploadStats.chunks.map((chunk, index) => (
                                    <div key={index} className="chunk-item">
                                        <div className={`badge ${
                                            chunk.status === 'completed' ? 'bg-success' :
                                            chunk.status === 'pending' ? 'bg-warning' :
                                            'bg-danger'
                                        } me-2`}>
                                            <i className={`fas fa-${
                                                chunk.status === 'completed' ? 'check' :
                                                chunk.status === 'pending' ? 'clock' :
                                                'times'
                                            }`}></i>
                                        </div>
                                        <span className="me-auto">Part {index + 1}</span>
                                        {chunk.speed > 0 && (
                                            <small className="text-muted">
                                                {chunk.speed.toFixed(1)} MB/s
                                            </small>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Success Modal */}
            <div className="modal fade" 
                id="successModal" 
                tabIndex="-1"
                aria-hidden="true">
                <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content border-0 shadow">
                        <div className="modal-body text-center p-5">
                            <div className="success-icon mb-4">
                                <i className="fas fa-check-circle text-success" style={{ fontSize: '4rem' }}></i>
                            </div>
                            <h4 className="mb-4">Upload Successful!</h4>
                            {uploadResult && (
                                <div className="upload-details text-start">
                                    <p><strong>Title:</strong> {uploadResult.title}</p>
                                    <p><strong>File:</strong> {uploadResult.fileName}</p>
                                    <p><strong>Size:</strong> {(uploadResult.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                                    <p><strong>Upload Time:</strong> {(uploadResult.uploadTime / 1000).toFixed(1)}s</p>
                                </div>
                            )}
                            <button 
                                className="btn btn-success mt-3" 
                                onClick={() => setShowSuccessModal(false)}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Admin;