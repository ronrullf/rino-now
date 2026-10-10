import { describe, it, expect } from "vitest";
import { extractFranchiseName } from "../src/lib/services/related";

describe("Related editions franchise extraction", () => {
  it("cleans edition and bundle keywords from game titles", () => {
    expect(extractFranchiseName("Forza Horizon 5 Standard Edition")).toBe("Forza Horizon 5");
    expect(extractFranchiseName("Elden Ring Deluxe Edition")).toBe("Elden Ring");
    expect(extractFranchiseName("Grand Theft Auto V: Premium Edition")).toBe("Grand Theft Auto V:");
    expect(extractFranchiseName("Cyberpunk 2077: Ultimate Edition")).toBe("Cyberpunk 2077:");
    expect(extractFranchiseName("Minecraft")).toBe("Minecraft");
  });
});
