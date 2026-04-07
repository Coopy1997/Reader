import React, { useState } from "react"
import { uploadAdminBook } from "./api"

export default function AdminUploadForm({ onUploadSuccess }) {
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [description, setDescription] = useState("")
  const [bookFile, setBookFile] = useState(null)
  const [coverImage, setCoverImage] = useState(null)
  const [coverPreview, setCoverPreview] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isHidden, setIsHidden] = useState(false)
  const [isFeatured, setIsFeatured] = useState(false)
  const [featuredRank, setFeaturedRank] = useState("")

  const handleCoverChange = (file) => {
    setCoverImage(file || null)

    if (file) {
      setCoverPreview(URL.createObjectURL(file))
    } else {
      setCoverPreview("")
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()

    if (!title || !bookFile) {
      setError("Title and book file are required")
      return
    }

    try {
      setLoading(true)
      setError("")
      setMessage("")

      const formData = new FormData()
      formData.append("title", title)
      formData.append("author", author)
      formData.append("description", description)
      formData.append("book", bookFile)

      if (coverImage) {
        formData.append("coverImage", coverImage)
      }

      formData.append("isHidden", String(isHidden))
      formData.append("isFeatured", String(isFeatured))

      if (isFeatured && featuredRank) {
        formData.append("featuredRank", featuredRank)
      }

      setUploadProgress(0)

      await uploadAdminBook(formData, {
        onProgress: (value) => setUploadProgress(value)
      })

      setMessage("Book uploaded successfully")
      setTitle("")
      setAuthor("")
      setDescription("")
      setBookFile(null)
      setCoverImage(null)
      setCoverPreview("")
      setIsHidden(false)
      setIsFeatured(false)
      setFeaturedRank("")
      setUploadProgress(100)

      if (onUploadSuccess) {
        onUploadSuccess()
      }
    } catch (err) {
      console.error("Upload error:", err)
      setError(err.message || "Upload failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="admin-form admin-upload-form" onSubmit={onSubmit}>
      <div className="admin-upload-grid">
        <div className="admin-upload-left">
          <input
            className="input"
            type="text"
            placeholder="Book title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <input
            className="input"
            type="text"
            placeholder="Author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />

          <textarea
            className="textarea"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="file-field">
            <label className="file-label">Book file (PDF or EPUB)</label>
            <input
              className="file-input"
              type="file"
              accept=".pdf,.epub"
              onChange={(e) => setBookFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="file-field">
            <label className="file-label">Custom cover image (optional)</label>
            <input
              className="file-input"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/*"
              onChange={(e) => handleCoverChange(e.target.files?.[0] || null)}
            />
          </div>

          <label className="admin-checkbox-row">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
            />
            <span>Mark as featured after upload</span>
          </label>

          {isFeatured && (
            <input
              className="input"
              type="number"
              min="1"
              placeholder="Featured order (optional)"
              value={featuredRank}
              onChange={(e) => setFeaturedRank(e.target.value)}
            />
          )}

          <label className="admin-checkbox-row">
            <input
              type="checkbox"
              checked={isHidden}
              onChange={(e) => setIsHidden(e.target.checked)}
            />
            <span>Upload as hidden</span>
          </label>

          {loading && (
            <div className="upload-progress-block">
              <div className="upload-progress-header">
                <span>Uploading</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="book-progress-bar">
                <div
                  className="book-progress-fill"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? "Uploading..." : "Upload Book"}
          </button>
        </div>

        <div className="admin-upload-right">
          <div className="upload-preview-card">
            <div className="upload-preview-title">Cover Preview</div>

            {coverPreview ? (
              <img
                src={coverPreview}
                alt="Cover preview"
                className="upload-preview-image"
              />
            ) : (
              <div className="upload-preview-empty">
                No custom cover selected
              </div>
            )}
          </div>
        </div>
      </div>

      {message && <p className="message-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </form>
  )
}
