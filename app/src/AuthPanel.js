import React, { useState } from "react"
import { getApiBase } from "./api"

const API_BASE = getApiBase()

function AuthPanel({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage("")
    setLoading(true)

    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register"

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (!response.ok) {
        setMessage(data.message || "Authentication failed")
        setLoading(false)
        return
      }

      localStorage.setItem("token", data.token)
      localStorage.setItem("user", JSON.stringify(data.user))

      setMessage(data.message || "Success")
      onAuthSuccess(data.user)
    } catch (error) {
      console.error("Auth error:", error)
      setMessage("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-card">
      <h2 className="auth-title">{isLogin ? "Login" : "Register"}</h2>
      <p className="auth-subtitle">
        {isLogin
          ? "Access your cloud library and continue reading where you left off."
          : "Create an account to start building your reading library."}
      </p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? "Please wait..." : isLogin ? "Login" : "Register"}
        </button>
      </form>

      {message && (
        <p className={message.toLowerCase().includes("success") ? "message-text" : "error-text"}>
          {message}
        </p>
      )}

      <div className="switch-row">
        <button
          className="secondary-btn"
          type="button"
          onClick={() => {
            setIsLogin(!isLogin)
            setMessage("")
          }}
        >
          {isLogin ? "Need an account? Register" : "Already have an account? Login"}
        </button>
      </div>
    </div>
  )
}

export default AuthPanel