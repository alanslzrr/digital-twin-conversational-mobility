import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, resolveLocale, UI_TIME_ZONE } from "./config";
import { messages } from "./messages";
export default getRequestConfig(async () => {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return { locale, messages: messages[locale], timeZone: UI_TIME_ZONE };
});
