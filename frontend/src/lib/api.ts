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
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function getCsrfHeader(): string {
  const csrfToken = getCookie("troxe_csrf");
  if (!csrfToken) return "";
  // The header value is HMAC of the cookie value
  // For client-side, we just send the raw token; server validates the HMAC match
  return csrfToken;
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

  // CSRF: send token from cookie via header
  const csrfToken = getCsrfHeader();
  if (csrfToken && !headers["X-CSRF-Token"]) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      (data as { error?: string } | null)?.error || res.statusText,
      data
    );
  }

  return data as T;
}
