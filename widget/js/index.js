
    <script>
        // Simulated process data
        const processes = [
            { name: 'Chrome', baseCpu: 15, baseRam: 25, variance: 5 },
            { name: 'VS Code', baseCpu: 8, baseRam: 12, variance: 3 },
            { name: 'Node.js', baseCpu: 12, baseRam: 8, variance: 4 },
            { name: 'Slack', baseCpu: 5, baseRam: 10, variance: 2 },
            { name: 'Docker', baseCpu: 10, baseRam: 15, variance: 3 },
            { name: 'System', baseCpu: 8, baseRam: 5, variance: 2 },
            { name: 'Terminal', baseCpu: 2, baseRam: 3, variance: 1 }
        ];

        // Data storage
        let cpuHistory = [];
        let ramHistory = [];
        let processHistory = [];
        const maxHistory = 60; // 60 seconds of data

        // Simple ML model using TensorFlow.js
        let cpuModel, ramModel;

        async function createModel() {
            const model = tf.sequential({
                layers: [
                    tf.layers.dense({ inputShape: [10], units: 16, activation: 'relu' }),
                    tf.layers.dense({ units: 8, activation: 'relu' }),
                    tf.layers.dense({ units: 1, activation: 'linear' })
                ]
            });
            model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });
            return model;
        }

        async function initModels() {
            cpuModel = await createModel();
            ramModel = await createModel();
        }

        function generateProcessUsage() {
            return processes.map(p => ({
                name: p.name,
                cpu: Math.max(0, Math.min(100, p.baseCpu + (Math.random() - 0.5) * p.variance * 2)),
                ram: Math.max(0, Math.min(100, p.baseRam + (Math.random() - 0.5) * p.variance * 2))
            }));
        }

        function updateProcessList(procs) {
            const list = document.getElementById('processList');
            list.innerHTML = procs.map(p => `
                <div class="process-item">
                    <span class="process-name">${p.name}</span>
                    <span class="process-usage">CPU: ${p.cpu.toFixed(1)}%</span>
                    <span class="process-usage">RAM: ${p.ram.toFixed(1)}%</span>
                </div>
            `).join('');
        }

        function prepareTrainingData(history) {
            if (history.length < 11) return null;
            
            const X = [];
            const y = [];
            
            for (let i = 0; i < history.length - 10; i++) {
                X.push(history.slice(i, i + 10));
                y.push([history[i + 10]]);
            }
            
            return { X: tf.tensor2d(X), y: tf.tensor2d(y) };
        }

        async function trainAndPredict(model, history) {
            if (history.length < 30) {
                return history[history.length - 1];
            }

            const data = prepareTrainingData(history);
            if (!data) return history[history.length - 1];

            await model.fit(data.X, data.y, {
                epochs: 5,
                verbose: 0,
                shuffle: true
            });

            data.X.dispose();
            data.y.dispose();

            const lastTen = tf.tensor2d([history.slice(-10)]);
            const prediction = model.predict(lastTen);
            const value = (await prediction.data())[0];
            
            lastTen.dispose();
            prediction.dispose();

            return Math.max(0, Math.min(100, value));
        }

        // Chart setup
        const ctx = document.getElementById('trendChart').getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'CPU Usage',
                        data: [],
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'CPU Predicted',
                        data: [],
                        borderColor: '#ffa726',
                        backgroundColor: 'rgba(255, 167, 38, 0.1)',
                        borderDash: [5, 5],
                        tension: 0.4
                    },
                    {
                        label: 'RAM Usage',
                        data: [],
                        borderColor: '#764ba2',
                        backgroundColor: 'rgba(118, 75, 162, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'RAM Predicted',
                        data: [],
                        borderColor: '#ff7043',
                        backgroundColor: 'rgba(255, 112, 67, 0.1)',
                        borderDash: [5, 5],
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });

        async function updateMetrics() {
            const procs = generateProcessUsage();
            const cpuUsage = procs.reduce((sum, p) => sum + p.cpu, 0) / procs.length;
            const ramUsage = procs.reduce((sum, p) => sum + p.ram, 0) / procs.length;

            cpuHistory.push(cpuUsage);
            ramHistory.push(ramUsage);
            processHistory.push(procs);

            if (cpuHistory.length > maxHistory) {
                cpuHistory.shift();
                ramHistory.shift();
                processHistory.shift();
            }

            // Update current values
            document.getElementById('cpuCurrent').textContent = `${cpuUsage.toFixed(1)}%`;
            document.getElementById('ramCurrent').textContent = `${ramUsage.toFixed(1)}%`;
            document.getElementById('cpuProgress').style.width = `${cpuUsage}%`;
            document.getElementById('ramProgress').style.width = `${ramUsage}%`;

            // ML predictions
            if (cpuHistory.length >= 30) {
                const cpuPred = await trainAndPredict(cpuModel, cpuHistory);
                const ramPred = await trainAndPredict(ramModel, ramHistory);
                
                document.getElementById('cpuPredicted').textContent = `${cpuPred.toFixed(1)}%`;
                document.getElementById('ramPredicted').textContent = `${ramPred.toFixed(1)}%`;
            }

            updateProcessList(procs);
            updateChart();
        }

        function updateChart() {
            const labels = cpuHistory.map((_, i) => `${i}s`);
            chart.data.labels = labels;
            chart.data.datasets[0].data = cpuHistory;
            chart.data.datasets[2].data = ramHistory;

            if (cpuHistory.length > 0) {
                chart.data.datasets[1].data = [...Array(cpuHistory.length - 1).fill(null), 
                    parseFloat(document.getElementById('cpuPredicted').textContent)];
                chart.data.datasets[3].data = [...Array(ramHistory.length - 1).fill(null), 
                    parseFloat(document.getElementById('ramPredicted').textContent)];
            }

            chart.update('none');
        }

        // Initialize
        initModels().then(() => {
            updateMetrics();
            setInterval(updateMetrics, 1000);
        });
    </script>

