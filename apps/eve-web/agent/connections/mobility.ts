import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: process.env.MOBILITY_MCP_URL ?? "http://127.0.0.1:3001/mcp",
  description:
    "Estado y disponibilidad de datos del dominio de movilidad de Madrid. No hay rutas ni llegadas disponibles hasta activar las fuentes.",
  tools: { allow: ["get_source_health"] },
  auth: {
    credentialOwner: "app",
    getToken: async () => {
      const token = process.env.MOBILITY_MCP_TOKEN;
      if (!token) throw new Error("MOBILITY_MCP_TOKEN is required");
      return { token };
    },
  },
});
