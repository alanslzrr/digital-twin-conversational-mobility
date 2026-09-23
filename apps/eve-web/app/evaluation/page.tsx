import Link from "next/link";
import { Evaluation } from "./evaluation";

export default function EvaluationPage() {
  return (
    <main>
      <header>
        <Link href="/">MADRID / MOBILITY TWIN</Link>
        <span>EVALUACIÓN UNIVERSITARIA</span>
      </header>
      <section className="evaluation-heading">
        <p className="eyebrow">GPT-6 Luna · OpenAI directo</p>
        <h1>
          Laboratorio
          <br />
          conversacional.
        </h1>
        <p className="intro">
          Acceso privado para cinco evaluadores. Puedes probar la conversación y
          consultar el estado de las fuentes. La ingestión y el cálculo de rutas
          todavía no están habilitados.
        </p>
      </section>
      <Evaluation />
    </main>
  );
}
