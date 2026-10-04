import apiClient from "@/api/client";
import {
  fetchPatientProfilePicture,
  uploadPatientProfilePicture,
} from "@/src/services/patientProfile";

jest.mock("@/api/client", () => {
  const api = {
    get: jest.fn(),
    post: jest.fn(),
    defaults: { baseURL: "https://example.test/api", headers: { common: {} } },
  };
  return { __esModule: true, default: api };
});

class MockFormData {
  parts: any[] = [];
  append = jest.fn((...args: any[]) => {
    this.parts.push(args);
  });
}

describe("src/services/patientProfile", () => {
  const api = apiClient as unknown as {
    get: jest.Mock;
    post: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Provide a deterministic FormData we can inspect
    (global as any).FormData = MockFormData as any;
  });

  afterEach(() => {
    delete (global as any).FormData;
    delete (global as any).fetch;
    delete (global as any).File;
  });

  it("fetchPatientProfilePicture hits /api/patient/profile-picture", async () => {
    api.get.mockResolvedValueOnce({ data: { profilePictureUrl: "x" } });

    await expect(fetchPatientProfilePicture()).resolves.toEqual({ profilePictureUrl: "x" });
    expect(api.get).toHaveBeenCalledWith("/api/patient/profile-picture");
  });

  it("uploadPatientProfilePicture (native branch) posts multipart form data", async () => {
    api.post.mockResolvedValueOnce({ data: { profilePictureUrl: "u" } });

    const uri = "file:///path/to/photo.png";
    const res = await uploadPatientProfilePicture(uri);

    expect(api.post).toHaveBeenCalledWith(
      "/api/patient/profile-picture",
      expect.any(MockFormData),
      { headers: { "Content-Type": "multipart/form-data" } }
    );

    const form = api.post.mock.calls[0][1] as MockFormData;
    expect(form.append).toHaveBeenCalledWith(
      "profilePicture",
      expect.objectContaining({ uri, name: "photo.png", type: "image/png" })
    );
    expect(res.profilePictureUrl).toBe("u");
  });

  it("uploadPatientProfilePicture (web branch) uses fetch+File", async () => {
    const { Platform } = require("react-native");
    const originalOS = Platform.OS;

    // Minimal File polyfill for the test
    (global as any).File = class File {
      constructor(public parts: any[], public name: string, public options: any) {}
    };

    (global as any).fetch = jest.fn(async () => ({
      blob: async () => ({ __blob: true }),
    }));

    try {
      try {
        Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Platform as any).OS = "web";
      }

      api.post.mockResolvedValueOnce({ data: { profilePictureUrl: "u" } });

      const uri = "https://example.test/p.jpg";
      await uploadPatientProfilePicture(uri);

      const form = api.post.mock.calls[0][1] as MockFormData;
      // Should append a File instance
      const appended = form.parts.find((p) => p[0] === "profilePicture");
      expect(appended).toBeTruthy();
      expect(appended[1]).toBeInstanceOf((global as any).File);
    } finally {
      try {
        Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Platform as any).OS = originalOS;
      }
    }
  });
});
