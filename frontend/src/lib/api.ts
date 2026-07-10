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

export async function fetchApi<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

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
