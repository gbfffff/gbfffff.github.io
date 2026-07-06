(function() {
  // Casual gate only -- keeps out randoms/crawlers, not a real secret.
  // The code is stored as a SHA-256 hash (not plaintext) so it isn't
  // copy-paste readable from view-source, but this is still defeatable by
  // anyone willing to read the check logic or brute-force short codes --
  // it's not a substitute for real server-side auth.
  //
  // To change the code: hash the new UPPERCASE code with e.g.
  // `python3 -c "import hashlib;print(hashlib.sha256(b'YOURCODE').hexdigest())"`
  // and replace CODE_LENGTH / CODE_HASH below.
  const GATE_KEY    = "gbf_gate_ok";
  const CODE_LENGTH = 20;
  const CODE_HASH   = "6b81a63c5b8c5aba8c3bec7d395cf82ea0f8292d8a05a1dc58225abdc0feaa2d";

  if (localStorage.getItem(GATE_KEY) === "1") {
    document.getElementById("gate-overlay").classList.add("hidden");
    return;
  }

  const otpEl   = document.getElementById("gate-otp");
  const errorEl = document.getElementById("gate-error");
  const submit  = document.getElementById("gate-submit");

  const cells = [];
  for (let i = 0; i < CODE_LENGTH; i++) {
    const cell = document.createElement("input");
    cell.type = "text";
    cell.className = "gate-otp-cell";
    cell.maxLength = 1;
    cell.autocomplete = "off";
    cell.inputMode = "text";
    otpEl.appendChild(cell);
    cells.push(cell);
  }

  function sanitize(ch) {
    return (ch || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  cells.forEach((cell, i) => {
    cell.addEventListener("input", () => {
      cell.value = sanitize(cell.value).slice(-1);
      errorEl.style.display = "none";
      if (cell.value && i < cells.length - 1) cells[i + 1].focus();
    });
    cell.addEventListener("keydown", e => {
      if (e.key === "Backspace" && !cell.value && i > 0) {
        cells[i - 1].focus();
      } else if (e.key === "ArrowLeft" && i > 0) {
        e.preventDefault(); cells[i - 1].focus();
      } else if (e.key === "ArrowRight" && i < cells.length - 1) {
        e.preventDefault(); cells[i + 1].focus();
      } else if (e.key === "Enter") {
        e.preventDefault(); tryCode();
      }
    });
    cell.addEventListener("paste", e => {
      e.preventDefault();
      const chars = sanitize(e.clipboardData.getData("text")).split("");
      cells.forEach(c => c.value = "");
      chars.forEach((ch, j) => { if (cells[j]) cells[j].value = ch; });
      const next = Math.min(chars.length, cells.length - 1);
      cells[next].focus();
    });
  });

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function tryCode() {
    const code = cells.map(c => c.value).join("");
    const hash = await sha256Hex(code);
    if (hash === CODE_HASH) {
      localStorage.setItem(GATE_KEY, "1");
      document.getElementById("gate-overlay").classList.add("hidden");
    } else {
      errorEl.style.display = "block";
      cells.forEach(c => c.value = "");
      cells[0].focus();
    }
  }
  submit.addEventListener("click", tryCode);
  cells[0].focus();
})();
