const LOCAL_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

export function createCorsMiddleware({ production, configuredOrigins = "" }) {
  const allowedOrigins = new Set(
    configuredOrigins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  if (!production) {
    for (const origin of LOCAL_ORIGINS) allowedOrigins.add(origin);
  }

  return (request, response, next) => {
    const origin = request.get("Origin");
    if (origin && !allowedOrigins.has(origin)) {
      return response.status(403).json({ error: "This app origin is not allowed." });
    }

    if (origin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    }

    if (request.method === "OPTIONS") {
      return origin ? response.sendStatus(204) : response.sendStatus(403);
    }
    return next();
  };
}
