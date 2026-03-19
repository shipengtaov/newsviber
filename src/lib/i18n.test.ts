import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n, {
  AUTO_DETECT_VALUE,
  getLanguagePreference,
  initializeI18n,
  setLanguagePreference,
} from "@/lib/i18n";

const {
  readLanguagePreferenceMock,
  saveLanguagePreferenceMock,
} = vi.hoisted(() => ({
  readLanguagePreferenceMock: vi.fn<() => string>(),
  saveLanguagePreferenceMock: vi.fn<(value: string) => Promise<void>>(),
}));

vi.mock("@/lib/app-settings", () => ({
  readLanguagePreference: readLanguagePreferenceMock,
  saveLanguagePreference: saveLanguagePreferenceMock,
}));

describe("i18n initialization", () => {
  beforeEach(() => {
    readLanguagePreferenceMock.mockReset();
    saveLanguagePreferenceMock.mockReset();
    readLanguagePreferenceMock.mockReturnValue(AUTO_DETECT_VALUE);
    saveLanguagePreferenceMock.mockResolvedValue();
  });

  it("exposes the bootstrapped persisted language preference", () => {
    readLanguagePreferenceMock.mockReturnValue("fr");

    expect(getLanguagePreference()).toBe("fr");
  });

  it("initializes i18n with the provided persisted language before render", async () => {
    await initializeI18n("de");

    expect(i18n.language).toBe("de");
  });

  it("persists language changes and updates i18n state", async () => {
    await initializeI18n("en");

    await setLanguagePreference("it");

    expect(saveLanguagePreferenceMock).toHaveBeenCalledWith("it");
    expect(i18n.language).toBe("it");
  });
});
