export async function onRequestGet(context) {
  const summary = {};
  for (const key of Object.keys(context.env).sort()) {
    const value = context.env[key];
    if (typeof value === "string") {
      summary[key] = value.length > 0 ? "set" : "empty";
    } else {
      summary[key] = typeof value;
    }
  }
  return Response.json({ env: summary });
}
