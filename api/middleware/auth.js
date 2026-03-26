const jwt = require("jsonwebtoken")

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" })
    }

    const token = authHeader.split(" ")[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role
    }

    next()
  } catch (err) {
    console.error("Auth error:", err)
    return res.status(401).json({ message: "Invalid or expired token" })
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" })
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" })
  }

  next()
}

module.exports = {
  requireAuth,
  requireAdmin
}