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

// manual cors fix
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

// optional normal cors too
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

      const fileName = bookFile.originalname.toLowerCase()
      let fileType = "epub"

      if (fileName.endsWith(".pdf")) {
        fileType = "pdf"
      } else if (fileName.endsWith(".epub")) {
        fileType = "epub"
      } else {
        return res.status(400).json({
          message: "Only PDF and EPUB files are allowed"
        })
      }

      let coverImagePath = null

      if (coverImage) {
        const coverName = coverImage.originalname.toLowerCase()
        const isValidCover =
          coverName.endsWith(".jpg") ||
          coverName.endsWith(".jpeg") ||
          coverName.endsWith(".png") ||
          coverName.endsWith(".webp")

        if (!isValidCover) {
          return res.status(400).json({
            message: "Cover image must be JPG, JPEG, PNG, or WEBP"
          })
        }
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