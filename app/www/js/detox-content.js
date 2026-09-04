// The Detox tab's presentation layer over plan.json.
//
// plan.json is generated from plan.html and carries the substance: the swaps,
// the whys, the picks with their notes. What it cannot carry is how a swap
// appears as a tile (a two word label and an icon) or its free version, which
// the page does not publish. That lives here, keyed by the swap's exact title
// so a renamed swap falls back to safe defaults rather than the wrong label.
//
// The free lines matter to the shape of the whole tab: they are why someone
// with no budget can still clear a source, which is why "Costs nothing" is a
// section and not a footnote.

const I = {
  box: "M5 9h14v11H5zM5 9l2-4h10l2 4M9 13h6",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  mug: "M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 9h2.5a2.5 2.5 0 0 1 0 5H16M8 3v2M11 3v2",
  bottle: "M10 2h4M10 2v4l-2.5 3V19a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V9L14 6V2",
  pan: "M4 13h12a6 6 0 0 1-12 0zM4 13h12M15.5 11L21 6.5",
  board: "M6 3h12v18H6zM12 6v.01",
  kettle: "M7 20h10l1.5-8h-13zM9 12V8a3 3 0 0 1 6 0v4M18.5 12L21 9.5",
  utensils: "M9 3v18M9 8C7 8 6 7 6 3M9 8c2 0 3-1 3-5M16 3v18M16 12c2 0 3-2 3-5s-1-4-3-4",
  bag: "M7 7h10l1 14H6zM9 7V5a3 3 0 0 1 6 0v2",
  moka: "M8 3h8l-1 7H9zM7 21h10l-1.5-7h-7zM12 10v4",
  cup: "M6 5h12M7.5 5l1.5 16h6L16.5 5M6.8 5L6 2h12l-.8 3",
  salt: "M9 9h6l1 11H8zM10 9V6a2 2 0 0 1 4 0v3M11 13h.01M13 15h.01M11 17h.01",
  gum: "M12 8a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 3v2M6.5 5.5L8 7M17.5 5.5L16 7",
  shirt: "M8 4l4 2 4-2 5 4-3 3-1-1v10H7V10l-1 1-3-3z",
  wind: "M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8",
  moon: "M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z",
  spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 4l.7 2L21 7l-1.3.7L19 10l-.7-2.3L17 7l1.3-1z",
};

const CONTENT = {
  "Stop heating and storing food in plastic": {
    short: "Hot food\nin plastic", icon: I.box,
    free: "A plate over the bowl and the glass jars you already own. Counts the same.",
  },
  "Filter your drinking water": {
    short: "Tap\nwater", icon: I.drop,
  },
  "Ditch plastic tea bags": {
    short: "Tea\nbags", icon: I.mug,
    free: "Loose leaf is usually cheaper per cup than bags.",
  },
  "Carry a stainless or glass water bottle": {
    short: "Plastic\nbottles", icon: I.bottle,
    free: "Any glass jar with a lid does the job while you choose one.",
  },
  "Replace nonstick cookware": {
    short: "Nonstick\npan", icon: I.pan,
    free: "Keep it below medium heat and retire the scratched pan first.",
  },
  "Swap your plastic cutting board for wood": {
    short: "Cutting\nboard", icon: I.board,
  },
  "Ditch the plastic electric kettle": {
    short: "Electric\nkettle", icon: I.kettle,
    free: "Never pour boiling water into plastic, whatever you boil it in.",
  },
  "Replace black plastic utensils": {
    short: "Black\nutensils", icon: I.utensils,
  },
  "Replace plastic wrap and zip bags": {
    short: "Wrap +\nzip bags", icon: I.bag,
    free: "A plate over the bowl, and the jars you were about to recycle.",
  },
  "Move to a plastic free coffee maker": {
    short: "Coffee\nmaker", icon: I.moka,
  },
  "Skip plastic coffee pods and lined to-go cups": {
    short: "Pods +\nto go cups", icon: I.cup,
    free: "Handing over your own mug is free everywhere.",
  },
  "Rethink your salt": {
    short: "Sea\nsalt", icon: I.salt,
  },
  "Cut plastic chewing gum": {
    short: "Chewing\ngum", icon: I.gum,
    free: "Quitting gum is the rare swap that saves money outright.",
  },
  "Choose natural fibers when you replace clothing": {
    short: "Synthetic\nclothes", icon: I.shirt,
    free: "Buying nothing new is the most plastic free option of all.",
  },
  "Catch microfibers in the laundry": {
    short: "Laundry\nfibers", icon: I.shirt,
    free: "Cold wash, full loads, air dry. The settings alone cut shedding by about a third.",
  },
  "Vacuum with a sealed HEPA vacuum": {
    short: "Leaky\nvacuum", icon: I.wind,
  },
  "Start your bedding with an organic cotton pillowcase": {
    short: "Pillow\ncase", icon: I.moon,
  },
  "Upgrade to a non toxic mattress (when ready)": {
    short: "Mattress", icon: I.moon,
    free: "A tightly woven natural fiber cover improves the mattress you have today.",
  },
  "Switch your toothbrush": {
    short: "Tooth\nbrush", icon: I.spark,
  },
  "Change your toothpaste": {
    short: "Tooth\npaste", icon: I.spark,
  },
  "Move to silk or PFAS free floss": {
    short: "Floss", icon: I.spark,
  },
  "Switch cleaning products": {
    short: "Cleaning\nsprays", icon: I.spark,
    free: "Vinegar and water clean most of a kitchen for pennies.",
  },
  "Switch to a metal safety razor": {
    short: "Razor", icon: I.spark,
  },
};

/** Tile label, icon and free line for a swap, with safe fallbacks. */
export function stepContent(step) {
  const c = CONTENT[step.swap] || {};
  return {
    short: c.short || step.swap,
    icon: c.icon || I.box,
    free: c.free || "",
  };
}

/**
 * A room name for a phase. The plan speaks in phases and exposure; a person
 * stands in a room. Falls back to the phase's own subtitle for any phase this
 * map has not met.
 */
const ROOMS = {
  "Kitchen and water": "Kitchen",
  "Air and textiles": "Air + laundry",
  "Reduce the chemicals": "Bathroom",
};
export function roomName(phase) {
  return ROOMS[phase.sub] || phase.sub;
}

/** The stage of the whole journey, for the bar's color and label. */
export function stage(ticked, all) {
  const p = all ? ticked / all : 0;
  if (p >= 1) return { key: "clear", label: "Your home is clear" };
  if (p >= 2 / 3) return { key: "close", label: "Almost plastic free" };
  if (p >= 1 / 3) return { key: "mid", label: "Making real progress" };
  return { key: "start", label: "Just getting started" };
}
