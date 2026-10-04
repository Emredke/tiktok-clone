// Stop background work while a document leaves or enters the page cache.
let pageActive = true;
const pendingRequests = new Set();
export const pageIsActive = () => pageActive;
window.addEventListener("pagehide", () => {
  pageActive = false;
  for (const controller of pendingRequests) controller.abort();
  pendingRequests.clear();
});
window.addEventListener("pageshow", () => {
  pageActive = true;
});
export async function api(path, body, method) {
  if (!pageActive)
    throw new DOMException(
      "Page navigation interrupted the request.",
      "AbortError",
    );
  const controller = new AbortController();
  pendingRequests.add(controller);
  const options = {
    signal: controller.signal,
    credentials: "same-origin",
    method: method || (body ? "POST" : "GET"),
  };
  if (body) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  try {
    const response = await fetch(`/api${path}`, options);
    const data = await response
      .json()
      .catch(() => ({ error: "Request failed." }));
    if (!response.ok) {
      const e = new Error(data.error || "Request failed.");
      e.status = response.status;
      throw e;
    }
    return data;
  } finally {
    pendingRequests.delete(controller);
  }
}
export function uploadFile(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api${path}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        return reject(new Error("Upload failed."));
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || "Upload failed."));
    };
    xhr.onerror = () => reject(new Error("Connection lost. Please retry."));
    xhr.send(form);
  });
}
