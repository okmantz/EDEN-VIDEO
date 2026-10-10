// Small fetch helpers. Every error surfaces as an Error with a readable message.

export async function api(path, { method = 'GET', body, form } = {}) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  if (form) opt.body = form;
  let res;
  try {
    res = await fetch('/api' + path, opt);
  } catch {
    throw new Error('Cannot reach Eden. Check that the app is still running.');
  }
  if (!res.ok) {
    let msg = res.statusText || 'Something went wrong';
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') msg = j.detail;
      else if (Array.isArray(j.detail) && j.detail[0]?.msg) msg = j.detail[0].msg;
    } catch { /* keep default */ }
    throw new Error(msg);
  }
  return res.json();
}

// XHR gives us upload progress, which fetch still cannot.
export function uploadFile(path, file, fields = {}, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    form.append('file', file);
    xhr.open('POST', '/api' + path);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total, e.loaded, e.total); };
    xhr.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      let msg = 'Upload failed.';
      if (data && typeof data.detail === 'string') msg = data.detail;
      else if (data && Array.isArray(data.detail) && data.detail[0]?.msg) msg = data.detail[0].msg;
      reject(new Error(msg));
    };
    xhr.send(form);
  });
}
