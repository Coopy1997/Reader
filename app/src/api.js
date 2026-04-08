const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000"

const unauthorizedListeners = new Set()

export function getApiBase() {
  return API_BASE
}

export function getToken() {
  return localStorage.getItem("token")
}

export function clearStoredAuth() {
  localStorage.removeItem("token")
  localStorage.removeItem("user")
}

export function getStoredUser() {
  const stored = localStorage.getItem("user")

  if (!stored) {
    return null
  }

  try {
    return JSON.parse(stored)
  } catch (error) {
    clearStoredAuth()
    return null
  }
}

export function getAuthHeaders() {
  const token = getToken()
  return token
    ? {
        Authorization: `Bearer ${token}`
      }
    : {}
}

export function subscribeToUnauthorized(handler) {
  unauthorizedListeners.add(handler)

  return () => {
    unauthorizedListeners.delete(handler)
  }
}

function notifyUnauthorized() {
  clearStoredAuth()
  unauthorizedListeners.forEach((listener) => {
    listener()
  })
}

async function parseErrorResponse(response) {
  try {
    const data = await response.json()
    return data.message || "Request failed"
  } catch (error) {
    return "Request failed"
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options)

  if (response.status === 401) {
    notifyUnauthorized()
    throw new Error("Your session has expired. Please log in again.")
  }

  return response
}

async function requestJson(path, options = {}) {
  const response = await request(path, options)

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response))
  }

  return response.json()
}

export async function requestBlob(path, options = {}) {
  const response = await request(path, options)

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response))
  }

  return response.blob()
}

export async function requestArrayBuffer(path, options = {}) {
  const response = await request(path, options)

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response))
  }

  return response.arrayBuffer()
}

function buildApiUrl(path) {
  return `${API_BASE}${path}`
}

function parseXhrResponse(xhr) {
  try {
    return xhr.responseText ? JSON.parse(xhr.responseText) : null
  } catch (error) {
    return null
  }
}

export async function fetchLibraryBooks() {
  return requestJson("/books/library", {
    headers: getAuthHeaders()
  })
}

export async function fetchProgress(bookId) {
  const response = await request(`/books/${bookId}/progress`, {
    headers: getAuthHeaders()
  })

  if (!response.ok) {
    return null
  }

  return response.json()
}

export async function saveProgress(bookId, payload) {
  return requestJson(`/books/${bookId}/progress`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  })
}

export async function fetchProtectedBookBuffer(bookId) {
  return requestArrayBuffer(`/books/${bookId}/read`, {
    headers: getAuthHeaders()
  })
}

export async function fetchProtectedCoverBlob(bookId) {
  return requestBlob(`/books/${bookId}/cover`, {
    headers: getAuthHeaders()
  })
}

export async function getAdminBooks() {
  return requestJson("/admin/books", {
    headers: getAuthHeaders()
  })
}

export function uploadAdminBook(formData, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.open("POST", buildApiUrl("/admin/books/upload"))

    const headers = getAuthHeaders()
    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value)
    })

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    }

    xhr.onload = () => {
      const data = parseXhrResponse(xhr)

      if (xhr.status === 401) {
        notifyUnauthorized()
        reject(new Error("Your session has expired. Please log in again."))
        return
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data)
        return
      }

      reject(new Error(data?.message || "Upload failed"))
    }

    xhr.onerror = () => {
      reject(new Error("Upload failed"))
    }

    xhr.send(formData)
  })
}

export async function getAdminBookReaders(bookId) {
  return requestJson(`/admin/books/${bookId}/readers`, {
    headers: getAuthHeaders()
  })
}

export async function updateAdminBook(bookId, payload) {
  return requestJson(`/admin/books/${bookId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  })
}

export async function updateAdminBookSettings(bookId, payload) {
  return requestJson(`/admin/books/${bookId}/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  })
}

export async function deleteAdminBook(bookId) {
  return requestJson(`/admin/books/${bookId}`, {
    method: "DELETE",
    headers: getAuthHeaders()
  })
}

export async function runAdminBulkAction(payload) {
  return requestJson("/admin/books/bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  })
}

export async function replaceAdminCover(bookId, file) {
  const formData = new FormData()
  formData.append("coverImage", file)

  return requestJson(`/admin/books/${bookId}/cover`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: formData
  })
}

export async function replaceAdminBookFile(bookId, file) {
  const formData = new FormData()
  formData.append("book", file)

  return requestJson(`/admin/books/${bookId}/file`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: formData
  })
}

export async function getAdminUsers() {
  return requestJson("/admin/users", {
    headers: getAuthHeaders()
  })
}

export async function getAdminBadges() {
  return requestJson("/admin/badges", {
    headers: getAuthHeaders()
  })
}

export async function updateAdminUserRole(userId, role) {
  return requestJson(`/admin/users/${userId}/role`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify({ role })
  })
}

export async function updateAdminUserGamification(userId, payload) {
  return requestJson(`/admin/users/${userId}/gamification`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  })
}

export async function grantAdminBadge(userId, badgeCode) {
  return requestJson(`/admin/users/${userId}/badges`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify({ badgeCode })
  })
}

export async function revokeAdminBadge(userId, badgeCode) {
  return requestJson(`/admin/users/${userId}/badges/${encodeURIComponent(badgeCode)}`, {
    method: "DELETE",
    headers: getAuthHeaders()
  })
}

export async function getMyProfile() {
  return requestJson("/profile/me", {
    headers: getAuthHeaders()
  })
}

export async function updateMyProfile(payload) {
  return requestJson("/profile/me", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  })
}

export async function uploadMyAvatar(file) {
  const formData = new FormData()
  formData.append("avatar", file)

  return requestJson("/profile/me/avatar", {
    method: "PUT",
    headers: getAuthHeaders(),
    body: formData
  })
}

export async function updateMyGoals(payload) {
  return requestJson("/profile/me/goals", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  })
}

export async function getProfile(userId) {
  return requestJson(`/profiles/${userId}`, {
    headers: getAuthHeaders()
  })
}

export async function getMyList() {
  return requestJson("/my-list", {
    headers: getAuthHeaders()
  })
}

export async function addBookToMyList(bookId) {
  return requestJson(`/books/${bookId}/my-list`, {
    method: "POST",
    headers: getAuthHeaders()
  })
}

export async function removeBookFromMyList(bookId) {
  return requestJson(`/books/${bookId}/my-list`, {
    method: "DELETE",
    headers: getAuthHeaders()
  })
}

export async function getBookReviews(bookId) {
  return requestJson(`/books/${bookId}/reviews`, {
    headers: getAuthHeaders()
  })
}

export async function saveBookReview(bookId, payload) {
  return requestJson(`/books/${bookId}/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  })
}

export async function updateAdminReview(reviewId, payload) {
  return requestJson(`/admin/reviews/${reviewId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  })
}

export async function deleteAdminReview(reviewId) {
  return requestJson(`/admin/reviews/${reviewId}`, {
    method: "DELETE",
    headers: getAuthHeaders()
  })
}

export async function toggleHelpfulVote(reviewId) {
  return requestJson(`/reviews/${reviewId}/helpful`, {
    method: "POST",
    headers: getAuthHeaders()
  })
}

export async function followUser(userId) {
  return requestJson(`/users/${userId}/follow`, {
    method: "POST",
    headers: getAuthHeaders()
  })
}

export async function unfollowUser(userId) {
  return requestJson(`/users/${userId}/follow`, {
    method: "DELETE",
    headers: getAuthHeaders()
  })
}

export async function getCommunityFeed() {
  return requestJson("/community/feed", {
    headers: getAuthHeaders()
  })
}

export async function getLeaderboard() {
  return requestJson("/community/leaderboard", {
    headers: getAuthHeaders()
  })
}
