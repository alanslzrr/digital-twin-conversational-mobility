# Versionar y publicar una release de código

[Índice](index.md) · [Contribución](../CONTRIBUTING.md) · [Notas de entrega](releases/template.md) · [Seguridad](../SECURITY.md)

Una release identifica un estado reutilizable del código y sus instrucciones. No activa el servicio, publica datos de operadores ni habilita cloud. Las [releases de routing](routing-releases.md) agrupan datos y grafo: son un procedimiento distinto.

## Índice

- [Decidir desde la PR](#decidir-desde-la-pr)
- [Asignar la versión](#asignar-la-versión)
- [Preparar la entrega](#preparar-la-entrega)
- [Validar y publicar](#validar-y-publicar)
- [Corregir o revertir](#corregir-o-revertir)

## Decidir desde la PR

Cada PR enlaza un issue real del repositorio con `Closes #N` o `Refs #N` y selecciona una sola casilla de release con motivo. La comprobación **PR policy** valida las secciones, el issue mediante la API de GitHub y la exclusividad de la decisión. Para una release exige versión objetivo estable; el contenido y los pasos de actualización se revisan manualmente. Usa código de la rama base y permisos de lectura, nunca código de un fork con credenciales privilegiadas.

| Cambio | Decisión habitual |
| --- | --- |
| Capacidad visible, corrección de comportamiento, seguridad, contrato o esquema | Release requerida; versión objetivo y notas de impacto |
| Documentación, pruebas o tooling internos sin efecto sobre usuarios | Sin release; explicar por qué |
| Varios cambios destinados a la misma entrega | Misma versión objetivo y un issue de entrega común |

Dependabot no tiene una excepción: el mantenedor añade el issue y la decisión. No se publican detalles de vulnerabilidades privadas en el issue; usa una referencia de seguimiento sanitizada.

## Asignar la versión

El repositorio usa SemVer `MAJOR.MINOR.PATCH` y tags `vX.Y.Z`. Antes de 1.0, un cambio incompatible o una capacidad sustancial incrementa MINOR; un arreglo compatible incrementa PATCH. Desde 1.0, los cambios incompatibles incrementan MAJOR. No reutilices ni muevas un tag publicado.

La versión raíz identifica la entrega del monorepo; los paquetes internos permanecen privados. Actualiza las versiones de los paquetes modificados cuando cambie su contrato o comportamiento; no publiques paquetes automáticamente. La primera entrega identifica el código existente como `v0.1.0`, con alcance de evaluación local.

## Preparar la entrega

1. Abre un issue de entrega con alcance, criterios y versión objetivo.
2. Integra los cambios por PR con **Quality gates** y **PR policy** aprobados.
3. Completa una página `docs/releases/vX.Y.Z.md` siguiendo la [plantilla formal](releases/template.md), y una entrada resumida en [CHANGELOG](../CHANGELOG.md). Incluye seguridad, compatibilidad, actualización, validación, límites e issues/PR.
4. Revisa el árbol desde un checkout limpio del commit que se publicará. Conserva los borradores locales fuera de la entrega.
5. No adjuntes `.env`, dumps, historiales de conversación, datos de operadores ni artefactos temporales. La distribución inicial contiene únicamente fuente y documentación versionadas.

## Validar y publicar

Ejecuta `pnpm check` y `pnpm audit --audit-level=moderate`. CI añade Gitleaks 8.30.1 sobre el historial alcanzable, con binario fijado y checksum comprobado; su único falso positivo revisado se limita a un fingerprint de texto documental. Revisa cualquier nuevo hallazgo antes de ampliar exclusiones.

Comprueba el resultado de CI de **main** para el SHA exacto de entrega, no solo el de la PR. El mantenedor crea la release apuntando a ese SHA y utilizando las notas revisadas:

```sh
gh release create vX.Y.Z --target SHA_COMPLETO --title "mobai vX.Y.Z — título" --notes-file docs/releases/vX.Y.Z.md
```

No uses notas automáticas como sustituto del resumen humano. Una release de evaluación puede marcarse como prerelease en GitHub para hacer visible su alcance; la etiqueta SemVer sigue identificando exactamente el código. Añade el enlace público y registra el resultado. Ningún workflow crea releases, despliega ni publica paquetes de forma automática.

## Corregir o revertir

Retira el uso de una entrega defectuosa y publica una nueva versión con explicación y pasos de recuperación; no cambies el tag anterior. El rollback del código no restaura la base de datos ni el grafo de routing. Sigue las copias y procedimientos de [operación local](local-runtime.md) y las migraciones documentadas de la entrega.
