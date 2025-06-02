import sharp from "sharp";
import fs from "fs";
import path from "path";
import { optimize } from "svgo";
import type { Plugin, ResolvedConfig } from "vite";

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
} as const;

interface ViteImageOptimizerOptions {
  /** Source directory for images */
  inputPath: string;
  /** Where optimized images go */
  outputPath: string;
  /** Compression quality (1-100, default: 80) */
  quality?: number;
}

interface OptimizationStats {
  file: string;
  originalSize: number;
  optimizedSize: number;
  savings: number;
  savingsPercent: string;
}

/**
 * Helper to get current timestamp for logging
 */
const getCurrentTimestamp = (): string => {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

const logPrefix = `${colors.cyan}[vIO]${colors.reset}`;

/**
 * Recursively get all image files from a directory
 */
const getAllFiles = (dir: string): string[] => {
  const files = fs.readdirSync(dir);
  return files.flatMap((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return getAllFiles(filePath);
    }
    if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file)) {
      return [filePath];
    }
    return [];
  });
};

/**
 * vIO - Vite Image Optimizer Plugin
 *
 * Automatically optimizes images during Vite builds with smart caching
 * and beautiful terminal output.
 *
 * @param options - Configuration options
 * @returns Vite plugin
 */
export const viteImageOptimizer = (
  options: ViteImageOptimizerOptions
): Plugin => {
  const { inputPath, outputPath, quality = 80 } = options;
  const resolvedInputPath = path.resolve(inputPath);
  const resolvedOutputPath = path.resolve(outputPath);
  const processedFiles = new Set<string>();
  let stats: OptimizationStats[] = [];
  let viteCommand: ResolvedConfig["command"] = "build"; // Default to 'build'

  return {
    name: "vite-image-optimizer",
    enforce: "pre",

    configResolved(resolvedConfig) {
      viteCommand = resolvedConfig.command; // 'build' or 'serve'
      // Clean output directory only for 'build' command
      if (viteCommand === "build" && fs.existsSync(resolvedOutputPath)) {
        fs.rmSync(resolvedOutputPath, { recursive: true });
      }
      // Always ensure the output directory exists
      fs.mkdirSync(resolvedOutputPath, { recursive: true });
    },

    async buildStart() {
      const timestamp = `${colors.dim}${getCurrentTimestamp()}${colors.reset}`;
      console.log(
        `${timestamp} ${logPrefix} ${colors.bright}🖼️  Processing images...${colors.reset}`
      );

      let totalOriginalSize = 0;
      let totalOptimizedSize = 0;
      let skippedCount = 0;
      stats = [];

      const imageFiles = getAllFiles(resolvedInputPath);

      for (const imagePath of imageFiles) {
        const relativePath = path.relative(resolvedInputPath, imagePath);
        const outputPath = path.join(resolvedOutputPath, relativePath);
        const originalFileStat = fs.statSync(imagePath); // Get original file stats once

        // Check if already optimized and up-to-date
        if (fs.existsSync(outputPath)) {
          const outputFileStat = fs.statSync(outputPath);
          if (outputFileStat.mtimeMs >= originalFileStat.mtimeMs) {
            skippedCount++;
            // Update totals for already optimized files to reflect their presence for the "total savings" calculation
            totalOriginalSize += originalFileStat.size;
            totalOptimizedSize += outputFileStat.size;
            processedFiles.add(imagePath); // Mark as "processed" in terms of being considered
            continue;
          }
        }

        const originalSize = originalFileStat.size;

        // Ensure output subdirectory exists
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });

        try {
          const fileExt = path.extname(imagePath).toLowerCase();

          if (fileExt === ".svg") {
            // Use SVGO for SVG files
            const svgString = fs.readFileSync(imagePath, "utf8");
            const result = optimize(svgString, {
              multipass: true,
            });
            fs.writeFileSync(outputPath, result.data);
          } else {
            // Use Sharp for other image formats
            await sharp(imagePath)
              .png({ quality })
              .jpeg({ quality })
              .webp({ quality })
              .toFile(outputPath);
          }

          const optimizedSize = fs.statSync(outputPath).size;
          const savings = originalSize - optimizedSize;
          const savingsPercent = ((savings / originalSize) * 100).toFixed(1);

          stats.push({
            file: relativePath,
            originalSize,
            optimizedSize,
            savings,
            savingsPercent,
          });

          totalOriginalSize += originalSize;
          totalOptimizedSize += optimizedSize;
          processedFiles.add(imagePath);
        } catch (error) {
          console.error(
            `${colors.red}Failed to optimize ${relativePath}:${colors.reset}`,
            error
          );
        }
      }

      if (skippedCount > 0) {
        const timestampSkipped = `${colors.dim}${getCurrentTimestamp()}${
          colors.reset
        }`;
        console.log(
          `${timestampSkipped} ${logPrefix} ${colors.dim}${skippedCount} image(s) skipped (already up-to-date).${colors.reset}`
        );
      }

      // Print stats
      const timestampStatsHeader = `${colors.dim}${getCurrentTimestamp()}${
        colors.reset
      }`;
      console.log(
        `\n${timestampStatsHeader} ${logPrefix} ${colors.bright}✨  Optimized images successfully this run:${colors.reset}`
      );

      if (stats.length === 0 && skippedCount > 0) {
        const timestampNoNew = `${colors.dim}${getCurrentTimestamp()}${
          colors.reset
        }`;
        console.log(
          `${timestampNoNew} ${logPrefix} ${colors.dim}No new images to optimize in this run.${colors.reset}\n`
        );
      } else {
        stats.forEach(
          ({ file, originalSize, optimizedSize, savingsPercent }) => {
            const color =
              parseFloat(savingsPercent) > 0 ? colors.green : colors.red;
            const timestampFile = `${colors.dim}${getCurrentTimestamp()}${
              colors.reset
            }`;
            console.log(
              `${timestampFile} ${logPrefix} ${colors.cyan}${file}${
                colors.reset
              }  ${color}-${savingsPercent}%${colors.reset}    ${
                colors.yellow
              }${(originalSize / 1024).toFixed(2)} kB${colors.reset} ⭢  ${
                colors.green
              }${(optimizedSize / 1024).toFixed(2)} kB${colors.reset}`
            );
          }
        );

        const totalSavings = totalOriginalSize - totalOptimizedSize;
        const totalSavingsPercent =
          totalOriginalSize > 0
            ? ((totalSavings / totalOriginalSize) * 100).toFixed(1)
            : "0.0";
        const timestampTotal = `${colors.dim}${getCurrentTimestamp()}${
          colors.reset
        }`;
        console.log(
          `\n${timestampTotal} ${logPrefix} ${
            colors.bright
          }💰 total savings = ${colors.green}${(totalSavings / 1024).toFixed(
            2
          )}kB${colors.reset}/${colors.yellow}${(
            totalOriginalSize / 1024
          ).toFixed(2)}kB${colors.reset} ${
            colors.magenta
          }≈ ${totalSavingsPercent}%${colors.reset}`
        );
      }
    },
  };
};

// Export types for users
export type { ViteImageOptimizerOptions };
