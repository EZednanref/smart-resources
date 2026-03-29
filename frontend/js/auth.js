/* ═══════════════════════════════════════════
   Smart Resources – Auth (login + register)
   ═══════════════════════════════════════════ */

(function () {
    "use strict";

    // Redirect to dashboard if already logged in
    const token = localStorage.getItem("sr_token");
    if (token) {
        window.location.href = "dashboard.html";
        return;
    }

    /* ── Login ────────────────────────────── */
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const errEl = document.getElementById("error-message");
            errEl.textContent = "";

            const username = document.getElementById("username").value.trim();
            const password = document.getElementById("password").value;

            try {
                const res = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, password }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    errEl.textContent = data.detail || "Identifiants incorrects";
                    return;
                }

                const data = await res.json();
                localStorage.setItem("sr_token", data.access_token);
                localStorage.setItem("sr_user", JSON.stringify(data.user));
                window.location.href = "dashboard.html";
            } catch (err) {
                errEl.textContent = "Erreur de connexion au serveur";
            }
        });
    }

    /* ── Register ─────────────────────────── */
    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const errEl = document.getElementById("error-message");
            const okEl  = document.getElementById("success-message");
            errEl.textContent = "";
            okEl.textContent  = "";

            const payload = {
                last_name:  document.getElementById("last_name").value.trim(),
                first_name: document.getElementById("first_name").value.trim(),
                username:   document.getElementById("username").value.trim(),
                password:   document.getElementById("password").value,
            };

            try {
                const res = await fetch("/api/auth/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                if (!res.ok) {
                    const data = await res.json();
                    errEl.textContent = data.detail || "Erreur lors de l'inscription";
                    return;
                }

                okEl.textContent = "Compte créé ! Redirection…";
                setTimeout(() => { window.location.href = "index.html"; }, 1500);
            } catch (err) {
                errEl.textContent = "Erreur de connexion au serveur";
            }
        });
    }
})();
