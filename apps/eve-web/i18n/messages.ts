import en from "./messages/en.json";
import es from "./messages/es.json";
import keys from "./owned-copy.json";
export const messages = { es, en };
type Catalog = typeof en;
export type MessageKey = {
  [N in keyof Catalog]: `${N}.${keyof Catalog[N] & string}`;
}[keyof Catalog];
export const ownedCopyKeys: Readonly<Record<string, MessageKey | undefined>> =
  keys as Record<string, MessageKey>;
