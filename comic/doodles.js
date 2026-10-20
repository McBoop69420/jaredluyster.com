// Margin doodles, the kind that end up on every page of a middle school notebook. Each is a
// pen-stroke path in a 40×40 box, drawn with the .doodle class (stroke = currentColor).
// Shared by the reader and the planner.

(function () {
  const PATHS = {
    star: "M20 4.5 L24.2 15.2 L35.6 15.6 L26.8 22.9 L30.1 34.2 L20.2 27.6 L10.1 34.4 L13.3 22.8 L4.4 15.7 L15.8 15.1 Z",
    bolt: "M23.5 3 L10 22.2 H19.6 L15.2 37 L30.4 15.8 H20.8 Z",
    spiral: "M20.5 20.2 c1.4-1.7 3.9-0.6 3.4 1.6 c-0.6 2.9-4.9 3.2-6.5 0.8 c-2.2-3.4 0.8-7.6 4.6-7.6 c4.9 0 8 4.7 6.6 9.2 c-1.6 5.2-8 7.4-12.5 4.5 c-5.3-3.4-5.4-11.3-1-15.5 c4.9-4.7 13.5-4.1 17.3 1.6",
    smiley: "M20 5.5 C28.6 5.4 34.6 11.6 34.4 20.2 C34.2 28.6 27.9 34.6 19.6 34.4 C11.3 34.2 5.4 28 5.6 19.7 C5.8 11.5 11.8 5.6 20 5.5 Z M14.6 15.4 v3.2 M25.2 15.2 v3.4 M12.8 23.4 c3.6 5.4 11.2 5.6 14.6 0.2",
    cube: "M7.5 15 H24.5 V32 H7.5 Z M15.5 7 H32.5 V24 H15.5 M7.5 15 L15.5 7 M24.5 15 L32.5 7 M24.5 32 L32.5 24 M15.5 7 V15",
    // The "cool S". Two rows of three strokes, cross-stitched, pointed at both ends.
    coolS: "M12 9 V17 M20 9 V17 M28 9 V17 M12 23 V31 M20 23 V31 M28 23 V31 M12 9 L20 2.5 L28 9 M12 31 L20 37.5 L28 31 M12 17 L20 23 M20 17 L28 23 M28 17 L24 20 M12 23 L16 20",
    arrow: "M5 31 C10 15 22 9.5 33 13.5 M26.5 8 L33.4 13.6 L27.2 20",
    heart: "M20 33.5 C12 27 5.5 21.6 6 14.4 C6.5 8.6 13.6 6 17.4 10.4 L20 13.4 L22.6 10.4 C26.4 6 33.5 8.6 34 14.4 C34.5 21.6 28 27 20 33.5 Z",
    zigzag: "M3 26 L9 14 L15 26 L21 14 L27 26 L33 14 L38 22",
    sun: "M20 13.5 c3.7 0 6.6 2.9 6.5 6.6 c-0.1 3.6-3 6.4-6.6 6.4 c-3.6-0.1-6.4-3-6.4-6.6 c0.1-3.6 2.9-6.4 6.5-6.4 Z M20 3.5 V8.5 M20 31.5 V36.5 M3.5 20 H8.5 M31.5 20 H36.5 M8.2 8.2 L11.6 11.6 M28.4 28.4 L31.8 31.8 M8.2 31.8 L11.6 28.4 M28.4 11.6 L31.8 8.2",
    person: "M20 5 c3 0 5 2.2 5 5 s-2.1 5-5 5 s-5-2.2-5-5 s2-5 5-5 Z M20 15 V27 M11 19.5 L20 18.5 L29 20 M20 27 L13 36 M20 27 L27.5 36",
  };

  const NAMES = Object.keys(PATHS);

  function doodle(name, className = "", style = "") {
    const d = PATHS[name] || PATHS.star;
    return `<svg class="doodle ${className}" viewBox="0 0 40 40" aria-hidden="true" focusable="false"${style ? ` style="${style}"` : ""}><path d="${d}"/></svg>`;
  }

  // Positions inside the sheet: the strip of margin between the binder holes and the red
  // line on the left, and the right-hand gutter. Kids doodle across the margin line, so
  // overlapping it is fine; overlapping the holes (10%, 50%, 90% down) is not.
  const SPOTS = [
    "left:30px;top:180px;transform:rotate(-12deg);width:40px;height:40px",
    "right:6px;bottom:18px;transform:rotate(9deg);width:34px;height:34px",
    "left:28px;bottom:22%;transform:rotate(14deg);width:40px;height:40px",
    "right:6px;top:38%;transform:rotate(-8deg);width:30px;height:30px",
    "left:32px;top:30%;transform:rotate(6deg);width:36px;height:36px",
  ];

  // A few doodles in the page's margins, picked and placed from a seed so a strip keeps the
  // same doodles every time it's opened (they're part of "the page", not decoration that
  // reshuffles).
  function marginDoodles(seed, count = 3) {
    let x = (Math.abs(seed | 0) * 2654435761) % 4294967296 || 7;
    const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
    const spots = SPOTS.slice();
    let html = "";
    for (let i = 0; i < count && spots.length; i++) {
      const spot = spots.splice(Math.floor(rand() * spots.length), 1)[0];
      const name = NAMES[Math.floor(rand() * NAMES.length)];
      const tint = rand() < 0.25 ? "red" : rand() < 0.2 ? "pencil" : "";
      html += doodle(name, `${tint} hide-sm`, spot);
    }
    return html;
  }

  window.Doodles = { doodle, marginDoodles, names: NAMES };
})();
