const express = require("express")
const cors = require("cors")
const booksRoutes = require("./routes/books")
const uploadRoutes = require("./routes/upload")

const app = express()
const port = 5000

app.use(cors())
app.use(express.json())

app.use("/books", booksRoutes)
app.use("/upload", uploadRoutes)

app.get("/", (req, res) => {
  res.send("API is working")
})

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})