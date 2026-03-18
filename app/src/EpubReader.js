import { useEffect, useRef, useState } from "react";
import ePub from "epubjs";

function EpubReader({ bookId }) {
  const viewerRef = useRef(null);
  const bookRef = useRef(null);
  const renditionRef = useRef(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState("");

  useEffect(() => {
    if (!bookId) return;

    let mounted = true;

    const loadBook = async () => {
      try {
        setLoading(true);
        setError("");
        setCurrentLocation("");

        const response = await fetch(`http://localhost:5000/books/${bookId}/read`);
        if (!response.ok) {
          throw new Error(`Failed to fetch EPUB: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        if (!mounted) return;

        let tries = 0;
        while (!viewerRef.current && tries < 20) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          tries++;
        }

        if (!viewerRef.current) {
          throw new Error("Reader container not found");
        }

        viewerRef.current.innerHTML = "";

        const book = ePub();
        bookRef.current = book;

        await book.open(arrayBuffer, "binary");

        const rendition = book.renderTo(viewerRef.current, {
          width: "100%",
          height: 800,
          spread: "none",
          flow: "paginated"
        });

        renditionRef.current = rendition;

        rendition.on("relocated", (location) => {
          if (location?.start?.displayed?.page && location?.start?.displayed?.total) {
            setCurrentLocation(
              `Page ${location.start.displayed.page} of ${location.start.displayed.total}`
            );
          } else {
            setCurrentLocation("Reading...");
          }
        });

        await rendition.display();

        if (mounted) {
          setLoading(false);
        }
      } catch (err) {
        console.error("EPUB READER ERROR:", err);
        if (mounted) {
          setError("Could not load EPUB.");
          setLoading(false);
        }
      }
    };

    loadBook();

    return () => {
      mounted = false;

      try {
        if (renditionRef.current) {
          renditionRef.current.destroy();
        }
      } catch (e) {
        console.log(e);
      }

      try {
        if (bookRef.current) {
          bookRef.current.destroy();
        }
      } catch (e) {
        console.log(e);
      }
    };
  }, [bookId]);

  const goPrev = () => {
    if (renditionRef.current) {
      renditionRef.current.prev();
    }
  };

  const goNext = () => {
    if (renditionRef.current) {
      renditionRef.current.next();
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          marginTop: "20px",
          marginBottom: "10px"
        }}
      >
        <button onClick={goPrev} disabled={loading}>
          Previous page
        </button>

        <button onClick={goNext} disabled={loading}>
          Next page
        </button>

        <span style={{ marginLeft: "10px" }}>
          {loading ? "Loading EPUB..." : currentLocation}
        </span>
      </div>

      {error && <p>{error}</p>}

      <div
        ref={viewerRef}
        style={{
          border: "1px solid #ccc",
          minHeight: "800px",
          background: "#fff",
          width: "100%"
        }}
      />
    </div>
  );
}

export default EpubReader;