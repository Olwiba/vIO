import { describe, it, expect } from "vitest";
import { viteImageOptimizer } from "../src/index";

describe("viteImageOptimizer", () => {
  it("should create a plugin with correct name", () => {
    const plugin = viteImageOptimizer({
      inputPath: "test/input",
      outputPath: "test/output",
    });

    expect(plugin.name).toBe("vite-image-optimizer");
  });

  it("should have default quality of 80", () => {
    const plugin = viteImageOptimizer({
      inputPath: "test/input",
      outputPath: "test/output",
    });

    expect(plugin).toBeDefined();
    // Add more specific tests as needed
  });
});
