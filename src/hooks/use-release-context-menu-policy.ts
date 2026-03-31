import { isTauri } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { useEffect } from "react";

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "file",
  "hidden",
  "image",
  "month",
  "radio",
  "range",
  "reset",
  "submit",
  "time",
  "week",
]);

type TextEditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

type ReleaseContextMenuResources = {
  items: [PredefinedMenuItem, PredefinedMenuItem, PredefinedMenuItem];
  menu: Menu;
};

type ReleaseContextMenuPolicyEnablementOptions = {
  isProductionBuild?: boolean;
  isTauriApp?: boolean;
};

type ReleaseContextMenuPolicyOptions = {
  enabled?: boolean;
} & ReleaseContextMenuPolicyEnablementOptions;

export function isReleaseContextMenuPolicyEnabled(
  options: ReleaseContextMenuPolicyEnablementOptions = {},
): boolean {
  const {
    isProductionBuild = import.meta.env.PROD,
    isTauriApp = isTauri(),
  } = options;

  return isProductionBuild && isTauriApp;
}

export function isTextEditableInput(target: HTMLInputElement): boolean {
  return !NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase());
}

function resolveElementTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }

  return target instanceof Node ? target.parentElement : null;
}

export function findTextEditableTarget(
  target: EventTarget | null,
): TextEditableTarget | null {
  const element = resolveElementTarget(target);
  if (!element) {
    return null;
  }

  const textControl = element.closest("input, textarea");
  if (textControl instanceof HTMLTextAreaElement) {
    return textControl;
  }

  if (
    textControl instanceof HTMLInputElement
    && isTextEditableInput(textControl)
  ) {
    return textControl;
  }

  const editableContentRoot = element.closest(
    "[contenteditable]:not([contenteditable='false'])",
  );
  return editableContentRoot instanceof HTMLElement
    ? editableContentRoot
    : null;
}

async function closeReleaseContextMenuResources(
  resources: ReleaseContextMenuResources,
): Promise<void> {
  await Promise.allSettled([
    resources.items[0].close(),
    resources.items[1].close(),
    resources.items[2].close(),
    resources.menu.close(),
  ]);
}

async function createReleaseContextMenuResources(): Promise<ReleaseContextMenuResources> {
  const createdItems: PredefinedMenuItem[] = [];

  try {
    const cut = await PredefinedMenuItem.new({ item: "Cut" });
    createdItems.push(cut);

    const copy = await PredefinedMenuItem.new({ item: "Copy" });
    createdItems.push(copy);

    const paste = await PredefinedMenuItem.new({ item: "Paste" });
    createdItems.push(paste);

    const menu = await Menu.new({
      items: [cut, copy, paste],
    });

    return {
      items: [cut, copy, paste],
      menu,
    };
  } catch (error) {
    await Promise.allSettled(createdItems.map((item) => item.close()));
    throw error;
  }
}

function focusTextEditableTarget(target: TextEditableTarget): void {
  try {
    target.focus();
  } catch {
    // Ignore focus failures; the native menu can still be shown.
  }
}

export function useReleaseContextMenuPolicy(
  options: ReleaseContextMenuPolicyOptions = {},
): void {
  const { enabled, ...enablementOptions } = options;
  const isPolicyEnabled = enabled ?? isReleaseContextMenuPolicyEnabled(enablementOptions);

  useEffect(() => {
    if (!isPolicyEnabled) {
      return;
    }

    let disposed = false;
    let menuResourcesPromise: Promise<ReleaseContextMenuResources> | null = null;
    let closeResourcesPromise: Promise<void> | null = null;

    const getMenuResources = () => {
      if (!menuResourcesPromise) {
        menuResourcesPromise = createReleaseContextMenuResources().catch((error: unknown) => {
          menuResourcesPromise = null;
          throw error;
        });
      }

      return menuResourcesPromise;
    };

    const closeMenuResources = () => {
      if (!menuResourcesPromise || closeResourcesPromise) {
        return closeResourcesPromise;
      }

      closeResourcesPromise = menuResourcesPromise
        .then((resources) => closeReleaseContextMenuResources(resources))
        .catch(() => undefined);

      return closeResourcesPromise;
    };

    const handleContextMenu = (event: MouseEvent) => {
      const editableTarget = findTextEditableTarget(event.target);
      if (!editableTarget) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      focusTextEditableTarget(editableTarget);

      void getMenuResources()
        .then((resources) => {
          if (disposed) {
            return;
          }

          return resources.menu.popup(
            new LogicalPosition(event.clientX, event.clientY),
          );
        })
        .catch((error: unknown) => {
          if (!disposed) {
            console.error("Failed to show release context menu", error);
          }
        });
    };

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      disposed = true;
      document.removeEventListener("contextmenu", handleContextMenu);
      void closeMenuResources();
    };
  }, [isPolicyEnabled]);
}
