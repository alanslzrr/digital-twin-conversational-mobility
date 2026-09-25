// Localhost and 127.0.0.1 are different origins/cookie jars. Explain, do not
// weaken Better Auth/CSRF or forward credentials to another origin.
export function canonicalLocalEvaluationUrl(href: string) {
  const url = new URL(href);
  return url.protocol === "http:" &&
    url.hostname === "localhost" &&
    url.port === "3000"
    ? "http://127.0.0.1:3000/evaluation"
    : null;
}

export function evaluationLoginError(status: number) {
  if (status === 429)
    return "Límite de acceso alcanzado. Inténtalo de nuevo en un minuto.";
  if (status === 403)
    return "Origen o acceso no autorizado. Usa la dirección de evaluación configurada; no cambies entre localhost y 127.0.0.1.";
  if (status >= 500)
    return "El servicio de acceso no está disponible temporalmente. Inténtalo de nuevo.";
  return "No se pudo iniciar sesión. Comprueba tus credenciales de evaluación.";
}
