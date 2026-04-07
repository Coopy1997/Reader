const express = require("express")
const cors = require("cors")
const multer = require("multer")
const { BlobServiceClient } = require("@azure/storage-blob")
const { v4: uuidv4 } = require("uuid")
const { connectDB, sql } = require("./db")
const progressRoutes = require("./routes/progress")
const authRoutes = require("./routes/auth")
const { requireAuth, requireAdmin } = require("./middleware/auth")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 5000

const allowedOrigins = [
  "http://localhost:3000",
  "https://reader-taupe-nu.vercel.app"
]

app.use((req, res, next) => {
  const origin = req.headers.origin

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  }

  res.setHeader("Vary", "Origin")
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    return res.sendStatus(204)
  }

  next()
})

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
)

app.use(express.json())

app.use(authRoutes)
app.use(progressRoutes)

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "books"
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)

const storage = multer.memoryStorage()
const upload = multer({ storage })

function isValidCoverFile(fileName) {
  const lower = fileName.toLowerCase()
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp")
  )
}

function getBookFileType(fileName) {
  const lower = fileName.toLowerCase()

  if (lower.endsWith(".pdf")) return "pdf"
  if (lower.endsWith(".epub")) return "epub"
  return null
}

function parseBooleanInput(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback
  }

  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "number") {
    return value === 1
  }

  const normalized = String(value).trim().toLowerCase()

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false
  }

  return fallback
}

function parseFeaturedRankInput(value) {
  if (value === undefined || value === null || value === "") {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.max(1, Math.floor(parsed))
}

function normalizePercentage(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.max(0, Math.min(100, parsed))
}

function getContainerClient() {
  return blobServiceClient.getContainerClient(containerName)
}

async function getBlobSize(blobPath) {
  if (!blobPath) return 0

  try {
    const blobClient = getContainerClient().getBlobClient(blobPath)
    const properties = await blobClient.getProperties()
    return Number(properties.contentLength || 0)
  } catch (error) {
    console.warn(`Failed to read blob size for ${blobPath}:`, error.message)
    return 0
  }
}

async function deleteBlobIfExists(blobPath) {
  if (!blobPath) return

  try {
    const blobClient = getContainerClient().getBlobClient(blobPath)
    await blobClient.deleteIfExists()
  } catch (error) {
    console.warn(`Failed to delete blob ${blobPath}:`, error.message)
  }
}

async function enrichBooksWithStorage(books) {
  return Promise.all(
    books.map(async (book) => {
      const [fileSizeBytes, coverSizeBytes] = await Promise.all([
        getBlobSize(book.BlobPath),
        getBlobSize(book.CoverImagePath)
      ])

      return {
        ...book,
        IsHidden: !!book.IsHidden,
        IsFeatured: !!book.IsFeatured,
        FeaturedRank: book.FeaturedRank || null,
        AverageCompletionPercentage: normalizePercentage(book.AverageCompletionPercentage),
        FileSizeBytes: fileSizeBytes,
        CoverSizeBytes: coverSizeBytes,
        TotalStorageBytes: fileSizeBytes + coverSizeBytes
      }
    })
  )
}

function buildAdminBookStats(books, totalUsers, totalProgressEntries) {
  const totalStorageBytes = books.reduce(
    (sum, book) => sum + Number(book.TotalStorageBytes || 0),
    0
  )

  const totalBookStorageBytes = books.reduce(
    (sum, book) => sum + Number(book.FileSizeBytes || 0),
    0
  )

  const totalCoverStorageBytes = books.reduce(
    (sum, book) => sum + Number(book.CoverSizeBytes || 0),
    0
  )

  const visibleBooks = books.filter((book) => !book.IsHidden)
  const hiddenBooks = books.filter((book) => book.IsHidden)
  const featuredBooks = books.filter((book) => book.IsFeatured)

  const mostReadBooks = [...books]
    .sort((a, b) => {
      if ((b.ActiveReaders || 0) !== (a.ActiveReaders || 0)) {
        return (b.ActiveReaders || 0) - (a.ActiveReaders || 0)
      }

      return normalizePercentage(b.AverageCompletionPercentage) -
        normalizePercentage(a.AverageCompletionPercentage)
    })
    .slice(0, 5)

  const recentlyUploadedBooks = [...books]
    .sort(
      (a, b) =>
        new Date(b.CreatedAt || 0).getTime() - new Date(a.CreatedAt || 0).getTime()
    )
    .slice(0, 5)

  return {
    TotalBooks: books.length,
    TotalVisibleBooks: visibleBooks.length,
    TotalHiddenBooks: hiddenBooks.length,
    TotalFeaturedBooks: featuredBooks.length,
    TotalUsers: totalUsers,
    TotalProgressEntries: totalProgressEntries,
    TotalStorageBytes: totalStorageBytes,
    TotalBookStorageBytes: totalBookStorageBytes,
    TotalCoverStorageBytes: totalCoverStorageBytes,
    AverageCompletionPercentage: books.length
      ? books.reduce(
          (sum, book) => sum + normalizePercentage(book.AverageCompletionPercentage),
          0
        ) / books.length
      : 0
  }
}

function buildHighlights(books) {
  const mostReadBooks = [...books]
    .sort((a, b) => {
      if ((b.ActiveReaders || 0) !== (a.ActiveReaders || 0)) {
        return (b.ActiveReaders || 0) - (a.ActiveReaders || 0)
      }

      return normalizePercentage(b.AverageCompletionPercentage) -
        normalizePercentage(a.AverageCompletionPercentage)
    })
    .slice(0, 5)

  const recentlyUploadedBooks = [...books]
    .sort(
      (a, b) =>
        new Date(b.CreatedAt || 0).getTime() - new Date(a.CreatedAt || 0).getTime()
    )
    .slice(0, 5)

  return {
    mostReadBooks,
    recentlyUploadedBooks
  }
}

async function fetchBookById(bookId) {
  const result = await sql.query`
    SELECT
      BookId,
      Title,
      Author,
      FileType,
      Description,
      CreatedAt,
      BlobPath,
      CoverImagePath,
      ISNULL(IsHidden, 0) AS IsHidden,
      ISNULL(IsFeatured, 0) AS IsFeatured,
      FeaturedRank
    FROM Books
    WHERE BookId = ${bookId}
  `

  return result.recordset[0] || null
}

app.get("/", (req, res) => {
  res.send("Server is running")
})

app.get("/books", requireAuth, async (req, res) => {
  try {
    await connectDB()

    const result = await sql.query(`
      SELECT
        BookId,
        Title,
        Author,
        FileType,
        Description,
        CreatedAt,
        CoverImagePath,
        ISNULL(IsFeatured, 0) AS IsFeatured,
        FeaturedRank
      FROM Books
      WHERE ISNULL(IsHidden, 0) = 0
      ORDER BY
        CASE WHEN ISNULL(IsFeatured, 0) = 1 THEN 0 ELSE 1 END,
        ISNULL(FeaturedRank, 999999),
        CreatedAt DESC
    `)

    res.json(result.recordset)
  } catch (err) {
    console.error("GET /books error:", err)
    res.status(500).json({
      message: "Failed to fetch books",
      error: err.message
    })
  }
})

app.get("/books/library", requireAuth, async (req, res) => {
  try {
    await connectDB()

    const userId = req.user.userId

    const result = await sql.query`
      SELECT
        b.BookId,
        b.Title,
        b.Author,
        b.FileType,
        b.Description,
        b.CreatedAt,
        b.CoverImagePath,
        ISNULL(b.IsFeatured, 0) AS IsFeatured,
        b.FeaturedRank,
        rp.Format,
        rp.ProgressValue,
        rp.Percentage,
        rp.UpdatedAt
      FROM Books b
      LEFT JOIN ReadingProgress rp
        ON rp.BookId = CAST(b.BookId AS NVARCHAR(255))
        AND rp.UserId = ${userId}
      WHERE ISNULL(b.IsHidden, 0) = 0
      ORDER BY
        CASE WHEN ISNULL(b.IsFeatured, 0) = 1 THEN 0 ELSE 1 END,
        ISNULL(b.FeaturedRank, 999999),
        CASE WHEN rp.UpdatedAt IS NULL THEN 1 ELSE 0 END,
        rp.UpdatedAt DESC,
        b.CreatedAt DESC
    `

    const books = result.recordset.map((row) => ({
      BookId: row.BookId,
      Title: row.Title,
      Author: row.Author,
      FileType: row.FileType,
      Description: row.Description,
      CreatedAt: row.CreatedAt,
      CoverImagePath: row.CoverImagePath,
      IsFeatured: !!row.IsFeatured,
      FeaturedRank: row.FeaturedRank || null,
      progress: row.ProgressValue
        ? {
            Format: row.Format,
            ProgressValue: row.ProgressValue,
            Percentage: row.Percentage || 0,
            UpdatedAt: row.UpdatedAt
          }
        : null
    }))

    res.json(books)
  } catch (err) {
    console.error("GET /books/library error:", err)
    res.status(500).json({
      message: "Failed to fetch personalized library",
      error: err.message
    })
  }
})

app.post(
  "/admin/books/upload",
  requireAuth,
  requireAdmin,
  upload.fields([
    { name: "book", maxCount: 1 },
    { name: "coverImage", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { title, author, description } = req.body
      const isHidden = parseBooleanInput(req.body.isHidden, false)
      const isFeatured = parseBooleanInput(req.body.isFeatured, false)
      const featuredRank = isFeatured
        ? parseFeaturedRankInput(req.body.featuredRank)
        : null
      const bookFile = req.files?.book?.[0]
      const coverImage = req.files?.coverImage?.[0]

      if (!bookFile) {
        return res.status(400).json({ message: "No book file uploaded" })
      }

      if (!title) {
        return res.status(400).json({ message: "Title is required" })
      }

      const fileType = getBookFileType(bookFile.originalname)

      if (!fileType) {
        return res.status(400).json({
          message: "Only PDF and EPUB files are allowed"
        })
      }

      if (coverImage && !isValidCoverFile(coverImage.originalname)) {
        return res.status(400).json({
          message: "Cover image must be JPG, JPEG, PNG, or WEBP"
        })
      }

      let coverImagePath = null
      const bookId = uuidv4()
      const containerClient = getContainerClient()

      const blobName = `books/${bookId}-${Date.now()}-${bookFile.originalname}`
      const blockBlobClient = containerClient.getBlockBlobClient(blobName)

      await blockBlobClient.uploadData(bookFile.buffer, {
        blobHTTPHeaders: {
          blobContentType: bookFile.mimetype
        }
      })

      if (coverImage) {
        const coverBlobName = `covers/${bookId}-${Date.now()}-${coverImage.originalname}`
        const coverBlobClient = containerClient.getBlockBlobClient(coverBlobName)

        await coverBlobClient.uploadData(coverImage.buffer, {
          blobHTTPHeaders: {
            blobContentType: coverImage.mimetype
          }
        })

        coverImagePath = coverBlobName
      }

      await connectDB()

      await sql.query`
        INSERT INTO Books (
          BookId,
          Title,
          Author,
          FileType,
          BlobPath,
          Description,
          CoverImagePath,
          IsHidden,
          IsFeatured,
          FeaturedRank
        )
        VALUES (
          ${bookId},
          ${title},
          ${author || null},
          ${fileType},
          ${blobName},
          ${description || null},
          ${coverImagePath},
          ${isHidden},
          ${isFeatured},
          ${featuredRank}
        )
      `

      res.json({
        message: "Book uploaded and saved successfully",
        bookId,
        blobPath: blobName,
        coverImagePath
      })
    } catch (err) {
      console.error("POST /admin/books/upload error:", err)
      res.status(500).json({
        message: "Upload failed",
        error: err.message
      })
    }
  }
)

app.get("/admin/books", requireAuth, requireAdmin, async (req, res) => {
  try {
    await connectDB()

    const booksResult = await sql.query(`
      SELECT
        b.BookId,
        b.Title,
        b.Author,
        b.FileType,
        b.Description,
        b.CreatedAt,
        b.BlobPath,
        b.CoverImagePath,
        ISNULL(b.IsHidden, 0) AS IsHidden,
        ISNULL(b.IsFeatured, 0) AS IsFeatured,
        b.FeaturedRank,
        COUNT(rp.Id) AS ProgressEntries,
        COUNT(DISTINCT rp.UserId) AS ActiveReaders,
        SUM(CASE WHEN ISNULL(rp.Percentage, 0) >= 100 THEN 1 ELSE 0 END) AS CompletedReaders,
        AVG(CAST(ISNULL(rp.Percentage, 0) AS FLOAT)) AS AverageCompletionPercentage
      FROM Books b
      LEFT JOIN ReadingProgress rp
        ON rp.BookId = CAST(b.BookId AS NVARCHAR(255))
      GROUP BY
        b.BookId,
        b.Title,
        b.Author,
        b.FileType,
        b.Description,
        b.CreatedAt,
        b.BlobPath,
        b.CoverImagePath,
        b.IsHidden,
        b.IsFeatured,
        b.FeaturedRank
      ORDER BY
        CASE WHEN ISNULL(b.IsFeatured, 0) = 1 THEN 0 ELSE 1 END,
        ISNULL(b.FeaturedRank, 999999),
        b.CreatedAt DESC
    `)

    const totalsResult = await sql.query(`
      SELECT
        (SELECT COUNT(*) FROM Users) AS TotalUsers,
        (SELECT COUNT(*) FROM ReadingProgress) AS TotalProgressEntries
    `)

    const books = await enrichBooksWithStorage(booksResult.recordset)
    const totals = totalsResult.recordset[0]
    const stats = buildAdminBookStats(
      books,
      totals.TotalUsers || 0,
      totals.TotalProgressEntries || 0
    )
    const highlights = buildHighlights(books)

    res.json({
      books,
      stats,
      highlights
    })
  } catch (err) {
    console.error("GET /admin/books error:", err)
    res.status(500).json({
      message: "Failed to fetch admin books",
      error: err.message
    })
  }
})

app.get("/admin/books/:id/readers", requireAuth, requireAdmin, async (req, res) => {
  try {
    const bookId = req.params.id

    await connectDB()

    const book = await fetchBookById(bookId)

    if (!book) {
      return res.status(404).json({ message: "Book not found" })
    }

    const readersResult = await sql.query`
      SELECT
        u.UserId,
        u.Email,
        u.Role,
        rp.Format,
        rp.ProgressValue,
        rp.Percentage,
        rp.UpdatedAt
      FROM ReadingProgress rp
      INNER JOIN Users u
        ON u.UserId = rp.UserId
      WHERE rp.BookId = ${bookId}
      ORDER BY
        CASE WHEN rp.Percentage IS NULL THEN 1 ELSE 0 END,
        rp.Percentage DESC,
        rp.UpdatedAt DESC
    `

    res.json({
      book,
      readers: readersResult.recordset
    })
  } catch (err) {
    console.error("GET /admin/books/:id/readers error:", err)
    res.status(500).json({
      message: "Failed to fetch book reader details",
      error: err.message
    })
  }
})

app.post("/admin/books/bulk", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { action, bookIds, featuredRank } = req.body

    if (!Array.isArray(bookIds) || bookIds.length === 0) {
      return res.status(400).json({ message: "Select at least one book" })
    }

    const validActions = ["delete", "hide", "unhide", "feature", "unfeature"]

    if (!validActions.includes(action)) {
      return res.status(400).json({ message: "Invalid bulk action" })
    }

    await connectDB()

    for (const bookId of bookIds) {
      if (action === "delete") {
        const book = await fetchBookById(bookId)

        await sql.query`
          DELETE FROM ReadingProgress
          WHERE BookId = ${bookId}
        `

        await sql.query`
          DELETE FROM Books
          WHERE BookId = ${bookId}
        `

        if (book) {
          await Promise.all([
            deleteBlobIfExists(book.BlobPath),
            deleteBlobIfExists(book.CoverImagePath)
          ])
        }

        continue
      }

      if (action === "hide" || action === "unhide") {
        await sql.query`
          UPDATE Books
          SET IsHidden = ${action === "hide"}
          WHERE BookId = ${bookId}
        `
        continue
      }

      if (action === "feature" || action === "unfeature") {
        await sql.query`
          UPDATE Books
          SET
            IsFeatured = ${action === "feature"},
            FeaturedRank = ${action === "feature" ? parseFeaturedRankInput(featuredRank) : null}
          WHERE BookId = ${bookId}
        `
      }
    }

    res.json({
      message: `Bulk action "${action}" completed successfully`
    })
  } catch (err) {
    console.error("POST /admin/books/bulk error:", err)
    res.status(500).json({
      message: "Failed to run bulk action",
      error: err.message
    })
  }
})

app.put("/admin/books/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, author, description } = req.body
    const bookId = req.params.id

    if (!title) {
      return res.status(400).json({ message: "Title is required" })
    }

    await connectDB()

    await sql.query`
      UPDATE Books
      SET
        Title = ${title},
        Author = ${author || null},
        Description = ${description || null}
      WHERE BookId = ${bookId}
    `

    res.json({ message: "Book metadata updated successfully" })
  } catch (err) {
    console.error("PUT /admin/books/:id error:", err)
    res.status(500).json({
      message: "Failed to update book",
      error: err.message
    })
  }
})

app.patch("/admin/books/:id/settings", requireAuth, requireAdmin, async (req, res) => {
  try {
    const bookId = req.params.id
    const isHidden = parseBooleanInput(req.body.isHidden, false)
    const isFeatured = parseBooleanInput(req.body.isFeatured, false)
    const featuredRank = isFeatured
      ? parseFeaturedRankInput(req.body.featuredRank)
      : null

    await connectDB()

    await sql.query`
      UPDATE Books
      SET
        IsHidden = ${isHidden},
        IsFeatured = ${isFeatured},
        FeaturedRank = ${featuredRank}
      WHERE BookId = ${bookId}
    `

    res.json({
      message: "Book settings updated successfully"
    })
  } catch (err) {
    console.error("PATCH /admin/books/:id/settings error:", err)
    res.status(500).json({
      message: "Failed to update book settings",
      error: err.message
    })
  }
})

app.put(
  "/admin/books/:id/cover",
  requireAuth,
  requireAdmin,
  upload.single("coverImage"),
  async (req, res) => {
    try {
      const bookId = req.params.id
      const coverImage = req.file

      if (!coverImage) {
        return res.status(400).json({ message: "No cover image uploaded" })
      }

      if (!isValidCoverFile(coverImage.originalname)) {
        return res.status(400).json({
          message: "Cover image must be JPG, JPEG, PNG, or WEBP"
        })
      }

      await connectDB()

      const existing = await fetchBookById(bookId)

      if (!existing) {
        return res.status(404).json({ message: "Book not found" })
      }

      const coverBlobName = `covers/${bookId}-${Date.now()}-${coverImage.originalname}`
      const coverBlobClient = getContainerClient().getBlockBlobClient(coverBlobName)

      await coverBlobClient.uploadData(coverImage.buffer, {
        blobHTTPHeaders: {
          blobContentType: coverImage.mimetype
        }
      })

      await sql.query`
        UPDATE Books
        SET CoverImagePath = ${coverBlobName}
        WHERE BookId = ${bookId}
      `

      await deleteBlobIfExists(existing.CoverImagePath)

      res.json({
        message: "Cover replaced successfully",
        coverImagePath: coverBlobName
      })
    } catch (err) {
      console.error("PUT /admin/books/:id/cover error:", err)
      res.status(500).json({
        message: "Failed to replace cover",
        error: err.message
      })
    }
  }
)

app.put(
  "/admin/books/:id/file",
  requireAuth,
  requireAdmin,
  upload.single("book"),
  async (req, res) => {
    try {
      const bookId = req.params.id
      const bookFile = req.file

      if (!bookFile) {
        return res.status(400).json({ message: "No replacement file uploaded" })
      }

      const fileType = getBookFileType(bookFile.originalname)

      if (!fileType) {
        return res.status(400).json({
          message: "Only PDF and EPUB files are allowed"
        })
      }

      await connectDB()

      const existing = await fetchBookById(bookId)

      if (!existing) {
        return res.status(404).json({ message: "Book not found" })
      }

      const blobName = `books/${bookId}-${Date.now()}-${bookFile.originalname}`
      const blockBlobClient = getContainerClient().getBlockBlobClient(blobName)

      await blockBlobClient.uploadData(bookFile.buffer, {
        blobHTTPHeaders: {
          blobContentType: bookFile.mimetype
        }
      })

      await sql.query`
        UPDATE Books
        SET
          BlobPath = ${blobName},
          FileType = ${fileType}
        WHERE BookId = ${bookId}
      `

      await deleteBlobIfExists(existing.BlobPath)

      res.json({
        message: "Book file replaced successfully",
        blobPath: blobName,
        fileType
      })
    } catch (err) {
      console.error("PUT /admin/books/:id/file error:", err)
      res.status(500).json({
        message: "Failed to replace book file",
        error: err.message
      })
    }
  }
)

app.delete("/admin/books/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const bookId = req.params.id

    await connectDB()

    const book = await fetchBookById(bookId)

    await sql.query`
      DELETE FROM ReadingProgress
      WHERE BookId = ${bookId}
    `

    await sql.query`
      DELETE FROM Books
      WHERE BookId = ${bookId}
    `

    if (book) {
      await Promise.all([
        deleteBlobIfExists(book.BlobPath),
        deleteBlobIfExists(book.CoverImagePath)
      ])
    }

    res.json({ message: "Book deleted successfully" })
  } catch (err) {
    console.error("DELETE /admin/books/:id error:", err)
    res.status(500).json({
      message: "Failed to delete book",
      error: err.message
    })
  }
})

app.get("/admin/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    await connectDB()

    const usersResult = await sql.query`
      SELECT
        u.UserId,
        u.Email,
        u.Role,
        COUNT(rp.Id) AS ProgressEntries,
        COUNT(DISTINCT rp.BookId) AS StartedBooks,
        SUM(CASE WHEN ISNULL(rp.Percentage, 0) >= 100 THEN 1 ELSE 0 END) AS CompletedBooks,
        MAX(rp.UpdatedAt) AS LastActivityAt
      FROM Users u
      LEFT JOIN ReadingProgress rp
        ON rp.UserId = u.UserId
      GROUP BY
        u.UserId,
        u.Email,
        u.Role
      ORDER BY
        CASE WHEN u.Role = 'admin' THEN 0 ELSE 1 END,
        u.Email ASC
    `

    const statsResult = await sql.query`
      SELECT
        COUNT(*) AS TotalUsers,
        SUM(CASE WHEN Role = 'admin' THEN 1 ELSE 0 END) AS TotalAdmins,
        SUM(CASE WHEN Role = 'user' THEN 1 ELSE 0 END) AS TotalStandardUsers
      FROM Users
    `

    res.json({
      users: usersResult.recordset,
      stats: statsResult.recordset[0]
    })
  } catch (err) {
    console.error("GET /admin/users error:", err)
    res.status(500).json({
      message: "Failed to fetch users",
      error: err.message
    })
  }
})

app.put("/admin/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id)
    const { role } = req.body

    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: "Invalid user id" })
    }

    if (!["admin", "user"].includes(role)) {
      return res.status(400).json({ message: "Role must be admin or user" })
    }

    if (req.user.userId === userId && role !== "admin") {
      return res.status(400).json({
        message: "You cannot remove your own admin access"
      })
    }

    await connectDB()

    const existing = await sql.query`
      SELECT UserId
      FROM Users
      WHERE UserId = ${userId}
    `

    if (existing.recordset.length === 0) {
      return res.status(404).json({ message: "User not found" })
    }

    await sql.query`
      UPDATE Users
      SET Role = ${role}
      WHERE UserId = ${userId}
    `

    res.json({
      message: `User role updated to ${role}`,
      userId,
      role
    })
  } catch (err) {
    console.error("PUT /admin/users/:id/role error:", err)
    res.status(500).json({
      message: "Failed to update user role",
      error: err.message
    })
  }
})

app.get("/books/:id/read", requireAuth, async (req, res) => {
  try {
    await connectDB()

    const result = await sql.query`
      SELECT BookId, Title, FileType, BlobPath, ISNULL(IsHidden, 0) AS IsHidden
      FROM Books
      WHERE BookId = ${req.params.id}
    `

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Book not found" })
    }

    const book = result.recordset[0]

    if (book.IsHidden && req.user.role !== "admin") {
      return res.status(404).json({ message: "Book not found" })
    }

    const blobClient = getContainerClient().getBlobClient(book.BlobPath)
    const downloadResponse = await blobClient.download()

    if (book.FileType === "pdf") {
      res.setHeader("Content-Type", "application/pdf")
      res.setHeader("Content-Disposition", "inline")
      res.setHeader("Access-Control-Expose-Headers", "Content-Type, Content-Disposition")
      downloadResponse.readableStreamBody.pipe(res)
      return
    }

    if (book.FileType === "epub") {
      res.setHeader("Content-Type", "application/epub+zip")
      res.setHeader("Content-Disposition", 'inline; filename="book.epub"')
      res.setHeader("Cache-Control", "no-store")
      res.setHeader("Access-Control-Expose-Headers", "Content-Type, Content-Disposition")
      downloadResponse.readableStreamBody.pipe(res)
      return
    }

    res.status(400).json({ message: "Unsupported file type" })
  } catch (err) {
    console.error("GET /books/:id/read error:", err)
    res.status(500).json({
      message: "Failed to stream book",
      error: err.message
    })
  }
})

app.get("/books/:id/cover", requireAuth, async (req, res) => {
  try {
    await connectDB()

    const result = await sql.query`
      SELECT CoverImagePath, ISNULL(IsHidden, 0) AS IsHidden
      FROM Books
      WHERE BookId = ${req.params.id}
    `

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Book not found" })
    }

    const book = result.recordset[0]

    if (book.IsHidden && req.user.role !== "admin") {
      return res.status(404).json({ message: "Book not found" })
    }

    if (!book.CoverImagePath) {
      return res.status(404).json({ message: "No custom cover found" })
    }

    const blobClient = getContainerClient().getBlobClient(book.CoverImagePath)
    const downloadResponse = await blobClient.download()

    res.setHeader("Content-Disposition", "inline")
    res.setHeader("Access-Control-Expose-Headers", "Content-Type, Content-Disposition")
    res.setHeader("Content-Type", downloadResponse.contentType || "image/jpeg")
    res.setHeader("Cache-Control", "no-store")

    downloadResponse.readableStreamBody.pipe(res)
  } catch (err) {
    console.error("GET /books/:id/cover error:", err)
    res.status(500).json({
      message: "Failed to stream cover image",
      error: err.message
    })
  }
})

app.listen(PORT, async () => {
  try {
    await connectDB()
    console.log(`Server running on port ${PORT}`)
  } catch (err) {
    console.error("Server startup failed:", err)
  }
})
