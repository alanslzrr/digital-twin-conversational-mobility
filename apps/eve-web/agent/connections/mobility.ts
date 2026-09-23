import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: process.env.MOBILITY_MCP_URL ?? "http://127.0.0.1:3001/mcp",
  description:
    "Movilidad local de Madrid: Renfe, rutas previstas, BiciMAD, aire y tráfico. Cada herramienta declara sus límites y frescura.",
  tools: {
    allow: [
      "get_source_health",
      "resolve_place",
      "plan_journey",
      "get_departures",
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
