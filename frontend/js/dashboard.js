

(function () {
    "use strict";

    const token = localStorage.getItem("sr_token");
    const userStr = localStorage.getItem("sr_user");
    const user = userStr ? JSON.parse(userStr) : null;

    if (!token || !user) {
        localStorage.clear();
        window.location.href = "index.html";
        return;
    }

    const isAdmin = user.role === "admin";
    const API_HEADERS = { "Authorization": "Bearer " + token };
    let currentDataset = "cifar100";

    document.getElementById("userInfo").textContent = user.first_name + " " + user.last_name + " (" + user.role + ")";
    if (isAdmin) {
        document.getElementById("cpuCard").style.display = "";
        document.getElementById("ramCard").style.display = "";
    }

    document.querySelectorAll(".nav-link[data-tab]").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(s => s.classList.remove("active"));
            link.classList.add("active");
            document.getElementById(link.dataset.tab + "-tab").classList.add("active");
        });
    });

    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.clear();
        window.location.href = "index.html";
    });

    const dsSelect = document.getElementById("viewDatasetSelect");
    if (dsSelect) {
        dsSelect.value = currentDataset;
        dsSelect.addEventListener("change", (e) => {
            currentDataset = e.target.value;
            console.log("Dataset changed to:", currentDataset);
            poll();
        });
    }

    Chart.defaults.color = "#94a3b8";
    Chart.defaults.borderColor = "rgba(51,65,85,0.5)";

    function makeChart(id, label) {
        return new Chart(document.getElementById(id).getContext("2d"), {
            type: "line",
            data: { datasets: [] },
            options: {
                responsive: true,
                animation: false,
                interaction: { mode: "index", intersect: false },
                scales: {
                    x: { type: "linear", title: { display: true, text: "Epoch" } },
                    y: { title: { display: true, text: label }, beginAtZero: true },
                },
                plugins: { legend: { position: "bottom" } },
            },
        });
    }

    const charts = {
        accuracy: makeChart("accuracyChart", "Précision"),
        speed: makeChart("speedChart", "Temps (s)"),
        cpu: isAdmin ? makeChart("cpuChart", "CPU (%)") : null,
        ram: isAdmin ? makeChart("ramChart", "RAM (%)") : null,
    };

    function updateChart(name, data, field) {
        if (!data || !charts[name]) return;

        const filtered = data.filter(m => m.dataset === currentDataset);
        const pytorch = filtered.filter(m => m.library === "pytorch").sort((a, b) => a.epoch - b.epoch);
        const tensorflow = filtered.filter(m => m.library === "tensorflow").sort((a, b) => a.epoch - b.epoch);

        const datasets = [];
        if (pytorch.length) {
            datasets.push({
                label: "PyTorch",
                data: pytorch.map(m => ({ x: m.epoch, y: m[field] })),
                borderColor: "#3b82f6",
                backgroundColor: "rgba(59,130,246,0.15)",
                borderWidth: 2,
                tension: 0.3,
                fill: true,
            });
        }
        if (tensorflow.length) {
            datasets.push({
                label: "TensorFlow",
                data: tensorflow.map(m => ({ x: m.epoch, y: m[field] })),
                borderColor: "#ef4444",
                backgroundColor: "rgba(239,68,68,0.15)",
                borderWidth: 2,
                tension: 0.3,
                fill: true,
            });
        }

        charts[name].data.datasets = datasets;
        charts[name].update("none");
    }

    function updateStatus(sessions) {
        const el = document.getElementById("training-status");
        if (!sessions || !sessions.length) {
            el.innerHTML = '<span class="status-badge pending"><span class="status-dot"></span>Aucun training</span>';
            return;
        }
        el.innerHTML = sessions.map(s => {
            const lib = s.library === "pytorch" ? "PyTorch" : "TensorFlow";
            const ds = s.dataset === "cifar100" ? "CIFAR-100" : "Fashion MNIST";
            const cls = s.status === "completed" ? "completed" : "running";
            return `<span class="status-badge ${cls}"><span class="status-dot"></span>${lib}/${ds}</span>`;
        }).join("");
    }

    async function poll() {
        try {
            const [acc, spd, sess, cpu, ram] = await Promise.all([
                fetch("/api/metrics/accuracy", { headers: API_HEADERS }).then(r => r.json()),
                fetch("/api/metrics/speed", { headers: API_HEADERS }).then(r => r.json()),
                fetch("/api/training/sessions", { headers: API_HEADERS }).then(r => r.json()),
                isAdmin ? fetch("/api/metrics/cpu", { headers: API_HEADERS }).then(r => r.json()) : null,
                isAdmin ? fetch("/api/metrics/ram", { headers: API_HEADERS }).then(r => r.json()) : null,
            ]);

            updateChart("accuracy", acc, "accuracy");
            updateChart("speed", spd, "epoch_time");
            updateStatus(sess);
            if (isAdmin) {
                updateChart("cpu", cpu, "cpu_usage");
                updateChart("ram", ram, "ram_usage");
            }
        } catch (err) {
            console.error("Error:", err);
        }
    }

    poll();
    setInterval(poll, 5000);

    
})();
