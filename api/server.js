const express = require("express")
const cors = require("cors")
const multer = require("multer")
const { BlobServiceClient } = require("@azure/storage-blob")
const { v4: uuidv4 } = require("uuid")
const { connectDB, sql } = require("./db")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "books"
const adminKey = process.env.ADMIN_KEY || "secret123"

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)

const storage = multer.memoryStorage()
const upload = multer({ storage })

app.get("/", (req, res) => {
  res.send("Server is running")
})

app.get("/books", async (req, res) => {
  try {
    await connectDB()

    const result = await sql.query(`
      SELECT BookId, Title, Author, FileType, Description, CreatedAt
      FROM Books
      ORDER BY CreatedAt DESC
    `)

    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Failed to fetch books" })
  }
})

app.post("/admin/books/upload", upload.single("book"), async (req, res) => {
  try {
    const sentAdminKey = req.headers["x-admin-key"]

    if (sentAdminKey !== adminKey) {
      return res.status(403).json({ message: "Admin access required" })
    }

    const { title, author, description } = req.body

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" })
    }

    if (!title) {
      return res.status(400).json({ message: "Title is required" })
    }

    const fileName = req.file.originalname.toLowerCase()
    let fileType = "epub"

    if (fileName.endsWith(".pdf")) {
      fileType = "pdf"
    } else if (fileName.endsWith(".epub")) {
      fileType = "epub"
    } else {
      return res.status(400).json({ message: "Only PDF and EPUB files are allowed" })
    }

    const bookId = uuidv4()
    const blobName = `${bookId}-${req.file.originalname}`

    const containerClient = blobServiceClient.getContainerClient(containerName)
    const blockBlobClient = containerClient.getBlockBlobClient(blobName)

    await blockBlobClient.uploadData(req.file.buffer)

    await connectDB()

    await sql.query`
      INSERT INTO Books (BookId, Title, Author, FileType, BlobPath, Description)
      VALUES (
        ${bookId},
        ${title},
        ${author || null},
        ${fileType},
        ${blobName},
        ${description || null}
      )
    `

    res.json({
      message: "Book uploaded and saved successfully",
      bookId: bookId,
      blobPath: blobName
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Upload failed" })
  }
})

app.get("/books/:id/read", async (req, res) => {
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
    } else {
      res.setHeader("Content-Type", "application/epub+zip")
    }

    res.setHeader("Content-Disposition", "inline")
    res.setHeader("Access-Control-Expose-Headers", "Content-Type, Content-Disposition")

    downloadResponse.readableStreamBody.pipe(res)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Failed to stream book" })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})