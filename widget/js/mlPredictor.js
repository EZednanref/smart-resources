// =============================================================================
// mlPredictor.js
// =============================================================================

const tf = require('@tensorflow/tfjs-node');

class MLPredictor {
  constructor() {
    this.model = null;
    this.featureEngineer = new FeatureEngineer();
    this.sequenceLength = 30;
    this.featureCount = 26;
    this.dataBuffer = [];
    this.futureBuffer = [];
    this.metrics = {
      predictions: [],
      errors: [],
      mae: 0,
      rmse: 0
    };
    this.isTraining = false;
    this.trainCounter = 0;
  }

  async initialize() {
    console.log('🧠 Initialisation du modèle ML...');
    this.model = this.buildModel();
    console.log('✅ Modèle ML prêt');
  }

  buildModel() {
    const model = tf.sequential();
    
    model.add(tf.layers.lstm({
      units: 64,
      returnSequences: true,
      inputShape: [this.sequenceLength, this.featureCount]
    }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    
    model.add(tf.layers.lstm({
      units: 32,
      returnSequences: false
    }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    
    model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 2, activation: 'sigmoid' }));
    
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae']
    });
    
    return model;
  }

  addData(currentData) {
    const features = this.featureEngineer.extractFeatures(currentData);
    this.dataBuffer.push(features);
    
    // Garder seulement les 1000 derniers
    if (this.dataBuffer.length > 1000) {
      this.dataBuffer.shift();
      if (this.futureBuffer.length > 0) {
        this.futureBuffer.shift();
      }
    }
  }

  addFutureValue(cpu, ram) {
    this.futureBuffer.push([cpu / 100, ram / 100]);
  }

  async train() {
    if (this.isTraining) return;
    if (this.dataBuffer.length < this.sequenceLength + 30) {
      console.log(`⏳ En attente de plus de données (${this.dataBuffer.length}/${this.sequenceLength + 30})`);
      return;
    }
    if (this.futureBuffer.length < 10) {
      console.log('⏳ En attente de valeurs futures pour l\'entraînement');
      return;
    }

    this.isTraining = true;
    this.trainCounter++;
    
    console.log(`🎓 Entraînement #${this.trainCounter} (${this.dataBuffer.length} samples)...`);

    try {
      const sequences = [];
      const targets = [];
      
      // Créer séquences d'entraînement
      const maxIdx = Math.min(this.dataBuffer.length - this.sequenceLength, this.futureBuffer.length);
      
      for (let i = 0; i < maxIdx - 1; i++) {
        sequences.push(this.dataBuffer.slice(i, i + this.sequenceLength));
        targets.push(this.futureBuffer[i]);
      }

      if (sequences.length < 10) {
        console.log('⏳ Pas assez de séquences complètes');
        this.isTraining = false;
        return;
      }

      const xs = tf.tensor3d(sequences);
      const ys = tf.tensor2d(targets);

      const history = await this.model.fit(xs, ys, {
        epochs: 5,
        batchSize: 16,
        validationSplit: 0.2,
        verbose: 0,
        shuffle: true
      });

      const finalLoss = history.history.loss[history.history.loss.length - 1];
      const finalValLoss = history.history.val_loss ? history.history.val_loss[history.history.val_loss.length - 1] : finalLoss;
      
      this.metrics.mae = finalLoss;
      
      console.log(`✅ Entraînement terminé: loss=${finalLoss.toFixed(4)}, val_loss=${finalValLoss.toFixed(4)}`);

      xs.dispose();
      ys.dispose();

    } catch (error) {
      console.error('❌ Erreur entraînement:', error.message);
    } finally {
      this.isTraining = false;
    }
  }

  async predict() {
    if (!this.model || this.dataBuffer.length < this.sequenceLength) {
      return null;
    }

    try {
      const sequence = this.dataBuffer.slice(-this.sequenceLength);
      const input = tf.tensor3d([sequence]);
      const prediction = this.model.predict(input);
      const [cpu, ram] = await prediction.data();

      input.dispose();
      prediction.dispose();

      const result = {
        cpu: cpu * 100,
        ram: ram * 100,
        confidence: this.computeConfidence(),
        timestamp: Date.now()
      };

      this.metrics.predictions.push(result);
      if (this.metrics.predictions.length > 100) {
        this.metrics.predictions.shift();
      }

      return result;

    } catch (error) {
      console.error('❌ Erreur prédiction:', error.message);
      return null;
    }
  }

  recordActual(cpu, ram) {
    if (this.metrics.predictions.length === 0) return;
    
    const lastPrediction = this.metrics.predictions[this.metrics.predictions.length - 1];
    const timeDiff = Date.now() - lastPrediction.timestamp;
    
    // Si la prédiction date de ~30 secondes
    if (timeDiff >= 28000 && timeDiff <= 32000) {
      const error = {
        cpu: Math.abs(lastPrediction.cpu - cpu),
        ram: Math.abs(lastPrediction.ram - ram),
        timestamp: Date.now()
      };
      
      this.metrics.errors.push(error);
      if (this.metrics.errors.length > 100) {
        this.metrics.errors.shift();
      }

      // Calculer MAE et RMSE
      if (this.metrics.errors.length > 0) {
        const cpuErrors = this.metrics.errors.map(e => e.cpu);
        const ramErrors = this.metrics.errors.map(e => e.ram);
        
        this.metrics.mae = (this.mean(cpuErrors) + this.mean(ramErrors)) / 2;
        this.metrics.rmse = Math.sqrt((this.mean(cpuErrors.map(e => e * e)) + this.mean(ramErrors.map(e => e * e))) / 2);
      }
    }
  }

  computeConfidence() {
    if (this.metrics.errors.length < 5) return 0.5;
    
    const avgError = this.metrics.mae;
    // Confidence inversement proportionnelle à l'erreur
    // Erreur de 0% = 100% confidence, erreur de 20% = 0% confidence
    return Math.max(0, Math.min(1, 1 - (avgError / 20)));
  }

  mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  getStatus() {
    return {
      initialized: this.model !== null,
      dataPoints: this.dataBuffer.length,
      futurePoints: this.futureBuffer.length,
      trainingCount: this.trainCounter,
      isTraining: this.isTraining,
      mae: this.metrics.mae.toFixed(4),
      rmse: this.metrics.rmse.toFixed(4),
      confidence: (this.computeConfidence() * 100).toFixed(1) + '%',
      recentPredictions: this.metrics.predictions.slice(-5),
      recentErrors: this.metrics.errors.slice(-5)
    };
  }

  async save(path) {
    await this.model.save(`file://${path}`);
    console.log(`💾 Modèle sauvegardé: ${path}`);
  }

  async load(path) {
    this.model = await tf.loadLayersModel(`file://${path}/model.json`);
    console.log(`📂 Modèle chargé: ${path}`);
  }
}

// =============================================================================
// Exemple d'utilisation
// =============================================================================

async function main() {
  const predictor = new MLPredictor();
  await predictor.initialize();

  // Simuler collecte de données
  console.log('\n📊 Simulation de collecte de données...\n');

  for (let i = 0; i < 100; i++) {
    const mockData = {
      cpu: { percentage: 30 + Math.random() * 40 },
      memory: { percentage: 50 + Math.random() * 30 },
      processes: [
        { pid: 1, name: 'chrome', cpu: 15, memory: 20 },
        { pid: 2, name: 'code', cpu: 10, memory: 15 }
      ]
    };

    predictor.addData(mockData);
    
    // Après 30 itérations, ajouter les valeurs "futures"
    if (i >= 30) {
      predictor.addFutureValue(
        mockData.cpu.percentage,
        mockData.memory.percentage
      );
    }

    // Entraîner tous les 50 points
    if (i > 0 && i % 50 === 0) {
      await predictor.train();
    }

    // Faire une prédiction
    if (i > 40) {
      const prediction = await predictor.predict();
      if (prediction && i % 10 === 0) {
        console.log(`\n🔮 Prédiction #${i}:`);
        console.log(`   CPU: ${prediction.cpu.toFixed(1)}% (actuel: ${mockData.cpu.percentage.toFixed(1)}%)`);
        console.log(`   RAM: ${prediction.ram.toFixed(1)}% (actuel: ${mockData.memory.percentage.toFixed(1)}%)`);
        console.log(`   Confiance: ${(prediction.confidence * 100).toFixed(1)}%`);
      }

      // Enregistrer les valeurs réelles après 30s
      if (i >= 70) {
        predictor.recordActual(mockData.cpu.percentage, mockData.memory.percentage);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n📈 Statut final:');
  console.log(JSON.stringify(predictor.getStatus(), null, 2));
}

// Exporter pour utilisation dans metricsServer.js
module.exports = MLPredictor;

// Décommenter pour tester
main().catch(console.error);
