import { useEffect, useState } from "react";
import EpubReader from "./EpubReader";

function App() {
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadBooks = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("http://localhost:5000/books");
      if (!response.ok) {
        throw new Error("Failed to load books");
      }

      const data = await response.json();
      setBooks(data);
    } catch (err) {
      console.error(err);
      setError("Could not load books from backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBooks();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "30px", fontFamily: "Arial" }}>
        <h1>Online Reader</h1>
        <p>Loading books...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "30px", fontFamily: "Arial" }}>
        <h1>Online Reader</h1>
        <p>{error}</p>
        <button onClick={loadBooks}>Try again</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "30px", fontFamily: "Arial" }}>
      <h1>Online Reader</h1>
      <p>Temporary frontend for testing backend integration.</p>

      {!selectedBook ? (
        <div>
          <h2>Library</h2>

          {books.length === 0 ? (
            <p>No books found in database.</p>
          ) : (
            <div style={{ display: "grid", gap: "15px" }}>
              {books.map((book) => (
                <div
                  key={book.BookId}
                  style={{
                    border: "1px solid #ccc",
                    padding: "15px",
                    borderRadius: "8px",
                    background: "#f9f9f9",
                  }}
                >
                  <h3 style={{ margin: "0 0 10px 0" }}>{book.Title}</h3>
                  <p style={{ margin: "5px 0" }}>
                    <strong>Author:</strong> {book.Author || "Unknown"}
                  </p>
                  <p style={{ margin: "5px 0" }}>
                    <strong>Type:</strong> {book.FileType}
                  </p>
                  <p style={{ margin: "5px 0" }}>
                    <strong>Description:</strong> {book.Description || "No description"}
                  </p>

                  <button
                    style={{ marginTop: "10px" }}
                    onClick={() => setSelectedBook(book)}
                  >
                    Read book
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <button onClick={() => setSelectedBook(null)}>Back to library</button>

          <h2 style={{ marginTop: "20px" }}>{selectedBook.Title}</h2>
          <p>
            <strong>Author:</strong> {selectedBook.Author || "Unknown"}
          </p>

          {selectedBook.FileType === "pdf" ? (
            <iframe
              title="PDF Reader"
              src={`http://localhost:5000/books/${selectedBook.BookId}/read`}
              width="100%"
              height="800px"
              style={{
                border: "1px solid #ccc",
                marginTop: "20px",
                background: "white",
              }}
            />
          ) : (
            <EpubReader bookId={selectedBook.BookId} />
          )}
        </div>
      )}
    </div>
  );
}

export default App;