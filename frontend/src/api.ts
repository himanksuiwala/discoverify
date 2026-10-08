export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type ErrorBody = {
  detail?: string | { code?: string; message?: string };
};

export async function readError(
  response: Response,
  fallback: string,
): Promise<ApiError> {
  try {
    const body = (await response.json()) as ErrorBody;
    if (typeof body.detail === "string") {
      return new ApiError(body.detail, response.status);
    }
    return new ApiError(
      body.detail?.message ?? fallback,
      response.status,
      body.detail?.code,
    );
  } catch {
    return new ApiError(fallback, response.status);
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw await readError(response, "The request could not be completed");
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
