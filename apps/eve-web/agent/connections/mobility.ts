import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: process.env.MOBILITY_MCP_URL ?? "http://127.0.0.1:3001/mcp",
  description:
    "Movilidad local de Madrid: horarios CRTM Metro/Metro Ligero/interurbanos y correspondencias documentadas (resolve_place source=crtm, get_crtm_timetable; sin rutas ni RT), Renfe, paradas y próximas llegadas EMT (resolve_place con source=emt, get_emt_arrivals), avisos e incidencias EMT (get_incidents, source=emt), rutas previstas, BiciMAD, AEMET, aire, tráfico y parking. Histórico retenido: get_historical_state (knowledge/event, minutos relativos calculados en Core). Busca por nombres exactos y reutiliza herramientas descubiertas; cada herramienta declara límites y frescura.",
  tools: {
    allow: [
      "get_source_health",
      "resolve_place",
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
