const express = require("express")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { connectDB, sql } = require("../db")
const { requireAuth } = require("../middleware/auth")

const router = express.Router()

router.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" })
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" })
    }

    await connectDB()

    const existingUser = await sql.query`
      SELECT TOP 1 UserId
      FROM Users
      WHERE Email = ${email}
    `

    if (existingUser.recordset.length > 0) {
      return res.status(400).json({ message: "User already exists" })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const insertResult = await sql.query`
      INSERT INTO Users (Email, PasswordHash, Role)
      OUTPUT INSERTED.UserId, INSERTED.Email, INSERTED.Role
      VALUES (${email}, ${passwordHash}, ${"user"})
    `

    const user = insertResult.recordset[0]

    const token = jwt.sign(
      {
        userId: user.UserId,
        email: user.Email,
        role: user.Role
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    )

    res.json({
      message: "Registration successful",
      token,
      user: {
        userId: user.UserId,
        email: user.Email,
        role: user.Role
      }
    })
  } catch (err) {
    console.error("Register error:", err)
    res.status(500).json({ message: "Registration failed" })
  }
})

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" })
    }

    await connectDB()

    const result = await sql.query`
      SELECT TOP 1 UserId, Email, PasswordHash, Role
      FROM Users
      WHERE Email = ${email}
    `

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" })
    }

    const user = result.recordset[0]

    const isMatch = await bcrypt.compare(password, user.PasswordHash)

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" })
    }

    const token = jwt.sign(
      {
        userId: user.UserId,
        email: user.Email,
        role: user.Role
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    )

    res.json({
      message: "Login successful",
      token,
      user: {
        userId: user.UserId,
        email: user.Email,
        role: user.Role
      }
    })
  } catch (err) {
    console.error("Login error:", err)
    res.status(500).json({ message: "Login failed" })
  }
})

router.get("/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user })
})

module.exports = router