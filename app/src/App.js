import React, { useEffect, useMemo, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"
import EpubReader from "./EpubReader"
import AuthPanel from "./AuthPanel"
import AdminUploadForm from "./AdminUploadForm"
import BookCover from "./BookCover"
import { getApiBase, getAuthHeaders, getToken } from "./api"
import "./App.css"

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const API_BASE = getApiBase()

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
  const [activePage, setActivePage] = useState("home")

  const [currentUser, setCurrentUser] = useState(() => {
    const stored = localStorage.getItem("user")
    return stored ? JSON.parse(stored) : null
  })

  const [currentPage, setCurrentPage] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [savedProgress, setSavedProgress] = useState(null)
  const [pdfReady, setPdfReady] = useState(false)

  const [readingProgress, setReadingProgress] = useState({
    format: "",
    progressValue: "",
    percentage: 0
  })

  const [searchTerm, setSearchTerm] = useState("")
  const [formatFilter, setFormatFilter] = useState("all")
  const [sortBy, setSortBy] = useState("recent")

  const token = getToken()

  const fetchBooks = async () => {
    if (!token) return

    try {
      setLoadingBooks(true)
      setBooksError("")

      const response = await fetch(`${API_BASE}/books/library`, {
        headers: getAuthHeaders()
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
  }

  useEffect(() => {
    if (!currentUser || !token) return
    fetchBooks()
  }, [currentUser])

  useEffect(() => {
    if (!selectedBook || !currentUser || !token) return

    setSavedProgress(null)
    setPdfReady(false)
    setCurrentPage(1)
    setNumPages(0)
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
            headers: getAuthHeaders()
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
            ...getAuthHeaders()
          },
          body: JSON.stringify(readingProgress)
        })
      } catch (error) {
        console.error("Failed to save PDF progress:", error)
      }
    }, 700)

    return () => clearTimeout(timeout)
  }, [readingProgress, selectedBook, pdfReady, token])

  const pdfFileUrl = useMemo(() => {
    if (!selectedBook || selectedBook.FileType !== "pdf") return null
    return `${API_BASE}/books/${selectedBook.BookId}/read`
  }, [selectedBook])

  const pdfDocumentFile = useMemo(() => {
    if (!pdfFileUrl || !token) return null

    return {
      url: pdfFileUrl,
      httpHeaders: getAuthHeaders()
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

  const goToNextPage = () => {
    if (!pdfReady) return
    if (currentPage >= numPages) return

    const nextPage = currentPage + 1
    setCurrentPage(nextPage)
    setReadingProgress({
      format: "pdf",
      progressValue: String(nextPage),
      percentage: numPages ? (nextPage / numPages) * 100 : 0
    })
  }

  const goToPreviousPage = () => {
    if (!pdfReady) return
    if (currentPage <= 1) return

    const previousPage = currentPage - 1
    setCurrentPage(previousPage)
    setReadingProgress({
      format: "pdf",
      progressValue: String(previousPage),
      percentage: numPages ? (previousPage / numPages) * 100 : 0
    })
  }

  const openBook = (book) => {
    setSelectedBook(book)
  }

  const closeBook = () => {
    setSelectedBook(null)
    setSavedProgress(null)
    setPdfReady(false)
    setCurrentPage(1)
    setNumPages(0)
    setReadingProgress({
      format: "",
      progressValue: "",
      percentage: 0
    })
  }

  const handleAuthSuccess = (user) => {
    setCurrentUser(user)
    setSelectedBook(null)
    setBooks([])
    setBooksError("")
    setActivePage("home")
  }

  const logout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    setCurrentUser(null)
    setBooks([])
    setSelectedBook(null)
    setBooksError("")
    setSavedProgress(null)
    setPdfReady(false)
    setCurrentPage(1)
    setNumPages(0)
    setReadingProgress({
      format: "",
      progressValue: "",
      percentage: 0
    })
    setActivePage("home")
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

  const lastOpenedBook = useMemo(() => {
    const booksWithProgress = books.filter((book) => book.progress?.UpdatedAt)

    if (booksWithProgress.length === 0) return null

    return [...booksWithProgress].sort((a, b) => {
      const aTime = new Date(a.progress.UpdatedAt).getTime()
      const bTime = new Date(b.progress.UpdatedAt).getTime()
      return bTime - aTime
    })[0]
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

  if (selectedBook) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-left">
            <div>
              <h1 className="brand-title">OnlineReader</h1>
              <p className="brand-subtitle">Your personal cloud reading platform</p>
            </div>

            <div className="topbar-nav">
              <button className="nav-btn active" onClick={() => closeBook()}>
                Reader
              </button>
              <button className="nav-btn" onClick={() => setActivePage("home")}>
                Home
              </button>
              {currentUser.role === "admin" && (
                <button className="nav-btn" onClick={() => setActivePage("admin")}>
                  Admin Panel
                </button>
              )}
            </div>
          </div>

          <div className="user-card">
            <div className="user-card-email">{currentUser.email}</div>
            <div className="user-card-role">{currentUser.role}</div>
            <button className="secondary-btn" onClick={logout}>
              Logout
            </button>
          </div>
        </div>

        <div className="reader-shell">
          <div className="reader-header">
            <div>
              <button className="secondary-btn" onClick={closeBook}>
                ← Back to Library
              </button>
              <h2 className="reader-title">{selectedBook.Title}</h2>
              <p className="reader-meta">
                {selectedBook.Author || "Unknown"} • {selectedBook.FileType}
              </p>
            </div>
          </div>

          {selectedBook.FileType === "pdf" && (
            <div className="reader-card">
              <div className="pdf-wrap">
                {pdfDocumentFile && (
                  <Document
                    file={pdfDocumentFile}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    loading={<p>Loading PDF...</p>}
                    error={<p>Failed to load PDF.</p>}
                    externalLinkTarget="_self"
                  >
                    <Page
                      pageNumber={currentPage}
                      width={800}
                      renderAnnotationLayer={true}
                      renderTextLayer={true}
                    />
                  </Document>
                )}
              </div>

              <div className="reader-controls">
                <button
                  className="secondary-btn"
                  onClick={goToPreviousPage}
                  disabled={!pdfReady || currentPage <= 1}
                >
                  Previous
                </button>

                <div className="progress-text">
                  Page {currentPage} of {numPages || 0}
                </div>

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
            </div>
          )}

          {selectedBook.FileType === "epub" && (
            <div className="reader-card">
              <EpubReader
                bookId={selectedBook.BookId}
                bookUrl={`${API_BASE}/books/${selectedBook.BookId}/read`}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="topbar-left">
          <div>
            <h1 className="brand-title">OnlineReader</h1>
            <p className="brand-subtitle">Your personal cloud reading platform</p>
          </div>

          <div className="topbar-nav">
            <button
              className={`nav-btn ${activePage === "home" ? "active" : ""}`}
              onClick={() => setActivePage("home")}
            >
              Home
            </button>

            {currentUser.role === "admin" && (
              <button
                className={`nav-btn ${activePage === "admin" ? "active" : ""}`}
                onClick={() => setActivePage("admin")}
              >
                Admin Panel
              </button>
            )}
          </div>
        </div>

        <div className="user-card">
          <div className="user-card-email">{currentUser.email}</div>
          <div className="user-card-role">{currentUser.role}</div>
          <button className="secondary-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      {activePage === "admin" && currentUser.role === "admin" && (
        <div className="admin-panel-shell">
          <div className="admin-panel-header">
            <h2 className="admin-panel-title">Admin Panel</h2>
            <p className="admin-panel-subtitle">
              Upload books, attach optional custom covers, and refresh the library.
            </p>
          </div>

          <AdminUploadForm onUploadSuccess={fetchBooks} />
        </div>
      )}

      {activePage === "home" && (
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

              <div className="continue-grid">
                {(() => {
                  const percentage = formatPercent(lastOpenedBook.progress?.Percentage)

                  return (
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
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="mini-progress-text">
                            {percentage.toFixed(1)}%
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
                  )
                })()}
              </div>
            </div>
          )}

          <div>
            <div className="section-header">
              <h2 className="section-title">Library</h2>
            </div>

            {booksError && <p className="error-text">{booksError}</p>}
            {loadingBooks && <p className="message-text">Loading your library...</p>}

            {!loadingBooks && filteredBooks.length === 0 ? (
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
    </div>
  )
}

export default App