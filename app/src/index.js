import React from "react"
import ReactDOM from "react-dom/client"
import { Analytics } from "@vercel/analytics/react"
import "./index.css"
import App from "./App"
import reportWebVitals from "./reportWebVitals"

if (typeof window !== "undefined" && "ResizeObserver" in window) {
  const NativeResizeObserver = window.ResizeObserver

  window.ResizeObserver = class ResizeObserver extends NativeResizeObserver {
    constructor(callback) {
      super((entries, observer) => {
        window.requestAnimationFrame(() => {
          callback(entries, observer)
        })
      })
    }
  }
}

window.addEventListener("error", (event) => {
  if (
    event.message === "ResizeObserver loop completed with undelivered notifications." ||
    event.message === "ResizeObserver loop limit exceeded"
  ) {
    event.stopImmediatePropagation()
  }
})

window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason?.message || ""

  if (
    message === "ResizeObserver loop completed with undelivered notifications." ||
    message === "ResizeObserver loop limit exceeded"
  ) {
    event.preventDefault()
  }
})

const root = ReactDOM.createRoot(document.getElementById("root"))

root.render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>
)

reportWebVitals()
