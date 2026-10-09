const USERS_URL = "https://jsonplaceholder.typicode.com/users";

const loadButton = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusEl = document.getElementById("status");
const usersList = document.getElementById("users-list");

let allUsers = [];

async function loadUsers() {
  loadButton.disabled = true;
  statusEl.textContent = "Loading users...";
  usersList.replaceChildren();

  try {
    const response = await fetch(USERS_URL);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    allUsers = await response.json();
    filterInput.value = "";
    renderUsers(allUsers);
    statusEl.textContent = `Loaded ${allUsers.length} users.`;
  } catch (error) {
    allUsers = [];
    statusEl.textContent = `Could not load users: ${error.message}`;
  } finally {
    loadButton.disabled = false;
  }
}

function renderUsers(list) {
  usersList.replaceChildren();

  list.forEach((user) => {
    const item = document.createElement("li");
    const name = document.createElement("strong");
    const details = document.createElement("span");

    name.textContent = user.name;
    details.textContent = ` - ${user.email} - ${user.address.city} - ${user.company.name}`;

    item.append(name, details);
    usersList.appendChild(item);
  });
}

function filterUsers() {
  if (allUsers.length === 0) return;

  const text = filterInput.value.trim().toLowerCase();

  const matches = allUsers.filter((user) =>
    user.name.toLowerCase().includes(text),
  );

  renderUsers(matches);

  statusEl.textContent =
    matches.length === 0
      ? "No users match your filter."
      : `Showing ${matches.length} of ${allUsers.length} users.`;
}

loadButton.addEventListener("click", loadUsers);
filterInput.addEventListener("input", filterUsers);
