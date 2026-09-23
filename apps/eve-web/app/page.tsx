const layers = [
  ["01", "Datos", "Fuentes independientes · Identidad canónica · Trazabilidad"],
  ["02", "Dominio", "Estado e histórico · Resolución de lugares · Routing"],
  ["03", "Conversación", "MCP de dominio · EVE · Acceso controlado"],
];

export default function HomePage() {
  return (
    <main>
      <header>
        <span>MADRID / MOBILITY TWIN</span>
        <span>ENTORNO DE DESARROLLO</span>
      </header>
      <section aria-labelledby="title">
        <p className="eyebrow">Plataforma de datos de movilidad</p>
        <h1 id="title">
          La ciudad, antes
          <br />
          de la conversación.
        </h1>
        <p className="intro">
          Base técnica para una evaluación de hasta cinco usuarios. El agente
          consulta el dominio; el dominio se encarga de los datos.
        </p>
        <p className="notice">
          <span aria-hidden="true">●</span> Preparación · Sin datos de movilidad
          en directo
        </p>
      </section>
      <ol>
        {layers.map(([number, name, detail]) => (
          <li key={number}>
            <span className="number">{number}</span>
            <h2>{name}</h2>
            <p>{detail}</p>
          </li>
        ))}
      </ol>
      <footer>
        <a href="/evaluation">Entrar al laboratorio conversacional →</a>
        <a href="/api/health">
          Estado del servicio <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>
  );
}
