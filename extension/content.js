/**
 * PMPilot Extension Content Script
 * Injects non-intrusive floating Associate PM indicator and enables one-click context capture.
 */

(function () {
  if (window.__pmpilot_injected) return;
  window.__pmpilot_injected = true;

  // Detect domain
  const host = window.location.hostname;
  let detectedType = "Web";
  if (host.includes("figma.com")) detectedType = "Figma";
  else if (host.includes("notion.so")) detectedType = "Notion";
  else if (host.includes("linear.app")) detectedType = "Linear";
  else if (host.includes("stripe.com") || host.includes("shopify.com") || host.includes("amazon.com")) detectedType = "Competitor";

  // Create floating launcher
  const floatingBtn = document.createElement("div");
  floatingBtn.id = "pmpilot-floating-pill";
  floatingBtn.innerHTML = `
    <div style="position: fixed; bottom: 20px; right: 20px; z-index: 999999; display: flex; align-items: center; gap: 8px; background: #0c1410; border: 1px solid #22352a; padding: 8px 14px; border-radius: 9999px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); font-family: -apple-system, sans-serif; cursor: pointer; color: #e5ece8; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'">
      <div style="background: #1f3b2d; color: #5eead4; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;">✦</div>
      <span style="font-size: 12px; font-weight: 600;">Associate PM</span>
      <span style="font-size: 10px; background: #1b2e23; color: #a7f3d0; padding: 2px 6px; border-radius: 4px;">${detectedType}</span>
    </div>
  `;

  floatingBtn.addEventListener("click", () => {
    fetch("http://localhost:4000/api/session/session_moonshot_checkout/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "capture_evidence",
        payload: {
          sourceName: document.title,
          sourceType: detectedType,
          url: window.location.href,
          content: (document.body.innerText || "").substring(0, 3000)
        }
      })
    })
      .then(() => {
        alert("✓ Page context captured into PMPilot Associate PM Evidence Graph!");
      })
      .catch(() => {
        alert("PMPilot is watching this tab. Open http://localhost:5173 to inspect Evidence Graph.");
      });
  });

  document.body.appendChild(floatingBtn);
})();
