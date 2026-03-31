// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createdMenus,
  createdPredefinedItems,
  isTauriMock,
  menuNewMock,
  predefinedMenuItemNewMock,
} = vi.hoisted(() => ({
  createdMenus: [] as Array<{
    close: ReturnType<typeof vi.fn>;
    items: unknown[];
    popup: ReturnType<typeof vi.fn>;
  }>,
  createdPredefinedItems: [] as Array<{
    close: ReturnType<typeof vi.fn>;
    item: string;
  }>,
  isTauriMock: vi.fn(),
  menuNewMock: vi.fn(),
  predefinedMenuItemNewMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: isTauriMock,
}));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: {
    new: menuNewMock,
  },
  PredefinedMenuItem: {
    new: predefinedMenuItemNewMock,
  },
}));

import {
  findTextEditableTarget,
  isReleaseContextMenuPolicyEnabled,
  isTextEditableInput,
  useReleaseContextMenuPolicy,
} from "@/hooks/use-release-context-menu-policy";

type TestHarnessProps = {
  children?: ReactNode;
  enabled?: boolean;
  isProductionBuild?: boolean;
  isTauriApp?: boolean;
};

function TestHarness({
  children,
  enabled,
  isProductionBuild,
  isTauriApp,
}: TestHarnessProps) {
  useReleaseContextMenuPolicy({
    enabled,
    isProductionBuild,
    isTauriApp,
  });

  return <>{children}</>;
}

describe("useReleaseContextMenuPolicy", () => {
  let container: HTMLDivElement;
  let root: Root;
  let previousActEnvironment: boolean | undefined;

  beforeEach(() => {
    createdMenus.length = 0;
    createdPredefinedItems.length = 0;
    isTauriMock.mockReset();
    menuNewMock.mockReset();
    predefinedMenuItemNewMock.mockReset();

    isTauriMock.mockReturnValue(true);
    predefinedMenuItemNewMock.mockImplementation(async ({ item }: { item: string }) => {
      const predefinedItem = {
        close: vi.fn().mockResolvedValue(undefined),
        item,
      };
      createdPredefinedItems.push(predefinedItem);
      return predefinedItem;
    });
    menuNewMock.mockImplementation(async ({ items }: { items: unknown[] }) => {
      const menu = {
        close: vi.fn().mockResolvedValue(undefined),
        items,
        popup: vi.fn().mockResolvedValue(undefined),
      };
      createdMenus.push(menu);
      return menu;
    });

    const actEnvironment = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    (globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  function renderHarness(
    node: ReactNode,
    options: Omit<TestHarnessProps, "children"> = {},
  ) {
    act(() => {
      root.render(
        <TestHarness {...options}>
          {node}
        </TestHarness>,
      );
    });
  }

  async function flushAsyncWork() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("enables the policy only for production tauri builds", () => {
    expect(
      isReleaseContextMenuPolicyEnabled({
        isProductionBuild: true,
        isTauriApp: true,
      }),
    ).toBe(true);
    expect(
      isReleaseContextMenuPolicyEnabled({
        isProductionBuild: false,
        isTauriApp: true,
      }),
    ).toBe(false);
    expect(
      isReleaseContextMenuPolicyEnabled({
        isProductionBuild: true,
        isTauriApp: false,
      }),
    ).toBe(false);
  });

  it("recognizes only text-editable targets", () => {
    const textInput = document.createElement("input");
    textInput.type = "email";

    const dateInput = document.createElement("input");
    dateInput.type = "date";

    const textarea = document.createElement("textarea");

    const editableRoot = document.createElement("div");
    editableRoot.setAttribute("contenteditable", "true");
    const editableChild = document.createElement("span");
    editableRoot.appendChild(editableChild);

    expect(isTextEditableInput(textInput)).toBe(true);
    expect(isTextEditableInput(dateInput)).toBe(false);
    expect(findTextEditableTarget(textInput)).toBe(textInput);
    expect(findTextEditableTarget(dateInput)).toBeNull();
    expect(findTextEditableTarget(textarea)).toBe(textarea);
    expect(findTextEditableTarget(editableChild)).toBe(editableRoot);
  });

  it("suppresses the native context menu on non-editable targets in release", async () => {
    renderHarness(<div data-target="static">Static content</div>, {
      enabled: true,
    });

    const target = document.querySelector("[data-target='static']");
    if (!(target instanceof HTMLDivElement)) {
      throw new Error("Static target not found.");
    }

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 18,
      clientY: 24,
    });

    target.dispatchEvent(event);
    await flushAsyncWork();

    expect(event.defaultPrevented).toBe(true);
    expect(predefinedMenuItemNewMock).not.toHaveBeenCalled();
    expect(menuNewMock).not.toHaveBeenCalled();
  });

  it("shows a cut-copy-paste menu for text inputs in release", async () => {
    renderHarness(<input data-target="field" type="text" />, {
      enabled: true,
    });

    const input = document.querySelector("[data-target='field']");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Text input not found.");
    }

    const focusSpy = vi.spyOn(input, "focus");
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 42,
      clientY: 84,
    });

    input.dispatchEvent(event);
    await flushAsyncWork();

    expect(event.defaultPrevented).toBe(true);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(predefinedMenuItemNewMock).toHaveBeenCalledTimes(3);
    expect(
      predefinedMenuItemNewMock.mock.calls.map(([options]) => options.item),
    ).toEqual(["Cut", "Copy", "Paste"]);
    expect(menuNewMock).toHaveBeenCalledTimes(1);
    expect(createdMenus[0]?.items).toEqual(createdPredefinedItems);
    expect(createdMenus[0]?.popup).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "Logical",
        x: 42,
        y: 84,
      }),
    );
  });

  it("shows the same menu for textareas and contenteditable roots", async () => {
    renderHarness(
      <>
        <textarea data-target="textarea" />
        <div
          data-target="editable-root"
          contentEditable
          suppressContentEditableWarning
        >
          <span data-target="editable-child">Editable</span>
        </div>
      </>,
      {
        enabled: true,
      },
    );

    const textarea = document.querySelector("[data-target='textarea']");
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Textarea not found.");
    }

    const editableRoot = document.querySelector("[data-target='editable-root']");
    const editableChild = document.querySelector("[data-target='editable-child']");
    if (!(editableRoot instanceof HTMLDivElement) || !(editableChild instanceof HTMLSpanElement)) {
      throw new Error("Contenteditable target not found.");
    }

    const textareaEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 16,
      clientY: 32,
    });
    const textareaFocusSpy = vi.spyOn(textarea, "focus");

    textarea.dispatchEvent(textareaEvent);
    await flushAsyncWork();

    expect(textareaEvent.defaultPrevented).toBe(true);
    expect(textareaFocusSpy).toHaveBeenCalledTimes(1);
    expect(createdMenus[0]?.popup).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "Logical",
        x: 16,
        y: 32,
      }),
    );

    const editableEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 28,
      clientY: 56,
    });
    const editableFocusSpy = vi.spyOn(editableRoot, "focus");

    editableChild.dispatchEvent(editableEvent);
    await flushAsyncWork();

    expect(editableEvent.defaultPrevented).toBe(true);
    expect(editableFocusSpy).toHaveBeenCalledTimes(1);
    expect(menuNewMock).toHaveBeenCalledTimes(1);
    expect(createdMenus[0]?.popup).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "Logical",
        x: 28,
        y: 56,
      }),
    );
  });

  it("keeps development builds unchanged", async () => {
    renderHarness(<input data-target="field" type="text" />, {
      isProductionBuild: false,
      isTauriApp: true,
    });

    const input = document.querySelector("[data-target='field']");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Text input not found.");
    }

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 12,
    });

    input.dispatchEvent(event);
    await flushAsyncWork();

    expect(event.defaultPrevented).toBe(false);
    expect(predefinedMenuItemNewMock).not.toHaveBeenCalled();
    expect(menuNewMock).not.toHaveBeenCalled();
  });

  it("does nothing outside tauri", async () => {
    renderHarness(<input data-target="field" type="text" />, {
      isProductionBuild: true,
      isTauriApp: false,
    });

    const input = document.querySelector("[data-target='field']");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Text input not found.");
    }

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 14,
      clientY: 18,
    });

    input.dispatchEvent(event);
    await flushAsyncWork();

    expect(event.defaultPrevented).toBe(false);
    expect(predefinedMenuItemNewMock).not.toHaveBeenCalled();
    expect(menuNewMock).not.toHaveBeenCalled();
  });

  it("removes the listener and closes menu resources on teardown", async () => {
    renderHarness(<input data-target="field" type="text" />, {
      enabled: true,
    });

    const input = document.querySelector("[data-target='field']");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Text input not found.");
    }

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 22,
      clientY: 44,
    });

    input.dispatchEvent(event);
    await flushAsyncWork();

    act(() => {
      root.unmount();
    });
    await flushAsyncWork();

    expect(createdMenus[0]?.close).toHaveBeenCalledTimes(1);
    expect(createdPredefinedItems[0]?.close).toHaveBeenCalledTimes(1);
    expect(createdPredefinedItems[1]?.close).toHaveBeenCalledTimes(1);
    expect(createdPredefinedItems[2]?.close).toHaveBeenCalledTimes(1);

    const detachedInput = document.createElement("input");
    document.body.appendChild(detachedInput);
    const detachedEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 60,
    });

    detachedInput.dispatchEvent(detachedEvent);
    await flushAsyncWork();

    expect(detachedEvent.defaultPrevented).toBe(false);
    expect(createdMenus[0]?.popup).toHaveBeenCalledTimes(1);
  });
});
