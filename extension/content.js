chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "EXECUTE_STEPS") {
    executeSteps(message.steps);
  }
});

async function executeSteps(steps) {
  for (const step of steps) {

    if (step.action === "navigate") {
      window.location.href = step.url;
      await delay(3000);
    }

    if (step.action === "click_text") {
      const elements = Array.from(document.querySelectorAll("*"));
      const match = elements.find(el => el.innerText === step.text);

      if (match) {
        match.click();
        await delay(2000);
      }
    }

    if (step.action === "scroll") {
      window.scrollBy({
        top: step.direction === "down" ? 500 : -500,
        behavior: "smooth"
      });
      await delay(1000);
    }
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}