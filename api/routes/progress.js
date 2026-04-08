const express = require("express")
const router = express.Router()
const { connectDB, sql } = require("../db")
const { requireAuth } = require("../middleware/auth")

async function ensureUserProfile(userId) {
  await sql.query`
    IF NOT EXISTS (SELECT 1 FROM UserProfiles WHERE UserId = ${userId})
    BEGIN
      INSERT INTO UserProfiles (UserId, DisplayName)
      SELECT
        ${userId},
        CASE
          WHEN u.Email IS NOT NULL AND CHARINDEX('@', u.Email) > 1
            THEN LEFT(u.Email, CHARINDEX('@', u.Email) - 1)
          ELSE CONCAT('Reader ', ${userId})
        END
      FROM Users u
      WHERE u.UserId = ${userId}
    END
  `
}

async function awardExperiencePoints(userId, amount) {
  const points = Math.max(0, Number(amount) || 0)

  if (!points) {
    return
  }

  await sql.query`
    UPDATE UserProfiles
    SET ExperiencePoints = ISNULL(ExperiencePoints, 0) + ${points},
        UpdatedAt = SYSUTCDATETIME()
    WHERE UserId = ${userId}
  `
}

async function ensureSocialPhase2Schema() {
  await sql.query(`
    IF COL_LENGTH('dbo.UserProfiles', 'ExperiencePoints') IS NULL
    BEGIN
      ALTER TABLE dbo.UserProfiles
      ADD ExperiencePoints INT NOT NULL
        CONSTRAINT DF_UserProfiles_ExperiencePoints_ProgressAuto DEFAULT 0;
    END;

    IF COL_LENGTH('dbo.UserProfiles', 'BonusLevels') IS NULL
    BEGIN
      ALTER TABLE dbo.UserProfiles
      ADD BonusLevels INT NOT NULL
        CONSTRAINT DF_UserProfiles_BonusLevels_ProgressAuto DEFAULT 0;
    END;
  `)
}

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
    await ensureSocialPhase2Schema()
    await ensureUserProfile(userId)

    const existingResult = await sql.query`
      SELECT TOP 1 Percentage, ProgressValue
      FROM ReadingProgress
      WHERE UserId = ${userId} AND BookId = ${bookId}
    `

    const existing = existingResult.recordset[0] || null

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

    const numericPercentage = Number(percentage || 0)

    if (!existing && progressValue) {
      const startedActivity = await sql.query`
        SELECT TOP 1 ActivityId
        FROM UserActivity
        WHERE UserId = ${userId}
          AND BookId = ${bookId}
          AND ActivityType = ${"started_book"}
      `

      if (startedActivity.recordset.length === 0) {
      await sql.query`
        INSERT INTO UserActivity (UserId, ActivityType, BookId, MetadataJson)
        VALUES (${userId}, ${"started_book"}, ${bookId}, ${JSON.stringify({ format })})
      `
      await awardExperiencePoints(userId, 15)
      }
    }

    if (numericPercentage >= 100 && Number(existing?.Percentage || 0) < 100) {
      const completedActivity = await sql.query`
        SELECT TOP 1 ActivityId
        FROM UserActivity
        WHERE UserId = ${userId}
          AND BookId = ${bookId}
          AND ActivityType = ${"completed_book"}
      `

      if (completedActivity.recordset.length === 0) {
      await sql.query`
        INSERT INTO UserActivity (UserId, ActivityType, BookId, MetadataJson)
        VALUES (${userId}, ${"completed_book"}, ${bookId}, ${JSON.stringify({ format })})
      `
      await awardExperiencePoints(userId, 120)
      }
    }

    res.json({ message: "Reading progress saved successfully" })
  } catch (err) {
    console.error("Save progress error:", err)
    res.status(500).json({ message: "Failed to save reading progress" })
  }
})

module.exports = router
