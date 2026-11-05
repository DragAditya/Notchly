/**
 * Windows notifications — WhatsApp, Teams, Outlook… mirrored into the
 * island. New ones arrive as alerts (through the activities module); this
 * module keeps the recent history. Backend: `src-tauri/src/providers/notifications/`.
 */
import { Badge, Glyph } from "../../components/Glyph";
import { Marquee } from "../../components/Marquee";
import { CompanionEyes } from "../../companion/CompanionEyes";
import { useProvider } from "../../core/bridge";
import { useCompanionMode } from "../../core/settings";
import type { IslandModule, ModuleView } from "../../core/types";
import { useNow } from "../ai-agents/common/format";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { NotificationsSettings } from "./components/NotificationsSettings";
import { NOTIFICATION_BLUE, NOTIFICATIONS_PROVIDER, type NotificationItem, type NotificationsState } from "./types";
import "./notifications.css";

/** Unread notifications this recent keep a spot in the compact island. */
const UNREAD_WINDOW_MS = 5 * 60_000;
const ROW = 52;

export const notificationsModule: IslandModule = {
  id: "notifications",
  title: "notifications.title",
  settingsIcon: <Glyph name="bell" size={14} />,
  SettingsSection: NotificationsSettings,
  useView(): ModuleView {
    const state = useProvider<NotificationsState>(NOTIFICATIONS_PROVIDER);
    const companionMode = useCompanionMode();
    const items = state?.items ?? [];
    const now = useNow(30_000, items.length > 0);
    const unread = items.filter((i) => !i.read);
    const latest = items[0];
    const recent = !!latest && !latest.read && now - latest.receivedAt < UNREAD_WINDOW_MS;

    return {
      active: recent,
      priority: 30,
      hidden: items.length === 0,
      accent: NOTIFICATION_BLUE,
      icon: <Glyph name="bell" size={14} color={NOTIFICATION_BLUE} />,
      compact: latest && {
        left: <NotificationCompactLeft item={latest} />,
        right: companionMode === "eyes" ? null : unread.length > 1 ? <span className="notif-more">+{unread.length - 1}</span> : null,
        width: companionMode === "eyes" ? 250 : 340,
      },
      expanded: <NotificationsPanel state={state} />,
      expandedSize: { width: 560, height: 66 + Math.min(Math.max(items.length, 1), 4) * ROW },
    };
  },
};

/** Compact history row: the eyes react, the app chip keeps the sender. */
function NotificationCompactLeft({ item }: { item: NotificationItem }) {
  const mode = useCompanionMode();
  const showEyes = mode === "eyes" || mode === "mixed";
  const showCopy = mode !== "eyes";
  if (!showEyes) {
    return (
      <>
        <Badge icon="bell" image={item.logo} color={NOTIFICATION_BLUE} size={24} radius={7} glyphSize={12} />
        <Marquee text={item.title} className="notif-compact-title" />
      </>
    );
  }
  return (
    <>
      <span className="notif-compact-eyes" aria-hidden="true">
        <CompanionEyes mood="surprised" gaze={false} />
        <Badge icon="bell" image={item.logo} color={NOTIFICATION_BLUE} size={14} radius={4} glyphSize={8} />
      </span>
      {showCopy && (
        <span className="notif-compact-copy">
          {item.app && <span className="notif-compact-app">{item.app}</span>}
          <Marquee text={item.title} className="notif-compact-title" />
        </span>
      )}
    </>
  );
}
