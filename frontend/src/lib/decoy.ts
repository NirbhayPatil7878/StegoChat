// Client-side generators for plausible decoy content.
//
// A decoy message is what you reveal under duress instead of the real one, so
// it has to read like an ordinary, forgettable note — nothing that hints a
// second message exists. These pools are intentionally mundane. Everything runs
// locally; no decoy text ever leaves the browser.

const DECOY_MESSAGES: string[] = [
  "Hey, are we still on for lunch tomorrow? Let me know what time works.",
  "Don't forget to pick up milk and eggs on your way home.",
  "Great catching up today — let's do it again soon.",
  "The meeting got moved to 3pm. Same room as before.",
  "Thanks again for the ride yesterday, really appreciated it.",
  "Can you send me those photos from the weekend when you get a chance?",
  "Running about ten minutes late, sorry! Grab us a table.",
  "Happy birthday! Hope you have a wonderful day.",
  "I left the spare key under the mat like we talked about.",
  "The package should arrive Thursday. I'll text you the tracking number.",
  "Let's finalize the trip details this weekend. Excited!",
  "Reminder: dentist appointment on Friday at 10.",
  "Movie night still good for Saturday? I'll bring snacks.",
  "Just wanted to say thanks for everything lately. Means a lot.",
  "Can we reschedule our call to next week? Something came up.",
  "The recipe turned out great — I'll send it over later.",
  "Feeling much better today, thanks for checking in.",
  "Traffic is terrible, might be a bit late for dinner.",
  "Loved the book you recommended. What should I read next?",
  "Let's split the bill evenly this time, easier that way.",
];

const ADJECTIVES = ["quiet", "amber", "north", "clever", "willow", "harbor", "copper", "velvet"];
const NOUNS = ["meadow", "lantern", "river", "cobble", "signal", "orchard", "cipher", "beacon"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** A believable, everyday decoy message. */
export function randomDecoyMessage(): string {
  return pick(DECOY_MESSAGES);
}

/** A memorable-but-strong decoy password (word-word-#### form). */
export function randomDecoyPassword(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${n}`;
}
