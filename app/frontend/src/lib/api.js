export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data;
}

export async function apiUpload(path, formData) {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    credentials: "same-origin",
    body: formData,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data;
}
