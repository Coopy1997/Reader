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
import AdminPanel from "./AdminPanel"
import AuthPanel from "./AuthPanel"
import BookCover from "./BookCover"
import EpubReader from "./EpubReader"
import {
  clearStoredAuth,
  fetchLibraryBooks,
  fetchProgress,
  getStoredUser,
  getToken,
  saveProgress,
  subscribeToUnauthorized
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
  const [currentUser, setCurrentUser] = useState(() => getStoredUser())
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

  const token = getToken()
  const readerShellRef = useRef(null)

  const resetReaderState = useCallback(() => {
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
    setIsReaderFullscreen(false)
  }, [])

  const logout = useCallback(() => {
    clearStoredAuth()
    setCurrentUser(null)
    setBooks([])
    setBooksError("")
    setCurrentPageView("library")
    resetReaderState()

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }, [resetReaderState])

  useEffect(() => {
    return subscribeToUnauthorized(() => {
      logout()
    })
  }, [logout])

  const fetchBooks = useCallback(async () => {
    if (!token) return

    try {
      setLoadingBooks(true)
      setBooksError("")

      const data = await fetchLibraryBooks()

      if (Array.isArray(data)) {
        setBooks(data)
      } else {
        setBooks([])
        setBooksError("Backend returned invalid data for /books/library.")
      }
    } catch (error) {
      console.error("Failed to fetch library:", error)

      if (error.message === "Your session has expired. Please log in again.") {
        return
      }

      setBooks([])
      setBooksError(error.message || "Failed to fetch books from backend.")
    } finally {
      setLoadingBooks(false)
    }
  }, [token])

  useEffect(() => {
    if (!currentUser || !token) return
    fetchBooks()
  }, [currentUser, token, fetchBooks])

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
        const data = await fetchProgress(selectedBook.BookId)
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
    if (!Number.isNaN(page) && page > 0) {
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
        await saveProgress(selectedBook.BookId, readingProgress)
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

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange)
    }
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

  const onDocumentLoadSuccess = ({ numPages: loadedPageCount }) => {
    setNumPages(loadedPageCount)
    setPdfReady(true)

    setReadingProgress((prev) => {
      if (prev.format === "pdf" && prev.progressValue === String(currentPage)) {
        return prev
      }

      return {
        format: "pdf",
        progressValue: String(currentPage),
        percentage: loadedPageCount ? (currentPage / loadedPageCount) * 100 : 0
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

    if (!Number.isNaN(page)) {
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
    resetReaderState()
    setCurrentPageView("library")

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }

  const handleAuthSuccess = (user) => {
    setCurrentUser(user)
    setBooks([])
    setBooksError("")
    setCurrentPageView("library")
    resetReaderState()
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
    const withProgress = books
      .filter((book) => book.progress?.UpdatedAt)
      .sort(
        (a, b) =>
          new Date(b.progress.UpdatedAt).getTime() -
          new Date(a.progress.UpdatedAt).getTime()
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
          <div className="brand-badge">Book</div>
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
              type="button"
            >
              Library
            </button>

            {currentUser.role === "admin" && (
              <button
                className={`secondary-btn ${currentPageView === "admin" ? "active-tab" : ""}`}
                onClick={() => setCurrentPageView("admin")}
                type="button"
              >
                Admin Panel
              </button>
            )}
          </div>

          <div className="user-card">
            <div className="user-card-email">{currentUser.email}</div>
            <div className="user-card-role">{currentUser.role}</div>
            <button className="secondary-btn" onClick={logout} type="button">
              Logout
            </button>
          </div>
        </div>
      </div>

      {currentPageView === "admin" && currentUser.role === "admin" && (
        <AdminPanel currentUser={currentUser} onLibraryRefresh={fetchBooks} />
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
              <option value="title">Title A-Z</option>
              <option value="author">Author A-Z</option>
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
                      {lastOpenedBook.Author || "Unknown"} |{" "}
                      {(lastOpenedBook.FileType || "").toUpperCase()}
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

                    <button className="primary-btn" onClick={() => openBook(lastOpenedBook)} type="button">
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

                      <button className="primary-btn" onClick={() => openBook(book)} type="button">
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
              <button className="secondary-btn" onClick={closeBook} type="button">
                Back to Library
              </button>

              <div>
                <h2 className="reader-title">{selectedBook.Title}</h2>
                <p className="reader-meta">
                  {selectedBook.Author || "Unknown"} | {selectedBook.FileType}
                </p>
              </div>
            </div>

            <div className="reader-toolbar-right">
              <button className="secondary-btn" onClick={toggleFullscreen} type="button">
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
                  type="button"
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
                  type="button"
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
