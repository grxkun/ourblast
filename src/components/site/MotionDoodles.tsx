// SPDX-License-Identifier: BUSL-1.1
/** Decorative floating doodles behind page content. Purely visual. */
const DOODLES = [
  { d: "M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z", x: "6%", y: "14%", s: 34, t: 14, delay: 0 },
  { d: "M13 2 L4 14 H11 L10 22 L20 9 H13 Z", x: "88%", y: "10%", s: 38, t: 17, delay: -4 },
  { d: "M12 3 C16 9 19 12 19 15.5 A7 7 0 0 1 5 15.5 C5 12 8 9 12 3 Z", x: "80%", y: "58%", s: 40, t: 19, delay: -8 },
  { d: "M3 12 C6 4 10 20 13 12 S20 4 21 12", x: "12%", y: "66%", s: 46, t: 21, delay: -2 },
  { d: "M12 2 L20 7 V17 L12 22 L4 17 V7 Z", x: "46%", y: "84%", s: 30, t: 16, delay: -6 },
  { d: "M12 2 C15 6 15 12 12 18 C9 12 9 6 12 2 Z M9 17 L7 21 M15 17 L17 21", x: "60%", y: "22%", s: 32, t: 23, delay: -10 },
  { d: "M4 12 A8 8 0 1 0 20 12 A8 8 0 1 0 4 12 M9 12 H15 M12 9 V15", x: "28%", y: "36%", s: 28, t: 18, delay: -12 },
  { d: "M12 4 L13.8 10.2 L20 12 L13.8 13.8 L12 20 L10.2 13.8 L4 12 L10.2 10.2 Z", x: "94%", y: "86%", s: 24, t: 13, delay: -5 },
];

export function MotionDoodles() {
  return (
    <div aria-hidden className="doodle-layer">
      {DOODLES.map((o, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={o.s}
          height={o.s}
          className={i % 2 ? "doodle doodle-alt" : "doodle"}
          style={{ left: o.x, top: o.y, animationDuration: `${o.t}s`, animationDelay: `${o.delay}s` }}
        >
          <path d={o.d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}
