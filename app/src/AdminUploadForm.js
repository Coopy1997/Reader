import React, { useState } from "react"
import { getApiBase, getAuthHeaders } from "./api"

const API_BASE = getApiBase()

function AdminUploadForm({ onUploadSuccess }) {
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [description, setDescription] = useState("")
  const [bookFile, setBookFile] = useState(null)
  const [coverFile, setCoverFile] = useState(null)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  const resetForm = () => {
    setTitle("")
    setAuthor("")
    setDescription("")
    setBookFile(null)
    setCoverFile(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!bookFile) {
      setMessage("Please select a book file.")
      return
    }

    setLoading(true)
    setMessage("")

    try {
      const formData = new FormData()
      formData.append("title", title)
      formData.append("author", author)
      formData.append("description", description)
      formData.append("book", bookFile)

      if (coverFile) {
        formData.append("cover", coverFile)
      }

      const response = await fetch(`${API_BASE}/admin/books/upload`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        setMessage(data.message || "Upload failed")
        setLoading(false)
        return
      }

      setMessage("Book uploaded successfully")
      resetForm()

      if (onUploadSuccess) {
        onUploadSuccess()
      }
    } catch (error) {
      console.error("Upload error:", error)
      setMessage("Upload failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-card">
      <h2 className="section-title">Upload Book</h2>

      <form className="admin-form" onSubmit={handleSubmit}>
        <input
          className="input"
          type="text"
          placeholder="Book title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
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

        <div>
          <p className="message-text">Book file (PDF or EPUB)</p>
          <input
            className="file-input"
            type="file"
            accept=".pdf,.epub"
            onChange={(e) => setBookFile(e.target.files[0] || null)}
            required
          />
        </div>

        <div>
          <p className="message-text">Optional custom cover image (JPG, PNG, WEBP)</p>
          <input
            className="file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setCoverFile(e.target.files[0] || null)}
          />
        </div>

        <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? "Uploading..." : "Upload Book"}
        </button>
      </form>

      {message && (
        <p className={message.toLowerCase().includes("success") ? "message-text" : "error-text"}>
          {message}
        </p>
      )}
    </div>
  )
}

export default AdminUploadForm