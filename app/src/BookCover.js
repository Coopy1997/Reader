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
    let objectUrlToRevoke = null

    async function loadCover() {
      try {
        setLoading(true)
        setCoverUrl(null)

        const token = localStorage.getItem("token")

        // 1) custom uploaded cover
        if (book.CoverImagePath) {
          const res = await fetch(
            `${API_BASE}/books/${book.BookId}/cover`,
            {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          )

          if (!res.ok) {
            throw new Error("Failed to fetch custom cover")
          }

          const blob = await res.blob()
          objectUrlToRevoke = URL.createObjectURL(blob)

          if (!cancelled) {
            setCoverUrl(objectUrlToRevoke)
          }

          return
        }

        // 2) PDF fallback
        if (book.FileType === "pdf") {
          if (!cancelled) {
            setCoverUrl(null)
          }
          return
        }

        // 3) EPUB extracted cover
        if (book.FileType === "epub") {
          const res = await fetch(
            `${API_BASE}/books/${book.BookId}/read`,
            {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          )

          if (!res.ok) {
            throw new Error("Failed to fetch EPUB")
          }

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

          const rootfileNode = containerDoc.querySelector("rootfile")
          const rootfilePath = rootfileNode?.getAttribute("full-path")

          if (!rootfilePath) {
            throw new Error("No OPF rootfile found")
          }

          const opfFile = zip.file(rootfilePath)
          if (!opfFile) {
            throw new Error("OPF file not found")
          }

          const opfText = await opfFile.async("text")
          const opfDoc = parser.parseFromString(opfText, "application/xml")

          const metadata = opfDoc.querySelector("metadata")
          const manifestItems = [...opfDoc.querySelectorAll("manifest > item")]

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
            coverHref = coverItem?.getAttribute("href") || null
          }

          if (!coverHref) {
            const propertiesCover = manifestItems.find((item) => {
              const props = item.getAttribute("properties") || ""
              return props.includes("cover-image")
            })
            coverHref = propertiesCover?.getAttribute("href") || null
          }

          if (!coverHref) {
            const imageGuess = manifestItems.find((item) => {
              const href = (item.getAttribute("href") || "").toLowerCase()
              return href.includes("cover")
            })
            coverHref = imageGuess?.getAttribute("href") || null
          }

          if (!coverHref) {
            throw new Error("No cover found")
          }

          const opfDir = rootfilePath.includes("/")
            ? rootfilePath.substring(0, rootfilePath.lastIndexOf("/") + 1)
            : ""

          const normalizedPath = `${opfDir}${coverHref}`

          const cleanPath = normalizedPath
            .replace(/^\.\//, "")
            .split("/")
            .reduce((acc, part) => {
              if (part === "..") {
                acc.pop()
              } else {
                acc.push(part)
              }
              return acc
            }, [])
            .join("/")

          const coverFile = zip.file(cleanPath)

          if (!coverFile) {
            throw new Error("Cover file not found in zip")
          }

          const coverBlob = await coverFile.async("blob")
          objectUrlToRevoke = URL.createObjectURL(coverBlob)

          if (!cancelled) {
            setCoverUrl(objectUrlToRevoke)
          }
        }
      } catch (err) {
        console.warn("Cover extraction failed:", err)
        if (!cancelled) {
          setCoverUrl(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadCover()

    return () => {
      cancelled = true
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke)
      }
    }
  }, [book.BookId, book.CoverImagePath, book.FileType, book.Title, book.Author])

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