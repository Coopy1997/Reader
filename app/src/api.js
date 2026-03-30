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

export async function getAdminBooks() {
  const res = await fetch(`${API_BASE}/admin/books`, {
    headers: getAuthHeaders()
  })

  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.message || "Failed to fetch admin books")
  }

  return res.json()
}

export async function updateAdminBook(bookId, payload) {
  const res = await fetch(`${API_BASE}/admin/books/${bookId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.message || "Failed to update book")
  }

  return res.json()
}

export async function deleteAdminBook(bookId) {
  const res = await fetch(`${API_BASE}/admin/books/${bookId}`, {
    method: "DELETE",
    headers: getAuthHeaders()
  })

  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.message || "Failed to delete book")
  }

  return res.json()
}

export async function replaceAdminCover(bookId, file) {
  const formData = new FormData()
  formData.append("coverImage", file)

  const res = await fetch(`${API_BASE}/admin/books/${bookId}/cover`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: formData
  })

  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.message || "Failed to replace cover")
  }

  return res.json()
}

export async function replaceAdminBookFile(bookId, file) {
  const formData = new FormData()
  formData.append("book", file)

  const res = await fetch(`${API_BASE}/admin/books/${bookId}/file`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: formData
  })

  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.message || "Failed to replace book file")
  }

  return res.json()
}