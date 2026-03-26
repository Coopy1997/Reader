const express = require("express")
const router = express.Router()
const { connectDB, sql } = require("../db")
const { requireAuth } = require("../middleware/auth")

router.get("/books/:id/progress", requireAuth, async (req, res) => {
  try {
    const bookId = req.params.id
    const userId = req.user.userId

    await connectDB()

    const result = await sql.query`
      SELECT TOP 1 BookId, Format, ProgressValue, Percentage, UpdatedAt
      FROM ReadingProgress
      WHERE UserId = ${userId} AND BookId = ${bookId}
    `

    if (result.recordset.length === 0) {
      return res.json(null)
    }

    res.json(result.recordset[0])
  } catch (err) {
    console.error("Get progress error:", err)
    res.status(500).json({ message: "Failed to get reading progress" })
  }
})

router.put("/books/:id/progress", requireAuth, async (req, res) => {
  try {
    const bookId = req.params.id
    const userId = req.user.userId
    const { format, progressValue, percentage } = req.body

    if (!format || !progressValue) {
      return res.status(400).json({
        message: "format and progressValue are required"
      })
    }

    await connectDB()

    await sql.query`
      MERGE ReadingProgress AS target
      USING (SELECT ${userId} AS UserId, ${bookId} AS BookId) AS source
      ON target.UserId = source.UserId AND target.BookId = source.BookId

      WHEN MATCHED THEN
        UPDATE SET
          Format = ${format},
          ProgressValue = ${progressValue},
          Percentage = ${percentage ?? null},
          UpdatedAt = SYSUTCDATETIME()

      WHEN NOT MATCHED THEN
        INSERT (UserId, BookId, Format, ProgressValue, Percentage)
        VALUES (${userId}, ${bookId}, ${format}, ${progressValue}, ${percentage ?? null});
    `

    res.json({ message: "Reading progress saved successfully" })
  } catch (err) {
    console.error("Save progress error:", err)
    res.status(500).json({ message: "Failed to save reading progress" })
  }
})

module.exports = router