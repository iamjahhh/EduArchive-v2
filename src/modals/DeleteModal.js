const DeleteModal = ({ isDeleting, modalFile, onDelete, onClose }) => {
    return (
        <div className="modal fade" id="deleteModal" tabIndex="-1" aria-labelledby="deleteModalLabel" aria-hidden="true">
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title" id="deleteModalLabel">Delete Resource</h5>
                        <button type="button" disabled={isDeleting} className="btn-close" onClick={onClose}></button>
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

                                    <p id="editTitleDelete" style={{ margin: 0, marginTop: "5px" }}>
                                        <strong>{modalFile.title} ({modalFile.year})</strong>
                                        <br />
                                        by <em style={{ fontWeight: "600" }}>{modalFile.author}</em>
                                    </p>

                                    <p style={{ marginTop: "5px", marginBottom: "10px" }}>
                                        Are you sure you want to delete this file? This action cannot be undone.
                                    </p>
                                    <button
                                        id="confirmDeleteBtn"
                                        className="red-btn"
                                        disabled={isDeleting}
                                        onClick={() => onDelete(modalFile.id)}
                                    >{isDeleting ? 'Deleting...' : 'Delete Resource'}</button>
                                </>
                            )}
                            <button
                                type="button"
                                className="cancel-btn"
                                onClick={onClose}
                                style={{ marginLeft: '1rem' }}
                                disabled={isDeleting}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DeleteModal;