import { useEffect } from "react";
import { providerAction } from "../../../core/bridge";
import { ASK_PROVIDER } from "../store";

/**
 * The Ask surface is on screen: mark the answer as read and drop the
 * "Gemini answered" alert for as long as it stays open.
 */
export function useAskViewing() {
  useEffect(() => {
    providerAction(ASK_PROVIDER, "viewing", true);
    return () => {
      providerAction(ASK_PROVIDER, "viewing", false);
    };
  }, []);
}
