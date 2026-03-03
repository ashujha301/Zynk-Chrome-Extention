const runBtn = document.getElementById("run");
const statusEl = document.getElementById("status");
const input = document.getElementById("command");

runBtn.addEventListener("click", () => {
  const command = input.value.trim();
  if (!command) return;

  statusEl.textContent = "Executing...";

  chrome.runtime.sendMessage(
    { type: "EXECUTE_COMMAND", command },
    (resp) => {
      if (resp?.error) {
        statusEl.textContent = "Error: " + resp.error;
      } else {
        statusEl.textContent = "Success";
      }
    }
  );
});