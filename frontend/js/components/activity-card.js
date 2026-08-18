function formatType(type) {
  if (!type) return "Activity";
  return type.charAt(0) + type.slice(1).toLowerCase();
}

// `records` is docs/api-contract.md's activity shape:
// [{ date, exercises: [{ type, duration_minutes, calories }] }].
export function renderActivity(container, records) {
  container.innerHTML = "";

  const flattened = [];
  for (const day of records) {
    for (const ex of day.exercises) {
      flattened.push({ date: day.date, ...ex });
    }
  }

  if (flattened.length === 0) {
    const empty = document.createElement("div");
    empty.className = "card-sublabel";
    empty.textContent = "no activity in range";
    container.appendChild(empty);
    return;
  }

  flattened.sort((a, b) => (a.date < b.date ? 1 : -1));

  const list = document.createElement("ul");
  list.className = "activity-list";
  for (const ex of flattened.slice(0, 8)) {
    const item = document.createElement("li");

    const type = document.createElement("span");
    type.className = "activity-type";
    type.textContent = formatType(ex.type);
    item.appendChild(type);

    const meta = document.createElement("span");
    meta.className = "activity-meta";
    const parts = [ex.date];
    if (typeof ex.duration_minutes === "number") parts.push(`${ex.duration_minutes} min`);
    if (typeof ex.calories === "number") parts.push(`${ex.calories} cal`);
    meta.textContent = parts.join(" · ");
    item.appendChild(meta);

    list.appendChild(item);
  }
  container.appendChild(list);
}
