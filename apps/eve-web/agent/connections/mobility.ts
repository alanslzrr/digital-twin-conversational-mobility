import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: process.env.MOBILITY_MCP_URL ?? "http://127.0.0.1:3001/mcp",
  description:
    "Movilidad local de Madrid: resúmenes almacenados get_line_status/get_network_status/get_mobility_snapshot sin refresco masivo; incidencias viarias DGT (get_incidents source=dgt, query=carretera/provincia/municipio; no sensores municipales ni desvíos), direcciones públicas mediante resolve_address (catálogos primero, fallback externo con consentimiento y caché), catálogos CRTM y horarios estáticos de Metro Ligero/interurbanos con correspondencias parciales (resolve_place source=crtm, get_crtm_timetable; esta herramienta no calcula rutas ni RT; Metro de Madrid conserva catálogo, no horarios actuales ni trayectos Metro en esta evaluación), Renfe, paradas y próximas llegadas EMT (resolve_place con source=emt, get_emt_arrivals), avisos e incidencias EMT (get_incidents, source=emt), plan_journey con Renfe/EMT/Metro Ligero/interurbanos y caminatas según cobertura disponible, base prevista con RT/alertas Renfe y avisos EMT aplicados por Core; correspondencias sin garantía de accesibilidad o tiempo de transbordo, BiciMAD, AEMET, aire, tráfico y parking. Histórico retenido: get_historical_state (knowledge/event, minutos relativos calculados en Core). Busca por nombres exactos y reutiliza herramientas descubiertas; cada herramienta declara límites y frescura.",
  tools: {
    allow: [
      "get_source_health",
      "get_line_status",
      "get_network_status",
      "get_mobility_snapshot",
      "resolve_place",
      "resolve_address",
      "plan_journey",
      "get_departures",
      "get_emt_arrivals",
      "get_crtm_timetable",
      "get_incidents",
      "get_bike_availability",
      "get_environment",
      "get_road_state",
      "get_historical_state",
      "get_parking",
    ],
  },
  auth: {
    credentialOwner: "app",
    getToken: async () => {
      const token = process.env.MOBILITY_MCP_TOKEN;
      if (!token) throw new Error("MOBILITY_MCP_TOKEN is required");
      return { token };
    },
  },
});
