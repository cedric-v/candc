export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers,
  });
}

export function text(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "text/plain; charset=utf-8");

  return new Response(body, {
    ...init,
    headers,
  });
}

export function methodNotAllowed(allowedMethods) {
  return json(
    {
      error: "method_not_allowed",
      allowedMethods,
    },
    {
      status: 405,
      headers: {
        allow: allowedMethods.join(", "),
      },
    },
  );
}

export function badRequest(message, details = undefined) {
  return json(
    {
      error: "bad_request",
      message,
      details,
    },
    { status: 400 },
  );
}

export function unauthorized(message = "Unauthorized") {
  return json(
    {
      error: "unauthorized",
      message,
    },
    { status: 401 },
  );
}

export function notFound(message = "Not found") {
  return json(
    {
      error: "not_found",
      message,
    },
    { status: 404 },
  );
}

export function conflict(message, details = undefined) {
  return json(
    {
      error: "conflict",
      message,
      details,
    },
    { status: 409 },
  );
}

export function serverError(message = "Internal server error", details = undefined) {
  return json(
    {
      error: "server_error",
      message,
      details,
    },
    { status: 500 },
  );
}
