const express = require("express")
const router = express.Router()
const multer = require("multer")

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/")
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname)
  }
})

const upload = multer({ storage: storage })

router.get("/", (req, res) => {
  res.send("Upload route is working. Use POST to upload a file.")
})

router.post("/", upload.single("book"), (req, res) => {
  res.json({
    message: "File uploaded successfully",
    file: req.file
  })
})

module.exports = router