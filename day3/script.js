let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const CATEGORIES = ["personal", "work", "study"];

// Lower-cases, trims and collapses repeated spaces
function normalise(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function searchNotes(word) {
  const search = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(search));
}

function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category]) {
      counts[note.category] += 1;
    } else {
      counts[note.category] = 1;
    }
  }
  return counts;
}

function getSummary() {
  const total = notes.length;
  const word = total === 1 ? "note" : "notes";
  if (total === 0) {
    return `0 ${word}.`;
  }
  const counts = countByCategory();
  const parts = [];
  for (const category of CATEGORIES) {
    if (counts[category]) {
      parts.push(`${counts[category]} ${category}`);
    }
  }
  return `${total} ${word}: ${parts.join(", ")}.`;
}

function isDuplicate(text) {
  const target = normalise(text);
  return notes.some((note) => normalise(note.text) === target);
}

function addNote(text, category) {
  const cleaned = text.trim();
  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("Not added: text must be 1-200 characters.");
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log("Not added: duplicate note.");
    return false;
  }
  if (!CATEGORIES.includes(category)) {
    console.log("Not added: category must be personal, work or study.");
    return false;
  }
  const nextId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  notes.push({ id: nextId, text: cleaned, category: category });
  return true;
}

// ---------- Tests ----------

// searchNotes
console.log(searchNotes("JAVASCRIPT")); // [ { id: 4, text: "Revise JavaScript arrays", category: "study" } ]
console.log(searchNotes("the")); // [ note 2, note 3 ] (two notes)
console.log(searchNotes("zzz")); // [] (no results)

// longestNote
console.log(longestNote()); // { id: 3, text: "Email the project report to Grace", category: "work" }
const backup = notes;
notes = [];
console.log(longestNote()); // null (empty array)
notes = backup;

// countByCategory
console.log(countByCategory()); // { personal: 2, study: 2, work: 1 }
notes = [];
console.log(countByCategory()); // {} (empty array)
notes = backup;

// getSummary
console.log(getSummary()); // "5 notes: 2 personal, 1 work, 2 study."
notes = [{ id: 1, text: "Only one", category: "work" }];
console.log(getSummary()); // "1 note: 1 work."
notes = [];
console.log(getSummary()); // "0 notes."
notes = backup;

// isDuplicate
console.log(isDuplicate("buy milk and bread")); // true (ignores case)
console.log(isDuplicate("  BUY   Milk and   bread  ")); // true (ignores extra spaces)
console.log(isDuplicate("Buy eggs")); // false

// addNote
console.log(addNote("Plan weekend trip", "personal")); // true
console.log(addNote("buy milk and bread", "personal")); // logs "Not added: duplicate note." then false
console.log(addNote("   ", "work")); // logs "Not added: text must be 1-200 characters." then false
console.log(addNote("x".repeat(201), "work")); // logs "Not added: text must be 1-200 characters." then false
console.log(addNote("Read chapter 4", "hobby")); // logs "Not added: category must be personal, work or study." then false
console.log(getSummary()); // "6 notes: 3 personal, 1 work, 2 study."
