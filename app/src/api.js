const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000"

export function getApiBase() {
  return API_BASE
}

export function getToken() {
  return localStorage.getItem("token")
}

export function getAuthHeaders() {
  const token = getToken()
  return {
    Authorization: `Bearer ${token}`
  }
}

export async function fetchProgress(bookId) {
  const res = await fetch(`${API_BASE}/books/${bookId}/progress`, {
    headers: getAuthHeaders()
  })

  if (!res.ok) return null
  return res.json()
}

export async function saveProgress(bookId, payload) {
  await fetch(`${API_BASE}/books/${bookId}/progress`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  })
}