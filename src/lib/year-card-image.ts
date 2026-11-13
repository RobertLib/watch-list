"use client";

/**
 * Paints a year-in-review card (`year-card.ts`) and hands it over as a PNG.
 *
 * Portrait, 1080 × 1350: the tallest shape every feed shows uncropped. Drawn
 * with the system's own typeface rather than the site's – a canvas can only
 * use a web font once it has loaded, and a card that silently fell back to a
 * serif on a slow connection would look broken rather than merely different.
 */

import type { YearCard } from "./year-card";

export const YEAR_CARD_WIDTH = 1080;
export const YEAR_CARD_HEIGHT = 1350;

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MARGIN = 88;

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT}`;
}

/** Shrink a line until it fits, down to a floor – a long genre name, a big number. */
function fitted(
  context: CanvasRenderingContext2D,
  text: string,
  weight: number,
  size: number,
  maxWidth: number,
  floor: number,
): number {
  let current = size;
  context.font = font(weight, current);
  while (current > floor && context.measureText(text).width > maxWidth) {
    current -= 2;
    context.font = font(weight, current);
  }
  return current;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

export function drawYearCard(context: CanvasRenderingContext2D, card: YearCard): void {
  const width = YEAR_CARD_WIDTH;
  const height = YEAR_CARD_HEIGHT;
  const inner = width - MARGIN * 2;

  // The site's own night: near-black into the theme colour.
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#0b0b14");
  background.addColorStop(1, "#1a1a2e");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  // One soft light, top right, so the card is not a flat panel.
  const glow = context.createRadialGradient(width * 0.85, height * 0.08, 0, width * 0.85, height * 0.08, width * 0.9);
  glow.addColorStop(0, "rgba(59, 130, 246, 0.35)");
  glow.addColorStop(1, "rgba(59, 130, 246, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.textBaseline = "alphabetic";
  context.textAlign = "left";

  // Heading
  context.fillStyle = "#93c5fd";
  context.font = font(700, 44);
  context.fillText(card.heading.toUpperCase(), MARGIN, 150);

  // The big number
  context.fillStyle = "#ffffff";
  const totalSize = fitted(context, card.total.value, 800, 300, inner, 160);
  context.font = font(800, totalSize);
  context.fillText(card.total.value, MARGIN - 8, 150 + 60 + totalSize * 0.78);

  let y = 150 + 60 + totalSize * 0.78 + 78;
  context.fillStyle = "#e5e7eb";
  context.font = font(600, 56);
  context.fillText(card.total.label, MARGIN, y);

  if (card.breakdown) {
    y += 62;
    context.fillStyle = "#9ca3af";
    context.font = font(500, 40);
    context.fillText(card.breakdown, MARGIN, y);
  }

  // Tiles: up to three across.
  if (card.tiles.length > 0) {
    y += 70;
    const gap = 24;
    const tileWidth = (inner - gap * (card.tiles.length - 1)) / card.tiles.length;
    const tileHeight = 190;
    card.tiles.forEach((tile, index) => {
      const x = MARGIN + index * (tileWidth + gap);
      roundedRect(context, x, y, tileWidth, tileHeight, 28);
      context.fillStyle = "rgba(255, 255, 255, 0.07)";
      context.fill();

      context.fillStyle = "#ffffff";
      const size = fitted(context, tile.value, 700, 72, tileWidth - 56, 36);
      context.font = font(700, size);
      context.fillText(tile.value, x + 28, y + 100);

      context.fillStyle = "#9ca3af";
      fitted(context, tile.label, 500, 32, tileWidth - 56, 22);
      context.fillText(tile.label, x + 28, y + 150);
    });
    y += tileHeight;
  }

  // Genres: a bar each, the longest full width.
  if (card.genres.length > 0) {
    y += 84;
    context.fillStyle = "#93c5fd";
    context.font = font(700, 34);
    context.fillText("MOSTLY", MARGIN, y);

    const labelWidth = 330;
    const barMax = inner - labelWidth;
    const colours = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b"];
    card.genres.forEach((genre, index) => {
      y += 70;
      context.fillStyle = "#e5e7eb";
      fitted(context, genre.name, 600, 40, labelWidth - 24, 26);
      context.fillText(genre.name, MARGIN, y);

      const barWidth = Math.max(18, barMax * genre.share);
      roundedRect(context, MARGIN + labelWidth, y - 32, barWidth, 36, 18);
      context.fillStyle = colours[index % colours.length];
      context.fill();
    });
  }

  // Footer, pinned to the bottom whatever is above it.
  context.fillStyle = "rgba(255, 255, 255, 0.12)";
  context.fillRect(MARGIN, height - 170, inner, 2);
  context.fillStyle = "#ffffff";
  context.font = font(700, 40);
  context.fillText(card.site, MARGIN, height - 100);
  context.fillStyle = "#9ca3af";
  context.font = font(500, 32);
  context.fillText(card.tagline, MARGIN, height - 54);
}

/**
 * The card as a PNG. Rejects where the browser has no canvas to draw on, or
 * will not export one.
 */
export function renderYearCard(card: YearCard): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = YEAR_CARD_WIDTH;
  canvas.height = YEAR_CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("No 2D canvas in this browser"));

  drawYearCard(context, card);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The canvas could not be exported"))),
      "image/png",
    );
  });
}

export type YearCardDelivery = "shared" | "saved" | "dismissed";

/**
 * Hand a rendered card to the visitor: the share sheet where it takes files (a
 * phone, where "save to photos" and every app are in it), a download anywhere
 * else.
 */
export async function deliverYearCard(
  blob: Blob,
  filename: string,
  text: string,
): Promise<YearCardDelivery> {
  const file = new File([blob], filename, { type: "image/png" });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch (error) {
      // Closing the sheet is an answer; anything else falls through to a
      // download, which needs no permission.
      if (
        error !== null && typeof error === "object" &&
        "name" in error && error.name === "AbortError"
      ) return "dismissed";
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // After the click has been handled: revoking at once can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}
