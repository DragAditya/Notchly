import { useLocale } from "../core/i18n";
import { appearanceSettings, useSetting } from "../core/settings";
import { useNow } from "../modules/ai-agents/common/format";

/** Time or date in the resting pill (Windows Island style). */
export function IdleClock() {
  const locale = useLocale();
  const format = useSetting(appearanceSettings.idleClockFormat);
  const now = useNow(5_000);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(now);
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(now);

  if (format === "date") return <div className="idle-clock is-date">{date}</div>;
  if (format === "both") {
    return (
      <div className="idle-clock is-both">
        <span className="idle-date">{date}</span>
        <span>{time}</span>
      </div>
    );
  }
  return <div className="idle-clock">{time}</div>;
}
