import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"
import EpubReader from "./EpubReader"
import AuthPanel from "./AuthPanel"
import AdminUploadForm from "./AdminUploadForm"
import BookCover from "./BookCover"
import {
  deleteAdminBook,
  getAdminBooks,
  replaceAdminBookFile,
  replaceAdminCover,
  updateAdminBook
} from "./api"
import "./App.css"

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000"

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return 0
  return Math.max(0, Math.min(100, Number(value)))
}

function formatDate(dateValue) {
  if (!dateValue) return ""
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date)
}

function App() {
  const [books, setBooks] = useState([])
  const [selectedBook, setSelectedBook] = useState(null)
  const [booksError, setBooksError] = useState("")
  const [loadingBooks, setLoadingBooks] = useState(false)
  const [currentPageView, setCurrentPageView] = useState("library")

  const [currentUser, setCurrentUser] = useState(() => {
    const stored = localStorage.getItem("user")
    return stored ? JSON.parse(stored) : null
  })

  const [currentPage, setCurrentPage] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [savedProgress, setSavedProgress] = useState(null)
  const [pdfReady, setPdfReady] = useState(false)
  const [pdfPageInput, setPdfPageInput] = useState("1")
  const [isReaderFullscreen, setIsReaderFullscreen] = useState(false)

  const [readingProgress, setReadingProgress] = useState({
    format: "",
    progressValue: "",
    percentage: 0
  })

  const [searchTerm, setSearchTerm] = useState("")
  const [formatFilter, setFormatFilter] = useState("all")
  const [sortBy, setSortBy] = useState("recent")

  const [adminBooks, setAdminBooks] = useState([])
  const [adminStats, setAdminStats] = useState(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState("")
  const [adminSearch, setAdminSearch] = useState("")
  const [adminFormatFilter, setAdminFormatFilter] = useState("all")
  const [adminSortBy, setAdminSortBy] = useState("newest")
  const [editingBook, setEditingBook] = useState(null)
  const [editTitle, setEditTitle] = useState("")
  const [editAuthor, setEditAuthor] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [adminActionLoading, setAdminActionLoading] = useState(false)

  const token = localStorage.getItem("token")
  const readerShellRef = useRef(null)

  const fetchBooks = useCallback(async () => {
    if (!token) return

    try {
      setLoadingBooks(true)
      setBooksError("")

      const response = await fetch(`${API_BASE}/books/library`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (!response.ok) {
        setBooks([])
        setBooksError(data.message || "Failed to fetch library.")
        return
      }

      if (Array.isArray(data)) {
        setBooks(data)
      } else {
        setBooks([])
        setBooksError("Backend returned invalid data for /books/library.")
      }
    } catch (error) {
      console.error("Failed to fetch library:", error)
      setBooks([])
      setBooksError("Failed to fetch books from backend.")
    } finally {
      setLoadingBooks(false)
    }
  }, [token])

  const fetchAdminBooks = useCallback(async () => {
    if (!token || currentUser?.role !== "admin") return

    try {
      setAdminLoading(true)
      setAdminError("")

      const data = await getAdminBooks()
      setAdminBooks(data.books || [])
      setAdminStats(data.stats || null)
    } catch (error) {
      console.error("Failed to fetch admin books:", error)
      setAdminError(error.message || "Failed to load admin panel")
    } finally {
      setAdminLoading(false)
    }
  }, [token, currentUser])

  useEffect(() => {
    if (!currentUser || !token) return
    fetchBooks()
  }, [currentUser, token, fetchBooks])

  useEffect(() => {
    if (currentPageView === "admin" && currentUser?.role === "admin") {
      fetchAdminBooks()
    }
  }, [currentPageView, currentUser, fetchAdminBooks])

  useEffect(() => {
    if (!selectedBook || !currentUser || !token) return

    setSavedProgress(null)
    setPdfReady(false)
    setCurrentPage(1)
    setNumPages(0)
    setPdfPageInput("1")
    setReadingProgress({
      format: "",
      progressValue: "",
      percentage: 0
    })

    const loadProgress = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/books/${selectedBook.BookId}/progress`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )

        const data = await response.json()
        setSavedProgress(data)
      } catch (error) {
        console.error("Failed to load progress:", error)
      }
    }

    loadProgress()
  }, [selectedBook, currentUser, token])

  useEffect(() => {
    if (!savedProgress) return
    if (!selectedBook) return
    if (selectedBook.FileType !== "pdf") return

    const savedFormat = savedProgress.Format || savedProgress.format
    const savedValue = savedProgress.ProgressValue || savedProgress.progressValue

    if (savedFormat !== "pdf") return

    const page = parseInt(savedValue, 10)
    if (!isNaN(page) && page > 0) {
      setCurrentPage(page)
      setPdfPageInput(String(page))
    }
  }, [savedProgress, selectedBook])

  useEffect(() => {
    if (!selectedBook) return
    if (selectedBook.FileType !== "pdf") return
    if (!pdfReady) return
    if (!readingProgress.format || !readingProgress.progressValue) return
    if (!token) return

    const timeout = setTimeout(async () => {
      try {
        await fetch(`${API_BASE}/books/${selectedBook.BookId}/progress`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(readingProgress)
        })
      } catch (error) {
        console.error("Failed to save PDF progress:", error)
      }
    }, 700)

    return () => clearTimeout(timeout)
  }, [readingProgress, selectedBook, pdfReady, token])



  useEffect(() => {
    const onFullscreenChange = () => {
      setIsReaderFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  const pdfFileUrl = useMemo(() => {
    if (!selectedBook || selectedBook.FileType !== "pdf") return null
    return `${API_BASE}/books/${selectedBook.BookId}/read`
  }, [selectedBook])

  const pdfDocumentFile = useMemo(() => {
    if (!pdfFileUrl || !token) return null

    return {
      url: pdfFileUrl,
      httpHeaders: {
        Authorization: `Bearer ${token}`
      }
    }
  }, [pdfFileUrl, token])

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages)
    setPdfReady(true)

    setReadingProgress((prev) => {
      if (prev.format === "pdf" && prev.progressValue === String(currentPage)) {
        return prev
      }

      return {
        format: "pdf",
        progressValue: String(currentPage),
        percentage: numPages ? (currentPage / numPages) * 100 : 0
      }
    })
  }

  const onDocumentLoadError = (error) => {
    console.error("PDF load error:", error)
    setPdfReady(false)
  }

  const goToPage = useCallback(
    (pageNumber) => {
      if (!pdfReady || !numPages) return

      const safePage = Math.max(1, Math.min(numPages, pageNumber))
      setCurrentPage(safePage)
      setPdfPageInput(String(safePage))
      setReadingProgress({
        format: "pdf",
        progressValue: String(safePage),
        percentage: numPages ? (safePage / numPages) * 100 : 0
      })
    },
    [pdfReady, numPages]
  )

  const goToNextPage = useCallback(() => {
    if (!pdfReady) return
    if (currentPage >= numPages) return
    goToPage(currentPage + 1)
  }, [pdfReady, currentPage, numPages, goToPage])

  const goToPreviousPage = useCallback(() => {
    if (!pdfReady) return
    if (currentPage <= 1) return
    goToPage(currentPage - 1)
  }, [pdfReady, currentPage, goToPage])

    useEffect(() => {
  if (!selectedBook) return

  const onKeyDown = (e) => {
    if (selectedBook.FileType === "pdf") {
      if (e.key === "ArrowRight") {
        e.preventDefault()
        goToNextPage()
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault()
        goToPreviousPage()
      }
    }

    if (e.key === "Escape") {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
      setIsReaderFullscreen(false)
    }
  }

  window.addEventListener("keydown", onKeyDown)
  return () => window.removeEventListener("keydown", onKeyDown)
}, [selectedBook, goToNextPage, goToPreviousPage])

  const handlePdfJumpSubmit = (e) => {
    e.preventDefault()
    const page = parseInt(pdfPageInput, 10)
    if (!isNaN(page)) {
      goToPage(page)
    }
  }

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && readerShellRef.current) {
        await readerShellRef.current.requestFullscreen()
        setIsReaderFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsReaderFullscreen(false)
      }
    } catch (error) {
      console.error("Fullscreen toggle failed:", error)
    }
  }

  const openBook = (book) => {
    setSelectedBook(book)
    setCurrentPageView("reader")
  }

  const closeBook = () => {
    setSelectedBook(null)
    setSavedProgress(null)
    setPdfReady(false)
    setCurrentPage(1)
    setNumPages(0)
    setPdfPageInput("1")
    setReadingProgress({
      format: "",
      progressValue: "",
      percentage: 0
    })
    setCurrentPageView("library")

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }

    setIsReaderFullscreen(false)
  }

  const handleAuthSuccess = (user) => {
    setCurrentUser(user)
    setSelectedBook(null)
    setBooks([])
    setBooksError("")
    setCurrentPageView("library")
  }

  const logout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    setCurrentUser(null)
    setBooks([])
    setAdminBooks([])
    setAdminStats(null)
    setSelectedBook(null)
    setBooksError("")
    setAdminError("")
    setSavedProgress(null)
    setPdfReady(false)
    setCurrentPage(1)
    setNumPages(0)
    setPdfPageInput("1")
    setReadingProgress({
      format: "",
      progressValue: "",
      percentage: 0
    })
    setCurrentPageView("library")
  }

  const openEditBook = (book) => {
    setEditingBook(book)
    setEditTitle(book.Title || "")
    setEditAuthor(book.Author || "")
    setEditDescription(book.Description || "")
  }

  const closeEditBook = () => {
    setEditingBook(null)
    setEditTitle("")
    setEditAuthor("")
    setEditDescription("")
  }

  const submitEditBook = async (e) => {
    e.preventDefault()
    if (!editingBook) return

    try {
      setAdminActionLoading(true)

      await updateAdminBook(editingBook.BookId, {
        title: editTitle,
        author: editAuthor,
        description: editDescription
      })

      await fetchAdminBooks()
      await fetchBooks()
      closeEditBook()
    } catch (error) {
      alert(error.message || "Failed to update book")
    } finally {
      setAdminActionLoading(false)
    }
  }

  const handleDeleteBook = async (book) => {
    const confirmed = window.confirm(`Delete "${book.Title}"?`)
    if (!confirmed) return

    try {
      setAdminActionLoading(true)
      await deleteAdminBook(book.BookId)
      await fetchAdminBooks()
      await fetchBooks()
    } catch (error) {
      alert(error.message || "Failed to delete book")
    } finally {
      setAdminActionLoading(false)
    }
  }

  const handleReplaceCover = async (book, file) => {
    if (!file) return

    try {
      setAdminActionLoading(true)
      await replaceAdminCover(book.BookId, file)
      await fetchAdminBooks()
      await fetchBooks()
    } catch (error) {
      alert(error.message || "Failed to replace cover")
    } finally {
      setAdminActionLoading(false)
    }
  }

  const handleReplaceBookFile = async (book, file) => {
    if (!file) return

    try {
      setAdminActionLoading(true)
      await replaceAdminBookFile(book.BookId, file)
      await fetchAdminBooks()
      await fetchBooks()
    } catch (error) {
      alert(error.message || "Failed to replace file")
    } finally {
      setAdminActionLoading(false)
    }
  }

  const filteredBooks = useMemo(() => {
    let result = [...books]

    const query = searchTerm.trim().toLowerCase()

    if (query) {
      result = result.filter((book) => {
        const haystack = [
          book.Title,
          book.Author,
          book.Description,
          book.FileType
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        return haystack.includes(query)
      })
    }

    if (formatFilter !== "all") {
      result = result.filter(
        (book) => (book.FileType || "").toLowerCase() === formatFilter
      )
    }

    if (sortBy === "title") {
      result.sort((a, b) => (a.Title || "").localeCompare(b.Title || ""))
    } else if (sortBy === "author") {
      result.sort((a, b) => (a.Author || "").localeCompare(b.Author || ""))
    } else if (sortBy === "progress") {
      result.sort(
        (a, b) =>
          formatPercent(b.progress?.Percentage) - formatPercent(a.progress?.Percentage)
      )
    } else {
      result.sort((a, b) => {
        const aTime = a.progress?.UpdatedAt
          ? new Date(a.progress.UpdatedAt).getTime()
          : new Date(a.CreatedAt || 0).getTime()

        const bTime = b.progress?.UpdatedAt
          ? new Date(b.progress.UpdatedAt).getTime()
          : new Date(b.CreatedAt || 0).getTime()

        return bTime - aTime
      })
    }

    return result
  }, [books, searchTerm, formatFilter, sortBy])

  const filteredAdminBooks = useMemo(() => {
    let result = [...adminBooks]

    const query = adminSearch.trim().toLowerCase()

    if (query) {
      result = result.filter((book) => {
        const haystack = [
          book.Title,
          book.Author,
          book.Description,
          book.FileType
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        return haystack.includes(query)
      })
    }

    if (adminFormatFilter !== "all") {
      result = result.filter(
        (book) => (book.FileType || "").toLowerCase() === adminFormatFilter
      )
    }

    if (adminSortBy === "title") {
      result.sort((a, b) => (a.Title || "").localeCompare(b.Title || ""))
    } else if (adminSortBy === "author") {
      result.sort((a, b) => (a.Author || "").localeCompare(b.Author || ""))
    } else {
      result.sort(
        (a, b) =>
          new Date(b.CreatedAt || 0).getTime() - new Date(a.CreatedAt || 0).getTime()
      )
    }

    return result
  }, [adminBooks, adminSearch, adminFormatFilter, adminSortBy])

  const lastOpenedBook = useMemo(() => {
    const withProgress = books
      .filter((b) => b.progress?.UpdatedAt)
      .sort(
        (a, b) =>
          new Date(b.progress.UpdatedAt) - new Date(a.progress.UpdatedAt)
      )

    return withProgress[0] || null
  }, [books])

  const completedBooksCount = useMemo(() => {
    return books.filter((book) => formatPercent(book.progress?.Percentage) >= 100).length
  }, [books])

  const inProgressBooksCount = useMemo(() => {
    return books.filter((book) => {
      const percentage = formatPercent(book.progress?.Percentage)
      return percentage > 0 && percentage < 100
    }).length
  }, [books])

  if (!currentUser) {
    return (
      <div className="app-shell auth-shell">
        <div className="brand-header">
          <div className="brand-badge">📚</div>
          <div>
            <h1 className="brand-title">OnlineReader</h1>
            <p className="brand-subtitle">
              Read beautifully. Track progress. Pick up where you left off.
            </p>
          </div>
        </div>

        <AuthPanel onAuthSuccess={handleAuthSuccess} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <h1 className="brand-title">OnlineReader</h1>
          <p className="brand-subtitle">Your personal cloud reading platform</p>
        </div>

        <div className="topbar-right">
          <div className="topbar-actions">
            <button
              className={`secondary-btn ${currentPageView === "library" ? "active-tab" : ""}`}
              onClick={() => setCurrentPageView("library")}
            >
              Library
            </button>

            {currentUser.role === "admin" && (
              <button
                className={`secondary-btn ${currentPageView === "admin" ? "active-tab" : ""}`}
                onClick={() => setCurrentPageView("admin")}
              >
                Admin Panel
              </button>
            )}
          </div>

          <div className="user-card">
            <div className="user-card-email">{currentUser.email}</div>
            <div className="user-card-role">{currentUser.role}</div>
            <button className="secondary-btn" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </div>

      {currentPageView === "admin" && currentUser.role === "admin" && (
        <div className="admin-overhaul">
          <div className="admin-stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total books</div>
              <div className="stat-value">{adminStats?.TotalBooks || 0}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Total users</div>
              <div className="stat-value">{adminStats?.TotalUsers || 0}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Progress entries</div>
              <div className="stat-value">{adminStats?.TotalProgressEntries || 0}</div>
            </div>
          </div>

          <div className="admin-card">
            <h2 className="section-title">Upload New Book</h2>
            <AdminUploadForm
              onUploadSuccess={async () => {
                await fetchBooks()
                await fetchAdminBooks()
              }}
            />
          </div>

          <div className="admin-card">
            <div className="section-header">
              <h2 className="section-title">Manage Books</h2>
            </div>

            <div className="library-toolbar admin-toolbar">
              <input
                className="input toolbar-input"
                type="text"
                placeholder="Search books..."
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
              />

              <select
                className="input toolbar-select"
                value={adminFormatFilter}
                onChange={(e) => setAdminFormatFilter(e.target.value)}
              >
                <option value="all">All formats</option>
                <option value="pdf">PDF</option>
                <option value="epub">EPUB</option>
              </select>

              <select
                className="input toolbar-select"
                value={adminSortBy}
                onChange={(e) => setAdminSortBy(e.target.value)}
              >
                <option value="newest">Newest</option>
                <option value="title">Title A–Z</option>
                <option value="author">Author A–Z</option>
              </select>
            </div>

            {adminError && <p className="error-text">{adminError}</p>}

            {adminLoading ? (
              <p className="message-text">Loading admin data...</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Cover</th>
                      <th>Title</th>
                      <th>Author</th>
                      <th>Format</th>
                      <th>Readers</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdminBooks.map((book) => (
                      <tr key={book.BookId}>
                        <td className="admin-cover-cell">
                          <div className="admin-cover-mini">
                            <BookCover book={book} />
                          </div>
                        </td>
                        <td>{book.Title}</td>
                        <td>{book.Author || "Unknown"}</td>
                        <td>{book.FileType}</td>
                        <td>{book.ActiveReaders || 0}</td>
                        <td>{formatDate(book.CreatedAt)}</td>
                        <td>
                          <div className="admin-actions">
                            <button
                              className="secondary-btn"
                              onClick={() => openEditBook(book)}
                            >
                              Edit
                            </button>

                            <label className="secondary-btn admin-file-label">
                              Replace Cover
                              <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.webp,image/*"
                                hidden
                                onChange={(e) =>
                                  handleReplaceCover(book, e.target.files?.[0] || null)
                                }
                              />
                            </label>

                            <label className="secondary-btn admin-file-label">
                              Replace File
                              <input
                                type="file"
                                accept=".pdf,.epub"
                                hidden
                                onChange={(e) =>
                                  handleReplaceBookFile(book, e.target.files?.[0] || null)
                                }
                              />
                            </label>

                            <button
                              className="danger-btn"
                              onClick={() => handleDeleteBook(book)}
                              disabled={adminActionLoading}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {filteredAdminBooks.length === 0 && (
                      <tr>
                        <td colSpan="7" className="admin-empty-cell">
                          No books found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {editingBook && (
            <div className="modal-overlay" onClick={closeEditBook}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <h3 className="section-title">Edit Book</h3>

                <form className="admin-form" onSubmit={submitEditBook}>
                  <input
                    className="input"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Title"
                  />

                  <input
                    className="input"
                    type="text"
                    value={editAuthor}
                    onChange={(e) => setEditAuthor(e.target.value)}
                    placeholder="Author"
                  />

                  <textarea
                    className="textarea"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description"
                  />

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={closeEditBook}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="primary-btn"
                      disabled={adminActionLoading}
                    >
                      {adminActionLoading ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {currentPageView === "library" && !selectedBook && (
        <>
          <div className="dashboard-stats">
            <div className="stat-card">
              <div className="stat-label">Books in library</div>
              <div className="stat-value">{books.length}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Continue reading</div>
              <div className="stat-value">{inProgressBooksCount}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Completed</div>
              <div className="stat-value">{completedBooksCount}</div>
            </div>
          </div>

          <div className="library-toolbar">
            <input
              className="input toolbar-input"
              type="text"
              placeholder="Search by title, author, description, or format..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <select
              className="input toolbar-select"
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
            >
              <option value="all">All formats</option>
              <option value="pdf">PDF</option>
              <option value="epub">EPUB</option>
            </select>

            <select
              className="input toolbar-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="recent">Recently active</option>
              <option value="title">Title A–Z</option>
              <option value="author">Author A–Z</option>
              <option value="progress">Highest progress</option>
            </select>
          </div>

          {lastOpenedBook && (
            <div className="continue-section">
              <div className="section-header">
                <h2 className="section-title">Resume Reading</h2>
              </div>

              <div className="continue-grid continue-grid-single">
                <div className="continue-card">
                  <div className="continue-cover">
                    <BookCover book={lastOpenedBook} />
                  </div>

                  <div className="continue-body">
                    <div className="continue-title">{lastOpenedBook.Title}</div>
                    <div className="continue-meta">
                      {lastOpenedBook.Author || "Unknown"} • {(lastOpenedBook.FileType || "").toUpperCase()}
                    </div>

                    <div className="mini-progress-row">
                      <div className="mini-progress-bar">
                        <div
                          className="mini-progress-fill"
                          style={{
                            width: `${formatPercent(lastOpenedBook.progress?.Percentage)}%`
                          }}
                        />
                      </div>
                      <span className="mini-progress-text">
                        {formatPercent(lastOpenedBook.progress?.Percentage).toFixed(1)}%
                      </span>
                    </div>

                    <div className="continue-date">
                      Last opened: {formatDate(lastOpenedBook.progress?.UpdatedAt) || "Recently"}
                    </div>

                    <button className="primary-btn" onClick={() => openBook(lastOpenedBook)}>
                      Resume Reading
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="section-header">
              <h2 className="section-title">Library</h2>
            </div>

            {booksError && <p className="error-text">{booksError}</p>}

            {loadingBooks ? (
              <div className="book-grid">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="book-card skeleton-card">
                    <div className="skeleton skeleton-cover" />
                    <div className="skeleton skeleton-line skeleton-line-lg" />
                    <div className="skeleton skeleton-line" />
                    <div className="skeleton skeleton-line" />
                    <div className="skeleton skeleton-line skeleton-line-sm" />
                  </div>
                ))}
              </div>
            ) : filteredBooks.length === 0 ? (
              <div className="empty-state">
                <p>No books match your current filters.</p>
              </div>
            ) : (
              <div className="book-grid">
                {filteredBooks.map((book) => {
                  const percentage = formatPercent(book.progress?.Percentage)
                  const hasProgress = percentage > 0
                  const isCompleted = percentage >= 100

                  return (
                    <div key={book.BookId} className="book-card premium-book-card">
                      <BookCover book={book} />

                      <div className="book-card-top">
                        <div className="format-pill">{book.FileType}</div>
                      </div>

                      <h3 className="book-title">{book.Title}</h3>

                      <p className="book-meta">
                        <strong>Author:</strong> {book.Author || "Unknown"}
                      </p>

                      <p className="book-description">
                        {book.Description || "No description"}
                      </p>

                      <div className="book-progress-block">
                        <div className="book-progress-header">
                          <span>
                            {isCompleted
                              ? "Completed"
                              : hasProgress
                              ? "Reading progress"
                              : "Not started"}
                          </span>
                          <span>{percentage.toFixed(1)}%</span>
                        </div>

                        <div className="book-progress-bar">
                          <div
                            className="book-progress-fill"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>

                        <div className="book-progress-meta">
                          {book.progress?.ProgressValue
                            ? `Saved: ${book.progress.ProgressValue}`
                            : "No saved position"}
                        </div>
                      </div>

                      <button className="primary-btn" onClick={() => openBook(book)}>
                        {hasProgress && !isCompleted ? "Resume Reading" : "Read Book"}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {selectedBook && (
        <div
          ref={readerShellRef}
          className={`reader-shell ${isReaderFullscreen ? "reader-shell-fullscreen" : ""}`}
        >
          <div className="reader-header reader-toolbar">
            <div className="reader-toolbar-left">
              <button className="secondary-btn" onClick={closeBook}>
                ← Back to Library
              </button>

              <div>
                <h2 className="reader-title">{selectedBook.Title}</h2>
                <p className="reader-meta">
                  {selectedBook.Author || "Unknown"} • {selectedBook.FileType}
                </p>
              </div>
            </div>

            <div className="reader-toolbar-right">
              <button className="secondary-btn" onClick={toggleFullscreen}>
                {isReaderFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>
          </div>

          {selectedBook.FileType === "pdf" && (
            <div className="reader-card">
              <div className="reader-controls reader-controls-top">
                <button
                  className="secondary-btn"
                  onClick={goToPreviousPage}
                  disabled={!pdfReady || currentPage <= 1}
                >
                  Previous
                </button>

                <form className="page-jump-form" onSubmit={handlePdfJumpSubmit}>
                  <span className="page-jump-label">Page</span>
                  <input
                    className="page-jump-input"
                    type="number"
                    min="1"
                    max={numPages || 1}
                    value={pdfPageInput}
                    onChange={(e) => setPdfPageInput(e.target.value)}
                  />
                  <span className="page-jump-total">of {numPages || 0}</span>
                  <button className="secondary-btn" type="submit" disabled={!pdfReady}>
                    Go
                  </button>
                </form>

                <button
                  className="secondary-btn"
                  onClick={goToNextPage}
                  disabled={!pdfReady || currentPage >= numPages}
                >
                  Next
                </button>

                <div className="progress-text">
                  {readingProgress.percentage
                    ? `${readingProgress.percentage.toFixed(1)}% read`
                    : ""}
                </div>
              </div>

              <div className="pdf-wrap">
                {!pdfReady && (
                  <div className="reader-loading-overlay">
                    <div className="reader-spinner" />
                    <p>Loading PDF...</p>
                  </div>
                )}

                {pdfDocumentFile && (
                  <Document
                    file={pdfDocumentFile}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    loading=""
                    error={<p>Failed to load PDF.</p>}
                    externalLinkTarget="_self"
                  >
                    <Page
                      pageNumber={currentPage}
                      width={isReaderFullscreen ? 1000 : 800}
                      renderAnnotationLayer={true}
                      renderTextLayer={true}
                    />
                  </Document>
                )}
              </div>
            </div>
          )}

          {selectedBook.FileType === "epub" && (
            <div className="reader-card">
              <EpubReader
                bookId={selectedBook.BookId}
                bookTitle={selectedBook.Title}
                bookAuthor={selectedBook.Author}
                bookUrl={`${API_BASE}/books/${selectedBook.BookId}/read`}
                isFullscreen={isReaderFullscreen}
                onToggleFullscreen={toggleFullscreen}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App