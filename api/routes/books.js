const express = require("express")
const router = express.Router()

router.get("/", (req, res) => {
  res.json([
    { id: 1, title: "Test Book 1", author: "Author 1" },
    { id: 2, title: "Test Book 2", author: "Author 2" }
  ])
})

module.exports = router