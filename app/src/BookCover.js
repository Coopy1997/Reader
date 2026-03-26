import React, { useEffect, useState } from "react"
import JSZip from "jszip"

const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000"

function CoverFallback({ book }) {
  return (
    <div className="cover-fallback cover-theme-1">
      <div className="book-cover-format">
        {(book.FileType || "").toUpperCase()}
      </div>
      <div className="book-cover-title">{book.Title}</div>
      <div className="book-cover-author">
        {book.Author || "Unknown"}
      </div>
    </div>
  )
}

export default function BookCover({ book }) {
  const [coverUrl, setCoverUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadCover() {
      try {
        setLoading(true)

        // 🔹 IF custom image exists → use it immediately
        if (book.CoverImagePath) {
          setCoverUrl(`${API_BASE}/covers/${book.CoverImagePath}`)
          return
        }

        if (book.FileType === "pdf") {
          // fallback handled elsewhere
          setCoverUrl(null)
          return
        }

        if (book.FileType === "epub") {
          const token = localStorage.getItem("token")

          const res = await fetch(
            `${API_BASE}/books/${book.BookId}/read`,
            {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          )

          const blob = await res.blob()
          const zip = await JSZip.loadAsync(blob)

          const parser = new DOMParser()

          const containerXml = await zip
            .file("META-INF/container.xml")
            .async("text")

          const containerDoc = parser.parseFromString(
            containerXml,
            "application/xml"
          )

          const rootfilePath =
            containerDoc.querySelector("rootfile").getAttribute("full-path")

          const opfFile = zip.file(rootfilePath)
          const opfText = await opfFile.async("text")

          const opfDoc = parser.parseFromString(opfText, "application/xml")

          const metadata = opfDoc.querySelector("metadata")
          const manifestItems = [
            ...opfDoc.querySelectorAll("manifest > item")
          ]

          let coverId = null

          const metaCover = metadata?.querySelector('meta[name="cover"]')
          if (metaCover) {
            coverId = metaCover.getAttribute("content")
          }

          let coverHref = null

          if (coverId) {
            const coverItem = manifestItems.find(
              (item) => item.getAttribute("id") === coverId
            )
            coverHref = coverItem?.getAttribute("href")
          }

          if (!coverHref) {
            const propertiesCover = manifestItems.find((item) => {
              const props = item.getAttribute("properties") || ""
              return props.includes("cover-image")
            })
            coverHref = propertiesCover?.getAttribute("href")
          }

          if (!coverHref) {
            const guess = manifestItems.find((item) =>
              (item.getAttribute("href") || "")
                .toLowerCase()
                .includes("cover")
            )
            coverHref = guess?.getAttribute("href")
          }

          if (!coverHref) throw new Error("No cover found")

          const opfDir = rootfilePath.includes("/")
            ? rootfilePath.substring(
                0,
                rootfilePath.lastIndexOf("/") + 1
              )
            : ""

          const normalizedPath = `${opfDir}${coverHref}`

          const cleanPath = normalizedPath
            .replace(/^\.\//, "")
            .split("/")
            .reduce((acc, part) => {
              if (part === "..") acc.pop()
              else acc.push(part)
              return acc
            }, [])
            .join("/")

          const coverFile = zip.file(cleanPath)
          if (!coverFile) throw new Error("Cover file not found")

          const coverBlob = await coverFile.async("blob")

          if (!cancelled) {
            setCoverUrl(URL.createObjectURL(coverBlob))
          }
        }
      } catch (err) {
        console.warn("Cover extraction failed:", err)
        setCoverUrl(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadCover()

    return () => {
      cancelled = true
    }
  }, [book])

  if (loading) {
    return (
      <div className="real-book-cover cover-loading">
        Loading...
      </div>
    )
  }

  if (!coverUrl) {
    return <CoverFallback book={book} />
  }

  return (
    <div className="real-book-cover">
      <img
        src={coverUrl}
        alt={book.Title}
        className="real-book-cover-img"
      />
    </div>
  )
}