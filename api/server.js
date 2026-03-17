const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { BlobServiceClient } = require("@azure/storage-blob");

const app = express();
app.use(cors());

const PORT = 5000;


const connectionString = "DefaultEndpointsProtocol=https;AccountName=readerproject123;AccountKey=DlsT0b2JpLgjFsikAYrIrVhk+eItfq1sw4+5NTWsoc5A258TbXPFrXywMEX8rYlSedzZnLT6a7AX+ASt0Q61eA==;EndpointSuffix=core.windows.net";

// Azure setup
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerName = "books";

// Multer setup (IMPORTANT)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Test route
app.get("/", (req, res) => {
  res.send("Server is running");
});

// 🔥 Upload route
app.post("/upload", upload.single("book"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);

    const blobName = Date.now() + "-" + req.file.originalname;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(req.file.buffer);

    res.send({
      message: "Uploaded to Azure!",
      url: blockBlobClient.url
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Upload failed");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});