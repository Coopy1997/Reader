import { useEffect, useState } from "react";

function App() {
  const [books, setBooks] = useState([]);

  useEffect(() => {
    fetch("http://localhost:5000/books")
      .then((res) => res.json())
      .then((data) => setBooks(data))
      .catch((err) => console.log(err));
  }, []);

  return (
    <div style={{ padding: "30px", fontFamily: "Arial" }}>
      <h1>Online Reader</h1>
      <p>Upload and read books online.</p>

      <h2>Books</h2>
      {books.length === 0 ? (
        <p>No books loaded yet.</p>
      ) : (
        <ul>
          {books.map((book) => (
            <li key={book.id}>
              {book.title} - {book.author}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;