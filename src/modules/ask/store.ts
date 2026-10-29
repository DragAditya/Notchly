import { providerAction } from "../../core/bridge";
import { createStore } from "../../core/island";
import { moduleEnabled, useSetting } from "../../core/settings";

/** Mirrors `Attachment` in `src-tauri/src/providers/ask/mod.rs`. */
export interface Attachment {
  path: string;
  name: string;
  isImage: boolean;
  label: string | null;
  thumb: string | null;
}

export interface AskMessage {
  fromUser: boolean;
  text: string;
  error: boolean;
  attachments: Attachment[];
}

export interface AskState {
  messages: AskMessage[];
  running: boolean;
  status: { kind: "thinking" | "writing" | "tool"; arg: string | null } | null;
  unread: boolean;
  hotkey: string | null;
}

export const ASK_PROVIDER = "ask";

/** "Ask Gemini" is turned on: other modules offer to send it things. */
export const useAskEnabled = () => useSetting(moduleEnabled({ id: ASK_PROVIDER, title: "ask.title" }));
export const GEMINI_BLUE = "#4285F4";

/** Goes with the next question (screenshots, dropped files, shelf items). */
export const pendingAttachments = createStore<Attachment[]>([]);

/** The input should take the keyboard (global shortcut, "ask about this file"); the panel consumes it. */
export const focusRequest = createStore(false);

/** Text to put in the question box (e.g. copied text); the panel consumes it. */
export const draftRequest = createStore<string | null>(null);

/** The instant-prompt shortcut opened Ask: use the one-line field even if compact mode is off. */
export const instantPrompt = createStore(false);

/**
 * A compact question is in flight. Holds the number of messages the answer will
 * bring (`messages.length + 2`: the question and the reply).
 */
export const compactWaiting = createStore<number | null>(null);

/** The reply shown on the island's answer surface (`null` = no answer). */
export const islandAnswer = createStore<AskMessage | null>(null);

/** The answer surface asked for the full chat. */
export const chatRequest = createStore(false);

/** The custom global shortcut fired: a fresh one-line prompt, keyboard ready. */
export function requestAskInstant() {
  if (islandAnswer.get()) islandAnswer.set(null);
  if (chatRequest.get()) chatRequest.set(false);
  instantPrompt.set(true);
  focusRequest.set(true);
}

export function addAttachments(list: Attachment[]) {
  pendingAttachments.set((prev) => [
    ...prev,
    ...list.filter((a) => !prev.some((p) => p.path.toLowerCase() === a.path.toLowerCase())),
  ]);
}

export async function attachFiles(paths: string[]) {
  const list = await providerAction<Attachment[]>(ASK_PROVIDER, "attachments", paths);
  if (list?.length) addAttachments(list);
}

export function requestAskFocus() {
  // Opening Ask from the global shortcut over an answer starts a new question.
  if (islandAnswer.get()) islandAnswer.set(null);
  focusRequest.set(true);
}
