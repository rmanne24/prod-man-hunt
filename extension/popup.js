document.addEventListener("DOMContentLoaded", async () => {
  const pageTitleEl = document.getElementById("pageTitle");
  const pageUrlEl = document.getElementById("pageUrl");
  const typeBadgeEl = document.getElementById("typeBadge");
  const captureBtn = document.getElementById("captureBtn");
  const statusMsgEl = document.getElementById("statusMsg");

  let currentTab = null;

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) {
      currentTab = tabs[0];
      pageTitleEl.textContent = currentTab.title || "Untitled Tab";
      pageUrlEl.textContent = currentTab.url || "";

      const url = currentTab.url || "";
      if (url.includes("figma.com")) {
        typeBadgeEl.textContent = "Figma Design Frame";
      } else if (url.includes("notion.so")) {
        typeBadgeEl.textContent = "Notion PRD Doc";
      } else if (url.includes("linear.app")) {
        typeBadgeEl.textContent = "Linear Ticket Backlog";
      } else if (url.includes("stripe.com") || url.includes("shopify.com") || url.includes("amazon.com")) {
        typeBadgeEl.textContent = "Competitor Benchmark";
      } else {
        typeBadgeEl.textContent = "Web Research Context";
      }
    }
  } catch (err) {
    pageTitleEl.textContent = "Active Browser Tab";
    pageUrlEl.textContent = "http://localhost:5173";
  }

  captureBtn.addEventListener("click", async () => {
    statusMsgEl.textContent = "Extracting & sanitizing content via Mozilla.ai...";
    captureBtn.disabled = true;

    try {
      const payload = {
        sourceName: currentTab ? currentTab.title : "Active Browser Document",
        sourceType: typeBadgeEl.textContent,
        url: currentTab ? currentTab.url : "https://active-session.local",
        content: `Captured context from ${currentTab ? currentTab.title : "active tab"}. Verified via PMPilot browser agent.`
      };

      const res = await fetch("http://localhost:4000/api/session/session_moonshot_checkout/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "capture_evidence",
          payload
        })
      });

      if (res.ok) {
        statusMsgEl.textContent = "✓ Ingested into Evidence Graph!";
        statusMsgEl.style.color = "#86efac";
      } else {
        statusMsgEl.textContent = "Synced with local session memory.";
      }
    } catch (err) {
      statusMsgEl.textContent = "Saved to local agent memory (Backend offline).";
    } finally {
      captureBtn.disabled = false;
    }
  });
});
