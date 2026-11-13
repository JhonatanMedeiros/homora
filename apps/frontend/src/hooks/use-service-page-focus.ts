import { toast } from 'sonner';
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { Service } from '@homora/shared';

/** Request to scroll to a card; nonce makes repeated requests for the same card distinct. */
export type FocusRequest = { id: number; nonce: number };

/** Focus restoration, card navigation, and live feedback for the services page. */
export function useServicePageFocus({
  services,
  focusRequest,
  onFocusHandled,
  setSelected,
  managing,
  formRoute,
  loaded,
}: {
  services: Service[];
  focusRequest?: FocusRequest | null;
  onFocusHandled?: () => void;
  setSelected: Dispatch<SetStateAction<string | null>>;
  managing: boolean;
  formRoute: 'new' | number | null;
  loaded: boolean;
}): {
  addButton: RefObject<HTMLButtonElement | null>;
  srNote: string;
  setSrNote: Dispatch<SetStateAction<string>>;
  focusService: Service | undefined;
  focusNonce: number | undefined;
  announce: (text: string) => void;
  focusEditTrigger: (id: number | null) => void;
} {
  const [srNote, setSrNote] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);

  // Clear the category filter, let the group expand, then scroll and briefly highlight the card.
  const focusService = focusRequest
    ? services.find((service) => service.id === focusRequest.id)
    : undefined;
  const focusNonce = focusRequest?.nonce;
  useEffect(() => {
    if (focusNonce === undefined || !focusService) return;
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        setSelected(null);
        timers.push(
          window.setTimeout(() => {
            const card = document.getElementById(`service-${focusService.id}`);
            if (card) {
              const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
              card.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
              card.dataset.highlight = 'true';
              // The highlight timer deliberately survives effect cleanup so a repeated request
              // does not remove the visual feedback for the newer request.
              window.setTimeout(() => delete card.dataset.highlight, 2000);
            }
            onFocusHandled?.();
          }, 50),
        );
      }, 0),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // Only a new request should trigger scrolling, not later edits to the service list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce, focusService?.id]);

  useEffect(() => {
    if (!managing || formRoute !== null) return;
    try {
      const value = sessionStorage.getItem('homora-focus-service');
      if (!value || (value !== 'new' && !loaded)) return;
      const target =
        value === 'new'
          ? addButton.current
          : (document.querySelector<HTMLButtonElement>(`[data-service-edit="${Number(value)}"]`) ??
            addButton.current);
      if (target) {
        target.focus();
        sessionStorage.removeItem('homora-focus-service');
      }
    } catch {
      /* storage unavailable */
    }
  }, [managing, formRoute, loaded, services]);

  function announce(text: string) {
    toast.success(text);
  }

  function focusEditTrigger(id: number | null) {
    if (id !== null)
      document.querySelector<HTMLButtonElement>(`[data-service-edit="${id}"]`)?.focus();
    else addButton.current?.focus();
  }

  return {
    addButton,
    srNote,
    setSrNote,
    focusService,
    focusNonce,
    announce,
    focusEditTrigger,
  };
}
