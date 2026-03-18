import { useState } from "react";

function App() {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");

  const handleUpload = async () => {
    if (!file) {
      setMessage("Please choose a file first.");
      return;
    }

    const formData = new FormData();
    formData.append("book", file);

    try {
      const response = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      setMessage(data.message || "Upload finished");
      setUploadedUrl(data.url || "");
    } catch (error) {
      console.error(error);
      setMessage("Upload failed");
    }
  };

  return (
    <div style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>Online Reader</h1>
      <p>Upload and store books online.</p>

      <input
        type="file"
        accept=".epub,.pdf"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <div style={{ marginTop: "20px" }}>
        <button onClick={handleUpload}>Upload Book</button>
      </div>

      <p style={{ marginTop: "20px" }}>{message}</p>

      {uploadedUrl && (
        <p>
          Uploaded file:{" "}
          <a href={uploadedUrl} target="_blank" rel="noreferrer">
            Open book
          </a>
        </p>
      )}
    </div>
  );
}

export default App;