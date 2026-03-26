import React, { useEffect, useRef, useState } from "react"
import ePub from "epubjs"
import { fetchProgress, saveProgress, getToken } from "./api"


function EpubReader({ bookId, bookUrl }) {
  const viewerRef = useRef(null)
  const bookRef = useRef(null)
  const renditionRef = useRef(null)

  const [savedProgress, setSavedProgress] = useState(null)
  const [progressLoaded, setProgressLoaded] = useState(false)

  const [readingProgress, setReadingProgress] = useState({
    format: "",
    progressValue: "",
    percentage: 0
  })

  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!bookId) return

    const loadProgress = async () => {
      try {
        setProgressLoaded(false)
        const data = await fetchProgress(bookId)
        setSavedProgress(data)
        setProgressLoaded(true)
      } catch (err) {
        console.error("Failed to load EPUB progress:", err)
        setSavedProgress(null)
        setProgressLoaded(true)
      }
    }

    loadProgress()
  }, [bookId])

  useEffect(() => {
    if (!bookUrl || !viewerRef.current || !progressLoaded) return

    let cancelled = false

    const setupReader = async () => {
      try {
        setIsLoading(true)
        setIsReady(false)
        setError("")

        if (viewerRef.current) {
          viewerRef.current.innerHTML = ""
        }

        if (renditionRef.current) {
          try {
            renditionRef.current.destroy()
          } catch (err) {
            console.error("Error destroying old rendition:", err)
          }
          renditionRef.current = null
        }

        if (bookRef.current) {
          try {
            bookRef.current.destroy()
          } catch (err) {
            console.error("Error destroying old book:", err)
          }
          bookRef.current = null
        }

        const token = getToken()

        const response = await fetch(bookUrl, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        if (!response.ok) {
          throw new Error("Failed to fetch EPUB file")
        }

        const arrayBuffer = await response.arrayBuffer()

        const book = ePub()
        await book.open(arrayBuffer, "binary")
        bookRef.current = book

        const rendition = book.renderTo(viewerRef.current, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: "none"
        })

        renditionRef.current = rendition

        await book.ready
        await book.locations.generate(1000)

        rendition.on("relocated", (location) => {
          const cfi = location?.start?.cfi || ""

          let percentage = 0

          if (cfi && bookRef.current) {
            try {
              const locationPercentage = bookRef.current.locations.percentageFromCfi(cfi)
              percentage = locationPercentage ? locationPercentage * 100 : 0
            } catch (err) {
              console.error("Failed to calculate EPUB percentage:", err)
            }
          }

          setReadingProgress({
            format: "epub",
            progressValue: cfi,
            percentage
          })
        })

        const savedFormat = savedProgress?.Format || savedProgress?.format
        const savedValue = savedProgress?.ProgressValue || savedProgress?.progressValue

        if (savedFormat === "epub" && savedValue) {
          await rendition.display(savedValue)
        } else {
          await rendition.display()
        }

        if (!cancelled) {
          setIsReady(true)
          setIsLoading(false)
        }
      } catch (err) {
        console.error("EPUB setup error:", err)

        if (!cancelled) {
          setError("Failed to load EPUB.")
          setIsLoading(false)
          setIsReady(false)
        }
      }
    }

    setupReader()

    return () => {
      cancelled = true
      setIsReady(false)

      if (renditionRef.current) {
        try {
          renditionRef.current.destroy()
        } catch (err) {
          console.error("Error destroying rendition:", err)
        }
        renditionRef.current = null
      }

      if (bookRef.current) {
        try {
          bookRef.current.destroy()
        } catch (err) {
          console.error("Error destroying book:", err)
        }
        bookRef.current = null
      }
    }
  }, [bookUrl, progressLoaded, savedProgress])

  useEffect(() => {
    if (!bookId) return
    if (!readingProgress.format || !readingProgress.progressValue) return

    const timeout = setTimeout(async () => {
      try {
        await saveProgress(bookId, readingProgress)
      } catch (err) {
        console.error("Failed to save EPUB progress:", err)
      }
    }, 700)

    return () => clearTimeout(timeout)
  }, [readingProgress, bookId])

  const goNext = async () => {
    if (!isReady) return
    if (!renditionRef.current) return

    try {
      await renditionRef.current.next()
    } catch (err) {
      console.error("Failed to go to next EPUB page:", err)
    }
  }

  const goPrev = async () => {
    if (!isReady) return
    if (!renditionRef.current) return

    try {
      await renditionRef.current.prev()
    } catch (err) {
      console.error("Failed to go to previous EPUB page:", err)
    }
  }

  return (
    <div style={{ marginTop: "20px" }}>
      {isLoading && <p>Loading EPUB...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <div
        style={{
          width: "900px",
          maxWidth: "100%",
          border: "1px solid rgba(148, 163, 184, 0.16)",
          backgroundColor: "#fff",
          padding: "10px",
          boxSizing: "border-box",
          borderRadius: "18px"
        }}
      >
        <div
          ref={viewerRef}
          style={{
            width: "100%",
            height: "600px",
            overflow: "hidden",
            position: "relative"
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          marginTop: "15px",
          flexWrap: "wrap"
        }}
      >
        <button className="secondary-btn" onClick={goPrev} disabled={!isReady}>
          Previous
        </button>

        <button className="secondary-btn" onClick={goNext} disabled={!isReady}>
          Next
        </button>

        <span className="progress-text">
          Progress: {readingProgress.percentage.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

export default EpubReader