const BASE_URL = "";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\s.\-]/g, "_").replace(/\.\./g, "_").slice(0, 255);
}

export async function fetchApi<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const hasBody = options.body !== undefined && options.body !== null;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (hasBody && !headers["Content-Type"] && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  // CSRF: send token from cookie via header (double-submit pattern)
  const csrfToken = getCookie("troxe_csrf");
  if (csrfToken && !headers["X-CSRF-Token"]) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "same-origin",
  });

  // Validate Content-Type before parsing
  const contentType = res.headers.get("content-type") || "";
  let data: T | null = null;

  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => null);
  } else if (res.status !== 204) {
    const text = await res.text().catch(() => null);
    data = text as any;
  }

  if (!res.ok) {
    const errMsg =
      typeof data === "object" && data !== null && "error" in data
        ? (data as any).error
        : typeof data === "string" && data.length > 0
        ? data
        : res.statusText;
    throw new ApiError(res.status, errMsg, data);
  }

  return data as T;
}

export { sanitizeFilename };
