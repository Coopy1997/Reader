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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    return res.sendStatus(204)
  }

  next()
})

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}))

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
        CoverImagePath
      FROM Books
      ORDER BY CreatedAt DESC
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
        rp.Format,
        rp.ProgressValue,
        rp.Percentage,
        rp.UpdatedAt
      FROM Books b
      LEFT JOIN ReadingProgress rp
        ON rp.BookId = CAST(b.BookId AS NVARCHAR(255))
        AND rp.UserId = ${userId}
      ORDER BY
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

      let coverImagePath = null

      if (coverImage && !isValidCoverFile(coverImage.originalname)) {
        return res.status(400).json({
          message: "Cover image must be JPG, JPEG, PNG, or WEBP"
        })
      }

      const bookId = uuidv4()
      const containerClient = blobServiceClient.getContainerClient(containerName)

      const blobName = `books/${bookId}-${bookFile.originalname}`
      const blockBlobClient = containerClient.getBlockBlobClient(blobName)

      await blockBlobClient.uploadData(bookFile.buffer, {
        blobHTTPHeaders: {
          blobContentType: bookFile.mimetype
        }
      })

      if (coverImage) {
        const coverBlobName = `covers/${bookId}-${coverImage.originalname}`
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
        INSERT INTO Books (BookId, Title, Author, FileType, BlobPath, Description, CoverImagePath)
        VALUES (
          ${bookId},
          ${title},
          ${author || null},
          ${fileType},
          ${blobName},
          ${description || null},
          ${coverImagePath}
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

    const result = await sql.query(`
      SELECT
        b.BookId,
        b.Title,
        b.Author,
        b.FileType,
        b.Description,
        b.CreatedAt,
        b.BlobPath,
        b.CoverImagePath,
        COUNT(rp.Id) AS ProgressEntries,
        COUNT(DISTINCT rp.UserId) AS ActiveReaders
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
        b.CoverImagePath
      ORDER BY b.CreatedAt DESC
    `)

    const statsResult = await sql.query(`
      SELECT
        (SELECT COUNT(*) FROM Books) AS TotalBooks,
        (SELECT COUNT(*) FROM Users) AS TotalUsers,
        (SELECT COUNT(*) FROM ReadingProgress) AS TotalProgressEntries
    `)

    res.json({
      books: result.recordset,
      stats: statsResult.recordset[0]
    })
  } catch (err) {
    console.error("GET /admin/books error:", err)
    res.status(500).json({
      message: "Failed to fetch admin books",
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

      const existing = await sql.query`
        SELECT CoverImagePath
        FROM Books
        WHERE BookId = ${bookId}
      `

      if (existing.recordset.length === 0) {
        return res.status(404).json({ message: "Book not found" })
      }

      const containerClient = blobServiceClient.getContainerClient(containerName)

      const coverBlobName = `covers/${bookId}-${Date.now()}-${coverImage.originalname}`
      const coverBlobClient = containerClient.getBlockBlobClient(coverBlobName)

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

      const existing = await sql.query`
        SELECT BookId
        FROM Books
        WHERE BookId = ${bookId}
      `

      if (existing.recordset.length === 0) {
        return res.status(404).json({ message: "Book not found" })
      }

      const containerClient = blobServiceClient.getContainerClient(containerName)
      const blobName = `books/${bookId}-${Date.now()}-${bookFile.originalname}`
      const blockBlobClient = containerClient.getBlockBlobClient(blobName)

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

    await sql.query`
      DELETE FROM ReadingProgress
      WHERE BookId = ${bookId}
    `

    await sql.query`
      DELETE FROM Books
      WHERE BookId = ${bookId}
    `

    res.json({ message: "Book deleted successfully" })
  } catch (err) {
    console.error("DELETE /admin/books/:id error:", err)
    res.status(500).json({
      message: "Failed to delete book",
      error: err.message
    })
  }
})

app.get("/books/:id/read", requireAuth, async (req, res) => {
  try {
    await connectDB()

    const result = await sql.query`
      SELECT BookId, Title, FileType, BlobPath
      FROM Books
      WHERE BookId = ${req.params.id}
    `

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Book not found" })
    }

    const book = result.recordset[0]

    const containerClient = blobServiceClient.getContainerClient(containerName)
    const blobClient = containerClient.getBlobClient(book.BlobPath)
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
      SELECT CoverImagePath
      FROM Books
      WHERE BookId = ${req.params.id}
    `

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Book not found" })
    }

    const book = result.recordset[0]

    if (!book.CoverImagePath) {
      return res.status(404).json({ message: "No custom cover found" })
    }

    const containerClient = blobServiceClient.getContainerClient(containerName)
    const blobClient = containerClient.getBlobClient(book.CoverImagePath)
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