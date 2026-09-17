/**
 * A verdict as a picture.
 *
 * Text and a link travel well in a message and not at all on Instagram, where
 * the post is the image and a link cannot be tapped. So the share carries a
 * card: the product, the verdict, the four checks behind it, and our name, in
 * a shape that reads at thumbnail size.
 *
 * Drawn on a canvas rather than rendered from the screen, because the screen is
 * a scrolling column sized to a phone and a post is a fixed rectangle. Four by
 * five, which is the tallest an Instagram feed post may be and works as a
 * story or a pin without cropping anything important.
 */
const W = 1080;
const H = 1350;
const PAD = 84;

const INK = "#12130F";
const BODY = "#4A4B45";
const MUTED = "#7C7B74";
const GROUND = "#EAE8E1";
const CARD = "#FFFFFF";
const ACCENT = "#6A2BF0";

const STANCE = {
  good:    { label: "Good choice", ink: "#0B4A38", bg: "#DCEFE4" },
  careful: { label: "Careful",     ink: "#9A4600", bg: "#FCE4CC" },
  skip:    { label: "Skip",        ink: "#8F1D17", bg: "#FADBD9" },
  neutral: { label: "Context",     ink: "#4A4B45", bg: "#E7E3D9" },
};

const MARK = { pass: "✓", caution: "!", fail: "✕", unknown: "–" };
const MARK_INK = { pass: "#0B4A38", caution: "#9A4600", fail: "#8F1D17", unknown: "#9B9A92" };

const font = (weight, size) =>
  `${weight} ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;

/** Wrap to a width, and say how many lines it took, so the card can breathe. */
function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) { line = next; continue; }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  // Text that ran out of room says so. Without this a reason simply stopped,
  // mid clause, reading as a sentence we forgot to finish rather than one the
  // card could not hold.
  const used = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(last + "…").width > maxWidth) last = last.replace(/\s*\S+$/, "");
    lines[lines.length - 1] = (last || lines[lines.length - 1]) + "…";
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The card, as a PNG data URL. Everything on it comes from the verdict we
 * already show, so the picture cannot say more than the screen does.
 *
 * Measured before it is drawn. A fixed card left a hole under every short
 * verdict, and a picture with a hole in it reads as a mistake, so the card is
 * exactly as tall as what it holds and sits in the middle of the frame.
 */
export function verdictCard(v) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "top";

  const innerW = W - PAD * 2 - 112;
  const s = STANCE[v.stance] || STANCE.neutral;

  // ---- measure
  //
  // The card is a fixed rectangle, so something has to give when a product has
  // a long name and a long reason. A first attempt centred the content and let
  // it run: a five word brand name pushed the reason straight through the rule
  // and into the four checks. So the layout is chosen rather than assumed. The
  // name gives up size first, then lines, and the reason takes whatever room
  // is left, down to nothing.
  // "Johnson & Johnson Johnson's Baby Bedtime Bath" is what naming the brand
  // and then the product gets you when the product name already carries it.
  const brand = v.brand.brand;
  const productName = (v.product && v.product.name) || "";
  // Matched on the first word, not the whole string: the brand is "Johnson &
  // Johnson" and the product starts "Johnson's", which shares no prefix and
  // reads as a stutter when both are printed.
  const firstWord = (t) => (String(t).toLowerCase().match(/[a-z0-9]+/) || [""])[0];
  const name = !productName ? brand
    : firstWord(productName) && firstWord(productName) === firstWord(brand) ? productName
    : `${brand} ${productName}`;
  const category = (v.brand && v.brand.category) || "";
  const catH = category ? 62 : 0;
  const contentRoom = (H - PAD - 96) - (PAD + 108) - 152 - 44 - 56;

  const layout = (() => {
    for (const maxNameLines of [4, 3, 2]) {
      for (let size = v.reason ? 88 : 120; size >= 46; size -= 5) {
        ctx.font = font(800, size);
        const nameLines = wrap(ctx, name, innerW, maxNameLines);
        if (!nameLines.every((l) => ctx.measureText(l).width <= innerW)) continue;
        const nameH = nameLines.length * size * 1.16;
        const fixed = 72 + 40 + nameH + 18 + catH;
        const forReason = Math.floor((contentRoom - fixed) / 56);
        if (forReason < (v.reason ? 2 : 0)) continue;
        ctx.font = font(500, 38);
        const reasonLines = v.reason ? wrap(ctx, v.reason, innerW, Math.min(5, forReason)) : [];
        return { size, nameLines, nameH, reasonLines, height: fixed + reasonLines.length * 56 };
      }
    }
    // Nothing fits: the name alone, as small and as short as we allow.
    ctx.font = font(800, 46);
    const nameLines = wrap(ctx, name, innerW, 2);
    const nameH = nameLines.length * 46 * 1.16;
    return { size: 46, nameLines, nameH, reasonLines: [], height: 72 + 40 + nameH + 18 + catH };
  })();

  const nameSize = layout.size;
  const nameLines = layout.nameLines;
  const reasonLines = layout.reasonLines;

  const topLimit = PAD + 108;
  const bottomLimit = H - PAD - 96;
  const drawnH = bottomLimit - topLimit;
  const cardTop = topLimit;
  const lead = Math.max(0, (contentRoom - layout.height) / 2);

  // ---- draw
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, W, H);

  ctx.font = font(800, 40);
  ctx.fillStyle = INK;
  ctx.fillText("plastic", PAD, PAD);
  const markW = ctx.measureText("plastic").width;
  ctx.fillStyle = ACCENT;
  ctx.fillText("detox", PAD + markW, PAD);

  ctx.fillStyle = CARD;
  roundRect(ctx, PAD, cardTop, W - PAD * 2, drawnH, 44);
  ctx.fill();

  const x = PAD + 56;
  let y = cardTop + 56 + lead;

  ctx.font = font(800, 34);
  const badgeW = ctx.measureText(s.label.toUpperCase()).width + 64;
  ctx.fillStyle = s.bg;
  roundRect(ctx, x, y, badgeW, 72, 36);
  ctx.fill();
  ctx.fillStyle = s.ink;
  ctx.fillText(s.label.toUpperCase(), x + 32, y + 20);
  y += 72 + 40;

  ctx.fillStyle = INK;
  ctx.font = font(800, nameSize);
  for (const line of nameLines) { ctx.fillText(line, x, y); y += nameSize * 1.16; }
  y += 18;

  if (category) {
    ctx.font = font(700, 32);
    ctx.fillStyle = MUTED;
    ctx.fillText(category, x, y);
    y += catH;
  }

  if (reasonLines.length) {
    ctx.font = font(500, 38);
    ctx.fillStyle = BODY;
    for (const line of reasonLines) { ctx.fillText(line, x, y); y += 56; }
  }

  // The four checks, along the foot of the card, in their own order.
  const rowY = cardTop + drawnH - 152;
  ctx.strokeStyle = "#E7E3D9";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, rowY - 44);
  ctx.lineTo(x + innerW, rowY - 44);
  ctx.stroke();

  const fronts = [
    ["formula", "Formula"], ["materials", "Materials"],
    ["legal", "Recalls"], ["testing", "Lab tests"],
  ];
  const colW = innerW / 4;
  fronts.forEach(([key, label], i) => {
    const st = ((v.fronts && v.fronts[key]) || {}).status || "unknown";
    const cx = x + colW * i;
    ctx.fillStyle = MARK_INK[st] || MARK_INK.unknown;
    ctx.font = font(800, 46);
    ctx.fillText(MARK[st] || MARK.unknown, cx, rowY);
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 26);
    ctx.fillText(label, cx, rowY + 62);
  });

  // And who says so, which is the only thing a picture carries off platform.
  ctx.font = font(700, 32);
  ctx.fillStyle = BODY;
  ctx.fillText("Check any product free", PAD, H - PAD - 44);
  ctx.font = font(800, 32);
  ctx.fillStyle = ACCENT;
  const tail = "plasticdetox.org";
  ctx.fillText(tail, W - PAD - ctx.measureText(tail).width, H - PAD - 44);

  return canvas.toDataURL("image/png");
}
