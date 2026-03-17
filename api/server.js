const express = require("express");
const cors = require("cors");

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API is working");
});

app.get("/books", (req, res) => {
  res.json([
    { id: 1, title: "Test Book 1", author: "Author 1" },
    { id: 2, title: "Test Book 2", author: "Author 2" }
  ]);
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});