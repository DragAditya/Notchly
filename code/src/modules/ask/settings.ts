import type { SettingDef } from "../../core/settings";

export const askGeminiKey: SettingDef<string> = {
  key: "ask.gemini.apiKey",
  label: "ask.gemini.apiKey",
  description: "ask.gemini.apiKeyDesc",
  default: "",
};

export const askGeminiModel: SettingDef<string> = {
  key: "ask.gemini.model",
  label: "ask.gemini.model",
  description: "ask.gemini.modelDesc",
  default: "gemini-2.5-flash",
};

/** A one-line prompt instead of the full chat panel; answers land in the island. */
export const askCompact: SettingDef<boolean> = {
  key: "ask.compact",
  label: "ask.compact.label",
  description: "ask.compact.desc",
  default: true,
};

/** Custom global shortcut that opens the one-line prompt ("" = off). */
export const askInstantShortcut: SettingDef<string> = {
  key: "ask.instantShortcut",
  label: "ask.instant.label",
  description: "ask.instant.desc",
  default: "",
};
