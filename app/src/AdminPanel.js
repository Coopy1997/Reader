import React, { useCallback, useEffect, useMemo, useState } from "react"
import AdminUploadForm from "./AdminUploadForm"
import BookCover from "./BookCover"
import {
  deleteAdminBook,
  getAdminBookReaders,
  getAdminBooks,
  getAdminUsers,
  replaceAdminBookFile,
  replaceAdminCover,
  runAdminBulkAction,
  updateAdminBook,
  updateAdminBookSettings,
  updateAdminUserRole
} from "./api"

function formatDate(dateValue) {
  if (!dateValue) return "No activity yet"

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return "No activity yet"

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date)
}

function formatPercent(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return 0
  }

  return Math.max(0, Math.min(100, number))
}

function formatBytes(value) {
  const bytes = Number(value)

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const amount = bytes / 1024 ** exponent

  return `${amount.toFixed(amount >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function getReaderStatus(reader) {
  const percentage = formatPercent(reader.Percentage)

  if (percentage >= 100) return "Completed"
  if (percentage > 0) return "In progress"
  return "Started"
}

function formatSavedPosition(reader, fallbackFileType) {
  if (!reader?.ProgressValue) {
    return "No saved position"
  }

  const format = (reader.Format || fallbackFileType || "").toLowerCase()

  if (format === "epub") {
    const percentage = formatPercent(reader.Percentage)
    return percentage > 0
      ? `Saved location: ${percentage.toFixed(1)}%`
      : "Saved location in EPUB"
  }

  return `Page ${reader.ProgressValue}`
}

function sortBooks(books, adminSortBy) {
  const result = [...books]

  if (adminSortBy === "title") {
    result.sort((a, b) => (a.Title || "").localeCompare(b.Title || ""))
  } else if (adminSortBy === "author") {
    result.sort((a, b) => (a.Author || "").localeCompare(b.Author || ""))
  } else if (adminSortBy === "storage") {
    result.sort((a, b) => (b.TotalStorageBytes || 0) - (a.TotalStorageBytes || 0))
  } else if (adminSortBy === "readers") {
    result.sort((a, b) => (b.ActiveReaders || 0) - (a.ActiveReaders || 0))
  } else {
    result.sort(
      (a, b) =>
        new Date(b.CreatedAt || 0).getTime() - new Date(a.CreatedAt || 0).getTime()
    )
  }

  return result
}

export default function AdminPanel({ currentUser, onLibraryRefresh }) {
  const [activeAdminTab, setActiveAdminTab] = useState("books")
  const [adminBooks, setAdminBooks] = useState([])
  const [adminStats, setAdminStats] = useState(null)
  const [adminHighlights, setAdminHighlights] = useState({
    mostReadBooks: [],
    recentlyUploadedBooks: []
  })
  const [adminUsers, setAdminUsers] = useState([])
  const [userStats, setUserStats] = useState(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [adminError, setAdminError] = useState("")
  const [usersError, setUsersError] = useState("")
  const [adminSearch, setAdminSearch] = useState("")
  const [adminFormatFilter, setAdminFormatFilter] = useState("all")
  const [adminVisibilityFilter, setAdminVisibilityFilter] = useState("all")
  const [adminFeaturedFilter, setAdminFeaturedFilter] = useState("all")
  const [adminSortBy, setAdminSortBy] = useState("newest")
  const [selectedBookIds, setSelectedBookIds] = useState([])
  const [userSearch, setUserSearch] = useState("")
  const [userRoleFilter, setUserRoleFilter] = useState("all")
  const [editingBook, setEditingBook] = useState(null)
  const [editTitle, setEditTitle] = useState("")
  const [editAuthor, setEditAuthor] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [selectedBookInsights, setSelectedBookInsights] = useState(null)
  const [bookReaders, setBookReaders] = useState([])
  const [bookReadersLoading, setBookReadersLoading] = useState(false)
  const [bookReadersError, setBookReadersError] = useState("")
  const [adminActionLoading, setAdminActionLoading] = useState(false)

  const fetchAdminBooks = useCallback(async () => {
    try {
      setAdminLoading(true)
      setAdminError("")

      const data = await getAdminBooks()
      setAdminBooks(data.books || [])
      setAdminStats(data.stats || null)
      setAdminHighlights(
        data.highlights || {
          mostReadBooks: [],
          recentlyUploadedBooks: []
        }
      )
    } catch (error) {
      console.error("Failed to fetch admin books:", error)
      setAdminError(error.message || "Failed to load admin panel")
    } finally {
      setAdminLoading(false)
    }
  }, [])

  const fetchAdminUsers = useCallback(async () => {
    try {
      setUsersLoading(true)
      setUsersError("")

      const data = await getAdminUsers()
      setAdminUsers(data.users || [])
      setUserStats(data.stats || null)
    } catch (error) {
      console.error("Failed to fetch admin users:", error)
      setUsersError(error.message || "Failed to load users")
    } finally {
      setUsersLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAdminBooks()
    fetchAdminUsers()
  }, [fetchAdminBooks, fetchAdminUsers])

  const filteredAdminBooks = useMemo(() => {
    const query = adminSearch.trim().toLowerCase()

    let result = adminBooks.filter((book) => {
      if (!query) {
        return true
      }

      const haystack = [book.Title, book.Author, book.Description, book.FileType]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(query)
    })

    if (adminFormatFilter !== "all") {
      result = result.filter(
        (book) => (book.FileType || "").toLowerCase() === adminFormatFilter
      )
    }

    if (adminVisibilityFilter !== "all") {
      result = result.filter((book) =>
        adminVisibilityFilter === "hidden" ? book.IsHidden : !book.IsHidden
      )
    }

    if (adminFeaturedFilter !== "all") {
      result = result.filter((book) =>
        adminFeaturedFilter === "featured" ? book.IsFeatured : !book.IsFeatured
      )
    }

    return sortBooks(result, adminSortBy)
  }, [
    adminBooks,
    adminFeaturedFilter,
    adminFormatFilter,
    adminSearch,
    adminSortBy,
    adminVisibilityFilter
  ])

  useEffect(() => {
    setSelectedBookIds((current) =>
      current.filter((bookId) => filteredAdminBooks.some((book) => book.BookId === bookId))
    )
  }, [filteredAdminBooks])

  const filteredUsers = useMemo(() => {
    let result = [...adminUsers]
    const query = userSearch.trim().toLowerCase()

    if (query) {
      result = result.filter((user) => {
        const haystack = [user.Email, user.Role, String(user.UserId)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        return haystack.includes(query)
      })
    }

    if (userRoleFilter !== "all") {
      result = result.filter((user) => (user.Role || "").toLowerCase() === userRoleFilter)
    }

    result.sort((a, b) => {
      if (a.Role !== b.Role) {
        return a.Role === "admin" ? -1 : 1
      }

      return (a.Email || "").localeCompare(b.Email || "")
    })

    return result
  }, [adminUsers, userRoleFilter, userSearch])

  const totalCompletedReaders = useMemo(() => {
    return bookReaders.filter((reader) => formatPercent(reader.Percentage) >= 100).length
  }, [bookReaders])

  const totalActiveReaders = useMemo(() => {
    return bookReaders.filter((reader) => formatPercent(reader.Percentage) > 0).length
  }, [bookReaders])

  const allFilteredSelected =
    filteredAdminBooks.length > 0 && selectedBookIds.length === filteredAdminBooks.length

  const toggleBookSelection = useCallback((bookId) => {
    setSelectedBookIds((current) =>
      current.includes(bookId)
        ? current.filter((id) => id !== bookId)
        : [...current, bookId]
    )
  }, [])

  const toggleSelectAllFiltered = useCallback(() => {
    setSelectedBookIds((current) => {
      if (filteredAdminBooks.length === 0) {
        return current
      }

      if (current.length === filteredAdminBooks.length) {
        return []
      }

      return filteredAdminBooks.map((book) => book.BookId)
    })
  }, [filteredAdminBooks])

  const refreshAdminAndLibrary = useCallback(async () => {
    await Promise.all([fetchAdminBooks(), onLibraryRefresh()])
  }, [fetchAdminBooks, onLibraryRefresh])

  const openEditBook = useCallback((book) => {
    setEditingBook(book)
    setEditTitle(book.Title || "")
    setEditAuthor(book.Author || "")
    setEditDescription(book.Description || "")
  }, [])

  const closeEditBook = useCallback(() => {
    setEditingBook(null)
    setEditTitle("")
    setEditAuthor("")
    setEditDescription("")
  }, [])

  const openBookInsights = useCallback(async (book) => {
    try {
      setSelectedBookInsights(book)
      setBookReaders([])
      setBookReadersError("")
      setBookReadersLoading(true)

      const data = await getAdminBookReaders(book.BookId)
      setSelectedBookInsights(data.book || book)
      setBookReaders(data.readers || [])
    } catch (error) {
      console.error("Failed to fetch book readers:", error)
      setBookReadersError(error.message || "Failed to load reader details")
    } finally {
      setBookReadersLoading(false)
    }
  }, [])

  const closeBookInsights = useCallback(() => {
    setSelectedBookInsights(null)
    setBookReaders([])
    setBookReadersError("")
    setBookReadersLoading(false)
  }, [])

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

      await refreshAdminAndLibrary()
      closeEditBook()
    } catch (error) {
      window.alert(error.message || "Failed to update book")
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
      await refreshAdminAndLibrary()
    } catch (error) {
      window.alert(error.message || "Failed to delete book")
    } finally {
      setAdminActionLoading(false)
    }
  }

  const handleReplaceCover = async (book, file) => {
    if (!file) return

    try {
      setAdminActionLoading(true)
      await replaceAdminCover(book.BookId, file)
      await refreshAdminAndLibrary()
    } catch (error) {
      window.alert(error.message || "Failed to replace cover")
    } finally {
      setAdminActionLoading(false)
    }
  }

  const handleReplaceBookFile = async (book, file) => {
    if (!file) return

    try {
      setAdminActionLoading(true)
      await replaceAdminBookFile(book.BookId, file)
      await refreshAdminAndLibrary()
    } catch (error) {
      window.alert(error.message || "Failed to replace file")
    } finally {
      setAdminActionLoading(false)
    }
  }

  const handleBookSettingToggle = async (book, payload) => {
    try {
      setAdminActionLoading(true)
      await updateAdminBookSettings(book.BookId, payload)
      await refreshAdminAndLibrary()
    } catch (error) {
      window.alert(error.message || "Failed to update book settings")
    } finally {
      setAdminActionLoading(false)
    }
  }

  const handleBulkAction = async (action) => {
    if (selectedBookIds.length === 0) {
      window.alert("Select at least one book first")
      return
    }

    const confirmed = window.confirm(
      `${action.charAt(0).toUpperCase()}${action.slice(1)} ${selectedBookIds.length} selected books?`
    )

    if (!confirmed) return

    try {
      setAdminActionLoading(true)
      await runAdminBulkAction({
        action,
        bookIds: selectedBookIds
      })
      setSelectedBookIds([])
      await refreshAdminAndLibrary()
    } catch (error) {
      window.alert(error.message || "Failed to run bulk action")
    } finally {
      setAdminActionLoading(false)
    }
  }

  const handleFeatureSingleBook = async (book) => {
    const nextFeatured = !book.IsFeatured

    await handleBookSettingToggle(book, {
      isHidden: book.IsHidden,
      isFeatured: nextFeatured,
      featuredRank: nextFeatured ? book.FeaturedRank || 1 : null
    })
  }

  const handleHideSingleBook = async (book) => {
    await handleBookSettingToggle(book, {
      isHidden: !book.IsHidden,
      isFeatured: book.IsFeatured,
      featuredRank: book.IsFeatured ? book.FeaturedRank || 1 : null
    })
  }

  const handleUserRoleUpdate = async (user, nextRole) => {
    try {
      setAdminActionLoading(true)
      await updateAdminUserRole(user.UserId, nextRole)
      await fetchAdminUsers()
    } catch (error) {
      window.alert(error.message || "Failed to update user role")
    } finally {
      setAdminActionLoading(false)
    }
  }

  return (
    <div className="admin-overhaul">
      <div className="admin-stats-grid admin-stats-grid-wide">
        <div className="stat-card">
          <div className="stat-label">Total books</div>
          <div className="stat-value">{adminStats?.TotalBooks || 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Visible books</div>
          <div className="stat-value">{adminStats?.TotalVisibleBooks || 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Hidden books</div>
          <div className="stat-value">{adminStats?.TotalHiddenBooks || 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Featured books</div>
          <div className="stat-value">{adminStats?.TotalFeaturedBooks || 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Storage used</div>
          <div className="stat-value stat-value-compact">
            {formatBytes(adminStats?.TotalStorageBytes || 0)}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Average completion</div>
          <div className="stat-value stat-value-compact">
            {formatPercent(adminStats?.AverageCompletionPercentage).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="admin-highlights-grid">
        <div className="admin-card">
          <div className="section-header">
            <h2 className="section-title">Recently Uploaded</h2>
          </div>

          <div className="highlight-list">
            {adminHighlights.recentlyUploadedBooks?.map((book) => (
              <div key={book.BookId} className="highlight-row">
                <div>
                  <div className="highlight-title">{book.Title}</div>
                  <div className="highlight-meta">
                    {book.Author || "Unknown"} | {formatDate(book.CreatedAt)}
                  </div>
                </div>
                <div className="summary-chip">{(book.FileType || "").toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-card">
          <div className="section-header">
            <h2 className="section-title">Most Read Books</h2>
          </div>

          <div className="highlight-list">
            {adminHighlights.mostReadBooks?.map((book) => (
              <div key={book.BookId} className="highlight-row">
                <div>
                  <div className="highlight-title">{book.Title}</div>
                  <div className="highlight-meta">
                    {book.ActiveReaders || 0} readers |{" "}
                    {formatPercent(book.AverageCompletionPercentage).toFixed(1)}% avg completion
                  </div>
                </div>
                <div className="summary-chip">{formatBytes(book.TotalStorageBytes || 0)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h2 className="section-title">Upload New Book</h2>
        <AdminUploadForm
          onUploadSuccess={async () => {
            await refreshAdminAndLibrary()
          }}
        />
      </div>

      <div className="admin-card">
        <div className="section-header">
          <h2 className="section-title">Admin Workspace</h2>

          <div className="admin-tab-row">
            <button
              className={`secondary-btn ${activeAdminTab === "books" ? "active-tab" : ""}`}
              onClick={() => setActiveAdminTab("books")}
              type="button"
            >
              Books
            </button>

            <button
              className={`secondary-btn ${activeAdminTab === "users" ? "active-tab" : ""}`}
              onClick={() => setActiveAdminTab("users")}
              type="button"
            >
              Users
            </button>
          </div>
        </div>

        {activeAdminTab === "books" && (
          <>
            <div className="library-toolbar admin-toolbar admin-toolbar-extended">
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
                value={adminVisibilityFilter}
                onChange={(e) => setAdminVisibilityFilter(e.target.value)}
              >
                <option value="all">All visibility</option>
                <option value="visible">Visible</option>
                <option value="hidden">Hidden</option>
              </select>

              <select
                className="input toolbar-select"
                value={adminFeaturedFilter}
                onChange={(e) => setAdminFeaturedFilter(e.target.value)}
              >
                <option value="all">All featuring</option>
                <option value="featured">Featured</option>
                <option value="standard">Standard</option>
              </select>

              <select
                className="input toolbar-select"
                value={adminSortBy}
                onChange={(e) => setAdminSortBy(e.target.value)}
              >
                <option value="newest">Newest</option>
                <option value="title">Title A-Z</option>
                <option value="author">Author A-Z</option>
                <option value="readers">Most readers</option>
                <option value="storage">Largest storage</option>
              </select>
            </div>

            <div className="admin-bulk-bar">
              <label className="admin-checkbox-row">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                />
                <span>Select all filtered ({filteredAdminBooks.length})</span>
              </label>

              <div className="admin-actions">
                <button
                  className="secondary-btn"
                  type="button"
                  disabled={adminActionLoading || selectedBookIds.length === 0}
                  onClick={() => handleBulkAction("feature")}
                >
                  Feature Selected
                </button>

                <button
                  className="secondary-btn"
                  type="button"
                  disabled={adminActionLoading || selectedBookIds.length === 0}
                  onClick={() => handleBulkAction("unfeature")}
                >
                  Unfeature Selected
                </button>

                <button
                  className="secondary-btn"
                  type="button"
                  disabled={adminActionLoading || selectedBookIds.length === 0}
                  onClick={() => handleBulkAction("hide")}
                >
                  Hide Selected
                </button>

                <button
                  className="secondary-btn"
                  type="button"
                  disabled={adminActionLoading || selectedBookIds.length === 0}
                  onClick={() => handleBulkAction("unhide")}
                >
                  Unhide Selected
                </button>

                <button
                  className="danger-btn"
                  type="button"
                  disabled={adminActionLoading || selectedBookIds.length === 0}
                  onClick={() => handleBulkAction("delete")}
                >
                  Delete Selected
                </button>
              </div>
            </div>

            {adminError && <p className="error-text">{adminError}</p>}

            {adminLoading ? (
              <p className="message-text">Loading admin data...</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table admin-table-books">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Cover</th>
                      <th>Title</th>
                      <th>Author</th>
                      <th>Format</th>
                      <th>Status</th>
                      <th>Readers</th>
                      <th>Completion</th>
                      <th>Storage</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdminBooks.map((book) => (
                      <tr key={book.BookId}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedBookIds.includes(book.BookId)}
                            onChange={() => toggleBookSelection(book.BookId)}
                          />
                        </td>
                        <td className="admin-cover-cell">
                          <div className="admin-cover-mini">
                            <BookCover book={book} />
                          </div>
                        </td>
                        <td>
                          <div className="admin-title-cell">
                            <strong>{book.Title}</strong>
                            {book.Description && <span>{book.Description}</span>}
                          </div>
                        </td>
                        <td>{book.Author || "Unknown"}</td>
                        <td>{(book.FileType || "").toUpperCase()}</td>
                        <td>
                          <div className="status-pill-row">
                            <span className={`user-role-pill ${book.IsHidden ? "role-hidden" : "role-visible"}`}>
                              {book.IsHidden ? "Hidden" : "Visible"}
                            </span>
                            <span className={`user-role-pill ${book.IsFeatured ? "role-admin" : "role-user"}`}>
                              {book.IsFeatured ? "Featured" : "Standard"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div>{book.ActiveReaders || 0} active</div>
                          <div className="table-subtext">
                            {book.CompletedReaders || 0} completed
                          </div>
                        </td>
                        <td>
                          <div>{formatPercent(book.AverageCompletionPercentage).toFixed(1)}%</div>
                          <div className="table-subtext">
                            {book.ProgressEntries || 0} progress saves
                          </div>
                        </td>
                        <td>
                          <div>{formatBytes(book.TotalStorageBytes || 0)}</div>
                          <div className="table-subtext">
                            File {formatBytes(book.FileSizeBytes || 0)} | Cover{" "}
                            {formatBytes(book.CoverSizeBytes || 0)}
                          </div>
                        </td>
                        <td>{formatDate(book.CreatedAt)}</td>
                        <td>
                          <div className="admin-actions">
                            <button
                              className="secondary-btn"
                              onClick={() => openBookInsights(book)}
                              type="button"
                            >
                              View Readers
                            </button>

                            <button
                              className="secondary-btn"
                              onClick={() => openEditBook(book)}
                              type="button"
                            >
                              Edit
                            </button>

                            <button
                              className="secondary-btn"
                              onClick={() => handleFeatureSingleBook(book)}
                              type="button"
                              disabled={adminActionLoading}
                            >
                              {book.IsFeatured ? "Unfeature" : "Feature"}
                            </button>

                            <button
                              className="secondary-btn"
                              onClick={() => handleHideSingleBook(book)}
                              type="button"
                              disabled={adminActionLoading}
                            >
                              {book.IsHidden ? "Unhide" : "Hide"}
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
                              type="button"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {filteredAdminBooks.length === 0 && (
                      <tr>
                        <td colSpan="11" className="admin-empty-cell">
                          No books found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeAdminTab === "users" && (
          <>
            <div className="library-toolbar admin-toolbar">
              <input
                className="input toolbar-input"
                type="text"
                placeholder="Search users by email or ID..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />

              <select
                className="input toolbar-select"
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
              >
                <option value="all">All roles</option>
                <option value="admin">Admins</option>
                <option value="user">Users</option>
              </select>

              <div className="admin-summary-chip-row">
                <div className="summary-chip">
                  Standard users: {userStats?.TotalStandardUsers || 0}
                </div>
                <div className="summary-chip">
                  Progress entries: {adminStats?.TotalProgressEntries || 0}
                </div>
              </div>
            </div>

            {usersError && <p className="error-text">{usersError}</p>}

            {usersLoading ? (
              <p className="message-text">Loading users...</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Started Books</th>
                      <th>Completed</th>
                      <th>Last Activity</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const isSelf = currentUser?.userId === user.UserId
                      const isAdmin = user.Role === "admin"

                      return (
                        <tr key={user.UserId}>
                          <td>
                            <div className="admin-user-cell">
                              <strong>{user.Email}</strong>
                              <span>ID {user.UserId}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`user-role-pill ${isAdmin ? "role-admin" : "role-user"}`}>
                              {user.Role}
                            </span>
                          </td>
                          <td>{user.StartedBooks || 0}</td>
                          <td>{user.CompletedBooks || 0}</td>
                          <td>{formatDate(user.LastActivityAt)}</td>
                          <td>
                            <div className="admin-actions">
                              {isAdmin ? (
                                <button
                                  className="secondary-btn"
                                  type="button"
                                  disabled={adminActionLoading || isSelf}
                                  onClick={() => handleUserRoleUpdate(user, "user")}
                                >
                                  {isSelf ? "Current Admin" : "Demote to User"}
                                </button>
                              ) : (
                                <button
                                  className="secondary-btn"
                                  type="button"
                                  disabled={adminActionLoading}
                                  onClick={() => handleUserRoleUpdate(user, "admin")}
                                >
                                  Promote to Admin
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}

                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan="6" className="admin-empty-cell">
                          No users found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
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

      {selectedBookInsights && (
        <div className="modal-overlay" onClick={closeBookInsights}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="section-header">
              <div>
                <h3 className="section-title">Reader Activity</h3>
                <p className="admin-modal-subtitle">
                  {selectedBookInsights.Title} by {selectedBookInsights.Author || "Unknown"}
                </p>
              </div>

              <button
                className="secondary-btn"
                onClick={closeBookInsights}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="admin-reader-stats">
              <div className="summary-chip">Readers: {bookReaders.length}</div>
              <div className="summary-chip">Active: {totalActiveReaders}</div>
              <div className="summary-chip">Completed: {totalCompletedReaders}</div>
              <div className="summary-chip">
                Avg completion:{" "}
                {bookReaders.length
                  ? (
                      bookReaders.reduce(
                        (sum, reader) => sum + formatPercent(reader.Percentage),
                        0
                      ) / bookReaders.length
                    ).toFixed(1)
                  : "0.0"}
                %
              </div>
            </div>

            {bookReadersError && <p className="error-text">{bookReadersError}</p>}

            {bookReadersLoading ? (
              <p className="message-text">Loading reader details...</p>
            ) : bookReaders.length === 0 ? (
              <div className="empty-state admin-insights-empty">
                <p>No users have saved progress for this book yet.</p>
              </div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Format</th>
                      <th>Status</th>
                      <th>Completion</th>
                      <th>Saved Position</th>
                      <th>Last Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookReaders.map((reader) => (
                      <tr key={reader.UserId}>
                        <td>{reader.Email}</td>
                        <td>{reader.Role}</td>
                        <td>{(reader.Format || selectedBookInsights.FileType || "").toUpperCase()}</td>
                        <td>{getReaderStatus(reader)}</td>
                        <td>{formatPercent(reader.Percentage).toFixed(1)}%</td>
                        <td>{formatSavedPosition(reader, selectedBookInsights.FileType)}</td>
                        <td>{formatDate(reader.UpdatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
