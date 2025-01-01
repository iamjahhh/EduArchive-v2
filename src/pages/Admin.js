import { useState, useEffect } from 'react';
import "./Admin.css"
import bootstrap from 'bootstrap/dist/js/bootstrap.bundle';

const Admin = () => {
    const [fileUploaded, setFileUploaded] = useState(null);
    const [fileError, setFileError] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedTopic, setSelectedTopic] = useState('');
    
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

    const handleSubmit = async (e) => {
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

            const response = await fetch('/api/UploadFile', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                console.log(response);
                alert('Response !ok: ' + JSON.stringify(response));
            }

            const modalElement = document.getElementById('uploadModal');
            const modal = bootstrap.Modal.getInstance(modalElement);
            modal.hide();
            resetForm();
            alert('File uploaded successfully!');

        } catch (error) {
            console.error('Upload error:', error);
            alert('Error uploading file: ' + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleTopicChange = (e) => {
        setSelectedTopic(e.target.value);
    };

    return (
        <>
            <div className="admin-container">
                <h2 style={{ alignSelf: "center" }}>Admin Panel</h2>

                <button
                    type="button"
                    className="upload-btn"
                    data-bs-toggle="modal"
                    data-bs-target="#uploadModal"
                ><i className="fas fa-upload"></i> Upload New Resource
                </button>

                <div id="filesTable" className="files-list">
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
                                    { fileUploaded ?
                                    <div id="file-name" className="file-name">{fileUploaded.name}</div>
                                    : null }
                                </div>
                                <div className="form-group">
                                    <label for="uploadTitle">Title:</label>
                                    <input type="text" id="uploadTitle" placeholder="Title" required></input>
                                </div>
                                <div className="form-group">
                                    <label for="uploadYear">Author:</label>
                                    <input type="text" id="uploadAuthor" placeholder="Author" required></input>
                                </div>
                                <div className="form-group">
                                    <label for="uploadYear">Year:</label>
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
                                    <label for="uploadKeywords">Keywords:</label>
                                    <input type="text" id="uploadKeywords" placeholder="Keywords (comma-separated)" required></input>
                                </div>
                                <div className="form-group">
                                    <label for="uploadSummary">Summary:</label>
                                    <textarea id="uploadSummary" placeholder="Summary of the resource" required></textarea>
                                </div>
                                <div className={`spinner ${isUploading ? '' : 'hidden'}`}></div>
                                <button 
                                    type="submit" 
                                    className="upload-btn"
                                    disabled={isUploading || !fileUploaded}
                                >
                                    {isUploading ? 'Uploading...' : 'Upload Resource'}
                                </button>
                            </form>
                        </div>
                        <div className="modal-footer">
                            <button type="button" id="uploadResource" className="upload-btn">Save changes</button>
                            <button 
                                type="button" 
                                className="red-btn" 
                                data-bs-dismiss="modal"
                                onClick={resetForm}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Admin;