/** Application clock, refreshed at turn boundaries, not a provider observation time. */
export function turnClock(now = new Date()) {
  return `Reloj del servidor al inicio de este turno: ${now.toISOString()}. Zona de presentación: Europe/Madrid. Para histórico relativo usa minutesAgo en get_historical_state: Core resuelve el instante al consultar. No ancles «hace diez minutos» a capturas, mensajes anteriores ni recuerdos. Para una fecha absoluta ambigua, pide aclaración.`;
}
