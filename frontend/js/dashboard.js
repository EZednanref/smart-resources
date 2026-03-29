/* ═══════════════════════════════════════════
   Smart Resources – Dashboard
   ═══════════════════════════════════════════ */

(function () {
    "use strict";

    /* ── Auth guard ───────────────────────── */
    const token = localStorage.getItem("sr_token");
    const user  = JSON.parse(localStorage.getItem("sr_user") || "null");

    if (!token || !user) {
        window.location.href = "index.html";
        return;
    }

    const isAdmin = user.role === "admin";

    /* ── UI setup ─────────────────────────── */
    document.getElementById("userInfo").textContent =
        user.first_name + " " + user.last_name + " (" + user.role + ")";

    if (isAdmin) {
        document.getElementById("cpuCard").style.display = "";
        document.getElementById("ramCard").style.display = "";
    }

    /* ── Tab navigation ───────────────────── */
    const navLinks    = document.querySelectorAll(".nav-link[data-tab]");
    const tabSections = document.querySelectorAll(".tab-content");

    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove("active"));
            tabSections.forEach(s => s.classList.remove("active"));
            link.classList.add("active");
            document.getElementById(link.dataset.tab + "-tab").classList.add("active");
        });
    });

    /* ── Logout ───────────────────────────── */
    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("sr_token");
        localStorage.removeItem("sr_user");
        window.location.href = "index.html";
    });

    /* ── Helpers ───────────────────────────── */
    const API_HEADERS = { "Authorization": "Bearer " + token };

    const COLORS = {
        "pytorch / fashion_mnist":     { border: "#ff6384", bg: "rgba(255,99,132,0.15)" },
        "pytorch / cifar100":          { border: "#ff9f40", bg: "rgba(255,159,64,0.15)" },
        "tensorflow / fashion_mnist":  { border: "#36a2eb", bg: "rgba(54,162,235,0.15)" },
        "tensorflow / cifar100":       { border: "#4bc0c0", bg: "rgba(75,192,192,0.15)" },
    };

    function getColor(key) {
        return COLORS[key] || { border: "#a78bfa", bg: "rgba(167,139,250,0.15)" };
    }

    /* ── Chart.js defaults ────────────────── */
    Chart.defaults.color = "#94a3b8";
    Chart.defaults.borderColor = "rgba(51,65,85,0.5)";

    function makeChart(canvasId, yLabel) {
        const ctx = document.getElementById(canvasId).getContext("2d");
        return new Chart(ctx, {
            type: "line",
            data: { datasets: [] },
            options: {
                responsive: true,
                animation: { duration: 400 },
                interaction: { mode: "index", intersect: false },
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: "Epoch" },
                        ticks: { stepSize: 1 },
                    },
                    y: {
                        title: { display: true, text: yLabel },
                        beginAtZero: true,
                    },
                },
                plugins: {
                    legend: { position: "bottom", labels: { usePointStyle: true } },
                },
            },
        });
    }

    const accuracyChart = makeChart("accuracyChart", "Précision");
    const speedChart    = makeChart("speedChart", "Temps (s)");
    let cpuChart = null;
    let ramChart = null;

    if (isAdmin) {
        cpuChart = makeChart("cpuChart", "CPU (%)");
        ramChart = makeChart("ramChart", "RAM (%)");
    }

    /* ── Group metrics by library/dataset ─── */
    function groupMetrics(data) {
        const groups = {};
        data.forEach(m => {
            const key = m.library + " / " + m.dataset;
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
        });
        return groups;
    }

    /* ── Update a chart with new data ─────── */
    function updateChart(chart, data, valueKey) {
        if (!chart) return;
        const groups = groupMetrics(data);
        const datasets = [];

        for (const [key, metrics] of Object.entries(groups)) {
            const sorted = metrics.slice().sort((a, b) => a.epoch - b.epoch);
            const color = getColor(key);
            datasets.push({
                label: key,
                data: sorted.map(m => ({ x: m.epoch, y: m[valueKey] })),
                borderColor: color.border,
                backgroundColor: color.bg,
                fill: true,
                tension: 0.35,
                pointRadius: 3,
                borderWidth: 2,
            });
        }

        chart.data.datasets = datasets;
        chart.update("none"); // skip animation for perf
    }

    /* ── Update training status badges ────── */
    function updateStatus(sessions) {
        const container = document.getElementById("training-status");
        if (!sessions || sessions.length === 0) {
            container.innerHTML = '<span class="status-badge pending"><span class="status-dot"></span>En attente de données…</span>';
            return;
        }
        container.innerHTML = sessions.map(s => {
            const label = s.library + " / " + s.dataset;
            const cls   = s.status === "completed" ? "completed" : "running";
            const info  = s.status === "completed"
                ? "Terminé"
                : "Epoch " + (s.current_epoch || 0) + "/" + (s.total_epochs || "?");
            return '<span class="status-badge ' + cls + '"><span class="status-dot"></span>' + label + ' – ' + info + '</span>';
        }).join("");
    }

    /* ── Polling loop ─────────────────────── */
    async function fetchData(url) {
        const res = await fetch(url, { headers: API_HEADERS });
        if (res.status === 401) {
            // Token expired
            localStorage.removeItem("sr_token");
            localStorage.removeItem("sr_user");
            window.location.href = "index.html";
            return null;
        }
        if (!res.ok) return null;
        return res.json();
    }

    async function poll() {
        try {
            // Parallel requests
            const promises = [
                fetchData("/api/metrics/accuracy"),
                fetchData("/api/metrics/speed"),
                fetchData("/api/training/sessions"),
            ];

            if (isAdmin) {
                promises.push(fetchData("/api/metrics/cpu"));
                promises.push(fetchData("/api/metrics/ram"));
            }

            const results = await Promise.all(promises);
            const [accData, speedData, sessions] = results;

            if (accData)   updateChart(accuracyChart, accData, "accuracy");
            if (speedData) updateChart(speedChart, speedData, "epoch_time");
            if (sessions)  updateStatus(sessions);

            if (isAdmin) {
                const cpuData = results[3];
                const ramData = results[4];
                if (cpuData) updateChart(cpuChart, cpuData, "cpu_usage");
                if (ramData) updateChart(ramChart, ramData, "ram_usage");
            }
        } catch (err) {
            console.error("Polling error:", err);
        }
    }

    // Initial fetch + interval (max 5 seconds as required)
    poll();
    setInterval(poll, 5000);
})();
